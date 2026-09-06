import { getDb } from "./db";
import {
  buildCycles,
  monthOf,
  money,
  pendingFrom,
  totalsFrom,
} from "./billing";
import type {
  LedgerView,
  MainMeter,
  MainMeterReading,
  MeterReading,
  PublicUserMeter,
  Recharge,
  RechargeWithPayer,
  Settlement,
  SettlementWithNames,
  UserMeter,
} from "./types";

const num = (value: unknown): number => {
  const n = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string => (value == null ? "" : String(value));
type Row = Record<string, unknown>;

/* ── main meters ────────────────────────────────────────────────── */

function toMeter(row: Row): MainMeter {
  return {
    id: num(row.id),
    name: str(row.name),
    meter_label: str(row.meter_label),
    created_at: str(row.created_at),
  };
}

export async function listMeters(): Promise<MainMeter[]> {
  const db = getDb();
  const result = await db.execute(
    "SELECT * FROM main_meters ORDER BY name COLLATE NOCASE"
  );
  return result.rows.map((r) => toMeter(r as unknown as Row));
}

export async function getMeter(id: number): Promise<MainMeter | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM main_meters WHERE id = ? LIMIT 1",
    args: [id],
  });
  const row = result.rows[0];
  return row ? toMeter(row as unknown as Row) : null;
}

export async function createMeter(
  name: string,
  meterLabel: string
): Promise<MainMeter> {
  const db = getDb();
  const result = await db.execute({
    sql: "INSERT INTO main_meters (name, meter_label) VALUES (?, ?) RETURNING *",
    args: [name, meterLabel],
  });
  return toMeter(result.rows[0] as unknown as Row);
}

export async function updateMeter(
  id: number,
  name: string,
  meterLabel: string
): Promise<MainMeter> {
  const db = getDb();
  const result = await db.execute({
    sql: "UPDATE main_meters SET name = ?, meter_label = ? WHERE id = ? RETURNING *",
    args: [name, meterLabel, id],
  });
  const row = result.rows[0];
  if (!row) throw new Error("No main meter found with id " + id);
  return toMeter(row as unknown as Row);
}

export async function deleteMeter(id: number): Promise<void> {
  const db = getDb();
  // SQLite only enforces ON DELETE CASCADE when foreign keys are switched on
  // per connection, so the children are removed explicitly.
  await db.batch(
    [
      { sql: "DELETE FROM settlements WHERE main_meter_id = ?", args: [id] },
      { sql: "DELETE FROM meter_readings WHERE main_meter_id = ?", args: [id] },
      { sql: "DELETE FROM main_meter_readings WHERE main_meter_id = ?", args: [id] },
      { sql: "DELETE FROM recharges WHERE main_meter_id = ?", args: [id] },
      { sql: "DELETE FROM users_meters WHERE main_meter_id = ?", args: [id] },
      { sql: "DELETE FROM main_meters WHERE id = ?", args: [id] },
    ],
    "write"
  );
}

/* ── people ─────────────────────────────────────────────────────── */

function toPublicUser(row: Row): PublicUserMeter {
  return {
    id: num(row.id),
    main_meter_id: num(row.main_meter_id),
    submitter: str(row.submitter),
    user_name: str(row.user_name),
    meter_number: str(row.meter_number),
    color_index: num(row.color_index),
    created_at: str(row.created_at),
  };
}

export async function listPeople(meterId: number): Promise<PublicUserMeter[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM users_meters WHERE main_meter_id = ?
       ORDER BY submitter COLLATE NOCASE`,
    args: [meterId],
  });
  return result.rows.map((r) => toPublicUser(r as unknown as Row));
}

/** Admin listing — carries the passcode so it can be handed to the person. */
export async function listPeopleForAdmin(meterId: number): Promise<UserMeter[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM users_meters WHERE main_meter_id = ?
       ORDER BY submitter COLLATE NOCASE`,
    args: [meterId],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Row;
    return { ...toPublicUser(row), passcode: str(row.passcode) };
  });
}

