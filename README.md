# 🩸 Smart Blood Bank Management & Alert System

A full-stack, ML-powered blood inventory management system built as a UEAB senior project. The core innovation: a Python ML microservice that forecasts blood inventory shortages **7 days in advance**, enabling proactive donor alerts before a crisis occurs.

---

## Project Structure

```
blood-bank-system/
├── schema.sql          ← PostgreSQL schema + mock data (run on Supabase)
├── ml_service/         ← Python Flask ML microservice
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
├── backend/            ← Node.js Express REST API
│   ├── server.js
│   ├── routes/
│   ├── middleware/
│   ├── lib/
│   └── .env.example
└── frontend/           ← Next.js React dashboard
    ├── src/app/
    ├── src/components/
    └── src/lib/
```

---

## Tools to Install

### 1. Node.js (v18 or later)
**Download:** https://nodejs.org → click **"LTS"** (recommended)
- Installs both `node` and `npm` automatically
- Verify: open terminal → `node -v` → should show `v18.x.x` or higher

### 2. Python 3.10+
**Download:** https://python.org/downloads → click latest **Python 3.x.x**
- ✅ During install, check **"Add Python to PATH"**
- Verify: `python --version` or `python3 --version`

### 3. Git
**Download:** https://git-scm.com/downloads
- Needed to push your code to GitHub for deployment
- Verify: `git --version`

### 4. VS Code (recommended editor)
**Download:** https://code.visualstudio.com
- Recommended extensions: **ES7 React**, **Tailwind CSS IntelliSense**, **Python**, **Prettier**

### 5. Supabase Account (free)
- Sign up at: https://supabase.com
- Create a new project → copy **Project URL** and **anon/service keys**

---

## Setup Instructions

### Step 1 — Database (Supabase)

1. Go to https://supabase.com → New Project
2. In the SQL Editor, paste the entire contents of `schema.sql` and run it
3. This creates all tables AND inserts 90 days of mock historical data
4. Copy your **Project URL** and **service_role key** from Settings → API

---

### Step 2 — ML Microservice

```bash
cd ml_service

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run in DEMO MODE first (no Supabase needed)
DEMO_MODE=1 python app.py
# → ML service running on http://localhost:5001

# To test: open browser → http://localhost:5001/health
```

---

### Step 3 — Backend API

```bash
cd backend

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET, ML_SERVICE_URL

# Run development server
npm run dev
# → API running on http://localhost:4000

# Test the health endpoint
# Open browser → http://localhost:4000/health
```

**Creating the first admin user:**
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bloodbank.ke","password":"admin1234","full_name":"Dr. Amina","role":"ADMIN"}'
```

---

### Step 4 — Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env.local
# Set: NEXT_PUBLIC_API_URL=http://localhost:4000

# Run development server
npm run dev
# → Dashboard at http://localhost:3000
```

---

## Running Everything at Once

Open **3 separate terminal windows:**

| Terminal | Command | URL |
|---|---|---|
| 1 — ML Service | `cd ml_service && DEMO_MODE=1 python app.py` | http://localhost:5001 |
| 2 — Backend    | `cd backend && npm run dev` | http://localhost:4000 |
| 3 — Frontend   | `cd frontend && npm run dev` | http://localhost:3000 |

Then open http://localhost:3000 in your browser.

---

## Key Features

### Predictive Dashboard
- 8 blood type cards showing real-time stock levels
- Colour-coded status: Green (OK) → Amber (Low) → Red (Critical / Shortage Predicted)
- 7-day forecast chart: actual stock history + ML predictions overlaid

### ML Microservice Endpoints
- `GET  /health` — service status check
- `GET  /predict/O%2B` — predict a single blood type
- `POST /predict` — run predictions for all 8 blood types

### Alert Workflow
1. ML service runs daily at 06:00 EAT (cron job in backend)
2. Shortage predictions → inserted as **PENDING** alerts in Supabase
3. Admin reviews on the Alerts page
4. Admin clicks **Approve** then **Broadcast to Donors**
5. System sends personalised emails to eligible donors

---

## Deployment (Free Tier)

| Service | Platform | Free Tier Limit |
|---|---|---|
| Frontend | Vercel | Unlimited static builds |
| Backend  | Render | 750 hrs/month (sleeps after 15min idle) |
| ML Service | PythonAnywhere or Render | 1 free web app |
| Database | Supabase | 500MB, 50k API calls/month |
| Email | Nodemailer + Gmail | 500 emails/day |

### Deploy Frontend to Vercel
```bash
npm install -g vercel
cd frontend
vercel
# Follow prompts, set NEXT_PUBLIC_API_URL to your Render backend URL
```

### Deploy Backend to Render
1. Push code to GitHub
2. Render → New Web Service → connect your repo
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add environment variables from `.env.example`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   USER BROWSER                       │
│         Next.js Dashboard (Vercel)                   │
│   Dashboard · Inventory · Donors · Alerts            │
└──────────────────────┬──────────────────────────────┘
                       │ REST API calls
                       ▼
┌─────────────────────────────────────────────────────┐
│          Node.js / Express Backend (Render)          │
│  /api/inventory · /api/donors · /api/alerts          │
│  /api/predictions · /api/auth                        │
│                                                      │
│  Daily Cron (06:00 EAT) ──────────────────────────► │
└──────────┬──────────────────────────────────────────┘
           │ Supabase SDK          │ ML HTTP call
           ▼                       ▼
┌─────────────────┐    ┌───────────────────────────────┐
│  Supabase (PG)  │    │ Python Flask ML Service        │
│  • users        │◄───│  (PythonAnywhere / Render)     │
│  • donors       │    │                                │
│  • blood_       │    │  Ridge Regression per          │
│    inventory    │    │  blood type, 8 features,       │
│  • historical_  │    │  7-day drawdown simulation     │
│    usage_logs   │    └───────────────────────────────┘
│  • alerts       │
│  • ml_          │
│    predictions  │
└─────────────────┘
```

---

## Academic Proof Points (for Grading Panel)

| Criterion | Implementation |
|---|---|
| **Data Engineering** | Timestamped `historical_usage_logs` with seasonal flags; `UNIQUE(log_date, blood_type)` enforces one row/day; `v_current_stock` view aggregates live stock |
| **Predictive Analytics** | Ridge Regression with 8 engineered features; R² score returned in every prediction; stock drawdown simulation over 7 future days |
| **Full-Stack Separation** | 4 independent services: DB (Supabase) → ML (Python/Flask) → API (Node/Express) → UI (Next.js) |
| **Proactive vs Reactive** | Cron job runs at 06:00 before any shortage occurs; alert is in PENDING state for admin review, not broadcast immediately |
#   B L O O D - B A N K - M A N A G E M E N T - A N D - A L E R T - S Y S T E M  
 