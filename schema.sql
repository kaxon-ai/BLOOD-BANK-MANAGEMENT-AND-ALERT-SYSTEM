-- =============================================================
-- SMART BLOOD BANK MANAGEMENT & ALERT SYSTEM
-- PostgreSQL Schema for Supabase
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────

CREATE TYPE blood_type_enum AS ENUM (
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
);

CREATE TYPE alert_type_enum AS ENUM (
    'URGENT',       -- inventory already critically low
    'PROACTIVE'     -- ML-predicted shortage in next 7 days
);

CREATE TYPE alert_status_enum AS ENUM (
    'PENDING',      -- awaiting admin approval
    'APPROVED',     -- admin approved, ready to broadcast
    'SENT',         -- broadcast completed
    'CANCELLED'     -- admin cancelled
);

CREATE TYPE user_role_enum AS ENUM (
    'ADMIN',
    'STAFF',
    'DONOR'
);


-- ─────────────────────────────────────────
-- TABLE: users  (staff / admin accounts)
-- ─────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,               -- bcrypt hash
    full_name       TEXT NOT NULL,
    role            user_role_enum NOT NULL DEFAULT 'STAFF',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Admin and staff accounts for managing the blood bank portal.';


-- ─────────────────────────────────────────
-- TABLE: donors
-- ─────────────────────────────────────────
CREATE TABLE donors (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name           TEXT NOT NULL,
    email               TEXT UNIQUE,
    phone               TEXT,                        -- E.164 format e.g. +254712345678
    blood_type          blood_type_enum NOT NULL,
    county              TEXT NOT NULL,               -- Kenyan county / location
    sub_county          TEXT,
    date_of_birth       DATE NOT NULL,
    last_donation_date  DATE,                        -- NULL if never donated
    is_eligible         BOOLEAN GENERATED ALWAYS AS (
                            last_donation_date IS NULL OR
                            (CURRENT_DATE - last_donation_date) >= 56  -- 56-day cooldown
                        ) STORED,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    opted_in_sms        BOOLEAN NOT NULL DEFAULT TRUE,
    opted_in_email      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE donors IS 'Registered blood donors with eligibility tracking.';
COMMENT ON COLUMN donors.is_eligible IS 'Auto-computed: TRUE when 56-day cooldown has passed since last donation.';


-- ─────────────────────────────────────────
-- TABLE: blood_inventory  (current live stock)
-- ─────────────────────────────────────────
CREATE TABLE blood_inventory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_type      blood_type_enum NOT NULL,
    units           INTEGER NOT NULL CHECK (units >= 0),   -- number of blood bags
    expiry_date     DATE NOT NULL,                          -- RBCs expire in ~42 days
    batch_code      TEXT UNIQUE NOT NULL,                   -- e.g. 'KNH-2025-OP-001'
    is_expired      BOOLEAN GENERATED ALWAYS AS (expiry_date < CURRENT_DATE) STORED,
    added_by        UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE blood_inventory IS 'Current blood unit stock per batch and blood type.';
COMMENT ON COLUMN blood_inventory.units IS 'Number of 450ml blood bags in this batch.';


-- Convenience view: aggregate live (non-expired) stock per blood type
CREATE VIEW v_current_stock AS
    SELECT
        blood_type,
        SUM(units) AS total_units,
        MIN(expiry_date) AS nearest_expiry
    FROM blood_inventory
    WHERE is_expired = FALSE
    GROUP BY blood_type
    ORDER BY blood_type;


-- ─────────────────────────────────────────
-- TABLE: historical_usage_logs
-- The ML model's training data source
-- ─────────────────────────────────────────
CREATE TABLE historical_usage_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_date        DATE NOT NULL,
    blood_type      blood_type_enum NOT NULL,
    units_used      INTEGER NOT NULL CHECK (units_used >= 0),
    units_received  INTEGER NOT NULL DEFAULT 0 CHECK (units_received >= 0),
    closing_stock   INTEGER NOT NULL CHECK (closing_stock >= 0),
    -- Context flags to help the ML model detect seasonal patterns
    is_holiday_week     BOOLEAN NOT NULL DEFAULT FALSE,  -- public holidays / long weekends
    is_rainy_season     BOOLEAN NOT NULL DEFAULT FALSE,  -- Apr-Jun, Oct-Dec in Kenya
    notes               TEXT,
    recorded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (log_date, blood_type)                        -- one row per day per blood type
);