export async function createPerson(input: {
  mainMeterId: number;
  submitter: string;
  userName: string;
  meterNumber: string;
  passcode: string;
}): Promise<PublicUserMeter> {
  const db = getDb();
  // Give the newcomer the next colour in the palette for this meter.
  const countResult = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM users_meters WHERE main_meter_id = ?",
    args: [input.mainMeterId],
  });
  const colorIndex = num((countResult.rows[0] as unknown as Row).c);

  const result = await db.execute({
    sql: `INSERT INTO users_meters
            (main_meter_id, submitter, user_name, meter_number, passcode, color_index)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      input.mainMeterId,
      input.submitter,
      input.userName,
      input.meterNumber,
      input.passcode,
      colorIndex,
    ],
  });
  return toPublicUser(result.rows[0] as unknown as Row);
}

export async function updatePerson(
  id: number,
  input: {
    submitter: string;
    userName: string;
    meterNumber: string;
    passcode?: string;
  }
): Promise<PublicUserMeter> {
  const db = getDb();
  // A blank passcode on the edit form means "leave it alone", not "clear it".
  const result = await db.execute({
    sql: `UPDATE users_meters
             SET submitter    = ?,
                 user_name    = ?,
                 meter_number = ?,
                 passcode     = COALESCE(?, passcode)
           WHERE id = ?
       RETURNING *`,
    args: [
      input.submitter,
      input.userName,
      input.meterNumber,
      input.passcode && input.passcode.length > 0 ? input.passcode : null,
      id,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("No person found with id " + id);
  return toPublicUser(row as unknown as Row);
}

export async function deletePerson(id: number): Promise<void> {
  const db = getDb();
  await db.batch(
    [
      {
        sql: "DELETE FROM settlements WHERE from_user_id = ? OR to_user_id = ?",
        args: [id, id],
      },
      { sql: "DELETE FROM meter_readings WHERE user_id = ?", args: [id] },
      { sql: "DELETE FROM recharges WHERE payer_id = ?", args: [id] },
      { sql: "DELETE FROM users_meters WHERE id = ?", args: [id] },
    ],
    "write"
  );
}

/**
 * Records where every meter stood when the ledger started.
 *
 * A month is priced against the month before it, so the very first month of a
 * new meter has nothing to measure from and stays unpriced — its recharges sit
 * in "pending" until a second month is entered. Storing the current readings as
 * the closing figures of `baselineMonth` (normally last month) supplies that
 * missing opening, so the very next month prices straight away.
 *
 * Nothing before the baseline is ever costed, which is correct: those units
 * were paid for under whatever arrangement came before this ledger.
 */
export async function saveBaseline(
  meterId: number,
  baselineMonth: string,
  entries: Array<{ userId: number; reading: number }>,
  mainReading: number | null
): Promise<{ saved: number }> {
  const db = getDb();
  const statements = entries.map((entry) => ({
    sql: `INSERT INTO meter_readings
            (main_meter_id, user_id, month_year, reading, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT (user_id, month_year) DO UPDATE SET
            reading    = excluded.reading,
            updated_at = datetime('now')`,
    args: [meterId, entry.userId, baselineMonth, entry.reading] as Array<
      number | string
    >,
  }));

  if (mainReading != null) {
    statements.push({
      sql: `INSERT INTO main_meter_readings
              (main_meter_id, month_year, reading, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (main_meter_id, month_year) DO UPDATE SET
              reading    = excluded.reading,
              updated_at = datetime('now')`,
      args: [meterId, baselineMonth, mainReading],
    });
  }

  if (statements.length > 0) await db.batch(statements, "write");
  return { saved: entries.length };
}

/**
 * The months this meter already has sub-meter readings for, oldest first. The
 * setup screen uses this to tell whether the ledger has been started at all.
 */
export async function readingMonths(meterId: number): Promise<string[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT DISTINCT month_year FROM meter_readings
           WHERE main_meter_id = ? ORDER BY month_year`,
    args: [meterId],
  });
  return result.rows.map((r) => str((r as unknown as Row).month_year));
}

/**
 * Every person matching a submitter label or sub-meter number, for the login
 * form.
 *
 * Labels are only unique per main meter — two buildings may each have a "B1" —
 * so this can return more than one row, and the caller picks the one whose
 * passcode matches. Returning just the first match would let whoever holds one
 * building's passcode be turned away, or worse, log in as the wrong meter's
 * namesake.
 */
export async function findPeopleByIdentifier(
  identifier: string
): Promise<UserMeter[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM users_meters
           WHERE submitter COLLATE NOCASE = ?
              OR (meter_number <> '' AND meter_number COLLATE NOCASE = ?)`,
    args: [identifier, identifier],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Row;
    return { ...toPublicUser(row), passcode: str(row.passcode) };
  });
}

export async function getPerson(id: number): Promise<PublicUserMeter | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM users_meters WHERE id = ? LIMIT 1",
    args: [id],
  });
  const row = result.rows[0];
  return row ? toPublicUser(row as unknown as Row) : null;
}

/* ── recharges ──────────────────────────────────────────────────── */

function toRecharge(row: Row): Recharge {
  return {
    id: num(row.id),
    main_meter_id: num(row.main_meter_id),
    payer_id: num(row.payer_id),
    recharged_at: str(row.recharged_at),
    month_year: str(row.month_year),
    amount: num(row.amount),
    note: str(row.note),
    created_at: str(row.created_at),
  };
}

export async function listRecharges(meterId: number): Promise<RechargeWithPayer[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT r.*,
                 u.submitter   AS payer_submitter,
                 u.user_name   AS payer_user_name,
                 u.color_index AS payer_color_index
            FROM recharges r
            JOIN users_meters u ON u.id = r.payer_id
           WHERE r.main_meter_id = ?
        ORDER BY r.recharged_at DESC, r.id DESC`,
    args: [meterId],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Row;
    return {
      ...toRecharge(row),
      payer_submitter: str(row.payer_submitter),
      payer_user_name: str(row.payer_user_name),
      payer_color_index: num(row.payer_color_index),
    };
  });
}

