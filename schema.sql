-- Premier Electrolysis – Database Schema
-- PostgreSQL 15+
-- Run: psql -d your_db -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ── USERS ────────────────────────────────────────────────────────────────────
-- Covers both the owner (role='owner') and clients (role='client').
-- New clients who submitted a booking request but haven't logged in yet
-- still get a row here so the owner can manage them from day one.

CREATE TABLE users (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT        NOT NULL UNIQUE,
    hashed_password  TEXT,                        -- NULL until they set a password
    role             TEXT        NOT NULL DEFAULT 'client'
                                 CHECK (role IN ('owner', 'client')),
    first_name       TEXT        NOT NULL,
    last_name        TEXT        NOT NULL,
    phone            TEXT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AVAILABILITY ─────────────────────────────────────────────────────────────
-- Owner sets recurring weekly hours and can block specific dates
-- (holidays, days off). The booking flow checks this before showing slots.

CREATE TABLE availability (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week   TEXT        CHECK (day_of_week IN
                               ('monday','tuesday','wednesday','thursday',
                                'friday','saturday','sunday')),
    open_time     TIME,                            -- e.g. 09:00
    close_time    TIME,                            -- e.g. 18:00
    is_blocked    BOOLEAN     NOT NULL DEFAULT FALSE,
    blocked_date  DATE,                            -- set when blocking a specific day
    note          TEXT,                            -- owner-facing note for the block
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default hours (Mon–Thu 9–6, Fri–Sat 10–2)
INSERT INTO availability (day_of_week, open_time, close_time) VALUES
    ('monday',    '09:00', '18:00'),
    ('tuesday',   '09:00', '18:00'),
    ('wednesday', '09:00', '18:00'),
    ('thursday',  '09:00', '18:00'),
    ('friday',    '10:00', '14:00'),
    ('saturday',  '10:00', '14:00');

-- ── BOOKINGS ─────────────────────────────────────────────────────────────────
-- A booking is the REQUEST or APPOINTMENT. It starts as 'pending' when a
-- new client submits the public form, moves to 'confirmed' when the owner
-- accepts, 'completed' after the session, or 'cancelled'.

CREATE TABLE bookings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date             DATE        NOT NULL,
    start_time       TIME        NOT NULL,
    duration_minutes INT         NOT NULL DEFAULT 60,
    service_name     TEXT        NOT NULL,        -- e.g. "60-Minute Session"
    amount_cents     INT         NOT NULL DEFAULT 0,
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN
                                   ('pending','confirmed','completed','cancelled','no_show')),
    client_notes     TEXT,                        -- what the client wrote at booking
    owner_notes      TEXT,                        -- private owner note on the booking
    is_first_visit   BOOLEAN     NOT NULL DEFAULT FALSE,
    treatment_area   TEXT,                        -- e.g. "upper lip, chin"
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_client_id ON bookings(client_id);
CREATE INDEX idx_bookings_date      ON bookings(date);
CREATE INDEX idx_bookings_status    ON bookings(status);

-- ── SESSIONS ─────────────────────────────────────────────────────────────────
-- A session is the clinical record created AFTER a booking is completed.
-- One booking → one session. Owner fills this in post-appointment.
-- This is what the client sees in their portal under "Past visits".

CREATE TABLE sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id       UUID        UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
    client_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date     TIMESTAMPTZ NOT NULL,
    owner_notes      TEXT,                        -- detailed clinical notes (private)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_client_id ON sessions(client_id);

-- ── SESSION AREAS ─────────────────────────────────────────────────────────────
-- One row per treatment area within a session, each with its own intensity.
-- e.g. upper lip at intensity 8, chin at intensity 6.

CREATE TABLE session_areas (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    treatment_area   TEXT        NOT NULL,        -- e.g. "upper lip"
    intensity_level  INT         NOT NULL,        -- numeric intensity used
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_areas_session_id ON session_areas(session_id);

-- ── PHOTOS ───────────────────────────────────────────────────────────────────
-- Before/after photos uploaded by the owner, linked to a client and
-- optionally to a specific session. Stored in S3/R2; only the URL lives here.

CREATE TABLE photos (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id   UUID        REFERENCES sessions(id) ON DELETE SET NULL,
    s3_url       TEXT        NOT NULL,            -- full URL from S3/Cloudflare R2
    s3_key       TEXT        NOT NULL,            -- storage key for deletion
    type         TEXT        NOT NULL DEFAULT 'before'
                             CHECK (type IN ('before', 'after', 'progress')),
    treatment_area TEXT,                          -- e.g. "upper lip"
    caption      TEXT,                            -- optional owner caption
    is_visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_photos_client_id  ON photos(client_id);
CREATE INDEX idx_photos_session_id ON photos(session_id);

-- ── NO-SHOW FEES ─────────────────────────────────────────────────────────────
-- Created automatically when a booking status is set to 'no_show'.

CREATE TABLE no_show_fees (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id   UUID        NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    client_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INT         NOT NULL DEFAULT 2000,   -- $20.00
    status       TEXT        NOT NULL DEFAULT 'unpaid'
                             CHECK (status IN ('unpaid', 'paid', 'waived')),
    waived_reason TEXT,                               -- owner note if waived
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at      TIMESTAMPTZ
);

CREATE INDEX idx_no_show_fees_client_id ON no_show_fees(client_id);

-- Trigger: insert a no-show fee row whenever a booking is marked 'no_show'
CREATE OR REPLACE FUNCTION create_no_show_fee()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'no_show' AND OLD.status <> 'no_show' THEN
        INSERT INTO no_show_fees (booking_id, client_id)
        VALUES (NEW.id, NEW.client_id)
        ON CONFLICT (booking_id) DO NOTHING;  -- safe if trigger fires twice
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_show_fee
    AFTER UPDATE OF status ON bookings
    FOR EACH ROW EXECUTE FUNCTION create_no_show_fee();

-- ── PASSWORD RESET TOKENS ────────────────────────────────────────────────────
-- For the "forgot password" flow. Token is a short-lived UUID sent by email.

CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
-- Automatically stamps updated_at on any row change.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── SEED: owner account ───────────────────────────────────────────────────────
-- Password is set separately via the /auth/set-password endpoint.
-- Replace email with Ambar's real email before running.

INSERT INTO users (email, role, first_name, last_name, phone, hashed_password)
VALUES (
    'ambar@premierelectrolysis.com',
    'owner',
    'Ambar',
    'Garcia',
    '3467041825',
    NULL  -- set via /auth/set-password on first login
);
