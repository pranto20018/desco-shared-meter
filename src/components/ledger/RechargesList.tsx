"use client";

import { Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { EmptyState, PersonChip, Section } from "@/components/ui";
import { colorFor, formatDateTime, formatMonthYear, taka } from "@/lib/billing";
import type { RechargeWithPayer } from "@/lib/types";

/**
 * Every top-up of the main meter, newest first. `onDelete` is omitted for the
 * tenant view, which turns this into a read-only record.
 */
export function RechargesList({
  recharges,
  viewerId,
  onDelete,
}: {
  recharges: RechargeWithPayer[];
  viewerId?: number;
  onDelete?: (recharge: RechargeWithPayer) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);

  const total = recharges.reduce((sum, r) => sum + r.amount, 0);

  if (recharges.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Wallet}
          title="No recharges logged"
          description="Every time someone tops up the main meter, record it here so the cost can be split against what they paid."
        />
      </div>
    );
  }

  return (
    <Section
      title="Recharges"
      description="Money put into the main meter, and who put it there."
      icon={Wallet}
      actions={
        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
          {taka(total)} over {recharges.length}
        </span>
      }
    >
      <div className="table-wrap">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Recharged by</th>
              <th>Month</th>
              <th className="text-right">Amount</th>
              <th>Note</th>
              {onDelete ? <th className="text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {recharges.map((recharge) => (
              <tr
                key={recharge.id}
                className={recharge.payer_id === viewerId ? "bg-brand-50/50" : undefined}
                style={{
                  borderLeft: `3px solid ${colorFor(recharge.payer_color_index)}`,
                }}
              >
                <td className="whitespace-nowrap text-xs">
                  {formatDateTime(recharge.recharged_at)}
                </td>
                <td>
                  <PersonChip
                    submitter={recharge.payer_submitter}
                    userName={recharge.payer_user_name}
                    colorIndex={recharge.payer_color_index}
                    size="sm"
                  />
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {formatMonthYear(recharge.month_year)}
                </td>
                <td className="text-right font-mono font-semibold text-slate-800">
                  {taka(recharge.amount)}
                </td>
                <td className="max-w-[200px] truncate text-xs text-slate-500">
                  {recharge.note || "—"}
                </td>
                {onDelete ? (
                  <td className="text-right">
                    {confirming === recharge.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-rose-700">Delete?</span>
                        <button
                          type="button"
                          className="btn-danger px-2.5 py-1 text-xs"
                          onClick={() => {
                            onDelete(recharge);
                            setConfirming(null);
                          }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2.5 py-1 text-xs"
                          onClick={() => setConfirming(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        onClick={() => setConfirming(recharge.id)}
                        aria-label={`Delete the ${taka(recharge.amount)} recharge`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