COMMENT ON TABLE historical_usage_logs IS
    'Daily snapshot of usage, donations received, and closing stock per blood type.
     Seasonal flags allow the ML model to learn surge patterns.';


-- ─────────────────────────────────────────
-- TABLE: alerts
-- ─────────────────────────────────────────
CREATE TABLE alerts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_type          blood_type_enum NOT NULL,
    alert_type          alert_type_enum NOT NULL,
    status              alert_status_enum NOT NULL DEFAULT 'PENDING',
    predicted_units     NUMERIC(6,2),           -- ML-predicted stock on shortage day
    shortage_date       DATE,                   -- predicted date stock hits critical level
    threshold_units     INTEGER NOT NULL,        -- the critical threshold that was breached
    message_subject     TEXT,
    message_body        TEXT,
    recipients_count    INTEGER DEFAULT 0,       -- number of donors contacted
    triggered_by        UUID REFERENCES users(id),
    approved_by         UUID REFERENCES users(id),
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alerts IS 'Log of every alert — both ML-driven proactive and manual urgent alerts.';


-- ─────────────────────────────────────────
-- TABLE: alert_recipients  (many-to-many)
-- ─────────────────────────────────────────
CREATE TABLE alert_recipients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id    UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    donor_id    UUID NOT NULL REFERENCES donors(id),
    channel     TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
    sent_at     TIMESTAMPTZ,
    delivered   BOOLEAN,
    UNIQUE (alert_id, donor_id, channel)
);


-- ─────────────────────────────────────────
-- TABLE: ml_predictions  (cache ML output)
-- ─────────────────────────────────────────
CREATE TABLE ml_predictions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blood_type      blood_type_enum NOT NULL,
    prediction_date DATE NOT NULL,           -- the future date being predicted
    predicted_units NUMERIC(6,2) NOT NULL,
    confidence      NUMERIC(5,4),            -- R² or model confidence 0-1
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (blood_type, prediction_date, generated_at)
);

COMMENT ON TABLE ml_predictions IS
    'Stores the 7-day-ahead predictions produced by the Python ML microservice.
     The frontend reads from here so it does not need to call the ML service directly.';


-- ─────────────────────────────────────────
-- INDEXES  (query performance)
-- ─────────────────────────────────────────
CREATE INDEX idx_usage_logs_date       ON historical_usage_logs(log_date DESC);
CREATE INDEX idx_usage_logs_blood_type ON historical_usage_logs(blood_type);
CREATE INDEX idx_inventory_blood_type  ON blood_inventory(blood_type);
CREATE INDEX idx_inventory_expiry      ON blood_inventory(expiry_date);
CREATE INDEX idx_donors_blood_type     ON donors(blood_type);
CREATE INDEX idx_donors_county         ON donors(county);
CREATE INDEX idx_alerts_status         ON alerts(status);
CREATE INDEX idx_predictions_date      ON ml_predictions(prediction_date, blood_type);


-- ─────────────────────────────────────────
-- TRIGGERS: auto-update updated_at
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_donors_updated_at
    BEFORE UPDATE ON donors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON blood_inventory
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_alerts_updated_at
    BEFORE UPDATE ON alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================
-- MOCK DATA
-- Simulates 90 days of history (Oct–Dec 2024) including:
--   • A normal baseline period (Oct)
--   • A rainy-season surge mid-Nov (road accidents spike)
--   • A holiday surge in late Dec (Christmas / New Year road fatalities)
-- =============================================================

-- Admin user (password: "admin1234" — replace hash in production)
INSERT INTO users (id, email, password_hash, full_name, role) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin@bloodbank.ke',
     '$2b$12$KIX.examplehashplaceholderforyou', 'Dr. Amina Ochieng', 'ADMIN'),
    ('a0000000-0000-0000-0000-000000000002', 'staff@bloodbank.ke',
     '$2b$12$KIX.examplehashplaceholderforyou', 'Brian Mwangi', 'STAFF');


