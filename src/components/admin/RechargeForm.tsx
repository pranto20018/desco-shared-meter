"use client";

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Section, Spinner } from "@/components/ui";
import { taka } from "@/lib/billing";
import type { PublicUserMeter } from "@/lib/types";

/** "2026-08-24T16:30" in local time, for the datetime-local default. */
function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Common top-up amounts, so the usual case is one tap. */
const QUICK_AMOUNTS = [300, 500, 1000, 2000];

export function RechargeForm({
  meterId,
  people,
  onAdded,
}: {
  meterId: number;
  people: PublicUserMeter[];
  onAdded: () => void;
}) {
  const toast = useToast();
  const [rechargedAt, setRechargedAt] = useState(nowLocal);
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState<string>(
    people.length > 0 ? String(people[0].id) : ""
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the recharge amount.");
      return;
    }
    if (!payerId) {
      toast.error("Choose who paid for this recharge.");
      return;
    }

    setBusy(true);
    try {
      await api.post("/api/admin/recharges", {
        mainMeterId: meterId,
        payerId: Number(payerId),
        rechargedAt,
        amount: value,
        note,
      });
      const payer = people.find((p) => p.id === Number(payerId));
      toast.success(`${taka(value)} recharge by ${payer?.submitter ?? "—"} logged.`);
      setAmount("");
      setNote("");
      setRechargedAt(nowLocal());
      onAdded();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not log the recharge."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Log a recharge"
      description="Record every top-up of the main meter and who paid for it."
      icon={Wallet}
    >
      {people.length === 0 ? (
        <p className="text-sm text-slate-500">
          Add at least one person to this meter before logging recharges.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="field-label" htmlFor="rc-date">
                Date &amp; time
              </label>
              <input
                id="rc-date"
                type="datetime-local"
                className="field-input"
                value={rechargedAt}
                onChange={(event) => setRechargedAt(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="rc-amount">
                Amount (BDT)
              </label>
              <input
                id="rc-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="field-input"
                placeholder="500"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="rc-payer">
                Recharged by
              </label>
              <select
                id="rc-payer"
                className="field-input"
                value={payerId}
                onChange={(event) => setPayerId(event.target.value)}
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.submitter}
                    {person.user_name ? ` — ${person.user_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="rc-note">
                Note <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="rc-note"
                className="field-input"
                placeholder="bKash, cash…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Quick amount:</span>
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                onClick={() => setAmount(String(quick))}
              >
                ৳{quick}
              </button>
            ))}
          </div>

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
            {busy ? "Saving…" : "Add recharge"}
          </button>
        </form>
      )}
    </Section>
  );
}
