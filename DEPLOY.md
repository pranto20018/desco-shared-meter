# Deploy guide

Getting this online, from nothing. Two free accounts, then one command — about
ten minutes. No credit card, no server.

Everything here is also in the [README](README.md); this file is just the deploy
path on its own.

---

## What you are setting up

| Piece | Who provides it | Cost |
| --- | --- | --- |
| The website | Netlify | Free tier |
| The database | Turso (hosted SQLite) | Free tier |

The data lives in Turso rather than in a file, because Netlify's filesystem is
wiped on every deploy. That is the only reason the second account is needed.

---

## Before you start

**Node.js 20 or newer.** Check:

```bash
node --version
```

If that prints `v18…`, something older, or an error, install the current LTS from
<https://nodejs.org> and reopen your terminal.

**The code.** Unpack the zip (or clone the repo) and open a terminal in that
folder. You should see `package.json` when you run `ls` — if not, you are in the
wrong directory.

**The dependencies:**

```bash
npm install
```

This takes a minute or two the first time.

---

## Step 1 — Create the database

1. Go to <https://turso.tech> and sign up. GitHub or email, either works.
2. Click **Create Database**. Name it something like `shared-meter`. Pick the
   region closest to you — Bangladesh is best served by one of the Asia regions.
3. Open the database and collect two values:

   **The URL** — shown on the database page, starting with `libsql://`. It looks
   like:

   ```
   libsql://shared-meter-yourname.aws-ap-northeast-1.turso.io
   ```

   **A token** — click **Create Token**. Choose full access and no expiry. It is
   a long string starting `eyJ…`. Copy it now; some dashboards only show it once.

Keep both somewhere for the next step.

> The token is a password for your database. Never commit it or paste it
> anywhere public. It is about to go into `.env.local`, which is git-ignored.

---

## Step 2 — Create the Netlify account

Sign up at <https://netlify.com> if you have not already. Nothing else to do
here — the next step logs in for you through the browser.

---

## Step 3 — Run the guided deploy

```bash
npm run deploy:guided
```

It walks through six steps:

**1. Netlify login.** Opens your browser to authorise the CLI, then creates the
site. If you already have a site linked, it asks whether to use that one.

**2. Turso credentials.** Paste the URL and token from step 1. It checks the URL
looks right before moving on.

**3. Secrets.** Two are needed:

- `ADMIN_SECRET_KEY` — your login for `/admin`. Press Enter and it generates a
  strong one. **Write it down when it prints.** There is no recovery flow; losing
  it means setting a new one from the terminal.
- `SESSION_SECRET` — signs the login cookies. Generated automatically; you never
  need to see it.

**4. Environment variables.** Pushes all four to Netlify.

**5. Database tables.** Creates them. It offers demo data — one meter, two
people, three months of readings — which is worth taking the first time so you
can see how the screens behave before entering anything real. You can wipe it
later with `npm run db:setup -- --reset`.

**6. Build and publish.** Takes two to three minutes, then prints your URLs.

Ctrl+C at any point before step 6 deploys nothing. Re-running is safe.

---

## Step 4 — Check it works

Open the URL it printed. You should see the sign-in card, styled, with no
spinner stuck on screen.

Then visit `/admin` and sign in with your `ADMIN_SECRET_KEY`.

If you took the demo data, the shared view accepts `B1` / `b1-2026` and you can
see a ledger with real figures in it.