-- Sample donors
INSERT INTO donors (full_name, email, phone, blood_type, county, last_donation_date) VALUES
    ('Faith Atieno',    'faith.a@email.com',  '+254701111001', 'O+',  'Nairobi',   '2024-10-01'),
    ('Samuel Kamau',    'sam.k@email.com',    '+254701111002', 'O-',  'Nairobi',   '2024-09-15'),
    ('Grace Wanjiku',   'grace.w@email.com',  '+254701111003', 'A+',  'Kiambu',    '2024-11-01'),
    ('James Omondi',    'james.o@email.com',  '+254701111004', 'B+',  'Kisumu',    NULL),
    ('Lilian Chebet',   'lil.c@email.com',    '+254701111005', 'AB+', 'Uasin Gishu', '2024-08-20'),
    ('Kevin Mutua',     'kev.m@email.com',    '+254701111006', 'O+',  'Machakos',  '2024-10-10'),
    ('Mercy Njeri',     'mercy.n@email.com',  '+254701111007', 'A-',  'Nairobi',   '2024-07-05'),
    ('David Kipchoge',  'dav.k@email.com',    '+254701111008', 'O+',  'Nandi',     '2024-11-15'),
    ('Aisha Hassan',    'aisha.h@email.com',  '+254701111009', 'B-',  'Mombasa',   NULL),
    ('Peter Ngugi',     'peter.n@email.com',  '+254701111010', 'O-',  'Nairobi',   '2024-10-20');


-- Current blood inventory (batches as of 2025-01-01)
INSERT INTO blood_inventory (blood_type, units, expiry_date, batch_code) VALUES
    ('O+',  45, '2025-02-05', 'KNH-2025-OP-001'),
    ('O+',  20, '2025-01-28', 'KNH-2025-OP-002'),
    ('O-',   8, '2025-02-10', 'KNH-2025-ON-001'),
    ('A+',  30, '2025-02-12', 'KNH-2025-AP-001'),
    ('A-',   5, '2025-01-30', 'KNH-2025-AN-001'),
    ('B+',  22, '2025-02-08', 'KNH-2025-BP-001'),
    ('B-',   4, '2025-02-15', 'KNH-2025-BN-001'),
    ('AB+', 12, '2025-02-03', 'KNH-2025-ABP-001'),
    ('AB-',  2, '2025-01-25', 'KNH-2025-ABN-001');


-- ─────────────────────────────────────────
-- HISTORICAL USAGE LOGS
-- 90-day window: 2024-10-01 → 2024-12-29
-- Pattern key:
--   Oct  = baseline (O+ ~8/day, A+ ~5/day, B+ ~4/day, O- ~2/day …)
--   Nov 13-20  = rainy-season surge  (+60% usage across O+, A+)
--   Dec 20-29  = holiday road-accident surge (+100% usage O+, O-)
-- ─────────────────────────────────────────

INSERT INTO historical_usage_logs
    (log_date, blood_type, units_used, units_received, closing_stock, is_rainy_season, is_holiday_week, notes)
VALUES

