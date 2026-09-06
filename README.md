# DESCO Shared Meter — Split & Settle

A building shares one prepaid DESCO main meter. Several people top it up over
time, each flat has its own sub-meter, and every month's cost is divided by the
units each sub-meter actually consumed. Comparing what someone put in against
what their units cost gives a **balance**: positive means they are owed money,
negative means they owe it.

Nobody gets "billed". The ledger says who is ahead and who is behind, and
suggests the fewest payments that would square everyone up.

| Portal | Who | What they can do |
| --- | --- | --- |
| `/` | Everyone sharing a meter | See the whole ledger — every person's units, recharges and balances. Read-only. |
| `/admin` | Whoever keeps the records | Meters, people, monthly readings, recharges, settlements. |

One deployment can hold several main meters, each with its own people and its own
ledger. Nobody can read a meter they do not belong to.

**Free to run.** Netlify's free tier hosts it; Turso's free tier stores the data.
No credit card, no server to maintain.

---

## Contents

- [How the split works](#how-the-split-works)
- [Deploy it (start here)](#deploy-it-start-here)
- [Using it, day to day](#using-it-day-to-day)
- [Running it locally](#running-it-locally)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Database schema](#database-schema)
- [Security notes](#security-notes)
- [Notes on the database client](#notes-on-the-database-client)
- [Troubleshooting](#troubleshooting)
- [Scripts](#scripts)

---

## How the split works

```
Units    = this month's closing reading − last month's closing reading
Rate     = everything recharged this month ÷ every sub-meter's units
Cost     = that person's units × rate
Balance  = what they recharged + settlements − their cost
```

A worked month, two people:

| | Opening | Closing | Units | Cost | Recharged | Balance |
|---|---|---|---|---|---|---|
| B1 | 4108 | 4200 | 92 | ৳901.96 | ৳1000 | **+৳98.04** |
| C1 | 6579 | 6640 | 61 | ৳598.04 | ৳500 | **−৳98.04** |
| | | | **153** | **৳1500** | **৳1500** | **৳0** |

Rate = 1500 ÷ 153 = ৳9.8039 per unit. The costs add back up to exactly what was
recharged, and the balances cancel out: B1 put in ৳98.04 more than they burned,
C1 that much less. C1 hands B1 ৳98.04 and the month is closed.

Four things follow from this, and they are worth knowing before you start.

**The rate comes from the sub-meters, not the main meter.** The money put in has
to be shared over the consumption actually measured. The main meter's own reading
is optional and only used to show the gap — usually common-area load, or a
sub-meter that was misread.

**The ledger needs a starting point.** A month is priced against the month before
it, so a brand-new meter has nothing to measure its first month against.
**Setup → Starting readings** records where every sub-meter stands today, filed as
last month's closing figures. The current month is then the first one that
splits. Skip this and the first month stays unpriced for a full cycle. Nothing
before the starting point is ever charged — those units were settled under
whatever arrangement came before.

**A month is only priced once every sub-meter has both readings.** Until then,
charging anyone would be guesswork. Recharges made into an unpriced month are
reported separately as *pending* rather than being dropped or counted as pure
credit, and they fold into the balances the moment the readings arrive.

**Settlements move a balance toward zero.** Recording that one person handed
money to another clears both sides without inventing a recharge that never
happened. The admin screen suggests the fewest transfers that would square
everyone up — with *n* people that is at most *n−1* payments, not everyone paying
everyone.

---

## Deploy it (start here)

Two free accounts, then one command. Around ten minutes end to end.
**[DEPLOY.md](DEPLOY.md)** covers the same ground in more detail, including what
to do when a step misbehaves.

### Step 1 — Get the code

If you have the zip, unpack it and open a terminal in that folder. Otherwise
clone the repository.

You need **Node.js 20 or newer**:

```bash
node --version
```

If that prints something older, or nothing at all, install it from
<https://nodejs.org> first. Then:

```bash
npm install
```

### Step 2 — Create the database (Turso)

The app stores everything in Turso — SQLite that runs as a service, so the data
survives every deploy. The free tier is far more than this needs (500 databases,
9 GB, a billion row reads a month).

1. Go to <https://turso.tech> and sign up. GitHub or email, either is fine.
2. **Create Database**. Name it something like `shared-meter`, and pick the
   region closest to you.
3. On the database's page, copy two things and keep them to hand:
   - the **URL**, which starts with `libsql://`
   - a **token** — click **Create Token** (full access, no expiry)

> The token is a password for your database. Do not commit it or paste it
> anywhere public. `.env.local`, where it is about to go, is git-ignored.

### Step 3 — Run the guided deploy

```bash
npm run deploy:guided
```

Six steps, done for you:

1. **Netlify login** — opens your browser to authorise the CLI, then creates the
   site. No Netlify account? Sign up at <https://netlify.com> first; it is free.
2. **Turso credentials** — paste the URL and token from step 2.
3. **Secrets** — generates your `ADMIN_SECRET_KEY` and `SESSION_SECRET` unless
   you supply your own. **Write the admin key down when it prints** — it is the
   only way into `/admin`.
4. **Environment variables** — pushes all four to Netlify.
5. **Database tables** — creates them, and offers demo data so you can click
   around before entering anything real.
6. **Build and publish** — prints both portal URLs when it finishes.

Ctrl+C before the last step deploys nothing. Re-running is safe: values you
already have are reused, and the schema uses `CREATE TABLE IF NOT EXISTS`.

### Step 4 — Sign in

Open the URL it printed.

- `/admin` — your `ADMIN_SECRET_KEY`
- `/` — where everyone else signs in, once you have added them

Now go to [Using it, day to day](#using-it-day-to-day).

### Redeploying later

After changing anything, two commands:

```bash
npm run build:netlify
npm run deploy
```

> **Why two?** `netlify deploy --build` restores the original publish directory
> after the Next.js plugin has swapped in its own, so the server function never
> reaches Netlify and every route 404s. Building first and deploying with
> `--no-build --dir=.netlify/static` — which `npm run deploy` already does —
> uploads what the plugin actually produced.

### Doing it by hand instead

```bash
# 1. Log in and create the site
npx netlify login
npx netlify init            # choose "Create & configure a new site"

# 2. Set the four environment variables
npx netlify env:set TURSO_DATABASE_URL "libsql://your-db.turso.io"
npx netlify env:set TURSO_AUTH_TOKEN   "eyJhbGciOi..."
npx netlify env:set ADMIN_SECRET_KEY   "a-long-random-string-you-choose"
npx netlify env:set SESSION_SECRET     "64-random-hex-characters"

# 3. Create the tables (add -- --seed for demo data)
npm run db:setup

# 4. Build and publish
npm run build:netlify && npm run deploy
```

Generate a `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Step 3 reads `.env.local`, so create that first — see
[Running it locally](#running-it-locally).

### Deploying from Git instead

If you would rather Netlify rebuild on every push: create a repository, push this
folder, then **app.netlify.com → Add new site → Import an existing project** and
pick it. `netlify.toml` already declares the build command, the publish
directory, Node 20 and the `@netlify/plugin-nextjs` runtime, so the defaults are
correct. Add the same four environment variables under **Site configuration →
Environment variables** before the first deploy, and run `npm run db:setup` once
against the production database.

### The four environment variables

| Key | What it is | Where it comes from |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Your database address | Turso dashboard, starts `libsql://` |
| `TURSO_AUTH_TOKEN` | Password for it | Turso dashboard → Create Token |
| `ADMIN_SECRET_KEY` | Your `/admin` login | You choose. Make it long and random. |
| `SESSION_SECRET` | Signs the login cookies | 64 random hex characters, generated |

`ADMIN_SECRET_KEY` is the only thing between the public internet and every
reading, passcode and balance in the system. Do not make it guessable.

To change one later:

```bash
npx netlify env:set ADMIN_SECRET_KEY "the-new-value"
npm run build:netlify && npm run deploy
```

---

## Using it, day to day

### Setting up a meter (once)

In `/admin`:

1. **Create a main meter.** Give it a name; the DESCO meter number is optional.
2. **Setup → People.** Add everyone sharing it. Each needs a sub-meter label
   (`B1`, `Flat 3B` — whatever you already call it), a name, and a passcode. The
   key icon suggests a passcode; the copy button puts it on your clipboard so you
   can send it to them.
3. **Setup → Starting readings.** Enter what each sub-meter reads *today*, and
   the main meter too if you want the cross-check working from the first month.
   This is what lets the very next month be split. Do not skip it.
4. Give each person their sub-meter label and passcode. They sign in at the site
   root.

### Each month

1. **Recharges** — log every top-up as it happens: when, how much, who paid.
   Quick-amount buttons cover the usual figures.
2. **Readings** — at the end of the month, pick that month and enter each
   sub-meter's closing reading. The previous month sits beside it and the units
   update as you type. A reading below last month's is refused: meters do not run
   backwards, so that is a typo.
3. **Overview** — the month is now priced. Check where everyone stands.
4. **Settle up** — when someone pays another to clear their balance, record it.
   The suggested transfers show the fewest payments that square everyone up;
   click one to fill the form.

### What everyone else sees

They sign in at `/` with their sub-meter label and passcode, and see the same
ledger you do — everyone's units, recharges and balances, month by month. That is
deliberate: a split nobody can check is a split nobody trusts. What they cannot
see is anyone's passcode, any other meter, or any way to change a number.

---

## Running it locally

Only needed if you want to change the code. To just use the app, the deploy above
is enough.

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:setup               # add -- --seed for demo data
npm run dev                    # http://localhost:3000
```

`.env.local` needs the same four variables as production. You can point it at the
same Turso database or a second one — a second is safer, since local experiments
then cannot disturb real records.

With `--seed` you get a worked example: one meter, two people (B1/Rosa and
C1/Sahabur), three months of readings and seven recharges — the figures in the
table at the top. Demo login: `B1` / `b1-2026`.

`npm run db:setup -- --reset` drops every table first, which is how you rebuild
after a schema change. **It deletes all data.**

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS — slate/blue palette, glassmorphism cards |
| Icons | Lucide React |
| Database | Turso / libSQL over HTTP (`@libsql/client/web`) |
| Auth | Signed `HttpOnly` JWT session cookie (`jose`), HS256 |
| Hosting | Netlify + `@netlify/plugin-nextjs` |

---

## Project layout

```
├── netlify.toml              Netlify build + Next.js runtime plugin
├── .env.example              Environment variable template
├── scripts/
│   ├── schema.sql            Six tables and their indexes
│   ├── setup-db.mjs          Applies the schema; --seed, --reset
│   └── deploy.mjs            Guided Netlify deploy
└── src/
    ├── app/
    │   ├── page.tsx          Shared view — the site root
    │   ├── admin/page.tsx    Admin dashboard
    │   └── api/
    │       ├── auth/         admin | user | session | logout
    │       ├── admin/        meters | people | baseline | readings |
    │       │                 recharges | settlements | ledger
    │       └── user/ledger   the caller's own meter, read-only
    ├── components/
    │   ├── ledger/           Views shared by both dashboards
    │   ├── admin/            Baseline, readings, recharge, settlement, setup
    │   ├── LoginCard.tsx     Sign-in card for both portals
    │   ├── Toast.tsx         Toast notifications
    │   └── ui.tsx            StatCard, BalanceBadge, PersonChip, Tabs…
    └── lib/
        ├── billing.ts        The split, the balances, settlement suggestions
        ├── queries.ts        Every SQL statement
        ├── db.ts             libSQL client singleton
        ├── auth.ts           Session cookie, constant-time compare, guards
        ├── api.ts            JSON envelope, validation, error mapping
        ├── ratelimit.ts      Login throttle
        ├── client.ts         Browser-side fetch wrapper
        └── types.ts          Shared types
```

---

## Database schema

**`main_meters`** — one physical DESCO main meter
`id`, `name` (unique), `meter_label`, `created_at`

**`users_meters`** — one person and their sub-meter
`id`, `main_meter_id`, `submitter` (the sub-meter's label, e.g. "B1"),
`user_name`, `meter_number`, `passcode`, `color_index`, `created_at`
— unique on `(main_meter_id, submitter)`: labels are per meter, so two buildings
can each have a "B1".

**`recharges`** — one top-up, paid by one person
`id`, `main_meter_id`, `payer_id`, `recharged_at`, `month_year` (derived),
`amount`, `note`, `created_at`

**`meter_readings`** — a month's closing reading for one sub-meter
`id`, `main_meter_id`, `user_id`, `month_year`, `reading`, `updated_at`
— unique on `(user_id, month_year)`, which makes the batch entry screen an
idempotent upsert. Only the closing figure is stored; the previous month's
closing reading is the opening one.

**`main_meter_readings`** — the main meter's own closing reading, for
cross-checking only
`id`, `main_meter_id`, `month_year`, `reading`, `updated_at`

**`settlements`** — one person paying another to clear a balance
`id`, `main_meter_id`, `from_user_id`, `to_user_id`, `settled_at`, `month_year`,
`amount`, `note`, `created_at`

---

## Security notes

- **Session cookies** are `HttpOnly`, `SameSite=Lax`, `Secure` in production, and
  signed with HS256 — a tampered or expired token is treated as signed out.
- **Meter isolation**: `/api/user/ledger` takes the main meter id from the signed
  session, never from the request. There is no parameter to change, so nobody can
  read a meter they do not belong to, and passcodes are stripped from every
  payload the shared view receives.
- **The shared view is read-only.** It exposes exactly one route, a GET. Every
  change goes through an admin route, and each of those calls `requireAdmin()`
  before touching the database.
- **What people on a meter *can* see** is deliberate: everyone's units, recharges
  and balances. A split nobody can check is a split nobody trusts. What they
  cannot see is anyone's passcode, or any other meter.
- **Constant-time comparison** for both the admin key and passcodes, so a
  response time cannot reveal how many characters matched.
- **No account enumeration**: an unknown sub-meter and a wrong passcode return
  the same message.
- **Duplicate labels resolve by passcode**: two meters may each have a "B1", so
  the login checks every candidate and picks the one whose passcode matches —
  comparing all of them either way, so the timing does not reveal how many share
  a label.
- **Login throttling**: 8 attempts per minute per IP, per portal.

Passcodes are stored in plain text so the admin can read one back and hand it
over — the same trade-off as writing it on a slip of paper. They guard a ledger
its own participants are meant to see. If you would rather they be irreversible,
hash them in `createPerson` / `updatePerson`, compare the hash in
`/api/auth/user`, and drop `passcode` from `listPeopleForAdmin`.

---

## Notes on the database client

`src/lib/db.ts` imports `@libsql/client/web`, not the package default. The default
entry point resolves to the Node build, which loads the `libsql` native addon —
that addon is not present in a Netlify Function bundle, so importing it crashes
the module before any route handler runs (every request returns a bare 500, with
nothing reaching your own error handling).

The `/web` entry talks to Turso over plain HTTP instead, which is what works in a
serverless function. The cost is that `file:` URLs no longer open, so local
development points at a real Turso database as well. `scripts/setup-db.mjs` runs
under plain Node and still uses the default client, so it can apply the schema to
either.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `TURSO_DATABASE_URL is not set` | The variable is missing in Netlify, or scoped to the wrong deploy context. Check with `npm run netlify:env`, then redeploy. |
| `SESSION_SECRET must be set to at least 32 characters` | Too short. Generate 64 hex characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `no such table: users_meters` | The schema step was skipped — run `npm run db:setup` against the production database. |
| The first month never splits on a new meter | No starting point was recorded. Setup → Starting readings, enter today's figures, and the next month prices immediately. |
| A month shows "not split yet" | Some sub-meter is missing a closing reading for that month or the one before. Enter it and the month prices itself. |
| Money shows as "not split yet" | Recharges landed in a month that cannot be priced. They are not lost — they count as soon as the readings arrive. |
| A balance looks too good | Check the pending figure. Until a month is priced, its recharges are excluded from the totals rather than counted as credit. |
| Reading cell highlighted red | The closing reading is below last month's. A meter does not run backwards — the save is refused until it is corrected. |
| Main meter shows "unaccounted" units | The main meter measured more than the sub-meters add up to. Usually common-area load; a large gap suggests a misread sub-meter. |
| Every route returns 404 after a deploy | The server function was not uploaded. Run `npm run build:netlify` then `npm run deploy` as two steps, not `netlify deploy --build`. |
| Page loads unstyled, spinner never resolves | The static assets were not uploaded — every `/_next/static/*` request 404s. The deploy needs `--dir=.netlify/static`, which `npm run deploy` passes. |
| Every API route returns a bare 500 | Usually the native libSQL addon being pulled into the bundle. Check that `src/lib/db.ts` imports `@libsql/client/web`. |
| `TURSO_DATABASE_URL must be an libsql:// URL` | A `file:` URL was configured. The HTTP client cannot open local files — use a Turso database. |
| Data disappears after a deploy | Same cause: `TURSO_DATABASE_URL` is a `file:` URL. Netlify's filesystem is ephemeral — use a `libsql://` URL. |

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on <http://localhost:3000> |
| `npm run build` | Production build |
| `npm start` | Serve the production build locally |
| `npm run lint` | Next.js ESLint |
| `npm run db:setup` | Apply the schema (`-- --seed` demo data, `-- --reset` wipes) |
| `npm run deploy:guided` | Guided first deploy — login, env vars, schema, publish |
| `npm run build:netlify` | Run the Netlify build without deploying |
| `npm run deploy` | Publish the built output to production |
| `npm run netlify:env` | List the environment variables Netlify currently holds |
