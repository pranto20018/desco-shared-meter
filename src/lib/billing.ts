import type {
  Cycle,
  CyclePerson,
  MainMeterReading,
  MeterReading,
  PublicUserMeter,
  Recharge,
  Settlement,
} from "./types";

/**
 * Cost split for a shared prepaid main meter.
 *
 *   Units      = this month's closing reading − last month's closing reading
 *   Rate       = everything recharged this month ÷ every sub-meter's units
 *   Cost       = that person's units × rate
 *   Balance    = what they recharged + settlements received − their cost
 *
 * The rate comes from the *sub-meters*, not from the main meter: the money
 * put in has to be shared out over the consumption actually measured. The
 * main meter's own reading is kept only to show the gap between it and the
 * sub-meters (common-area load, or a sub-meter that was misread).
 *
 * Balances are per month and simply add up. A positive total means the
 * person put in more than they burned and is owed the difference.
 */

export const MONEY_PRECISION = 2;
export const RATE_PRECISION = 4;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // +Number.EPSILON nudges values like 1.005 off their float representation so
  // they round half-up the way someone reading the number expects.
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const money = (value: number): number => roundTo(value, MONEY_PRECISION);
export const rateOf = (value: number): number => roundTo(value, RATE_PRECISION);

/* ── month helpers ──────────────────────────────────────────────── */