export async function createRecharge(input: {
  mainMeterId: number;
  payerId: number;
  rechargedAt: string;
  amount: number;
  note: string;
}): Promise<Recharge> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO recharges
            (main_meter_id, payer_id, recharged_at, month_year, amount, note)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      input.mainMeterId,
      input.payerId,
      input.rechargedAt,
      monthOf(input.rechargedAt),
      input.amount,
      input.note,
    ],
  });
  return toRecharge(result.rows[0] as unknown as Row);
}

export async function updateRecharge(
  id: number,
  input: { payerId: number; rechargedAt: string; amount: number; note: string }
): Promise<Recharge> {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE recharges
             SET payer_id = ?, recharged_at = ?, month_year = ?, amount = ?, note = ?
           WHERE id = ?
       RETURNING *`,
    args: [
      input.payerId,
      input.rechargedAt,
      monthOf(input.rechargedAt),
      input.amount,
      input.note,
      id,
    ],
  });
  const row = result.rows[0];
  if (!row) throw new Error("No recharge found with id " + id);
  return toRecharge(row as unknown as Row);
}

export async function deleteRecharge(id: number): Promise<void> {
  const db = getDb();
  await db.execute({ sql: "DELETE FROM recharges WHERE id = ?", args: [id] });
}

/* ── readings ───────────────────────────────────────────────────── */

function toReading(row: Row): MeterReading {
  return {
    id: num(row.id),
    main_meter_id: num(row.main_meter_id),
    user_id: num(row.user_id),
    month_year: str(row.month_year),
    reading: num(row.reading),
    updated_at: str(row.updated_at),
  };
}

export async function listReadings(meterId: number): Promise<MeterReading[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM meter_readings WHERE main_meter_id = ?
       ORDER BY month_year, user_id`,
    args: [meterId],
  });
  return result.rows.map((r) => toReading(r as unknown as Row));
}

export async function listMainReadings(
  meterId: number
): Promise<MainMeterReading[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM main_meter_readings WHERE main_meter_id = ?
       ORDER BY month_year`,
    args: [meterId],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Row;
    return {
      id: num(row.id),
      main_meter_id: num(row.main_meter_id),
      month_year: str(row.month_year),
      reading: num(row.reading),
      updated_at: str(row.updated_at),
    };
  });
}

/**
 * Saves one month's closing readings. Entries left blank are skipped so a
 * half-filled table can be saved and finished later; passing `null` for a
 * person's reading deletes it, which is how a mistaken entry is undone.
 */
export async function saveReadingsBatch(
  meterId: number,
  monthYear: string,
  entries: Array<{ userId: number; reading: number | null }>,
  mainReading: number | null
): Promise<{ saved: number; cleared: number }> {
  const db = getDb();
  const statements = [];
  let saved = 0;
  let cleared = 0;

  for (const entry of entries) {
    if (entry.reading == null) {
      statements.push({
        sql: "DELETE FROM meter_readings WHERE user_id = ? AND month_year = ?",
        args: [entry.userId, monthYear],
      });
      cleared++;
      continue;
    }
    statements.push({
      sql: `INSERT INTO meter_readings
              (main_meter_id, user_id, month_year, reading, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT (user_id, month_year) DO UPDATE SET
              reading    = excluded.reading,
              updated_at = datetime('now')`,
      args: [meterId, entry.userId, monthYear, entry.reading],
    });
    saved++;
  }

  if (mainReading == null) {
    statements.push({
      sql: "DELETE FROM main_meter_readings WHERE main_meter_id = ? AND month_year = ?",
      args: [meterId, monthYear],
    });
  } else {
    statements.push({
      sql: `INSERT INTO main_meter_readings
              (main_meter_id, month_year, reading, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT (main_meter_id, month_year) DO UPDATE SET
              reading    = excluded.reading,
              updated_at = datetime('now')`,
      args: [meterId, monthYear, mainReading],
    });
  }

  if (statements.length > 0) await db.batch(statements, "write");
  return { saved, cleared };
}

/* ── settlements ────────────────────────────────────────────────── */

export async function listSettlements(
  meterId: number
): Promise<SettlementWithNames[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.*,
                 f.submitter AS from_submitter, f.user_name AS from_user_name,
                 t.submitter AS to_submitter,   t.user_name AS to_user_name
            FROM settlements s
            JOIN users_meters f ON f.id = s.from_user_id
            JOIN users_meters t ON t.id = s.to_user_id
           WHERE s.main_meter_id = ?
        ORDER BY s.settled_at DESC, s.id DESC`,
    args: [meterId],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Row;
    return {
      id: num(row.id),
      main_meter_id: num(row.main_meter_id),
      from_user_id: num(row.from_user_id),
      to_user_id: num(row.to_user_id),
      settled_at: str(row.settled_at),
      month_year: str(row.month_year),
      amount: num(row.amount),
      note: str(row.note),
      created_at: str(row.created_at),
      from_submitter: str(row.from_submitter),
      from_user_name: str(row.from_user_name),
      to_submitter: str(row.to_submitter),
      to_user_name: str(row.to_user_name),
    };
  });
}