-- ══ OCTOBER 2024 – BASELINE ══════════════════════════════════
-- O+ baseline: use ~8/day, receive ~6/day
('2024-10-01','O+', 8, 6, 120, FALSE, FALSE, 'Baseline'),
('2024-10-02','O+', 7, 0, 113, FALSE, FALSE, NULL),
('2024-10-03','O+', 9, 10,114, FALSE, FALSE, NULL),
('2024-10-04','O+', 8, 0, 106, FALSE, FALSE, NULL),
('2024-10-05','O+', 6, 0, 100, FALSE, FALSE, NULL),
('2024-10-06','O+', 7, 8,  101,FALSE, FALSE, NULL),
('2024-10-07','O+', 5, 0,  96, FALSE, FALSE, NULL),
('2024-10-08','O+', 8, 0,  88, FALSE, FALSE, NULL),
('2024-10-09','O+', 9, 12, 91, FALSE, FALSE, NULL),
('2024-10-10','O+', 7, 0,  84, FALSE, FALSE, NULL),
('2024-10-11','O+', 8, 0,  76, FALSE, FALSE, NULL),
('2024-10-12','O+', 6, 10, 80, FALSE, FALSE, NULL),
('2024-10-13','O+', 7, 0,  73, FALSE, FALSE, NULL),
('2024-10-14','O+', 8, 0,  65, FALSE, FALSE, NULL),
('2024-10-15','O+', 9, 15, 71, FALSE, FALSE, NULL),
('2024-10-16','O+', 7, 0,  64, FALSE, FALSE, NULL),
('2024-10-17','O+', 8, 0,  56, FALSE, FALSE, NULL),
('2024-10-18','O+', 6, 10, 60, FALSE, FALSE, NULL),
('2024-10-19','O+', 7, 0,  53, FALSE, FALSE, NULL),
('2024-10-20','O+', 8, 5,  50, FALSE, FALSE, NULL),
('2024-10-21','O+', 8, 0,  42, FALSE, FALSE, NULL),
('2024-10-22','O+', 7, 0,  35, FALSE, FALSE, NULL),
('2024-10-23','O+', 9, 20, 46, FALSE, FALSE, NULL),
('2024-10-24','O+', 8, 0,  38, FALSE, FALSE, NULL),
('2024-10-25','O+', 7, 5,  36, FALSE, FALSE, NULL),
('2024-10-26','O+', 8, 0,  28, FALSE, FALSE, NULL),
('2024-10-27','O+', 6, 10, 32, FALSE, FALSE, NULL),
('2024-10-28','O+', 7, 0,  25, FALSE, FALSE, NULL),
('2024-10-29','O+', 8, 8,  25, FALSE, FALSE, NULL),
('2024-10-30','O+', 9, 0,  16, FALSE, FALSE, NULL),
('2024-10-31','O+', 7, 15, 24, FALSE, FALSE, NULL),

-- O- baseline: ~2/day, receive ~3/day
('2024-10-01','O-', 2, 3, 18, FALSE, FALSE, NULL),
('2024-10-05','O-', 2, 0, 16, FALSE, FALSE, NULL),
('2024-10-10','O-', 3, 4, 17, FALSE, FALSE, NULL),
('2024-10-15','O-', 2, 0, 15, FALSE, FALSE, NULL),
('2024-10-20','O-', 2, 2, 15, FALSE, FALSE, NULL),
('2024-10-25','O-', 3, 0, 12, FALSE, FALSE, NULL),
('2024-10-31','O-', 2, 3, 13, FALSE, FALSE, NULL),

-- A+ baseline: ~5/day
('2024-10-01','A+', 5, 4, 85, FALSE, FALSE, NULL),
('2024-10-07','A+', 5, 8, 88, FALSE, FALSE, NULL),
('2024-10-14','A+', 6, 0, 82, FALSE, FALSE, NULL),
('2024-10-21','A+', 5, 5, 82, FALSE, FALSE, NULL),
('2024-10-28','A+', 5, 0, 77, FALSE, FALSE, NULL),
('2024-10-31','A+', 4, 0, 73, FALSE, FALSE, NULL),

-- B+ baseline: ~4/day
('2024-10-01','B+', 4, 3, 55, FALSE, FALSE, NULL),
('2024-10-10','B+', 4, 5, 56, FALSE, FALSE, NULL),
('2024-10-20','B+', 5, 0, 51, FALSE, FALSE, NULL),
('2024-10-31','B+', 4, 4, 51, FALSE, FALSE, NULL),


