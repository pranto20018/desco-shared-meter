#!/usr/bin/env node
/**
 * One-command Netlify deploy.
 *
 *   npm run deploy:guided
 *
 * Walks through everything a first deploy needs:
 *   1. Netlify login + site link
 *   2. Collect the Turso URL and token
 *   3. Generate ADMIN_SECRET_KEY / SESSION_SECRET if you don't have them
 *   4. Push all four variables to Netlify
 *   5. Apply the database schema
 *   6. Build and deploy to production
 *
 * Re-running it is safe: existing variables are shown and kept unless you
 * choose to replace them, and the schema uses CREATE TABLE IF NOT EXISTS.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rl = createInterface({ input: process.stdin, output: process.stdout });

// ANSI helpers. The escape is written out rather than embedded as a raw
// control byte, so the file stays plain ASCII.
const paint = (code) => (s) => `\u001b[${code}m${s}\u001b[0m`;
const B = paint(1);
const DIM = paint(2);
const OK = paint(32);
const WARN = paint(33);
const ERR = paint(31);

function step(n, title) {
  console.log(`\n${B(`── Step ${n} ${"─".repeat(Math.max(0, 46 - title.length))} ${title}`)}\n`);
}

/** Runs a command with its output attached to this terminal. */
function run(command, args, { allowFailure = false, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => {
      if (code === 0 || allowFailure) resolve(code);
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

/** Runs a command and captures stdout instead of printing it. */
function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: process.platform === "win32",
      env: process.env,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", () => {});
    child.on("close", (code) => resolve({ code, out }));
    child.on("error", () => resolve({ code: 1, out: "" }));
  });
}

const netlify = ["netlify"];
async function nf(args, options) {
  return run("npx", [...netlify, ...args], options);
}
async function nfCapture(args) {
  return capture("npx", [...netlify, ...args]);
}

async function ask(question, fallback = "") {
  const suffix = fallback ? ` ${DIM(`[${fallback}]`)}` : "";
  const answer = (await rl.question(`${question}${suffix}\n> `)).trim();
  return answer || fallback;
}

async function confirm(question, defaultYes = true) {
  const answer = (
    await rl.question(`${question} ${DIM(defaultYes ? "[Y/n]" : "[y/N]")} `)
  )
    .trim()
    .toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith("y");
}

/* ── main ─────────────────────────────────────────────────────── */

console.log(
  B("\n  DESCO Meter Billing — guided Netlify deploy\n") +
    DIM("  Ctrl+C at any point is safe; nothing is deployed until the last step.\n")
);

