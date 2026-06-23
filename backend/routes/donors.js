const express  = require("express");
const supabase = require("../lib/supabase");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/donors — paginated list with optional blood_type filter
router.get("/", requireAuth, async (req, res) => {
  const { blood_type, county, eligible_only, page = 1, limit = 20 } = req.query;
  const from = (page - 1) * limit;
  const to   = from + Number(limit) - 1;

  let query = supabase
    .from("donors")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .range(from, to)
    .order("full_name");

  if (blood_type)    query = query.eq("blood_type", blood_type);
  if (county)        query = query.ilike("county", `%${county}%`);
  if (eligible_only === "true") query = query.eq("is_eligible", true);

  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ donors: data, total: count, page: Number(page), limit: Number(limit) });
});

// GET /api/donors/:id
router.get("/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("donors")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Donor not found." });
  res.json({ donor: data });
});

// POST /api/donors — register a new donor
router.post("/", async (req, res) => {  // public endpoint for self-registration
  const {
    full_name, email, phone, blood_type,
    county, sub_county, date_of_birth,
    opted_in_sms = true, opted_in_email = true
  } = req.body;

  if (!full_name || !blood_type || !county || !date_of_birth) {
    return res.status(400).json({
      error: "full_name, blood_type, county, and date_of_birth are required."
    });
  }

  const { data, error } = await supabase
    .from("donors")
    .insert({
      full_name, email, phone, blood_type,
      county, sub_county, date_of_birth,
      opted_in_sms, opted_in_email,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ donor: data });
});

// PATCH /api/donors/:id/record-donation — update last donation date
router.patch("/:id/record-donation", requireAuth, async (req, res) => {
  const { donation_date } = req.body;
  const today = donation_date || new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("donors")
    .update({ last_donation_date: today })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ donor: data, next_eligible: getNextEligibleDate(today) });
});

// PATCH /api/donors/:id — update donor details
router.patch("/:id", requireAuth, async (req, res) => {
  const allowed = ["full_name","email","phone","county","sub_county",
                   "opted_in_sms","opted_in_email","is_active"];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await supabase
    .from("donors")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ donor: data });
});

// DELETE /api/donors/:id — soft-delete
router.delete("/:id", requireAuth, async (req, res) => {
  const { error } = await supabase
    .from("donors")
    .update({ is_active: false })
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Donor deactivated." });
});

// GET /api/donors/eligible/:blood_type — list eligible donors for an alert
router.get("/eligible/:blood_type", requireAuth, async (req, res) => {
  const { county } = req.query;
  let query = supabase
    .from("donors")
    .select("id, full_name, email, phone, county, last_donation_date")
    .eq("blood_type", req.params.blood_type)
    .eq("is_eligible", true)
    .eq("is_active", true);

  if (county) query = query.eq("county", county);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ eligible_donors: data, count: data.length });
});

function getNextEligibleDate(donationDate) {
  const d = new Date(donationDate);
  d.setDate(d.getDate() + 56);
  return d.toISOString().split("T")[0];
}

module.exports = router;
