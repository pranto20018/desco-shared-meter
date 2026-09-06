"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarRange,
  Gauge,
  Handshake,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { LoginCard } from "@/components/LoginCard";
import { EmptyState, Section, Spinner, Tabs } from "@/components/ui";
import { LedgerOverview } from "@/components/ledger/LedgerOverview";
import { CyclesList } from "@/components/ledger/CyclesList";
import { RechargesList } from "@/components/ledger/RechargesList";
import { SettlementsList } from "@/components/ledger/SettlementsList";
import { ReadingsPanel } from "@/components/admin/ReadingsPanel";
import { RechargeForm } from "@/components/admin/RechargeForm";
import { SettlementForm } from "@/components/admin/SettlementForm";
import { SetupPanel } from "@/components/admin/SetupPanel";
import { currentMonthYear, taka } from "@/lib/billing";
import type { LedgerView, MainMeter, Session } from "@/lib/types";

type TabId = "overview" | "readings" | "recharges" | "cycles" | "settle" | "setup";

interface MeterSummary {
  meter: MainMeter;
  people: number;
  months: number;
  unsettled: number;
}

export default function AdminPage() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const [meters, setMeters] = useState<MeterSummary[]>([]);
  const [meterId, setMeterId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [month, setMonth] = useState(currentMonthYear());
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newMeterName, setNewMeterName] = useState("");

  /* ── session ─────────────────────────────────────────────────── */

  const loadSession = useCallback(async () => {
    try {
      const data = await api.get<{ session: Session | null }>("/api/auth/session");
      setSession(data.session);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  /* ── meters ──────────────────────────────────────────────────── */

  const loadMeters = useCallback(async () => {
    try {
      const data = await api.get<{ meters: MeterSummary[] }>("/api/admin/meters");
      setMeters(data.meters);
      // Select the first meter on the first load so the dashboard is never blank
      // when meters already exist.
      setMeterId((current) => {
        if (current != null && data.meters.some((m) => m.meter.id === current)) {
          return current;
        }
        return data.meters[0]?.meter.id ?? null;
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        return;
      }
      toast.error(
        error instanceof ApiError ? error.message : "Could not load the meters."
      );
    }
  }, [toast]);

  useEffect(() => {
    if (session?.role === "admin") void loadMeters();
  }, [session, loadMeters]);

  /* ── ledger ──────────────────────────────────────────────────── */

  const loadLedger = useCallback(async () => {
    if (meterId == null) {
      setLedger(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<{ ledger: LedgerView }>(
        `/api/admin/ledger?meterId=${meterId}`
      );
      setLedger(data.ledger);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        return;
      }
      toast.error(
        error instanceof ApiError ? error.message : "Could not load the ledger."
      );
    } finally {
      setLoading(false);
    }
  }, [meterId, toast]);

  useEffect(() => {
    if (session?.role === "admin") void loadLedger();
  }, [session, loadLedger]);

  const refresh = useCallback(() => {
    void loadLedger();
    void loadMeters();
  }, [loadLedger, loadMeters]);

  /* ── actions ─────────────────────────────────────────────────── */

  async function createMeter(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    if (!newMeterName.trim()) {
      toast.error("Give the main meter a name.");
      return;
    }
    setCreating(true);
    try {
      const data = await api.post<{ meter: MainMeter }>("/api/admin/meters", {
        name: newMeterName.trim(),
      });
      toast.success(`${data.meter.name} created.`);
      setNewMeterName("");
      setMeterId(data.meter.id);
      setTab("setup");
      await loadMeters();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the meter."
      );
    } finally {
      setCreating(false);
    }
  }

  async function deleteRecharge(id: number) {
    try {
      await api.del(`/api/admin/recharges?id=${id}`);
      toast.success("Recharge deleted.");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not delete the recharge."
      );
    }
  }

  async function deleteSettlement(id: number) {
    try {
      await api.del(`/api/admin/settlements?id=${id}`);
      toast.success("Settlement deleted.");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not delete the settlement."
      );
    }
  }

  async function signOut() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setSession(null);
      setLedger(null);
      setMeters([]);
      toast.info("Signed out of the admin portal.");
    }
  }

  /* ── render ──────────────────────────────────────────────────── */

  if (session === undefined) {
    return (
      <main className="grid min-h-screen place-items-center">
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Checking your session…
        </span>
      </main>
    );
  }

  if (session === null || session.role !== "admin") {
    return (
      <LoginCard
        title="Admin portal"
        subtitle="Enter the admin secret key to manage meters, people, readings, and recharges."
        endpoint="/api/auth/admin"
        fields={[
          {
            name: "secret",
            label: "Admin secret key",
            placeholder: "Your ADMIN_SECRET_KEY",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        onSignedIn={loadSession}
        backLink={{ href: "/", label: "Back to the shared view" }}
        footer={
          <p className="text-xs leading-relaxed text-slate-500">
            The key is the <code className="font-mono">ADMIN_SECRET_KEY</code>{" "}
            environment variable. People sharing a meter sign in from the{" "}
            <Link href="/" className="font-semibold text-brand-700 hover:underline">
              main page
            </Link>{" "}
            instead.
          </p>
        }
      />
    );
  }

  const activeMeter = meters.find((m) => m.meter.id === meterId);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Admin dashboard
            </h1>
            <p className="text-sm text-slate-500">
              {activeMeter
                ? `${activeMeter.meter.name}${
                    activeMeter.meter.meter_label
                      ? ` · ${activeMeter.meter.meter_label}`
                      : ""
                  }`
                : "Shared prepaid meter ledger"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {meters.length > 0 ? (
            <select
              className="field-input w-auto"
              value={meterId ?? ""}
              onChange={(event) => {
                setMeterId(Number(event.target.value));
                setTab("overview");
              }}
              aria-label="Main meter"
            >
              {meters.map((entry) => (
                <option key={entry.meter.id} value={entry.meter.id}>
                  {entry.meter.name}
                  {entry.unsettled > 0.01 ? ` · ${taka(entry.unsettled)} owed` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            onClick={refresh}
            disabled={loading}
            title="Reload"
          >
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button type="button" className="btn-ghost" onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {meters.length === 0 ? (
        <Section
          title="Add your first main meter"
          description="Everything — people, readings, recharges — belongs to a main meter."
          icon={Gauge}
        >
          <form onSubmit={createMeter} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="field-label" htmlFor="new-meter">
                Meter name
              </label>
              <input
                id="new-meter"
                className="field-input"
                placeholder="Building A"
                value={newMeterName}
                onChange={(event) => setNewMeterName(event.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
              Create meter
            </button>
          </form>
        </Section>
      ) : (
        <>
          <Tabs<TabId>
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "readings", label: "Readings", icon: Gauge },
              {
                id: "recharges",
                label: "Recharges",
                icon: Wallet,
                badge: ledger?.recharges.length,
              },
              { id: "cycles", label: "Months", icon: CalendarRange },
              { id: "settle", label: "Settle up", icon: Handshake },
              { id: "setup", label: "Setup", icon: Settings },
            ]}
          />

          {loading && !ledger ? (
            <div className="glass-card flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
              <Spinner /> Loading the ledger…
            </div>
          ) : !ledger ? (
            <div className="glass-card">
              <EmptyState
                icon={Gauge}
                title="Pick a main meter"
                description="Choose one from the list above, or create another in Setup."
              />
            </div>
          ) : (
            <div className="space-y-6">
              {tab === "overview" ? <LedgerOverview ledger={ledger} /> : null}

              {tab === "readings" ? (
                <ReadingsPanel
                  meterId={ledger.meter.id}
                  month={month}
                  onMonthChange={setMonth}
                  onSaved={refresh}
                />
              ) : null}

              {tab === "recharges" ? (
                <>
                  <RechargeForm
                    meterId={ledger.meter.id}
                    people={ledger.people}
                    onAdded={refresh}
                  />
                  <RechargesList
                    recharges={ledger.recharges}
                    onDelete={(recharge) => void deleteRecharge(recharge.id)}
                  />
                </>
              ) : null}

              {tab === "cycles" ? <CyclesList ledger={ledger} /> : null}

              {tab === "settle" ? (
                <>
                  <SettlementForm
                    meterId={ledger.meter.id}
                    people={ledger.people}
                    onAdded={refresh}
                  />
                  <SettlementsList
                    settlements={ledger.settlements}
                    onDelete={(settlement) => void deleteSettlement(settlement.id)}
                  />
                </>
              ) : null}

              {tab === "setup" ? (
                <>
                  <SetupPanel
                    meter={ledger.meter}
                    onMeterChanged={refresh}
                    onPeopleChanged={refresh}
                  />
                  <Section
                    title="Other main meters"
                    description="Each meter keeps its own people, readings, and ledger."
                    icon={Gauge}
                  >
                    <form
                      onSubmit={createMeter}
                      className="mb-5 flex flex-wrap items-end gap-3"
                    >
                      <div className="min-w-[220px] flex-1">
                        <label className="field-label" htmlFor="another-meter">
                          Add another meter
                        </label>
                        <input
                          id="another-meter"
                          className="field-input"
                          placeholder="Building B"
                          value={newMeterName}
                          onChange={(event) => setNewMeterName(event.target.value)}
                        />
                      </div>
                      <button type="submit" className="btn-primary" disabled={creating}>
                        {creating ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
                        Create
                      </button>
                    </form>

                    <div className="table-wrap">
                      <table className="data-table min-w-[560px]">
                        <thead>
                          <tr>
                            <th>Meter</th>
                            <th className="text-right">People</th>
                            <th className="text-right">Months</th>
                            <th className="text-right">Outstanding</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meters.map((entry) => (
                            <tr
                              key={entry.meter.id}
                              className={
                                entry.meter.id === meterId ? "bg-brand-50/50" : undefined
                              }
                            >
                              <td>
                                <p className="font-semibold text-slate-800">
                                  {entry.meter.name}
                                </p>
                                {entry.meter.meter_label ? (
                                  <p className="font-mono text-[11px] text-slate-400">
                                    {entry.meter.meter_label}
                                  </p>
                                ) : null}
                              </td>
                              <td className="text-right font-mono text-xs">
                                {entry.people}
                              </td>
                              <td className="text-right font-mono text-xs">
                                {entry.months}
                              </td>
                              <td className="text-right font-mono text-xs">
                                {entry.unsettled > 0.01 ? taka(entry.unsettled) : "—"}
                              </td>
                              <td className="text-right">
                                {entry.meter.id === meterId ? (
                                  <span className="text-xs font-semibold text-brand-700">
                                    Viewing
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn-secondary px-3 py-1.5 text-xs"
                                    onClick={() => {
                                      setMeterId(entry.meter.id);
                                      setTab("overview");
                                    }}
                                  >
                                    Open
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {meters.length > 1 ? (
                      <DeleteMeterControl
                        meter={ledger.meter}
                        onDeleted={() => {
                          setMeterId(null);
                          setTab("overview");
                          refresh();
                        }}
                      />
                    ) : null}
                  </Section>
                </>
              ) : null}
            </div>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Deleting a meter takes its whole ledger with it, so it asks for the meter's
 * name to be typed rather than settling for a single click.
 */
function DeleteMeterControl({
  meter,
  onDeleted,
}: {
  meter: MainMeter;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/meters?id=${meter.id}&confirm=1`);
      toast.success(`${meter.name} and its whole ledger were deleted.`);
      setOpen(false);
      setTyped("");
      onDeleted();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not delete the meter."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost mt-4 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete {meter.name}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
      <p className="text-sm font-semibold text-rose-800">
        Delete {meter.name} permanently?
      </p>
      <p className="mt-1 text-xs leading-relaxed text-rose-700">
        Its people, readings, recharges, and settlements all go with it. Type{" "}
        <b>{meter.name}</b> to confirm.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="field-input max-w-xs"
          placeholder={meter.name}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <button
          type="button"
          className="btn-danger"
          disabled={busy || typed.trim() !== meter.name}
          onClick={remove}
        >
          {busy ? <Spinner /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Delete
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