export async function createSettlement(input: {
  mainMeterId: number;
  fromUserId: number;
  toUserId: number;
  settledAt: string;
  amount: number;
  note: string;
}): Promise<Settlement> {
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO settlements
            (main_meter_id, from_user_id, to_user_id, settled_at, month_year, amount, note)
          VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      input.mainMeterId,
      input.fromUserId,
      input.toUserId,
      input.settledAt,
      monthOf(input.settledAt),
      input.amount,
      input.note,
    ],
  });
  const row = result.rows[0] as unknown as Row;
  return {
    id: num(row.id),
    main_meter_id: num(row.main_meter_id),
    from_user_id: num(row.from_user_id),
    to_user_id: num(row.to_user_id),
    settled_at: str(row.settled_at),
    month_year: str(row.month_year),
    amount: num(row.amount),
    note: str(row.note),
    created_at: str(row.created_at),
  };
}

export async function deleteSettlement(id: number): Promise<void> {
  const db = getDb();
  await db.execute({ sql: "DELETE FROM settlements WHERE id = ?", args: [id] });
}

/* ── the assembled ledger ───────────────────────────────────────── */

/**
 * Everything both dashboards render, for one main meter. Reading the whole
 * ledger at once and computing in memory keeps the split logic in a single
 * tested place rather than spread across SQL.
 */
export async function getLedger(meterId: number): Promise<LedgerView | null> {
  const meter = await getMeter(meterId);
  if (!meter) return null;

  const [people, readings, mainReadings, recharges, settlements] =
    await Promise.all([
      listPeople(meterId),
      listReadings(meterId),
      listMainReadings(meterId),
      listRecharges(meterId),
      listSettlements(meterId),
    ]);

  const cycles = buildCycles({
    people,
    readings,
    mainReadings,
    recharges,
    settlements,
  });

  const months = Array.from(
    new Set([
      ...readings.map((r) => r.month_year),
      ...recharges.map((r) => r.month_year),
      ...settlements.map((s) => s.month_year),
    ])
  )
    .filter(Boolean)
    .sort()
    .reverse();

  return {
    meter,
    people,
    cycles,
    recharges,
    settlements,
    totals: totalsFrom(cycles, people),
    pending: pendingFrom(cycles, recharges, people),
    months,
  };
}

/** Sums every meter's outstanding position, for the admin's meter picker. */
export async function meterSummaries(): Promise<
  Array<{ meter: MainMeter; people: number; months: number; unsettled: number }>
> {
  const meters = await listMeters();
  return Promise.all(
    meters.map(async (meter) => {
      const ledger = await getLedger(meter.id);
      const unsettled = ledger
        ? money(
            ledger.totals.reduce((sum, t) => sum + Math.max(0, t.balance), 0)
          )
        : 0;
      return {
        meter,
        people: ledger?.people.length ?? 0,
        months: ledger?.cycles.length ?? 0,
        unsettled,
      };
    })
  );
}