-- ══ NOVEMBER 2024 ══════════════════════════════════
-- Early Nov: approaching rainy season
('2024-11-01','O+', 8,  5, 21, TRUE, FALSE, 'Early rainy season'),
('2024-11-02','O+', 9,  0, 12, TRUE, FALSE, NULL),
('2024-11-03','O+', 7, 20, 25, TRUE, FALSE, 'Emergency donation drive'),
('2024-11-04','O+', 8,  0, 17, TRUE, FALSE, NULL),
('2024-11-05','O+', 9,  5, 13, TRUE, FALSE, NULL),
('2024-11-06','O+', 8,  8, 13, TRUE, FALSE, NULL),
('2024-11-07','O+', 7,  0,  6, TRUE, FALSE, NULL),
('2024-11-08','O+', 6, 20, 20, TRUE, FALSE, 'Restocked'),
('2024-11-09','O+', 8,  0, 12, TRUE, FALSE, NULL),
('2024-11-10','O+', 9,  0,  3, TRUE, FALSE, NULL),
('2024-11-11','O+', 8, 25, 20, TRUE, FALSE, NULL),
('2024-11-12','O+', 7,  0, 13, TRUE, FALSE, NULL),
-- SURGE BEGINS: heavy rains → road accidents spike
('2024-11-13','O+', 14, 15, 14, TRUE, FALSE, 'SURGE: Nairobi flooding, mass casualty event'),
('2024-11-14','O+', 16,  0, -2, TRUE, FALSE, 'Critical shortage – hospital alert sent'),  -- went negative (stockout)
('2024-11-15','O+', 13, 30, 15, TRUE, FALSE, 'Emergency restock from KNBTS'),
('2024-11-16','O+', 15,  5,  5, TRUE, FALSE, NULL),
('2024-11-17','O+', 12, 20, 13, TRUE, FALSE, NULL),
('2024-11-18','O+', 11,  0,  2, TRUE, FALSE, NULL),
('2024-11-19','O+', 10, 25, 17, TRUE, FALSE, NULL),
('2024-11-20','O+',  9,  0,  8, TRUE, FALSE, 'Surge tapering'),
-- Post-surge recovery
('2024-11-21','O+', 8,  10, 10, TRUE, FALSE, NULL),
('2024-11-22','O+', 7,   0,  3, TRUE, FALSE, NULL),
('2024-11-23','O+', 6,  15, 12, TRUE, FALSE, NULL),
('2024-11-24','O+', 8,   0,  4, TRUE, FALSE, NULL),
('2024-11-25','O+', 7,  10, 7,  TRUE, FALSE, NULL),
('2024-11-26','O+', 8,   0,  -1,TRUE, FALSE, NULL), -- minor stockout
('2024-11-27','O+', 7,  20, 12, TRUE, FALSE, NULL),
('2024-11-28','O+', 8,   0,  4, TRUE, FALSE, NULL),
('2024-11-29','O+', 7,   5,  2, TRUE, FALSE, NULL),
('2024-11-30','O+', 6,  10,  6, TRUE, FALSE, NULL),

-- O- Nov surge
('2024-11-01','O-', 2, 0, 11, TRUE, FALSE, NULL),
('2024-11-13','O-', 5, 3,  9, TRUE, FALSE, 'Surge – O- used for emergency transfusions'),
('2024-11-14','O-', 6, 0,  3, TRUE, FALSE, 'Near stockout'),
('2024-11-15','O-', 4, 8,  7, TRUE, FALSE, NULL),
('2024-11-20','O-', 3, 0,  4, TRUE, FALSE, NULL),
('2024-11-30','O-', 2, 4,  6, TRUE, FALSE, NULL),

-- A+ Nov
('2024-11-01','A+', 5, 0, 68, TRUE, FALSE, NULL),
('2024-11-13','A+', 9, 5, 64, TRUE, FALSE, 'Surge'),
('2024-11-15','A+',10, 10,64, TRUE, FALSE, NULL),
('2024-11-20','A+', 7, 0, 57, TRUE, FALSE, NULL),
('2024-11-30','A+', 5, 8, 60, TRUE, FALSE, NULL),


