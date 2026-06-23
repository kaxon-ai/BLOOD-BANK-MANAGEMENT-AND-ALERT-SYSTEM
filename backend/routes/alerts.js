const express  = require("express");
const supabase = require("../lib/supabase");
const { sendEmail, buildDriveEmail, buildUrgentEmail } = require("../lib/mailer");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/alerts — list all alerts (newest first)
router.get("/", requireAuth, async (req, res) => {
  const { status, blood_type } = req.query;
  let query = supabase
    .from("alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (status)     query = query.eq("status", status);
  if (blood_type) query = query.eq("blood_type", blood_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ alerts: data });
});

// GET /api/alerts/:id
router.get("/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .select("*, alert_recipients(*)")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(404).json({ error: "Alert not found." });
  res.json({ alert: data });
});

// POST /api/alerts — manually create an urgent alert
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const { blood_type, alert_type = "URGENT", message_subject, message_body, threshold_units } = req.body;
  if (!blood_type || !message_subject || !message_body || !threshold_units) {
    return res.status(400).json({ error: "blood_type, message_subject, message_body, threshold_units required." });
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      blood_type,
      alert_type,
      status: "PENDING",
      threshold_units,
      message_subject,
      message_body,
      triggered_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ alert: data });
});

// PATCH /api/alerts/:id/approve — admin approves a PENDING alert
router.patch("/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .update({ status: "APPROVED", approved_by: req.user.id })
    .eq("id", req.params.id)
    .eq("status", "PENDING")
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ alert: data, message: "Alert approved. Ready to broadcast." });
});

// POST /api/alerts/:id/broadcast — send the alert to eligible donors
router.post("/:id/broadcast", requireAuth, requireAdmin, async (req, res) => {
  // Fetch alert
  const { data: alert, error: aErr } = await supabase
    .from("alerts")
    .select("*")
    .eq("id", req.params.id)
    .eq("status", "APPROVED")
    .single();

  if (aErr || !alert) return res.status(404).json({ error: "Alert not found or not approved." });

  // Fetch eligible donors for this blood type
  const { data: donors, error: dErr } = await supabase
    .from("donors")
    .select("id, full_name, email, phone, blood_type")
    .eq("blood_type", alert.blood_type)
    .eq("is_eligible", true)
    .eq("is_active", true)
    .eq("opted_in_email", true);

  if (dErr) return res.status(500).json({ error: dErr.message });

  let sent = 0;
  const recipientRows = [];

  for (const donor of donors) {
    const daysAway = alert.shortage_date
      ? Math.ceil((new Date(alert.shortage_date) - new Date()) / 86400000)
      : null;

    const html = alert.alert_type === "PROACTIVE"
      ? buildDriveEmail({
          donorName:    donor.full_name,
          bloodType:    alert.blood_type,
          shortageDate: alert.shortage_date,
          daysAway,
        })
      : buildUrgentEmail({ donorName: donor.full_name, bloodType: alert.blood_type });

    try {
      if (donor.email) {
        await sendEmail(donor.email, alert.message_subject, html);
        sent++;
        recipientRows.push({ alert_id: alert.id, donor_id: donor.id, channel: "EMAIL", sent_at: new Date().toISOString(), delivered: true });
      }
    } catch {
      recipientRows.push({ alert_id: alert.id, donor_id: donor.id, channel: "EMAIL", delivered: false });
    }
  }

  // Persist recipient records
  if (recipientRows.length) {
    await supabase.from("alert_recipients").insert(recipientRows);
  }

  // Mark alert as SENT
  await supabase
    .from("alerts")
    .update({ status: "SENT", recipients_count: sent, sent_at: new Date().toISOString() })
    .eq("id", alert.id);

  res.json({ message: `Alert broadcast to ${sent} donor(s).`, recipients: sent });
});

// PATCH /api/alerts/:id/cancel
router.patch("/:id/cancel", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .update({ status: "CANCELLED" })
    .eq("id", req.params.id)
    .in("status", ["PENDING", "APPROVED"])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ alert: data });
});

module.exports = router;
