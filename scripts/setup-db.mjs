#!/usr/bin/env node
/**
 * Creates the schema on the configured Turso / libSQL database, and optionally
 * seeds a worked example.
 *
 *   npm run db:setup            # schema only
 *   npm run db:setup -- --seed  # schema + a two-person meter with real months
 *   npm run db:setup -- --reset # drop every table first, then recreate
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from .env.local (or the real
 * environment, which is how you would run it against production).
 */
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Minimal .env loader so the script works without extra dependencies.
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue; // real environment wins
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  die(
    "TURSO_DATABASE_URL is not set.\n\n" +
      "  Copy .env.example to .env.local, fill in the values from your Turso\n" +
      "  dashboard (https://turso.tech), then run this again.\n\n" +
      "  See DEPLOY.md step 1 if you have not created a database yet."
  );
}

// Someone who copied .env.example and ran straight away would otherwise get a
// raw 404 from the libSQL client, which says nothing about what to fix.
if (url.includes("your-db-name") || url.includes("your-org")) {
  die(
    "TURSO_DATABASE_URL is still the placeholder from .env.example.\n\n" +
      "  Open .env.local and replace it with your real database URL — the one\n" +
      "  shown on your database's page at https://turso.tech. It looks like:\n\n" +
      "    libsql://shared-meter-yourname.aws-ap-northeast-1.turso.io"
  );
}

if (!url.startsWith("libsql://") && !url.startsWith("file:")) {
  die(
    `TURSO_DATABASE_URL does not look like a database URL:\n\n    ${url}\n\n` +
      "  It should start with libsql:// — copy it from your Turso dashboard."
  );
}

if (url.startsWith("libsql://")) {
  if (!token) {
    die(
      "TURSO_AUTH_TOKEN is not set.\n\n" +
        "  On your database's page at https://turso.tech, click Create Token\n" +
        "  and put the result in .env.local."
    );
  }
  if (token.startsWith("eyJhbGciOi...") || token.length < 20) {
    die(
      "TURSO_AUTH_TOKEN is still the placeholder from .env.example.\n\n" +
        "  Create a real token on your database's page at https://turso.tech\n" +
        "  and put it in .env.local."
    );
  }
}

const db = createClient({
  url,
  authToken: url.startsWith("file:") ? undefined : token,
});

// The libSQL client throws its own errors, which read as raw stack traces and
// say nothing about which credential is wrong. Everything below this point is
// database work, so a single handler can translate them once.
function explainDbError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/404/.test(message)) {
    return (
      "The database URL was not found:\n\n" +
      `    ${url}\n\n` +
      "  Check it against your database's page at https://turso.tech — it is\n" +
      "  easy to copy the organisation URL instead of the database's own."
    );
  }
  if (/401|403|unauthor/i.test(message)) {
    return (
      "The database rejected the auth token.\n\n" +
      "  Create a fresh one on your database's page at https://turso.tech\n" +
      "  (Create Token), and put it in .env.local as TURSO_AUTH_TOKEN."
    );
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return (
      "Could not reach the database.\n\n" +
      "  Check your internet connection, and that the URL in .env.local is\n" +
      `  spelled correctly:\n\n    ${url}`
    );
  }
  return `The database rejected the request:\n\n    ${message}`;
}

process.on("uncaughtException", (error) => die(explainDbError(error)));
process.on("unhandledRejection", (error) => die(explainDbError(error)));

console.log(`\n  Connecting to ${url.replace(/\/\/.*@/, "//***@")}`);

/* ── optional reset ─────────────────────────────────────────────── */

if (process.argv.includes("--reset")) {
  // Children first: the parent rows are referenced by the rest.
  for (const table of [
    "settlements",
    "meter_readings",
    "main_meter_readings",
    "recharges",
    "users_meters",
    "main_meters",
    // Tables from the previous month-billing schema, if this database still
    // has them. Dropping them keeps an upgraded database tidy.
    "main_recharges",
  ]) {
    await db.execute(`DROP TABLE IF EXISTS ${table}`);
  }
  console.log("  Dropped every table.");
}

/* ── schema ─────────────────────────────────────────────────────── */

const schema = await readFile(join(here, "schema.sql"), "utf8");

// libSQL executes one statement per call. Strip the `--` comment lines before
// splitting, otherwise the comments trailing the last `;` form an extra
// fragment that SQLite rejects as "incomplete input".
const statements = schema
  .split("\n")
  .filter((line) => !/^\s*--/.test(line))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of statements) {
  await db.execute(statement);
}
console.log(`  Applied ${statements.length} schema statements.`);

/* ── seed ───────────────────────────────────────────────────────── */

if (process.argv.includes("--seed")) {
  const existing = await db.execute(
    "SELECT id FROM main_meters WHERE name = ? LIMIT 1"
  );
  if (existing.rows.length > 0) {
    console.log("  Demo meter already exists — skipping the seed.");
  } else {
    const meter = await db.execute({
      sql: "INSERT INTO main_meters (name, meter_label) VALUES (?, ?) RETURNING id",
      args: ["Shared Meter", "22005588"],
    });
    const meterId = Number(meter.rows[0].id);

    const people = [
      ["B1", "Rosa", "", "b1-2026", 0],
      ["C1", "Sahabur", "", "c1-2026", 1],
    ];
    const ids = {};
    for (const [submitter, userName, meterNumber, passcode, color] of people) {
      const inserted = await db.execute({
        sql: `INSERT INTO users_meters
                (main_meter_id, submitter, user_name, meter_number, passcode, color_index)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [meterId, submitter, userName, meterNumber, passcode, color],
      });
      ids[submitter] = Number(inserted.rows[0].id);
    }

    // Closing readings for three months, so June→July and July→August can both
    // be priced.
    const readings = [
      ["2026-06", "B1", 4108],
      ["2026-06", "C1", 6579],
      ["2026-07", "B1", 4200],
      ["2026-07", "C1", 6640],
      ["2026-08", "B1", 4292],
      ["2026-08", "C1", 6699],
    ];
    for (const [month, submitter, reading] of readings) {
      await db.execute({
        sql: `INSERT INTO meter_readings (main_meter_id, user_id, month_year, reading)
              VALUES (?, ?, ?, ?)`,
        args: [meterId, ids[submitter], month, reading],
      });
    }

    const recharges = [
      ["2026-06-21T12:02", "B1", 495],
      ["2026-07-08T10:46", "B1", 500],
      ["2026-07-21T10:25", "B1", 500],
      ["2026-07-29T10:34", "C1", 500],
      ["2026-08-08T09:02", "C1", 500],
      ["2026-08-16T10:16", "C1", 300],
      ["2026-08-20T10:19", "B1", 500],
    ];
    for (const [at, submitter, amount] of recharges) {
      await db.execute({
        sql: `INSERT INTO recharges
                (main_meter_id, payer_id, recharged_at, month_year, amount, note)
              VALUES (?, ?, ?, ?, ?, '')`,
        args: [meterId, ids[submitter], at, at.slice(0, 7), amount],
      });
    }

    console.log(
      `  Seeded "Shared Meter": 2 people, ${readings.length} readings, ${recharges.length} recharges.`
    );
    console.log("  Demo login → Sub-meter: B1   Passcode: b1-2026");
  }
}

console.log("\n  Database ready.\n");
