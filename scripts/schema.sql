-- ────────────────────────────────────────────────────────────────────
--  DESCO Main & Sub-Meter Electricity Bill Management System
--  Schema for Turso / libSQL (SQLite dialect)
--
--  The model is a shared prepaid main meter. Several people recharge it
--  over time, each sub-meter records its own consumption, and the cost of
--  each month is split by units consumed. Comparing what someone paid to
--  what their units cost gives a balance: positive means they are owed
--  money, negative means they owe it.
-- ────────────────────────────────────────────────────────────────────

-- A physical DESCO main meter. Everything else hangs off one of these, so
-- one deployment can serve several buildings or floors.
CREATE TABLE IF NOT EXISTS main_meters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,        -- "Building A"
  meter_label  TEXT    NOT NULL DEFAULT '',    -- DESCO number, e.g. "661120201082"
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- A person sharing one main meter: one sub-meter, one login passcode.
-- `submitter` is the sub-meter's own label (B1, C1, Flat 3B); `user_name`
-- is the person behind it.
CREATE TABLE IF NOT EXISTS users_meters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  main_meter_id INTEGER NOT NULL,
  submitter     TEXT    NOT NULL,              -- "B1"
  user_name     TEXT    NOT NULL,              -- "Rosa"
  meter_number  TEXT    NOT NULL DEFAULT '',   -- sub-meter number, optional
  passcode      TEXT    NOT NULL,
  color_index   INTEGER NOT NULL DEFAULT 0,    -- position in the UI palette
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (main_meter_id) REFERENCES main_meters(id) ON DELETE CASCADE,
  -- Unique per meter, not globally: two buildings may both have a "B1".
  UNIQUE (main_meter_id, submitter)
);

-- One recharge of the main meter, paid by one person. Many of these can
-- fall inside a single month.
CREATE TABLE IF NOT EXISTS recharges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  main_meter_id INTEGER NOT NULL,
  payer_id      INTEGER NOT NULL,              -- who actually paid
  recharged_at  TEXT    NOT NULL,              -- "2026-08-16T10:16"
  month_year    TEXT    NOT NULL,              -- derived: "2026-08"
  amount        REAL    NOT NULL DEFAULT 0,    -- BDT
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (main_meter_id) REFERENCES main_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (payer_id)      REFERENCES users_meters(id) ON DELETE CASCADE
);

-- A month's closing reading for one sub-meter. The previous month's
-- closing reading is the opening one, so only the closing figure is stored.
CREATE TABLE IF NOT EXISTS meter_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  main_meter_id INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  month_year    TEXT    NOT NULL,              -- "2026-08"
  reading       REAL    NOT NULL DEFAULT 0,    -- closing reading for the month
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (main_meter_id) REFERENCES main_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users_meters(id) ON DELETE CASCADE,
  -- One reading per sub-meter per month; the batch entry screen upserts on it.
  UNIQUE (user_id, month_year)
);

-- The main meter's own closing reading for a month. Optional — it exists
-- only to cross-check the sub-meters, never to price anything.
CREATE TABLE IF NOT EXISTS main_meter_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  main_meter_id INTEGER NOT NULL,
  month_year    TEXT    NOT NULL,
  reading       REAL    NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (main_meter_id) REFERENCES main_meters(id) ON DELETE CASCADE,
  UNIQUE (main_meter_id, month_year)
);

-- A settlement records that one person handed money to another to clear a
-- balance, so the ledger can be zeroed without inventing a fake recharge.
CREATE TABLE IF NOT EXISTS settlements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  main_meter_id INTEGER NOT NULL,
  from_user_id  INTEGER NOT NULL,              -- who paid
  to_user_id    INTEGER NOT NULL,              -- who received
  settled_at    TEXT    NOT NULL,
  month_year    TEXT    NOT NULL,
  amount        REAL    NOT NULL DEFAULT 0,
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (main_meter_id) REFERENCES main_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id)  REFERENCES users_meters(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id)    REFERENCES users_meters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_meter      ON users_meters (main_meter_id);
CREATE INDEX IF NOT EXISTS idx_recharges_meter  ON recharges (main_meter_id, month_year);
CREATE INDEX IF NOT EXISTS idx_recharges_payer  ON recharges (payer_id);
CREATE INDEX IF NOT EXISTS idx_readings_meter   ON meter_readings (main_meter_id, month_year);
CREATE INDEX IF NOT EXISTS idx_readings_user    ON meter_readings (user_id);
CREATE INDEX IF NOT EXISTS idx_mainread_meter   ON main_meter_readings (main_meter_id, month_year);
CREATE INDEX IF NOT EXISTS idx_settle_meter     ON settlements (main_meter_id, month_year);
