"use client";

import { CalendarRange, TriangleAlert } from "lucide-react";
import { EmptyState, IncompleteNotice, Section } from "@/components/ui";
import { CycleTable } from "./LedgerOverview";
import { formatMonthYear, formatUnits, taka } from "@/lib/billing";
import type { LedgerView } from "@/lib/types";

/**
 * Month-by-month breakdown, newest first. Months that cannot be priced yet are
 * still listed — with their recharges shown and an explanation — rather than
 * hidden, so money that went into the meter is never invisible.
 */
export function CyclesList({
  ledger,
  viewerId,
}: {
  ledger: LedgerView;
  viewerId?: number;
}) {
  if (ledger.cycles.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={CalendarRange}
          title="No months to show yet"
          description="A month can be split once every sub-meter has a closing reading for it and for the month before."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {[...ledger.cycles].reverse().map((cycle) => {
        const missing = cycle.people.filter(
          (p) => p.reading == null || p.previous_reading == null
        );

        return (
          <Section
            key={cycle.month_year}
            title={formatMonthYear(cycle.month_year)}
            description={
              cycle.complete
                ? `${taka(cycle.recharge_total)} over ${cycle.recharge_count} ${
                    cycle.recharge_count === 1 ? "top-up" : "top-ups"
                  } · ${formatUnits(cycle.total_units)} · ${taka(cycle.rate)} per unit`
                : `${taka(cycle.recharge_total)} recharged · not split yet`
            }
            icon={CalendarRange}
            actions={
              cycle.main_diff != null ? (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    Math.abs(cycle.main_diff) > 1
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                  title="Main meter units compared with the sum of the sub-meters"
                >
                  Main {cycle.main_units?.toLocaleString("en-US")} kWh
                  {Math.abs(cycle.main_diff) > 1
                    ? ` · ${cycle.main_diff > 0 ? "+" : ""}${cycle.main_diff.toLocaleString("en-US")} unaccounted`
                    : " · matches"}
                </span>
              ) : null
            }
          >
            {!cycle.complete ? (
              <div className="mb-4">
                <IncompleteNotice>
                  <span className="inline-flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      This month has no cost split yet
                      {missing.length > 0 ? (
                        <>
                          {" "}
                          — missing a reading for{" "}
                          <b>{missing.map((p) => p.submitter).join(", ")}</b>
                        </>
                      ) : null}
                      . Any recharges below still count toward each person&apos;s
                      balance once the readings arrive.
                    </span>
                  </span>
                </IncompleteNotice>
              </div>
            ) : null}

            <CycleTable cycle={cycle} viewerId={viewerId} />
          </Section>
        );
      })}
    </div>
  );
}
