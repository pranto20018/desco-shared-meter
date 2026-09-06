"use client";

import {
  CircleDollarSign,
  Flag,
  Gauge,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { BalanceBadge, EmptyState, PersonChip, Section, StatCard } from "@/components/ui";
import {
  colorFor,
  describeBalance,
  formatMonthYear,
  formatUnits,
  taka,
} from "@/lib/billing";
import type { LedgerView } from "@/lib/types";

/**
 * The headline view of a meter's ledger: where everyone stands overall, then
 * the most recent priced month. Shared by both dashboards — the tenant sees
 * exactly the same figures the admin does, which is the point of the split
 * being checkable.
 *
 * `viewerId` highlights the row belonging to the person looking at it.
 */
export function LedgerOverview({
  ledger,
  viewerId,
}: {
  ledger: LedgerView;
  viewerId?: number;
}) {
  const priced = ledger.cycles.filter((c) => c.complete);
  const latest = priced.length > 0 ? priced[priced.length - 1] : null;

  const totalUnits = ledger.totals.reduce((sum, t) => sum + t.units, 0);
  const totalPaid = ledger.totals.reduce((sum, t) => sum + t.paid, 0);
  const outstanding = ledger.totals.reduce(
    (sum, t) => sum + Math.max(0, t.balance),
    0
  );

  if (ledger.people.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Gauge}
          title="Nobody on this meter yet"
          description="In Setup, add the people sharing this main meter and record where their sub-meters stand today. Readings and recharges follow from there."
        />
      </div>
    );
  }

  // No readings at all means the ledger has not been started, and nothing here
  // can say anything useful yet. Point at the one action that unblocks it.
  if (ledger.cycles.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Flag}
          title="This ledger has not started yet"
          description="Record where each sub-meter stands today under Setup → Starting readings. Consumption is the difference from the month before, so the ledger needs that starting point before anything can be split."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total consumed"
          value={formatUnits(totalUnits)}
          hint={`across ${priced.length} ${priced.length === 1 ? "month" : "months"}`}
          icon={Gauge}
          tone="indigo"
        />
        <StatCard
          label="Total recharged"
          value={taka(totalPaid)}
          hint="counted in priced months"
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label="Latest unit rate"
          value={latest ? `${taka(latest.rate)}` : "—"}
          hint={latest ? `${formatMonthYear(latest.month_year)} · per kWh` : "no priced month yet"}
          icon={TrendingUp}
          tone="slate"
        />
        <StatCard
          label="Outstanding"
          value={taka(outstanding)}
          hint={
            outstanding > 0.01
              ? "owed between people"
              : "everyone is square"
          }
          icon={Scale}
          tone={outstanding > 0.01 ? "amber" : "emerald"}
        />
      </section>

      {ledger.pending.total > 0.01 ? (
        <div className="glass-card border-amber-200/70 bg-amber-50/60 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <CircleDollarSign className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-bold tracking-tight text-amber-900">
                {taka(ledger.pending.total)} not split yet
              </p>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Recharged from{" "}
                {ledger.pending.since_month
                  ? formatMonthYear(ledger.pending.since_month)
                  : "an earlier month"}{" "}
                onward, but those months have no complete set of readings, so
                nothing can be costed. It counts once the readings are entered.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ledger.pending.per_user
                  .filter((entry) => entry.amount > 0.01)
                  .map((entry) => {
                    const person = ledger.people.find((p) => p.id === entry.user_id);
                    if (!person) return null;
                    return (
                      <span
                        key={entry.user_id}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1 text-xs"
                      >
                        <PersonChip
                          submitter={person.submitter}
                          colorIndex={person.color_index}
                          size="sm"
                        />
                        <span className="font-semibold text-amber-900">
                          {taka(entry.amount)}
                        </span>
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Section
        title="Where everyone stands"
        description="Every priced month added up. A positive balance means that person put in more than they used."
        icon={Scale}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ledger.totals.map((entry) => {
            const isViewer = entry.user_id === viewerId;
            const { tone } = describeBalance(entry.balance);
            return (
              <div
                key={entry.user_id}
                className={`rounded-xl border p-4 transition ${
                  isViewer
                    ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200"
                    : "border-slate-200/80 bg-white/70"
                }`}
                style={{ borderLeftWidth: 3, borderLeftColor: colorFor(entry.color_index) }}
              >
                <div className="flex items-start justify-between gap-2">
                  <PersonChip
                    submitter={entry.submitter}
                    userName={entry.user_name}
                    colorIndex={entry.color_index}
                  />
                  {isViewer ? (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                      You
                    </span>
                  ) : null}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Units used</dt>
                    <dd className="font-semibold text-slate-700">
                      {entry.units.toLocaleString("en-US")}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Their share of cost</dt>
                    <dd className="font-semibold text-slate-700">{taka(entry.cost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Recharged</dt>
                    <dd className="font-semibold text-slate-700">{taka(entry.paid)}</dd>
                  </div>
                  {Math.abs(entry.settled) > 0.01 ? (
                    <div className="flex justify-between">
                      {/* `settled` is signed against the balance, so a positive
                          figure means money they handed over. */}
                      <dt className="text-slate-500">
                        {entry.settled > 0 ? "Paid to others" : "Received"}
                      </dt>
                      <dd className="font-semibold text-slate-700">
                        {taka(Math.abs(entry.settled))}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <BalanceBadge balance={entry.balance} size="sm" />
                  {tone !== "settled" ? (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      {entry.balance > 0
                        ? "Put in more than they used."
                        : "Used more than they put in."}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {latest ? (
        <Section
          title={`${formatMonthYear(latest.month_year)} in detail`}
          description={`${taka(latest.recharge_total)} recharged over ${latest.recharge_count} ${
            latest.recharge_count === 1 ? "top-up" : "top-ups"
          }, split across ${formatUnits(latest.total_units)} at ${taka(latest.rate)} per unit.`}
          icon={CircleDollarSign}
        >
          <CycleTable cycle={latest} viewerId={viewerId} />
        </Section>
      ) : null}
    </div>
  );
}

/** One month's split as a table — people down the side, the sums across. */
export function CycleTable({
  cycle,
  viewerId,
}: {
  cycle: LedgerView["cycles"][number];
  viewerId?: number;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            <th>Sub-meter</th>
            <th className="text-right">Opening</th>
            <th className="text-right">Closing</th>
            <th className="text-right">Units</th>
            <th className="text-right">Cost share</th>
            <th className="text-right">Recharged</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {cycle.people.map((person) => (
            <tr
              key={person.user_id}
              className={person.user_id === viewerId ? "bg-brand-50/50" : undefined}
            >
              <td>
                <PersonChip
                  submitter={person.submitter}
                  userName={person.user_name}
                  colorIndex={person.color_index}
                  size="sm"
                />
              </td>
              <td className="text-right font-mono text-xs">
                {person.previous_reading?.toLocaleString("en-US") ?? "—"}
              </td>
              <td className="text-right font-mono text-xs">
                {person.reading?.toLocaleString("en-US") ?? "—"}
              </td>
              <td className="text-right font-mono">
                {person.units.toLocaleString("en-US")}
              </td>
              <td className="text-right font-mono">
                {cycle.complete ? taka(person.cost) : "—"}
              </td>
              <td className="text-right font-mono">{taka(person.paid)}</td>
              <td className="text-right">
                <BalanceBadge balance={person.balance} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50/80">
            <td className="px-4 py-3 text-sm font-semibold text-slate-700">Total</td>
            <td />
            <td />
            <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
              {cycle.total_units.toLocaleString("en-US")}
            </td>
            <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
              {cycle.complete ? taka(cycle.recharge_total) : "—"}
            </td>
            <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
              {taka(cycle.recharge_total)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
