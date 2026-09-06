"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { colorFor, describeBalance, taka } from "@/lib/billing";

/* ── Stat card ──────────────────────────────────────────────────── */

const TONES = {
  brand: "from-brand-500 to-brand-700 shadow-brand-600/25",
  emerald: "from-emerald-500 to-emerald-700 shadow-emerald-600/25",
  amber: "from-amber-500 to-amber-600 shadow-amber-600/25",
  rose: "from-rose-500 to-rose-700 shadow-rose-600/25",
  slate: "from-slate-600 to-slate-800 shadow-slate-700/25",
  indigo: "from-indigo-500 to-indigo-700 shadow-indigo-600/25",
} as const;

export type Tone = keyof typeof TONES;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="glass-card animate-fade-in-up p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg ${TONES[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </div>
  );
}

/* ── People ─────────────────────────────────────────────────────── */

/** A person's colour dot plus label, used everywhere a name appears. */
export function PersonChip({
  submitter,
  userName,
  colorIndex,
  size = "md",
}: {
  submitter: string;
  userName?: string;
  colorIndex: number;
  size?: "sm" | "md";
}) {
  const color = colorFor(colorIndex);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block shrink-0 rounded-full"
        style={{
          background: color,
          width: size === "sm" ? 8 : 10,
          height: size === "sm" ? 8 : 10,
        }}
        aria-hidden
      />
      <span className={size === "sm" ? "text-xs" : "text-sm"}>
        <span className="font-semibold text-slate-800">{submitter}</span>
        {userName ? <span className="text-slate-500"> · {userName}</span> : null}
      </span>
    </span>
  );
}

/**
 * A balance, worded from the holder's point of view: money owed to them,
 * money they owe, or nothing outstanding.
 */
export function BalanceBadge({
  balance,
  size = "md",
}: {
  balance: number;
  size?: "sm" | "md";
}) {
  const { tone, label, amount } = describeBalance(balance);

  const styles = {
    positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
    negative: "border-rose-200 bg-rose-50 text-rose-700",
    settled: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];

  const dot = {
    positive: "bg-emerald-500",
    negative: "bg-rose-500",
    settled: "bg-slate-400",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"
      } ${styles}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {tone === "settled" ? (
        "Settled"
      ) : (
        <>
          {tone === "positive" ? "+" : "−"}
          {taka(amount).replace("৳", "৳")} <span className="font-normal">{label}</span>
        </>
      )}
    </span>
  );
}

/* ── Section shell ──────────────────────────────────────────────── */

export function Section({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card animate-fade-in-up p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-800">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/* ── Misc ───────────────────────────────────────────────────────── */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="font-semibold text-slate-700">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function MonthPicker({
  value,
  onChange,
  label = "Month",
  id = "month-picker",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="month"
        className="field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Tab strip used by both dashboards. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; icon?: LucideIcon; badge?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="no-print mb-6 flex flex-wrap gap-1 border-b border-slate-200/80">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              isActive
                ? "border-brand-600 text-slate-800"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Warns that a month cannot be priced yet. */
export function IncompleteNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs leading-relaxed text-amber-800">
      {children}
    </div>
  );
}
