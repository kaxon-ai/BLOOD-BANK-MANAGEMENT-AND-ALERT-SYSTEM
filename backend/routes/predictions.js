const express  = require("express");
const axios    = require("axios");
const supabase = require("../lib/supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { runDailyPrediction } = require("../lib/cron");

const router = express.Router();

// GET /api/predictions — fetch latest 7-day predictions from DB cache
router.get("/", requireAuth, async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const end   = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("ml_predictions")
    .select("*")
    .gte("prediction_date", today)
    .lte("prediction_date", end)
    .order("blood_type")
    .order("prediction_date");

  if (error) return res.status(500).json({ error: error.message });
  res.json({ predictions: data });
});

// GET /api/predictions/shortages — only blood types flagged as at-risk
router.get("/shortages", requireAuth, async (req, res) => {
  const THRESHOLDS = {
    "O+": 15, "O-": 5, "A+": 10, "A-": 4,
    "B+": 8,  "B-": 3, "AB+": 5, "AB-": 2,
  };

  const today = new Date().toISOString().split("T")[0];
  const end   = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("ml_predictions")
    .select("*")
    .gte("prediction_date", today)
    .lte("prediction_date", end);

  if (error) return res.status(500).json({ error: error.message });

  const shortages = data.filter(p => {
    const threshold = THRESHOLDS[p.blood_type] ?? 5;
    return p.predicted_units < threshold;
  });

  res.json({ shortages, count: shortages.length });
});

// POST /api/predictions/run — trigger a fresh prediction run (admin only)
router.post("/run", requireAuth, requireAdmin, async (req, res) => {
  try {
    await runDailyPrediction();
    res.json({ message: "Prediction job triggered successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions/history — historical usage for the chart
router.get("/history/:blood_type", requireAuth, async (req, res) => {
  const { blood_type } = req.params;
  const days = parseInt(req.query.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("historical_usage_logs")
    .select("log_date, units_used, closing_stock, is_holiday_week, is_rainy_season")
    .eq("blood_type", blood_type)
    .gte("log_date", cutoff)
    .order("log_date");

  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data, blood_type });
});

module.exports = router;
