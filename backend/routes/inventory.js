const express  = require("express");
const supabase = require("../lib/supabase");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/inventory — all live (non-expired) batches, grouped summary
router.get("/", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("blood_inventory")
    .select("*")
    .order("expiry_date", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ inventory: data });
});

// GET /api/inventory/summary — aggregate totals per blood type (from view)
router.get("/summary", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("v_current_stock")
    .select("*");

  if (error) return res.status(500).json({ error: error.message });
  res.json({ summary: data });
});

// GET /api/inventory/expiring — batches expiring within N days (default 7)
router.get("/expiring", requireAuth, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);

  const { data, error } = await supabase
    .from("blood_inventory")
    .select("*")
    .lte("expiry_date", cutoffDate.toISOString().split("T")[0])
    .gte("expiry_date", new Date().toISOString().split("T")[0])
    .order("expiry_date");

  if (error) return res.status(500).json({ error: error.message });
  res.json({ expiring: data, days });
});

// POST /api/inventory — add a new batch
router.post("/", requireAuth, async (req, res) => {
  const { blood_type, units, expiry_date, batch_code } = req.body;
  if (!blood_type || !units || !expiry_date || !batch_code) {
    return res.status(400).json({ error: "blood_type, units, expiry_date, batch_code required." });
  }

  const { data, error } = await supabase
    .from("blood_inventory")
    .insert({ blood_type, units, expiry_date, batch_code, added_by: req.user.id })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Log the received units into historical_usage_logs
  const today = new Date().toISOString().split("T")[0];
  await supabase.from("historical_usage_logs").upsert({
    log_date:       today,
    blood_type,
    units_used:     0,
    units_received: units,
    closing_stock:  units,
    recorded_by:    req.user.id,
  }, { onConflict: "log_date,blood_type", ignoreDuplicates: false });

  res.status(201).json({ batch: data });
});

// PATCH /api/inventory/:id — update units (e.g. after transfusion)
router.patch("/:id", requireAuth, async (req, res) => {
  const { units } = req.body;
  const { data, error } = await supabase
    .from("blood_inventory")
    .update({ units })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ batch: data });
});

// DELETE /api/inventory/:id — admin only
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("blood_inventory")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Batch deleted." });
});

// POST /api/inventory/log-usage — record daily usage (staff end-of-day)
router.post("/log-usage", requireAuth, async (req, res) => {
  const { blood_type, units_used, is_holiday_week, is_rainy_season, notes } = req.body;
  if (!blood_type || units_used === undefined) {
    return res.status(400).json({ error: "blood_type and units_used required." });
  }

  const today = new Date().toISOString().split("T")[0];

  // Get current total stock
  const { data: batches } = await supabase
    .from("blood_inventory")
    .select("units")
    .eq("blood_type", blood_type)
    .gt("expiry_date", today);

  const currentStock = (batches || []).reduce((sum, b) => sum + b.units, 0);
  const closingStock = Math.max(0, currentStock - units_used);

  const { data, error } = await supabase
    .from("historical_usage_logs")
    .upsert({
      log_date:       today,
      blood_type,
      units_used,
      units_received: 0,
      closing_stock:  closingStock,
      is_holiday_week: is_holiday_week || false,
      is_rainy_season: is_rainy_season || false,
      notes:          notes || null,
      recorded_by:    req.user.id,
    }, { onConflict: "log_date,blood_type" })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ log: data });
});

module.exports = router;
