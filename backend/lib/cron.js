const cron    = require("node-cron");
const axios   = require("axios");
const supabase = require("./supabase");

const ML_URL    = process.env.ML_SERVICE_URL || "http://localhost:5001";
const ML_SECRET = process.env.ML_SECRET || "";

/**
 * Called daily at 06:00 EAT (UTC+3 = 03:00 UTC).
 * 1. Hits the ML service POST /predict for all blood types.
 * 2. Inserts any returned shortage alerts into the alerts table (status=PENDING).
 * 3. Admin reviews them in the dashboard before they're broadcast.
 */
async function runDailyPrediction() {
  console.log("[CRON] Starting daily ML prediction job...");

  try {
    const { data } = await axios.post(
      `${ML_URL}/predict`,
      {},
      { headers: { "X-ML-Secret": ML_SECRET }, timeout: 30_000 }
    );

    const alerts = data.alerts || [];
    console.log(`[CRON] ML returned ${alerts.length} shortage alert(s).`);

    for (const alert of alerts) {
      // Avoid duplicate alerts: check if an identical PENDING/APPROVED alert already exists today
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("blood_type", alert.blood_type)
        .eq("shortage_date", alert.shortage_date)
        .in("status", ["PENDING", "APPROVED"])
        .maybeSingle();

      if (existing) {
        console.log(`[CRON] Duplicate alert skipped for ${alert.blood_type}`);
        continue;
      }

      const { error } = await supabase.from("alerts").insert({
        blood_type:      alert.blood_type,
        alert_type:      "PROACTIVE",
        status:          "PENDING",
        predicted_units: alert.predicted_units,
        shortage_date:   alert.shortage_date,
        threshold_units: alert.threshold_units,
        message_subject: alert.message_subject,
        message_body:    alert.message_body,
      });

      if (error) console.error("[CRON] Insert error:", error.message);
      else console.log(`[CRON] Alert created for ${alert.blood_type} → ${alert.shortage_date}`);
    }

    console.log("[CRON] Daily prediction job complete.");
  } catch (err) {
    console.error("[CRON] ML service call failed:", err.message);
  }
}

/**
 * Register the cron schedule.
 * Runs at 06:00 EAT every day.
 * To test immediately: call runDailyPrediction() directly.
 */
function startCron() {
  // "0 3 * * *" = 03:00 UTC = 06:00 EAT
  cron.schedule("0 3 * * *", runDailyPrediction, {
    scheduled: true,
    timezone: "Africa/Nairobi",
  });
  console.log("[CRON] Scheduler registered: daily prediction at 06:00 EAT");
}

module.exports = { startCron, runDailyPrediction };