export function isValidMonthYear(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** "2026-08-16T10:16" → "2026-08". Returns "" if unparseable. */
export function monthOf(timestamp: string): string {
  const match = /^(\d{4}-\d{2})/.exec(timestamp);
  return match ? match[1] : "";
}

/** Current month as "YYYY-MM" in Asia/Dhaka, where the meters are. */
export function currentMonthYear(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** The month before the given "YYYY-MM". */
export function previousMonthYear(monthYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!match) return monthYear;
  const d = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" → "August 2026". */
export function formatMonthYear(monthYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!match) return monthYear;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/* ── formatting ─────────────────────────────────────────────────── */

export function formatBDT(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `BDT ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact form for dense tables and cards: "৳1,234.50". */
export function taka(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `৳${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUnits(units: number): string {
  const n = Number.isFinite(units) ? units : 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} kWh`;
}

/** "2026-08-16T10:16" → "16 Aug 2026, 10:16". */
export function formatDateTime(timestamp: string): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.replace("T", " ");
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How a balance should read to a person: owed, owing, or square. */
export function describeBalance(balance: number): {
  tone: "positive" | "negative" | "settled";
  label: string;
  amount: number;
} {
  if (Math.abs(balance) < 0.01) {
    return { tone: "settled", label: "Settled", amount: 0 };
  }
  return balance > 0
    ? { tone: "positive", label: "to receive", amount: balance }
    : { tone: "negative", label: "owes", amount: Math.abs(balance) };
}

/** The palette the UI colours people with; index stored on each person. */
export const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#4f46e5",
  "#ea580c",
] as const;

export function colorFor(index: number): string {
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i];
}

/* ── the ledger ─────────────────────────────────────────────────── */

interface BuildCyclesInput {
  people: PublicUserMeter[];
  readings: MeterReading[];
  mainReadings: MainMeterReading[];
  recharges: Recharge[];
  settlements: Settlement[];
}

/**
 * Turns raw rows into one cycle per month, oldest first.
 *
 * A month is only priced once every listed person has both a closing reading
 * for it and one for the month before — until then the units are unknown, so
 * charging anyone would be guesswork. Recharges made in an unpriced month are
 * reported separately as "pending" rather than being silently dropped.
 */
export function buildCycles({
  people,
  readings,
  mainReadings,
  recharges,
  settlements,
}: BuildCyclesInput): Cycle[] {
  if (people.length === 0) return [];

  // reading[userId][month] and mainReading[month] for direct lookup.
  const byUser = new Map<number, Map<string, number>>();
  for (const person of people) byUser.set(person.id, new Map());
  for (const row of readings) {
    byUser.get(row.user_id)?.set(row.month_year, row.reading);
  }

  const mainByMonth = new Map<string, number>();
  for (const row of mainReadings) mainByMonth.set(row.month_year, row.reading);

  // Every month that carries a reading, oldest first. The first such month has
  // no predecessor to subtract from, so it seeds the opening figures only.
  const months = Array.from(new Set(readings.map((r) => r.month_year))).sort();

  const cycles: Cycle[] = [];

  for (const month of months) {
    const previous = previousMonthYear(month);

    const perPerson: CyclePerson[] = [];
    let totalUnits = 0;
    let complete = true;

    for (const person of people) {
      const map = byUser.get(person.id);
      const closing = map?.get(month);
      const opening = map?.get(previous);

      if (closing == null || opening == null) complete = false;

      // A meter never runs backwards; a negative delta is bad data, so clamp
      // rather than crediting the person with negative consumption.
      const units =
        closing != null && opening != null ? Math.max(0, money(closing - opening)) : 0;
      totalUnits += units;

      perPerson.push({
        user_id: person.id,
        submitter: person.submitter,
        user_name: person.user_name,
        color_index: person.color_index,
        reading: closing ?? null,
        previous_reading: opening ?? null,
        units,
        cost: 0,
        paid: 0,
        settled: 0,
        balance: 0,
      });
    }

    const monthRecharges = recharges.filter((r) => r.month_year === month);
    const rechargeTotal = money(
      monthRecharges.reduce((sum, r) => sum + r.amount, 0)
    );

    const monthSettlements = settlements.filter((s) => s.month_year === month);

    const rate = totalUnits > 0 ? rateOf(rechargeTotal / totalUnits) : 0;

    for (const entry of perPerson) {
      entry.paid = money(
        monthRecharges
          .filter((r) => r.payer_id === entry.user_id)
          .reduce((sum, r) => sum + r.amount, 0)
      );

      // A settlement moves a balance toward zero, so it carries the opposite
      // sign to the balance it clears. Receiving money means you were owed it
      // and now are not, which *reduces* your balance; handing money over
      // discharges a debt, which raises yours.
      const received = monthSettlements
        .filter((s) => s.to_user_id === entry.user_id)
        .reduce((sum, s) => sum + s.amount, 0);
      const given = monthSettlements
        .filter((s) => s.from_user_id === entry.user_id)
        .reduce((sum, s) => sum + s.amount, 0);
      entry.settled = money(given - received);

      entry.cost = complete ? money(entry.units * rate) : 0;
      entry.balance = money(entry.paid + entry.settled - entry.cost);
    }

    const mainClosing = mainByMonth.get(month);
    const mainOpening = mainByMonth.get(previous);
    const mainUnits =
      mainClosing != null && mainOpening != null
        ? money(mainClosing - mainOpening)
        : null;

    cycles.push({
      month_year: month,
      complete,
      total_units: money(totalUnits),
      recharge_total: rechargeTotal,
      recharge_count: monthRecharges.length,
      rate,
      main_units: mainUnits,
      main_diff: mainUnits == null ? null : money(mainUnits - totalUnits),
      people: perPerson,
    });
  }

  // The oldest month can never be priced — nothing precedes it to measure from.
  // Keep it only if it has recharges worth reporting.
  return cycles.filter(
    (c, index) => index > 0 || c.recharge_total > 0 || c.total_units > 0
  );
}

/** Sums every cycle into one running position per person. */
export function totalsFrom(
  cycles: Cycle[],
  people: PublicUserMeter[]
): Array<{
  user_id: number;
  submitter: string;
  user_name: string;
  color_index: number;
  units: number;
  cost: number;
  paid: number;
  settled: number;
  balance: number;
}> {
  // Only priced months count. Money put into a month that cannot be costed yet
  // would otherwise show up as pure credit — the payer would look owed the full
  // amount until the readings arrive. That money is reported by pendingFrom()
  // instead, and folds into the balance once the month is priceable.
  const priced = cycles.filter((c) => c.complete);

  return people.map((person) => {
    let units = 0;
    let cost = 0;
    let paid = 0;
    let settled = 0;

    for (const cycle of priced) {
      const entry = cycle.people.find((p) => p.user_id === person.id);
      if (!entry) continue;
      units += entry.units;
      cost += entry.cost;
      paid += entry.paid;
      settled += entry.settled;
    }

    return {
      user_id: person.id,
      submitter: person.submitter,
      user_name: person.user_name,
      color_index: person.color_index,
      units: money(units),
      cost: money(cost),
      paid: money(paid),
      settled: money(settled),
      balance: money(paid + settled - cost),
    };
  });
}

/**
 * Recharges that have not been priced yet, because no month after them has a
 * complete set of readings. They are money already in the meter, so they are
 * shown separately rather than being lost.
 */
export function pendingFrom(
  cycles: Cycle[],
  recharges: Recharge[],
  people: PublicUserMeter[]
): {
  total: number;
  since_month: string | null;
  per_user: Array<{ user_id: number; amount: number }>;
} {
  const pricedMonths = new Set(
    cycles.filter((c) => c.complete).map((c) => c.month_year)
  );
  const unpriced = recharges.filter((r) => !pricedMonths.has(r.month_year));

  const sinceMonth =
    unpriced.length > 0
      ? unpriced.reduce(
          (earliest, r) => (r.month_year < earliest ? r.month_year : earliest),
          unpriced[0].month_year
        )
      : null;

  return {
    total: money(unpriced.reduce((sum, r) => sum + r.amount, 0)),
    since_month: sinceMonth,
    per_user: people.map((person) => ({
      user_id: person.id,
      amount: money(
        unpriced
          .filter((r) => r.payer_id === person.id)
          .reduce((sum, r) => sum + r.amount, 0)
      ),
    })),
  };
}

/**
 * Turns a set of balances into the fewest payments that clear them: the
 * biggest debtor pays the biggest creditor, repeat. With n people this settles
 * in at most n−1 transfers instead of everyone paying everyone.
 */
export function suggestSettlements(
  balances: Array<{ user_id: number; submitter: string; balance: number }>
): Array<{ from_user_id: number; to_user_id: number; amount: number }> {
  const debtors = balances
    .filter((b) => b.balance < -0.01)
    .map((b) => ({ ...b, remaining: -b.balance }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.balance > 0.01)
    .map((b) => ({ ...b, remaining: b.balance }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: Array<{
    from_user_id: number;
    to_user_id: number;
    amount: number;
  }> = [];

  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = money(Math.min(debtors[d].remaining, creditors[c].remaining));
    if (amount > 0.01) {
      transfers.push({
        from_user_id: debtors[d].user_id,
        to_user_id: creditors[c].user_id,
        amount,
      });
      debtors[d].remaining = money(debtors[d].remaining - amount);
      creditors[c].remaining = money(creditors[c].remaining - amount);
    }
    if (debtors[d].remaining <= 0.01) d++;
    if (creditors[c].remaining <= 0.01) c++;
  }

  return transfers;
}
