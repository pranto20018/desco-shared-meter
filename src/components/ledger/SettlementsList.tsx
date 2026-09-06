"use client";

import { ArrowRight, Handshake, Trash2 } from "lucide-react";
import { useState } from "react";
import { EmptyState, Section } from "@/components/ui";
import { formatDateTime, taka } from "@/lib/billing";
import type { SettlementWithNames } from "@/lib/types";

/**
 * Money handed directly between people to clear a balance. Recording it here
 * keeps the ledger honest without inventing a recharge that never happened.
 */
export function SettlementsList({
  settlements,
  viewerId,
  onDelete,
}: {
  settlements: SettlementWithNames[];
  viewerId?: number;
  onDelete?: (settlement: SettlementWithNames) => void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);

  if (settlements.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Handshake}
          title="Nothing settled yet"
          description="When someone hands money to another person to clear their balance, record it so both sides land back at zero."
        />
      </div>
    );
  }

  return (
    <Section
      title="Settlements"
      description="Payments made between people to clear their balances."
      icon={Handshake}
    >
      <div className="table-wrap">
        <table className="data-table min-w-[620px]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payment</th>
              <th className="text-right">Amount</th>
              <th>Note</th>
              {onDelete ? <th className="text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {settlements.map((settlement) => {
              const involvesViewer =
                settlement.from_user_id === viewerId ||
                settlement.to_user_id === viewerId;
              return (
                <tr
                  key={settlement.id}
                  className={involvesViewer ? "bg-brand-50/50" : undefined}
                >
                  <td className="whitespace-nowrap text-xs">
                    {formatDateTime(settlement.settled_at)}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-800">
                        {settlement.from_submitter}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      <span className="font-semibold text-slate-800">
                        {settlement.to_submitter}
                      </span>
                    </span>
                  </td>
                  <td className="text-right font-mono font-semibold text-slate-800">
                    {taka(settlement.amount)}
                  </td>
                  <td className="max-w-[200px] truncate text-xs text-slate-500">
                    {settlement.note || "—"}
                  </td>
                  {onDelete ? (
                    <td className="text-right">
                      {confirming === settlement.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-rose-700">Delete?</span>
                          <button
                            type="button"
                            className="btn-danger px-2.5 py-1 text-xs"
                            onClick={() => {
                              onDelete(settlement);
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
                          onClick={() => setConfirming(settlement.id)}
                          aria-label="Delete this settlement"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
