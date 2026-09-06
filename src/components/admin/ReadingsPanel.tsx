"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Save, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import {
  EmptyState,
  MonthPicker,
  PersonChip,
  Section,
  Spinner,
} from "@/components/ui";
import { formatMonthYear } from "@/lib/billing";

interface Row {
  user_id: number;
  submitter: string;
  user_name: string;
  meter_number: string;
  color_index: number;
  previous_reading: number | null;
  reading: number | null;
}

interface Payload {
  month: string;
  previous_month: string;
  rows: Row[];
  main_reading: number | null;
  main_previous_reading: number | null;
}

/**
 * Closing readings for one month. Only the closing figure is entered — the
 * previous month's closing reading is shown beside it, since that is what the
 * units are measured against.
 */
export function ReadingsPanel({
  meterId,
  month,
  onMonthChange,
  onSaved,
}: {
  meterId: number;
  month: string;
  onMonthChange: (month: string) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [mainDraft, setMainDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Payload>(
        `/api/admin/readings?meterId=${meterId}&month=${month}`
      );
      setPayload(data);
      setDrafts(
        Object.fromEntries(
          data.rows.map((row) => [
            row.user_id,
            row.reading == null ? "" : String(row.reading),
          ])
        )
      );
      setMainDraft(data.main_reading == null ? "" : String(data.main_reading));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not load the readings."
      );
    } finally {
      setLoading(false);
    }
  }, [meterId, month, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const computed = useMemo(() => {
    if (!payload) return [];
    return payload.rows.map((row) => {
      const raw = drafts[row.user_id] ?? "";
      const hasValue = raw !== "";
      const value = Number(raw);
      const backwards =
        hasValue &&
        row.previous_reading != null &&
        Number.isFinite(value) &&
        value < row.previous_reading;
      const units =
        hasValue && row.previous_reading != null && !backwards
          ? Math.max(0, value - row.previous_reading)
          : null;
      return { row, raw, hasValue, value, backwards, units };
    });
  }, [payload, drafts]);

  const problems = computed.filter((c) => c.backwards).length;
  const filled = computed.filter((c) => c.hasValue).length;
  const totalUnits = computed.reduce((sum, c) => sum + (c.units ?? 0), 0);
  const missingOpening = computed.filter(
    (c) => c.hasValue && c.row.previous_reading == null
  );

  async function save() {
    if (busy || !payload) return;

    if (problems > 0) {
      toast.error(
        "Some readings are below last month's. Fix the highlighted rows first."
      );
      return;
    }

    setBusy(true);
    try {
      const result = await api.post<{ saved: number; cleared: number }>(
        "/api/admin/readings",
        {
          meterId,
          monthYear: month,
          entries: payload.rows.map((row) => ({
            userId: row.user_id,
            reading: drafts[row.user_id] ?? "",
          })),
          mainReading: mainDraft,
        }
      );
      const parts = [];
      if (result.saved > 0) parts.push(`${result.saved} saved`);
      if (result.cleared > 0) parts.push(`${result.cleared} cleared`);
      toast.success(
        `${formatMonthYear(month)}: ${parts.join(", ") || "nothing to change"}.`
      );
      onSaved();
      void load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save the readings."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Monthly readings"
      description={`Closing sub-meter readings for ${formatMonthYear(month)}. Leave a cell blank to skip it.`}
      icon={Gauge}
      actions={
        <div className="flex items-end gap-2">
          <MonthPicker
            value={month}
            onChange={(value) => value && onMonthChange(value)}
            id="readings-month"
            label=""
          />
          <button
            type="button"
            className="btn-primary"
            onClick={save}
            disabled={busy || loading || !payload || payload.rows.length === 0}
          >
            {busy ? <Spinner /> : <Save className="h-4 w-4" aria-hidden />}
            {busy ? "Saving…" : "Save readings"}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner /> Loading readings…
        </div>
      ) : !payload || payload.rows.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Nobody on this meter yet"
          description="Add the people sharing this main meter first — each one becomes a row here."
        />
      ) : (
        <>
          {missingOpening.length > 0 ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-amber-800">
                No {formatMonthYear(payload.previous_month)} reading for{" "}
                <b>{missingOpening.map((c) => c.row.submitter).join(", ")}</b>, so{" "}
                {formatMonthYear(month)} cannot be costed until that month is
                entered too. The readings still save.
              </p>
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Sub-meter</th>
                  <th className="w-40 text-right">
                    {formatMonthYear(payload.previous_month)} closing
                  </th>
                  <th className="w-44">{formatMonthYear(month)} closing</th>
                  <th className="w-28 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {computed.map(({ row, backwards, units }) => (
                  <tr key={row.user_id} className={backwards ? "bg-rose-50/60" : undefined}>
                    <td>
                      <PersonChip
                        submitter={row.submitter}
                        userName={row.user_name}
                        colorIndex={row.color_index}
                        size="sm"
                      />
                      {row.meter_number ? (
                        <p className="mt-0.5 pl-4 font-mono text-[11px] text-slate-400">
                          {row.meter_number}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-right font-mono text-xs text-slate-500">
                      {row.previous_reading?.toLocaleString("en-US") ?? "—"}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="—"
                        className={`field-input px-3 py-2 text-sm ${
                          backwards ? "border-rose-300 focus:border-rose-500" : ""
                        }`}
                        aria-label={`${formatMonthYear(month)} closing reading for ${row.submitter}`}
                        aria-invalid={backwards}
                        value={drafts[row.user_id] ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.user_id]: event.target.value,
                          }))
                        }
                      />
                      {backwards ? (
                        <p className="mt-1 text-xs font-medium text-rose-600">
                          Below last month&apos;s reading
                        </p>
                      ) : null}
                    </td>
                    <td className="text-right font-mono text-sm">
                      {units == null ? "—" : units.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                    Totals ({filled} of {payload.rows.length} entered)
                  </td>
                  <td />
                  <td />
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
                    {totalUnits.toLocaleString("en-US")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200/80 bg-white/60 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[200px] flex-1">
                <label className="field-label" htmlFor="main-reading">
                  Main meter closing reading{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="main-reading"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="field-input"
                  placeholder="—"
                  value={mainDraft}
                  onChange={(event) => setMainDraft(event.target.value)}
                />
              </div>
              <div className="text-xs leading-relaxed text-slate-500">
                <p>
                  {formatMonthYear(payload.previous_month)} closing:{" "}
                  <span className="font-mono">
                    {payload.main_previous_reading?.toLocaleString("en-US") ?? "—"}
                  </span>
                </p>
                <p className="mt-1 max-w-sm">
                  Never used to price anything — only to show the gap between the
                  main meter and the sub-meters, which is common-area load or a
                  misread meter.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