-- ══ DECEMBER 2024 ══════════════════════════════════
-- Dec 1-19: settling back to normal
('2024-12-01','O+',  8, 10, 8,  TRUE, FALSE, NULL),
('2024-12-02','O+',  7,  0, 1,  TRUE, FALSE, NULL),
('2024-12-03','O+',  6, 20, 15, TRUE, FALSE, NULL),
('2024-12-04','O+',  8,  0,  7, TRUE, FALSE, NULL),
('2024-12-05','O+',  7,  5,  5, TRUE, FALSE, NULL),
('2024-12-06','O+',  8,  8,  5, TRUE, FALSE, NULL),
('2024-12-07','O+',  7,  0,  -2,TRUE, FALSE, NULL),
('2024-12-08','O+',  6, 20, 12, TRUE, FALSE, NULL),
('2024-12-09','O+',  8,  0,  4, TRUE, FALSE, NULL),
('2024-12-10','O+',  7,  5,  2, TRUE, FALSE, NULL),
('2024-12-11','O+',  8, 10, 4,  TRUE, FALSE, NULL),
('2024-12-12','O+',  9,  0, -5, TRUE, FALSE, NULL),
('2024-12-13','O+',  7, 20, 8,  TRUE, FALSE, NULL),
('2024-12-14','O+',  8,  0,  0, TRUE, FALSE, NULL),
('2024-12-15','O+',  7, 15,  8, TRUE, FALSE, NULL),
('2024-12-16','O+',  8,  0,  0, TRUE, FALSE, NULL),
('2024-12-17','O+',  9,  5, -4, TRUE, FALSE, NULL),
('2024-12-18','O+',  7, 20,  9, TRUE, FALSE, NULL),
('2024-12-19','O+',  8,  0,  1, TRUE, FALSE, NULL),
-- HOLIDAY SURGE (Dec 20-29): Christmas + New Year road carnage
('2024-12-20','O+', 17, 20, 4,  TRUE, TRUE, 'HOLIDAY SURGE: Christmas week – road fatalities spike'),
('2024-12-21','O+', 19, 0, -15, TRUE, TRUE, 'Critical stockout'),
('2024-12-22','O+', 18, 35,  2, TRUE, TRUE, 'Emergency KNBTS restock'),
('2024-12-23','O+', 20,  0,-18, TRUE, TRUE, 'Stockout again – 3 hospitals on divert'),
('2024-12-24','O+', 16, 40,  6, TRUE, TRUE, 'Donation drive response'),
('2024-12-25','O+', 14,  0, -8, TRUE, TRUE, 'Christmas Day road accidents'),
('2024-12-26','O+', 15, 20, -3, TRUE, TRUE, NULL),
('2024-12-27','O+', 13,  0,-16, TRUE, TRUE, NULL),
('2024-12-28','O+', 12, 30,  2, TRUE, TRUE, NULL),
('2024-12-29','O+', 11,  0, -9, TRUE, TRUE, 'Stock critically depleted heading into NYE'),

-- O- holiday surge
('2024-12-20','O-',  5,  2,  3, TRUE, TRUE, 'Holiday surge'),
('2024-12-21','O-',  6,  0, -3, TRUE, TRUE, 'Stockout'),
('2024-12-22','O-',  4,  8,  1, TRUE, TRUE, NULL),
('2024-12-24','O-',  5,  0, -4, TRUE, TRUE, 'Christmas stockout'),
('2024-12-25','O-',  6,  8,  -2,TRUE, TRUE, NULL),
('2024-12-29','O-',  5,  5,  -2,TRUE, TRUE, NULL),

-- A+ and B+ Dec
('2024-12-01','A+',  5, 0, 55, TRUE, FALSE, NULL),
('2024-12-10','A+',  6, 8, 57, TRUE, FALSE, NULL),
('2024-12-20','A+', 11, 10, 56, TRUE, TRUE, 'Holiday surge'),
('2024-12-25','A+', 12,  0, 44, TRUE, TRUE, NULL),
('2024-12-29','A+', 10, 15, 49, TRUE, TRUE, NULL),

('2024-12-01','B+',  4, 5, 52, TRUE, FALSE, NULL),
('2024-12-15','B+',  5, 0, 47, TRUE, FALSE, NULL),
('2024-12-20','B+',  8, 5, 44, TRUE, TRUE, 'Holiday surge'),
('2024-12-25','B+',  9, 0, 35, TRUE, TRUE, NULL),
('2024-12-29','B+',  8, 8, 35, TRUE, TRUE, NULL);


-- =============================================================
-- ROW-LEVEL SECURITY (Supabase RLS)
-- Uncomment and adapt these policies after enabling RLS
-- on each table in the Supabase dashboard.
-- =============================================================

/*
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;

-- Only authenticated staff/admin may read donor PII
CREATE POLICY "staff_read_donors" ON donors
    FOR SELECT TO authenticated
    USING (auth.jwt() ->> 'role' IN ('ADMIN', 'STAFF'));

ALTER TABLE blood_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_inventory" ON blood_inventory
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' IN ('ADMIN', 'STAFF'));

ALTER TABLE historical_usage_logs ENABLE ROW LEVEL SECURITY;

-- ML service reads via service-role key (bypasses RLS)
CREATE POLICY "staff_read_logs" ON historical_usage_logs
    FOR SELECT TO authenticated
    USING (TRUE);
*/