try {
  /* 1. login + link */
  step(1, "Netlify account");

  const status = await nfCapture(["status", "--json"]);
  let linkedSite = null;
  let authenticated = false;

  // `netlify status` can exit 0 while still reporting that it needs a login, so
  // trust the parsed payload rather than the exit code.
  if (status.code === 0) {
    try {
      const parsed = JSON.parse(status.out);
      const account = parsed?.account?.Name ?? parsed?.user?.email;
      if (account) {
        authenticated = true;
        linkedSite = parsed?.siteData?.name ?? null;
        console.log(`  Logged in as ${OK(account)}`);
      }
    } catch {
      /* not JSON — treat as not authenticated and log in below */
    }
  }

  if (!authenticated) {
    console.log("  Opening your browser to authorize the Netlify CLI…");
    await nf(["login"]);

    // Pick up the site link if this machine was already configured for one.
    const after = await nfCapture(["status", "--json"]);
    try {
      linkedSite = JSON.parse(after.out)?.siteData?.name ?? null;
    } catch {
      linkedSite = null;
    }
  }

  if (linkedSite) {
    console.log(`  Linked to site ${OK(linkedSite)}`);
    if (!(await confirm("  Deploy to this site?"))) {
      await nf(["unlink"], { allowFailure: true });
      linkedSite = null;
    }
  }

  if (!linkedSite) {
    console.log(
      "\n  No site linked yet. The next prompt creates one (choose\n" +
        `  ${B("Create & configure a new site")}) or links an existing one.\n`
    );
    await nf(["init"]);
  }

  /* 2. database credentials */
  step(2, "Turso database");

  console.log(
    "  This app stores data in Turso (serverless SQLite, free tier).\n" +
      `  Create a database at ${B("https://turso.tech")} — sign up, ${B("Create Database")},\n` +
      "  then copy its URL and create a token from the database's page.\n"
  );

  const envFile = join(root, ".env.local");
  const existing = {};
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) existing[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }

  let dbUrl = await ask(
    `  ${B("TURSO_DATABASE_URL")} (starts with libsql://)`,
    existing.TURSO_DATABASE_URL ?? ""
  );
  while (!/^libsql:\/\/.+/.test(dbUrl)) {
    if (dbUrl.startsWith("file:")) {
      console.log(
        ERR(
          "  A file: URL only works locally — Netlify's filesystem is read-only.\n" +
            "  Use the libsql:// URL from your Turso dashboard."
        )
      );
    } else {
      console.log(ERR("  That does not look like a libsql:// URL."));
    }
    dbUrl = await ask(`  ${B("TURSO_DATABASE_URL")}`);
  }

  let dbToken = await ask(
    `  ${B("TURSO_AUTH_TOKEN")} (the long eyJ… string)`,
    existing.TURSO_AUTH_TOKEN ?? ""
  );
  while (dbToken.length < 20) {
    console.log(ERR("  That token looks too short."));
    dbToken = await ask(`  ${B("TURSO_AUTH_TOKEN")}`);
  }

  /* 3. secrets */
  step(3, "Admin key & session secret");

  let adminKey = existing.ADMIN_SECRET_KEY ?? "";
  if (adminKey) {
    console.log(`  Found an existing admin key in .env.local (${adminKey.length} chars).`);
    if (!(await confirm("  Keep it?"))) adminKey = "";
  }
  if (!adminKey) {
    adminKey = await ask(
      `  ${B("ADMIN_SECRET_KEY")} — your admin login. Blank generates one`
    );
    if (!adminKey) {
      adminKey = `admin-${randomBytes(12).toString("base64url")}`;
      console.log(`  Generated: ${OK(adminKey)}`);
      console.log(WARN("  Save this now — it is the only way into /admin."));
    }
  }

  let sessionSecret = existing.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) {
    sessionSecret = randomBytes(32).toString("hex");
    console.log(`  Generated a 64-character SESSION_SECRET.`);
  } else {
    console.log("  Reusing the SESSION_SECRET from .env.local.");
  }

  const vars = {
    TURSO_DATABASE_URL: dbUrl,
    TURSO_AUTH_TOKEN: dbToken,
    ADMIN_SECRET_KEY: adminKey,
    SESSION_SECRET: sessionSecret,
  };

  // Keep a local copy so re-runs and `npm run dev` pick the same values up.
  writeFileSync(
    envFile,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    "utf8"
  );
  console.log(`  Written to ${DIM(".env.local")} (git-ignored).`);

  /* 4. push env vars */
  step(4, "Push variables to Netlify");

  for (const [key, value] of Object.entries(vars)) {
    process.stdout.write(`  ${key} … `);
    const result = await nfCapture([
      "env:set",
      key,
      value,
      "--context",
      "all",
      "--force",
    ]);
    console.log(result.code === 0 ? OK("set") : ERR("failed"));
    if (result.code !== 0) {
      console.log(
        WARN(
          `    Set it by hand: Netlify → Site configuration → Environment variables → ${key}`
        )
      );
    }
  }

  /* 5. schema */
  step(5, "Create the database tables");

  const seed = await confirm(
    "  Add 6 demo flats and a sample month so you can click around first?",
    false
  );
  await run("node", ["scripts/setup-db.mjs", ...(seed ? ["--seed"] : [])], {
    env: { TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: dbToken },
  });

  /* 6. deploy */
  step(6, "Build & deploy");

  if (!(await confirm("  Build and deploy to production now?"))) {
    console.log(
      `\n  Stopped before deploying. Run ${B("npm run deploy")} when you are ready.\n`
    );
    rl.close();
    process.exit(0);
  }

  // Two steps on purpose. `deploy --build` restores the original publish
  // directory after the Next plugin runs, so the SSR handler function never
  // gets uploaded and every route 404s. Building first and deploying with
  // --no-build uploads what the plugin actually produced.
  await nf(["build"]);
  await nf(["deploy", "--prod", "--no-build", "--dir=.netlify/static"]);

  const final = await nfCapture(["status", "--json"]);
  let url = "";
  try {
    url = JSON.parse(final.out)?.siteData?.ssl_url ?? "";
  } catch {
    /* the deploy output above already printed the URL */
  }

  console.log(`\n${B("  Deployed.")}\n`);
  if (url) {
    console.log(`  Tenant portal  ${OK(url)}`);
    console.log(`  Admin portal   ${OK(`${url}/admin`)}`);
  }
  console.log(`\n  Admin key      ${B(adminKey)}`);
  if (seed) {
    console.log(`  Demo tenant    ${B("Flat 1A")} / ${B("flat1a-2026")}`);
  }
  console.log(
    "\n  Next: sign in to /admin, save this month's recharge and main units,\n" +
      "  add your flats, then enter the sub-meter readings.\n"
  );
} catch (error) {
  console.log(`\n${ERR("  Deploy stopped:")} ${error.message}\n`);
  console.log(
    "  Nothing is broken — fix the issue above and run " +
      B("npm run deploy:guided") +
      " again.\n"
  );
  rl.close();
  process.exit(1);
}

rl.close();
