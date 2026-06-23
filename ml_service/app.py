"""
Smart Blood Bank Management & Alert System
==========================================
Python ML Microservice — Flask + Scikit-Learn
Hosted on: PythonAnywhere (free tier) or Render

Endpoint:  POST /predict
           GET  /health
           GET  /predict/<blood_type>

Algorithm:
  1. Pulls the last 90 days of historical_usage_logs from Supabase.
  2. Engineers features: day-of-week, is_holiday_week, is_rainy_season,
     7-day rolling avg of units_used, trend index.
  3. Trains a LinearRegression model per blood type (fast — < 1 second).
  4. Predicts units_used for each of the next 7 days.
  5. Simulates closing_stock by subtracting predicted usage from current stock.
  6. Flags any blood type predicted to drop below CRITICAL_THRESHOLD.
  7. Writes predictions back to Supabase ml_predictions table.
  8. Returns a JSON payload the Node.js backend can relay to the frontend.
"""

import os
import json
import logging
from datetime import date, timedelta
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score
from supabase import create_client, Client

# ─────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY", "")
ML_SECRET: str = os.environ.get("ML_SECRET", "dev-secret-change-me")

# Number of days of historical data to fetch for training
HISTORY_DAYS: int = 90

# How many future days to forecast
FORECAST_DAYS: int = 7

# Critical stock thresholds (units) per blood type
# Below this = flag as "HIGH RISK OF SHORTAGE"
CRITICAL_THRESHOLDS: Dict[str, int] = {
    "O+":  15,   # Universal donor — highest demand
    "O-":   5,   # Rare + used in emergencies
    "A+":  10,
    "A-":   4,
    "B+":   8,
    "B-":   3,
    "AB+":  5,
    "AB-":  2,
}

ALL_BLOOD_TYPES = list(CRITICAL_THRESHOLDS.keys())

# ─────────────────────────────────────────
# FLASK APP
# ─────────────────────────────────────────

app = Flask(__name__)
CORS(app, origins=["https://yourdomain.vercel.app", "http://localhost:3000"])

# Supabase client (uses service-role key to bypass RLS)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─────────────────────────────────────────
# DATA LAYER
# ─────────────────────────────────────────

def fetch_historical_data(blood_type: str) -> pd.DataFrame:
    """
    Fetch the last HISTORY_DAYS days of usage logs for a specific
    blood type from Supabase. Returns a pandas DataFrame.
    """
    cutoff = (date.today() - timedelta(days=HISTORY_DAYS)).isoformat()

    response = (
        supabase.table("historical_usage_logs")
        .select("log_date, units_used, units_received, closing_stock, "
                "is_holiday_week, is_rainy_season")
        .eq("blood_type", blood_type)
        .gte("log_date", cutoff)
        .order("log_date", desc=False)
        .execute()
    )

    if not response.data:
        logger.warning(f"No historical data found for {blood_type}")
        return pd.DataFrame()

    df = pd.DataFrame(response.data)
    df["log_date"] = pd.to_datetime(df["log_date"])
    df = df.sort_values("log_date").reset_index(drop=True)
    return df


def fetch_current_stock(blood_type: str) -> int:
    """
    Returns the current total live (non-expired) stock units
    for the given blood type from the blood_inventory table.
    Falls back to the last closing_stock in historical logs.
    """
    response = (
        supabase.rpc("v_current_stock_for_type",
                     {"p_blood_type": blood_type})
        .execute()
    )
    # v_current_stock_for_type is a simple SQL function wrapper around the view.
    # If you haven't created it, fall back to the view via a select:
    response = (
        supabase.table("blood_inventory")
        .select("units")
        .eq("blood_type", blood_type)
        .gt("expiry_date", date.today().isoformat())
        .execute()
    )
    if response.data:
        return sum(row["units"] for row in response.data)
    return 0


def write_predictions(blood_type: str, predictions: List[Dict]) -> None:
    """
    Upsert ML predictions into the ml_predictions table so the
    Node.js backend can read them without calling the ML service directly.
    """
    rows = [
        {
            "blood_type": blood_type,
            "prediction_date": pred["date"],
            "predicted_units": pred["predicted_stock"],
            "confidence": pred.get("r2", None),
        }
        for pred in predictions
    ]
    supabase.table("ml_predictions").upsert(rows).execute()


# ─────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────

