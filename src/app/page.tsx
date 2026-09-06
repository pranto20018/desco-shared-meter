"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarRange,
  Eye,
  Handshake,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { LoginCard } from "@/components/LoginCard";
import { Spinner, Tabs } from "@/components/ui";
import { LedgerOverview } from "@/components/ledger/LedgerOverview";
import { CyclesList } from "@/components/ledger/CyclesList";
import { RechargesList } from "@/components/ledger/RechargesList";
import { SettlementsList } from "@/components/ledger/SettlementsList";
import type { LedgerView, Session } from "@/lib/types";

type TabId = "overview" | "cycles" | "recharges" | "settlements";

/**
 * The shared view. Everyone on a main meter sees the same ledger — their own
 * position and everyone else's — because a split nobody can check is a split
 * nobody trusts. It is strictly read-only; every change goes through the admin.
 */
export default function SharedLedgerPage() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [viewerId, setViewerId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

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

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ ledger: LedgerView; viewerId: number }>(
        "/api/user/ledger"
      );
      setLedger(data.ledger);
      setViewerId(data.viewerId);
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
  }, [toast]);

  useEffect(() => {
    if (session?.role === "user") void loadLedger();
  }, [session, loadLedger]);

  async function signOut() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setSession(null);
      setLedger(null);
      setViewerId(undefined);
      toast.info("Signed out.");
    }
  }

  if (session === undefined) {
    return (
      <main className="grid min-h-screen place-items-center">
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Checking your session…
        </span>
      </main>
    );
  }

  if (session === null || session.role !== "user") {
    return (
      <LoginCard
        title="Shared meter ledger"
        subtitle="Sign in with your sub-meter label and the passcode your admin gave you."
        endpoint="/api/auth/user"
        fields={[
          {
            name: "identifier",
            label: "Sub-meter label or number",
            placeholder: "B1",
            autoComplete: "username",
          },
          {
            name: "passcode",
            label: "Passcode",
            placeholder: "Your passcode",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        onSignedIn={loadSession}
        footer={
          <p className="text-xs leading-relaxed text-slate-500">
            You will see the whole ledger for your meter — everyone&apos;s units,
            recharges, and balances — so the split can be checked. Admin?{" "}
            <Link
              href="/admin"
              className="font-semibold text-brand-700 hover:underline"
            >
              Admin portal
            </Link>
            .
          </p>
        }
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
            <Users className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {ledger?.meter.name ?? "Shared meter"}
            </h1>
            <p className="text-sm text-slate-500">
              Signed in as {session.submitter}
              {session.userName ? ` · ${session.userName}` : ""}
              {ledger?.meter.meter_label ? ` · Meter ${ledger.meter.meter_label}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadLedger()}
            disabled={loading}
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

      <div className="no-print mb-6 flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-4 py-2.5">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <p className="text-xs leading-relaxed text-slate-500">
          Everyone sharing this meter sees the same figures, so the split can be
          checked by the people it applies to. This view is read-only — ask your
          admin to correct a reading or a recharge.
        </p>
      </div>

      {loading && !ledger ? (
        <div className="glass-card flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
          <Spinner /> Loading the ledger…
        </div>
      ) : !ledger ? null : (
        <>
          <Tabs<TabId>
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "cycles", label: "Months", icon: CalendarRange },
              {
                id: "recharges",
                label: "Recharges",
                icon: Wallet,
                badge: ledger.recharges.length,
              },
              {
                id: "settlements",
                label: "Settlements",
                icon: Handshake,
                badge: ledger.settlements.length,
              },
            ]}
          />

          {tab === "overview" ? (
            <LedgerOverview ledger={ledger} viewerId={viewerId} />
          ) : null}
          {tab === "cycles" ? (
            <CyclesList ledger={ledger} viewerId={viewerId} />
          ) : null}
          {tab === "recharges" ? (
            <RechargesList recharges={ledger.recharges} viewerId={viewerId} />
          ) : null}
          {tab === "settlements" ? (
            <SettlementsList settlements={ledger.settlements} viewerId={viewerId} />
          ) : null}
        </>
      )}
    </main>
  );
}
