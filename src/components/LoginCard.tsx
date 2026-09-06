"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, LogIn, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface Field {
  name: string;
  label: string;
  placeholder: string;
  type?: "text" | "password";
  autoComplete?: string;
}

/**
 * Shared sign-in card for both portals. `endpoint` decides which credential
 * check runs server-side; the form itself only collects and posts.
 */
export function LoginCard({
  title,
  subtitle,
  endpoint,
  fields,
  onSignedIn,
  footer,
  backLink,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
  fields: Field[];
  onSignedIn: () => void;
  footer?: React.ReactNode;
  /** Optional "back" link. Omitted on the tenant portal, which is the root page. */
  backLink?: { href: string; label: string };
}) {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, ""]))
  );
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      await api.post(endpoint, values);
      toast.success("Signed in.");
      onSignedIn();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Sign-in failed. Please try again."
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {backLink ? (
          <Link
            href={backLink.href}
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLink.label}
          </Link>
        ) : null}

        <div className="glass-card animate-fade-in-up p-6 sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
            <Zap className="h-6 w-6" aria-hidden />
          </span>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{subtitle}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {fields.map((field) => {
              const isSecret = field.type === "password";
              const shown = revealed[field.name] ?? false;
              return (
                <div key={field.name}>
                  <label className="field-label" htmlFor={field.name}>
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      id={field.name}
                      name={field.name}
                      type={isSecret && !shown ? "password" : "text"}
                      className={`field-input ${isSecret ? "pr-11" : ""}`}
                      placeholder={field.placeholder}
                      autoComplete={field.autoComplete}
                      value={values[field.name] ?? ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      required
                    />
                    {isSecret ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((current) => ({
                            ...current,
                            [field.name]: !shown,
                          }))
                        }
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition hover:text-slate-600"
                        aria-label={shown ? "Hide passcode" : "Show passcode"}
                      >
                        {shown ? (
                          <EyeOff className="h-4.5 w-4.5" aria-hidden />
                        ) : (
                          <Eye className="h-4.5 w-4.5" aria-hidden />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Spinner /> : <LogIn className="h-4 w-4" aria-hidden />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {footer ? <div className="mt-5">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
