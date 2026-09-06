"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Flag, Save } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { MonthPicker, PersonChip, Section, Spinner } from "@/components/ui";
import { formatMonthYear } from "@/lib/billing";

interface Row {
  user_id: number;
  submitter: string;
  user_name: string;
  meter_number: string;
  color_index: number;
}

interface Payload {
  started: boolean;
  baseline_month: string;
  suggested_month: string;
  people: Row[];
}

/**
 * Opening readings for a new meter.
 *
 * A month is priced against the month before it, so a brand-new meter's first
 * month has nothing to measure from: it stays unpriced and its recharges sit in
 * "pending". Recording where each meter stood at the start supplies that
 * missing opening, and the very next month prices straight away.
 */
export function BaselinePanel({
  meterId,
  onSaved,
}: {
  meterId: number;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [month, setMonth] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [mainDraft, setMainDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reopened, setReopened] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Payload>(`/api/admin/baseline?meterId=${meterId}`);
      setPayload(data);
      setMonth(data.started ? data.baseline_month : data.suggested_month);
      setDrafts({});
      setMainDraft("");
      setReopened(false);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not load the setup state."
      );
    } finally {
      setLoading(false);
    }
  }, [meterId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (busy || !payload) return;

    const missing = payload.people.filter(
      (person) => (drafts[person.user_id] ?? "") === ""
    );
    if (missing.length > 0) {
      toast.error(
        `Enter a starting reading for ${missing.map((m) => m.submitter).join(", ")}.`
      );
      return;
    }

    setBusy(true);
    try {
      await api.post("/api/admin/baseline", {
        meterId,
        baselineMonth: month,
        entries: payload.people.map((person) => ({
          userId: person.user_id,
          reading: drafts[person.user_id],
        })),
        mainReading: mainDraft,
      });
      toast.success(
        `Starting readings saved against ${formatMonthYear(month)}. ${formatMonthYear(
          nextMonthOf(month)
        )} onward will now be split.`
      );
      onSaved();
      void load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save the starting readings."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Section title="Starting readings" icon={Flag}>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Spinner /> Loading…
        </div>
      </Section>
    );
  }

  if (!payload) return null;

  if (payload.people.length === 0) {
    return (
      <Section
        title="Starting readings"
        description="Where each sub-meter stood when this ledger began."
        icon={Flag}
      >
        <p className="text-sm text-slate-500">
          Add the people sharing this meter first — then record where their
          sub-meters stood at the start.
        </p>
      </Section>
    );
  }

  // Once the ledger has begun, this collapses to a one-line confirmation with a
  // way back in — re-entering a baseline silently rewrites a priced month.
  if (payload.started && !reopened) {
    return (
      <Section
        title="Starting readings"
        description="Where each sub-meter stood when this ledger began."
        icon={Flag}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Recorded — this ledger starts from{" "}
            <b>{formatMonthYear(payload.baseline_month)}</b>.
          </p>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => setReopened(true)}
          >
            Correct them
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Use <b>Readings</b> for each month from{" "}
          {formatMonthYear(nextMonthOf(payload.baseline_month))} onward. Only
          correct the starting readings if they were entered wrongly — changing
          them re-prices every month that follows.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Starting readings"
      description="Where each sub-meter stands right now, so the next month can be split."
      icon={Flag}
      actions={
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save className="h-4 w-4" aria-hidden />}
          {busy ? "Saving…" : "Save starting readings"}
        </button>
      }
    >
      <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3">
        <p className="text-sm leading-relaxed text-brand-800">
          A month&apos;s consumption is the difference from the month before, so the
          ledger needs a starting point. Enter what each sub-meter reads today —
          filed as the closing figure for{" "}
          <b>{month ? formatMonthYear(month) : "the starting month"}</b>, which
          makes <b>{month ? formatMonthYear(nextMonthOf(month)) : "the next month"}</b>{" "}
          the first month that gets split.
        </p>
        <p className="mt-2 text-xs text-brand-700/80">
          Nothing before this point is ever charged — those units were settled
          under whatever arrangement came before.
        </p>
      </div>

      <div className="mb-4 max-w-xs">
        <MonthPicker
          value={month}
          onChange={(value) => value && setMonth(value)}
          id="baseline-month"
          label="Starting month"
        />
        <p className="mt-1 text-xs text-slate-500">
          Normally last month, so this month is the first one split.
        </p>
      </div>

      <div className="table-wrap">
        <table className="data-table min-w-[520px]">
          <thead>
            <tr>
              <th>Sub-meter</th>
              <th className="w-56">Current reading</th>
            </tr>
          </thead>
          <tbody>
            {payload.people.map((person) => (
              <tr key={person.user_id}>
                <td>
                  <PersonChip
                    submitter={person.submitter}
                    userName={person.user_name}
                    colorIndex={person.color_index}
                    size="sm"
                  />
                  {person.meter_number ? (
                    <p className="mt-0.5 pl-4 font-mono text-[11px] text-slate-400">
                      {person.meter_number}
                    </p>
                  ) : null}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="e.g. 4108"
                    className="field-input px-3 py-2 text-sm"
                    aria-label={`Current reading for ${person.submitter}`}
                    value={drafts[person.user_id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [person.user_id]: event.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200/80 bg-white/60 p-4">
        <div className="max-w-xs">
          <label className="field-label" htmlFor="baseline-main">
            Main meter current reading{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="baseline-main"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="field-input"
            placeholder="e.g. 10000"
            value={mainDraft}
            onChange={(event) => setMainDraft(event.target.value)}
          />
        </div>
        <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
          Recording this too means the very first split can already show the gap
          between the main meter and the sub-meters. It never prices anything.
        </p>
      </div>

      {payload.started ? (
        <button
          type="button"
          className="btn-ghost mt-4 px-3 py-1.5 text-xs"
          onClick={() => setReopened(false)}
        >
          Cancel
        </button>
      ) : null}
    </Section>
  );
}

/** "2026-07" → "2026-08". */
function nextMonthOf(monthYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!match) return monthYear;
  const d = new Date(Number(match[1]), Number(match[2]), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
