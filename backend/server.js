/**
 * Smart Blood Bank — Express API Server
 * Entry point: sets up middleware, mounts routes, starts cron job.
 */

require("dotenv").config();
const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const { startCron } = require("./lib/cron");

const inventoryRoutes  = require("./routes/inventory");
const donorRoutes      = require("./routes/donors");
const alertRoutes      = require("./routes/alerts");
const predictionRoutes = require("./routes/predictions");
const authRoutes       = require("./routes/auth");

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Security & Parsing ───────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "https://blood-bank.vercel.app",  // replace with your Vercel URL
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("CORS policy: origin not allowed"));
  },
  credentials: true,
}));

// ── Rate Limiting ─────────────────────────────────────────────────────
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in 15 minutes." },
}));

// ── Health Check ─────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "blood-bank-api",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────────────────
app.use("/api/auth",        authRoutes);
app.use("/api/inventory",   inventoryRoutes);
app.use("/api/donors",      donorRoutes);
app.use("/api/alerts",      alertRoutes);
app.use("/api/predictions", predictionRoutes);

// ── 404 ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global Error Handler ──────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Blood Bank API running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV === "production") startCron();
});

module.exports = app;
