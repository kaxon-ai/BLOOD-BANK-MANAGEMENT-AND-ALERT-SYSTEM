const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST  || "smtp.gmail.com",
  port:   Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send a single email.
 * @param {string|string[]} to  — recipient address(es)
 * @param {string}          subject
 * @param {string}          html — HTML body
 */
async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from:    `"Smart Blood Bank" <${process.env.EMAIL_FROM}>`,
      to:      Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
    });
    console.log(`[MAIL] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("[MAIL ERROR]", err.message);
    throw err;
  }
}

/**
 * Build a pre-emptive donation drive email body.
 */
function buildDriveEmail({ donorName, bloodType, shortageDate, daysAway }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border-top:4px solid #ef4444;">
      <h2 style="color:#111;">🩸 Pre-Emptive Donation Drive — ${bloodType}</h2>
      <p>Dear <strong>${donorName}</strong>,</p>
      <p>
        Our predictive system has detected a potential <strong>${bloodType}</strong> blood shortage
        at our centre around <strong>${shortageDate}</strong> (${daysAway} day(s) from today).
      </p>
      <p>
        This is based on seasonal usage trends and current inventory levels. 
        Your donation <strong>today</strong> could save lives before the shortage occurs.
      </p>
      <a href="#" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#ef4444;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
        Schedule My Donation
      </a>
      <p style="margin-top:24px;color:#6b7280;font-size:13px;">
        📍 Visit our centre or call +254-XXX-XXXXXX to book your slot.<br>
        Remember: there is a 56-day cooldown between donations.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:11px;">Smart Blood Bank Management System · Unsubscribe</p>
    </div>
  `;
}

/**
 * Build an urgent emergency alert email.
 */
function buildUrgentEmail({ donorName, bloodType }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;border-top:4px solid #dc2626;">
      <h2 style="color:#dc2626;">🚨 URGENT: ${bloodType} Blood Critically Needed</h2>
      <p>Dear <strong>${donorName}</strong>,</p>
      <p>
        Our <strong>${bloodType}</strong> blood supply has reached a <strong>critical level</strong>.
        We need emergency donations <em>immediately</em>.
      </p>
      <a href="#" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
        Donate Now — Walk-in Welcome
      </a>
      <p style="margin-top:24px;color:#6b7280;font-size:13px;">
        📍 Our centre is open 24/7 for emergencies. Call: +254-XXX-XXXXXX
      </p>
    </div>
  `;
}

module.exports = { sendEmail, buildDriveEmail, buildUrgentEmail };