Working? Go to [Using it, day to day](README.md#using-it-day-to-day) in the
README and set up your real meter.

---

## Redeploying after a change

Two commands, always in this order:

```bash
npm run build:netlify
npm run deploy
```

**Why two and not `netlify deploy --build`?** The Next.js plugin swaps in its own
publish directory during the build and restores the original afterwards. A
combined `deploy --build` therefore uploads the raw Next output — no server
function, no static assets — and every route 404s. Building first and deploying
with `--no-build --dir=.netlify/static`, which `npm run deploy` already passes,
uploads what the plugin actually produced.

---

## Doing it manually

If the guided script fails, or you would rather see each step:

```bash
# 1. Log in and create the site
npx netlify login
npx netlify init            # choose "Create & configure a new site"

# 2. Set the four environment variables
npx netlify env:set TURSO_DATABASE_URL "libsql://your-db.turso.io"
npx netlify env:set TURSO_AUTH_TOKEN   "eyJhbGciOi..."
npx netlify env:set ADMIN_SECRET_KEY   "a-long-random-string-you-choose"
npx netlify env:set SESSION_SECRET     "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# 3. Create the tables
npm run db:setup            # add -- --seed for demo data

# 4. Build and publish
npm run build:netlify && npm run deploy
```

On Windows PowerShell, `$(…)` does not expand — generate the secret separately:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx netlify env:set SESSION_SECRET "paste-the-output-here"
```

Step 3 reads `.env.local`, so create it first:

```bash
cp .env.example .env.local
```

…and fill in the same four values.

---

## Deploying from Git instead

If you would rather Netlify rebuild on every push:

1. Create a repository and push this folder to it.
2. **app.netlify.com → Add new site → Import an existing project**, and pick it.
3. Leave the build settings alone. `netlify.toml` already declares the build
   command, publish directory, Node 20 and the `@netlify/plugin-nextjs` runtime.
4. **Before the first deploy**, add the four environment variables under **Site
   configuration → Environment variables**, scoped to all deploy contexts.
5. Run `npm run db:setup` once from your machine, pointed at the production
   database, to create the tables.

Then every push to the default branch deploys itself, and the two-step dance
above stops being necessary.

---

## The four environment variables

| Key | What it is | Where it comes from |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Your database address | Turso dashboard, starts `libsql://` |
| `TURSO_AUTH_TOKEN` | Password for it | Turso dashboard → Create Token |
| `ADMIN_SECRET_KEY` | Your `/admin` login | You choose. Long and random. |
| `SESSION_SECRET` | Signs the login cookies | 64 random hex characters |

See what Netlify currently holds:

```bash
npm run netlify:env
```

Change one:

```bash
npx netlify env:set ADMIN_SECRET_KEY "the-new-value"
npm run build:netlify && npm run deploy
```

A changed variable only takes effect after a redeploy.

`ADMIN_SECRET_KEY` is the only thing between the public internet and every
reading, passcode and balance in the system. Do not leave it as something
guessable.

---

## If something goes wrong

| What you see | What it means |
| --- | --- |
| Every route returns 404 | The server function was not uploaded. Run the two steps separately — `npm run build:netlify`, then `npm run deploy`. |
| Page loads with no styling, spinner never stops | The static assets were not uploaded. Same fix: `npm run deploy` passes the `--dir` flag that handles this. |
| `TURSO_DATABASE_URL is not set` | The variable is missing on Netlify, or scoped to the wrong context. `npm run netlify:env` to check, then redeploy. |
| `no such table: users_meters` | Step 3 was skipped. Run `npm run db:setup`. |
| `SESSION_SECRET must be set to at least 32 characters` | Too short. Generate 64 hex characters with the command above. |
| Every API route returns a bare 500 | Check that `src/lib/db.ts` imports `@libsql/client/web` — the native addon does not exist in a Netlify Function. |
| Data disappears after a deploy | `TURSO_DATABASE_URL` is a `file:` URL. Netlify's disk is wiped on deploy; use the `libsql://` URL. |
| 401 on every page, redirected to a Netlify login | Netlify's own team access protection is on for the site. Turn it off under **Site configuration → Access control**. |
| `JSONHTTPError: Not Found` from `netlify env:set` | That site cannot take environment variables through the CLI. Create a fresh site (`npx netlify sites:create`), link it, and set them there. |

The longer troubleshooting table, covering the app itself rather than the deploy,
is in the [README](README.md#troubleshooting).

---

## Keeping it running

Nothing to maintain. Netlify serves the site, Turso holds the data, and both free
tiers comfortably cover a building's worth of monthly readings.

Two things worth doing once you are past the demo:

- **Wipe the demo data** before entering real records:
  `npm run db:setup -- --reset` (this deletes everything, then recreates the
  empty tables).
- **Back up occasionally.** Turso's dashboard can dump the database, or install
  its CLI and run `turso db shell <name> ".dump" > backup.sql`.