def is_rainy_season(d: date) -> bool:
    """Kenya has two rainy seasons: Mar–May (long rains) and Oct–Dec (short rains)."""
    return d.month in (3, 4, 5, 10, 11, 12)


def is_holiday_period(d: date) -> bool:
    """Rough approximation: Dec 20 – Jan 2 and public holiday weeks."""
    return (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 2)


def build_features(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    """
    Feature matrix X and target vector y from historical DataFrame.

    Features:
      0 - day_of_week   (0=Mon … 6=Sun)
      1 - month          (1-12)
      2 - day_of_year    (1-366)
      3 - trend          (row index — captures long-term trend)
      4 - is_rainy       (1/0)
      5 - is_holiday     (1/0)
      6 - rolling_7_avg  (7-day rolling mean of units_used, lag-1)
      7 - rolling_7_std  (7-day rolling std — captures volatility)
    """
    df = df.copy()
    df["day_of_week"]  = df["log_date"].dt.dayofweek
    df["month"]        = df["log_date"].dt.month
    df["day_of_year"]  = df["log_date"].dt.dayofyear
    df["trend"]        = range(len(df))

    # Ensure boolean flags are numeric
    df["is_rainy"]   = df["is_rainy_season"].astype(int)
    df["is_holiday"] = df["is_holiday_week"].astype(int)

    # Lagged rolling statistics (shift by 1 so we use only past data)
    df["rolling_7_avg"] = (
        df["units_used"].rolling(window=7, min_periods=1).mean().shift(1).fillna(df["units_used"].mean())
    )
    df["rolling_7_std"] = (
        df["units_used"].rolling(window=7, min_periods=1).std().shift(1).fillna(1.0)
    )

    feature_cols = [
        "day_of_week", "month", "day_of_year", "trend",
        "is_rainy", "is_holiday", "rolling_7_avg", "rolling_7_std"
    ]
    X = df[feature_cols].values
    y = df["units_used"].values
    return X, y


def build_future_features(last_row_index: int,
                          last_rolling_avg: float,
                          last_rolling_std: float) -> np.ndarray:
    """
    Build feature rows for the next FORECAST_DAYS days (future dates).
    We carry forward the rolling stats from the last known data point.
    """
    today = date.today()
    rows = []
    rolling_avg = last_rolling_avg
    rolling_std = last_rolling_std

    for i in range(1, FORECAST_DAYS + 1):
        future_date = today + timedelta(days=i)
        row = [
            future_date.weekday(),                    # day_of_week
            future_date.month,                        # month
            future_date.timetuple().tm_yday,          # day_of_year
            last_row_index + i,                       # trend
            int(is_rainy_season(future_date)),        # is_rainy
            int(is_holiday_period(future_date)),      # is_holiday
            rolling_avg,                              # rolling_7_avg (carried forward)
            rolling_std,                              # rolling_7_std (carried forward)
        ]
        rows.append(row)
        # Crude online update: rolling avg will be updated once we predict
        # (we can't know future values, so we hold the last known mean)

    return np.array(rows)


# ─────────────────────────────────────────
# ML MODEL
# ─────────────────────────────────────────

def train_and_predict(blood_type: str) -> Dict:
    """
    Main ML pipeline for one blood type:
      1. Fetch historical data.
      2. Engineer features.
      3. Train Ridge Regression (regularised to prevent overfitting on small data).
      4. Predict next 7 days of usage.
      5. Simulate closing stock.
      6. Flag shortage risk.
    Returns a result dict consumed by the API response builder.
    """
    df = fetch_historical_data(blood_type)

    if df.empty or len(df) < 7:
        logger.warning(f"Insufficient data for {blood_type} — returning fallback.")
        return _fallback_result(blood_type)

    X, y = build_features(df)

    # Scale features (important for Ridge regularisation)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train Ridge Regression (α=1.0 — good default for small tabular data)
    model = Ridge(alpha=1.0)
    model.fit(X_scaled, y)
    y_pred_train = model.predict(X_scaled)
    r2 = float(r2_score(y, y_pred_train))

    logger.info(f"[{blood_type}] Trained Ridge Regression — R²={r2:.3f} on {len(df)} samples")

    # Get rolling stats from the last 7 rows
    last_rolling_avg = float(df["units_used"].tail(7).mean())
    last_rolling_std = float(df["units_used"].tail(7).std()) or 1.0

    # Build future feature matrix
    X_future = build_future_features(
        last_row_index=len(df) - 1,
        last_rolling_avg=last_rolling_avg,
        last_rolling_std=last_rolling_std,
    )
    X_future_scaled = scaler.transform(X_future)

    # Predict daily usage for next 7 days
    predicted_usage = model.predict(X_future_scaled)
    predicted_usage = np.clip(predicted_usage, 0, None)  # no negative usage

    # Simulate inventory drawdown over the 7 days
    current_stock = fetch_current_stock(blood_type)
    threshold = CRITICAL_THRESHOLDS[blood_type]

    today = date.today()
    daily_forecasts = []
    simulated_stock = float(current_stock)
    shortage_flag = False
    shortage_date = None

    for i in range(FORECAST_DAYS):
        forecast_date = today + timedelta(days=i + 1)
        usage_today = float(predicted_usage[i])
        simulated_stock -= usage_today

        if simulated_stock < threshold and not shortage_flag:
            shortage_flag = True
            shortage_date = forecast_date.isoformat()

        daily_forecasts.append({
            "date": forecast_date.isoformat(),
            "day_label": forecast_date.strftime("%a %b %d"),
            "predicted_usage": round(usage_today, 1),
            "predicted_stock": round(max(simulated_stock, 0), 1),
            "below_threshold": simulated_stock < threshold,
            "r2": round(r2, 4),
        })

    return {
        "blood_type": blood_type,
        "current_stock": current_stock,
        "critical_threshold": threshold,
        "shortage_predicted": shortage_flag,
        "shortage_date": shortage_date,
        "model_r2": round(r2, 4),
        "training_samples": len(df),
        "forecast": daily_forecasts,
    }


def _fallback_result(blood_type: str) -> Dict:
    """Returned when we have insufficient training data."""
    return {
        "blood_type": blood_type,
        "current_stock": None,
        "critical_threshold": CRITICAL_THRESHOLDS[blood_type],
        "shortage_predicted": False,
        "shortage_date": None,
        "model_r2": None,
        "training_samples": 0,
        "forecast": [],
        "warning": "Insufficient historical data (< 7 days). Cannot forecast.",
    }


# ─────────────────────────────────────────
# ALERT GENERATION
# ─────────────────────────────────────────

def generate_alert_payload(result: Dict) -> Dict | None:
    """
    If a shortage is predicted, returns a structured alert payload
    that the Node.js backend will insert into the alerts table and
    use to compose donor notifications.
    Returns None if no shortage is predicted.
    """
    if not result["shortage_predicted"]:
        return None

    blood_type = result["blood_type"]
    shortage_date = result["shortage_date"]
    days_away = (date.fromisoformat(shortage_date) - date.today()).days

    subject = (
        f"Pre-emptive Donation Drive: {blood_type} blood type needed by {shortage_date}"
    )
    body = (
        f"Dear {blood_type} donor,\n\n"
        f"Our predictive system has flagged a potential {blood_type} blood shortage "
        f"at our centre around {shortage_date} ({days_away} day(s) from today). "
        f"This is based on seasonal trends and current usage patterns.\n\n"
        f"You are eligible and your donation could save lives. "
        f"Please consider scheduling a pre-emptive donation this week.\n\n"
        f"📍 Visit our centre or call +254-XXX-XXXXXX to book.\n"
        f"Thank you for being a hero.\n\n"
        f"— Smart Blood Bank Team"
    )

    return {
        "alert_type": "PROACTIVE",
        "blood_type": blood_type,
        "shortage_date": shortage_date,
        "predicted_units": result["forecast"][-1]["predicted_stock"],
        "threshold_units": result["critical_threshold"],
        "message_subject": subject,
        "message_body": body,
    }


# ─────────────────────────────────────────
# API ROUTES
# ─────────────────────────────────────────

def _verify_secret(req) -> bool:
    """Simple shared-secret auth between Node.js backend and ML service."""
    return req.headers.get("X-ML-Secret") == ML_SECRET


@app.get("/health")
def health_check():
    return jsonify({"status": "ok", "service": "blood-bank-ml", "version": "1.0.0"})


@app.get("/predict/<blood_type>")
def predict_single(blood_type: str):
    """
    Predict inventory for a single blood type.
    Example: GET /predict/O%2B
    """
    if not _verify_secret(request):
        return jsonify({"error": "Unauthorized"}), 401

    blood_type = blood_type.replace("%2B", "+")
    if blood_type not in ALL_BLOOD_TYPES:
        return jsonify({"error": f"Unknown blood type: {blood_type}"}), 400

    result = train_and_predict(blood_type)
    alert  = generate_alert_payload(result)
    return jsonify({"prediction": result, "alert": alert})


@app.post("/predict")
def predict_all():
    """
    Run predictions for ALL blood types in a single call.
    Called by the Node.js cron job every morning at 06:00 EAT.

    Request body (optional):
        { "blood_types": ["O+", "O-"] }   — subset for testing
    """
    if not _verify_secret(request):
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json(silent=True) or {}
    blood_types = body.get("blood_types", ALL_BLOOD_TYPES)

    results = []
    alerts  = []

    for bt in blood_types:
        if bt not in ALL_BLOOD_TYPES:
            logger.warning(f"Skipping unknown blood type: {bt}")
            continue

        result = train_and_predict(bt)
        alert  = generate_alert_payload(result)

        # Write predictions to DB so the frontend reads without calling ML
        if result["forecast"]:
            write_predictions(bt, result["forecast"])

        results.append(result)
        if alert:
            alerts.append(alert)

    summary = {
        "run_date": date.today().isoformat(),
        "blood_types_analysed": len(results),
        "shortages_predicted": len(alerts),
        "shortage_blood_types": [a["blood_type"] for a in alerts],
    }

    logger.info(f"Prediction run complete: {summary}")
    return jsonify({
        "summary": summary,
        "predictions": results,
        "alerts": alerts,
    })


# ─────────────────────────────────────────
# DEMO / OFFLINE MODE (no Supabase needed)
# Uses synthetic in-memory data to demo the ML pipeline.
# Run with:  DEMO_MODE=1 python app.py
# ─────────────────────────────────────────

def _generate_synthetic_data(blood_type: str, n_days: int = 90) -> pd.DataFrame:
    """
    Generates realistic synthetic historical data for demo/testing.
    Mimics Oct-Dec surge patterns baked into the SQL mock data.
    """
    np.random.seed(42)
    base_usage = {"O+": 8, "O-": 2, "A+": 5, "A-": 1.5,
                  "B+": 4, "B-": 1, "AB+": 2, "AB-": 0.5}
    base = base_usage.get(blood_type, 5)

    rows = []
    start_date = date.today() - timedelta(days=n_days)
    stock = 120

    for i in range(n_days):
        d = start_date + timedelta(days=i)
        rainy   = d.month in (3, 4, 5, 10, 11, 12)
        holiday = (d.month == 12 and d.day >= 20)

        # Simulate surge multipliers
        multiplier = 1.0
        if rainy and 12 <= i <= 18:       # rainy surge window
            multiplier = 1.8
        if holiday:
            multiplier = 2.2

        usage    = max(0, int(np.random.poisson(base * multiplier)))
        received = int(np.random.poisson(base * 0.7)) if i % 3 == 0 else 0
        stock    = max(0, stock - usage + received)

        rows.append({
            "log_date":        pd.Timestamp(d),
            "units_used":      usage,
            "units_received":  received,
            "closing_stock":   stock,
            "is_rainy_season": rainy,
            "is_holiday_week": holiday,
        })

    return pd.DataFrame(rows)


DEMO_MODE = os.environ.get("DEMO_MODE", "0") == "1"

if DEMO_MODE:
    logger.info("=== DEMO MODE: using synthetic data, no Supabase calls ===")

    # Monkey-patch data functions to use synthetic data
    def fetch_historical_data(blood_type: str) -> pd.DataFrame:   # noqa: F811
        return _generate_synthetic_data(blood_type)

    def fetch_current_stock(blood_type: str) -> int:               # noqa: F811
        base = {"O+": 65, "O-": 8, "A+": 30, "A-": 5,
                "B+": 22, "B-": 4, "AB+": 12, "AB-": 2}
        return base.get(blood_type, 10)

    def write_predictions(blood_type, predictions):                 # noqa: F811
        logger.info(f"[DEMO] Would write {len(predictions)} rows for {blood_type}")


# ─────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_ENV", "production") == "development"

    logger.info(f"Starting ML microservice on port {port} | demo={DEMO_MODE}")
    app.run(host="0.0.0.0", port=port, debug=debug)
