"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Handshake, Plus, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Section, Spinner } from "@/components/ui";
import { taka } from "@/lib/billing";
import type { PublicUserMeter } from "@/lib/types";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

interface Suggested {
  from_user_id: number;
  to_user_id: number;
  amount: number;
}

/**
 * Records one person paying another to clear a balance, and offers the
 * shortest set of transfers that would square everyone up — with n people that
 * is at most n−1 payments rather than everyone paying everyone.
 */
export function SettlementForm({
  meterId,
  people,
  onAdded,
}: {
  meterId: number;
  people: PublicUserMeter[];
  onAdded: () => void;
}) {
  const toast = useToast();
  const [settledAt, setSettledAt] = useState(nowLocal);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<Suggested[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ suggested: Suggested[] }>(`/api/admin/settlements?meterId=${meterId}`)
      .then((data) => {
        if (!cancelled) setSuggested(data.suggested);
      })
      .catch(() => {
        // The list is a convenience; the form still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [meterId]);

  function applySuggestion(transfer: Suggested) {
    setFromId(String(transfer.from_user_id));
    setToId(String(transfer.to_user_id));
    setAmount(String(transfer.amount));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const value = Number(amount);
    if (!fromId || !toId) {
      toast.error("Choose who paid and who received.");
      return;
    }
    if (fromId === toId) {
      toast.error("A settlement needs two different people.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount handed over.");
      return;
    }

    setBusy(true);
    try {
      await api.post("/api/admin/settlements", {
        mainMeterId: meterId,
        fromUserId: Number(fromId),
        toUserId: Number(toId),
        settledAt,
        amount: value,
        note,
      });
      const from = people.find((p) => p.id === Number(fromId));
      const to = people.find((p) => p.id === Number(toId));
      toast.success(
        `${taka(value)} from ${from?.submitter ?? "—"} to ${to?.submitter ?? "—"} recorded.`
      );
      setAmount("");
      setNote("");
      setSettledAt(nowLocal());
      onAdded();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not record the settlement."
      );
    } finally {
      setBusy(false);
    }
  }

  const label = (id: number) => {
    const person = people.find((p) => p.id === id);
    return person ? person.submitter : "—";
  };

  return (
    <Section
      title="Record a settlement"
      description="When someone hands money to another person to clear their balance."
      icon={Handshake}
    >
      {people.length < 2 ? (
        <p className="text-sm text-slate-500">
          A settlement needs at least two people on this meter.
        </p>
      ) : (
        <>
          {suggested.length > 0 ? (
            <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/70 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Suggested to settle up
              </p>
              <p className="mt-1 text-xs leading-relaxed text-brand-700/80">
                The fewest payments that would bring everyone to zero. Click one to
                fill the form.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggested.map((transfer, index) => (
                  <button
                    key={`${transfer.from_user_id}-${transfer.to_user_id}-${index}`}
                    type="button"
                    onClick={() => applySuggestion(transfer)}
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:bg-white"
                  >
                    {label(transfer.from_user_id)}
                    <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />
                    {label(transfer.to_user_id)}
                    <span className="font-mono text-brand-700">
                      {taka(transfer.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="field-label" htmlFor="st-date">
                  Date &amp; time
                </label>
                <input
                  id="st-date"
                  type="datetime-local"
                  className="field-input"
                  value={settledAt}
                  onChange={(event) => setSettledAt(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="st-from">
                  Paid by
                </label>
                <select
                  id="st-from"
                  className="field-input"
                  value={fromId}
                  onChange={(event) => setFromId(event.target.value)}
                >
                  <option value="">Choose…</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.submitter}
                      {person.user_name ? ` — ${person.user_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="st-to">
                  Paid to
                </label>
                <select
                  id="st-to"
                  className="field-input"
                  value={toId}
                  onChange={(event) => setToId(event.target.value)}
                >
                  <option value="">Choose…</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.submitter}
                      {person.user_name ? ` — ${person.user_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="st-amount">
                  Amount (BDT)
                </label>
                <input
                  id="st-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="field-input"
                  placeholder="292.06"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="st-note">
                  Note <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="st-note"
                  className="field-input"
                  placeholder="cash, bKash…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
              {busy ? "Saving…" : "Record settlement"}
            </button>
          </form>
        </>
      )}
    </Section>
  );
}
