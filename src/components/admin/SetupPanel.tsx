"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { EmptyState, PersonChip, Section, Spinner } from "@/components/ui";
import { BaselinePanel } from "./BaselinePanel";
import type { MainMeter, UserMeter } from "@/lib/types";

const BLANK = { submitter: "", userName: "", meterNumber: "", passcode: "" };

function suggestPasscode(submitter: string): string {
  const slug = submitter.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") || "meter";
  return `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function SetupPanel({
  meter,
  onMeterChanged,
  onPeopleChanged,
}: {
  meter: MainMeter;
  onMeterChanged: () => void;
  onPeopleChanged: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState(meter.name);
  const [label, setLabel] = useState(meter.meter_label);
  const [savingMeter, setSavingMeter] = useState(false);

  const [people, setPeople] = useState<UserMeter[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    setName(meter.name);
    setLabel(meter.meter_label);
  }, [meter]);

  async function loadPeople() {
    setLoading(true);
    try {
      const data = await api.get<{ people: UserMeter[] }>(
        `/api/admin/people?meterId=${meter.id}`
      );
      setPeople(data.people);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not load the people."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPeople();
    // Reloading whenever the meter changes is the point; the toast helper is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter.id]);

  async function saveMeter(event: React.FormEvent) {
    event.preventDefault();
    if (savingMeter) return;
    if (!name.trim()) {
      toast.error("The meter needs a name.");
      return;
    }
    setSavingMeter(true);
    try {
      await api.put("/api/admin/meters", {
        id: meter.id,
        name: name.trim(),
        meterLabel: label.trim(),
      });
      toast.success("Main meter updated.");
      onMeterChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update the meter."
      );
    } finally {
      setSavingMeter(false);
    }
  }

  function startEdit(person: UserMeter) {
    setEditingId(person.id);
    setForm({
      submitter: person.submitter,
      userName: person.user_name,
      meterNumber: person.meter_number,
      passcode: "",
    });
    document.getElementById("submitter-input")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK);
  }

  async function submitPerson(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!form.submitter.trim() || !form.userName.trim()) {
      toast.error("Both the sub-meter label and the person's name are required.");
      return;
    }
    if (editingId == null && form.passcode.trim().length < 4) {
      toast.error("Set a passcode of at least 4 characters.");
      return;
    }

    setBusy(true);
    try {
      if (editingId == null) {
        await api.post("/api/admin/people", { mainMeterId: meter.id, ...form });
        toast.success(`${form.submitter.trim()} added.`);
      } else {
        await api.put("/api/admin/people", { id: editingId, ...form });
        toast.success(
          form.passcode.trim()
            ? `${form.submitter.trim()} updated, including the passcode.`
            : `${form.submitter.trim()} updated.`
        );
      }
      setForm(BLANK);
      setEditingId(null);
      await loadPeople();
      onPeopleChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save the person."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePerson(person: UserMeter) {
    setBusy(true);
    try {
      await api.del(`/api/admin/people?id=${person.id}`);
      toast.success(`${person.submitter} removed along with their entries.`);
      setConfirming(null);
      if (editingId === person.id) cancelEdit();
      await loadPeople();
      onPeopleChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not remove the person."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPasscode(person: UserMeter) {
    try {
      await navigator.clipboard.writeText(person.passcode);
      toast.success(`Passcode for ${person.submitter} copied.`);
    } catch {
      // Clipboard access needs a secure context and permission; showing the
      // value is the useful fallback.
      setRevealed((current) => new Set(current).add(person.id));
      toast.warning("Clipboard unavailable — the passcode is shown instead.");
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Main meter"
        description="The shared prepaid meter everything on this page belongs to."
        icon={Gauge}
      >
        <form onSubmit={saveMeter} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="field-label" htmlFor="meter-name">
              Name
            </label>
            <input
              id="meter-name"
              className="field-input"
              placeholder="Building A"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="field-label" htmlFor="meter-label">
              DESCO meter number{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="meter-label"
              className="field-input"
              placeholder="661120201082"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={savingMeter}>
            {savingMeter ? <Spinner /> : <Save className="h-4 w-4" aria-hidden />}
            Save
          </button>
        </form>
      </Section>

      <Section
        title="People on this meter"
        description="Each person has one sub-meter and their own passcode."
        icon={Users}
        actions={
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
        }
      >
        <form
          onSubmit={submitPerson}
          className="mb-6 rounded-xl border border-slate-200/80 bg-white/60 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="field-label" htmlFor="submitter-input">
                Sub-meter label
              </label>
              <input
                id="submitter-input"
                className="field-input"
                placeholder="B1"
                value={form.submitter}
                onChange={(event) =>
                  setForm((c) => ({ ...c, submitter: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label" htmlFor="username-input">
                Name
              </label>
              <input
                id="username-input"
                className="field-input"
                placeholder="Rosa"
                value={form.userName}
                onChange={(event) =>
                  setForm((c) => ({ ...c, userName: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label" htmlFor="meternumber-input">
                Sub-meter number{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="meternumber-input"
                className="field-input"
                placeholder="DESCO-101"
                value={form.meterNumber}
                onChange={(event) =>
                  setForm((c) => ({ ...c, meterNumber: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="field-label" htmlFor="passcode-input">
                Passcode{" "}
                {editingId != null ? (
                  <span className="font-normal text-slate-400">(blank = unchanged)</span>
                ) : null}
              </label>
              <div className="flex gap-2">
                <input
                  id="passcode-input"
                  className="field-input"
                  placeholder={editingId != null ? "Leave blank to keep" : "b1-2026"}
                  value={form.passcode}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, passcode: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 px-3"
                  title="Suggest a passcode"
                  onClick={() =>
                    setForm((c) => ({ ...c, passcode: suggestPasscode(c.submitter) }))
                  }
                >
                  <KeyRound className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : editingId == null ? (
                <Plus className="h-4 w-4" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {editingId == null ? "Add person" : "Save changes"}
            </button>
            {editingId != null ? (
              <button type="button" className="btn-ghost" onClick={cancelEdit}>
                <X className="h-4 w-4" aria-hidden />
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Spinner /> Loading…
          </div>
        ) : people.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody added yet"
            description="Add everyone who shares this main meter. Each needs a unique sub-meter label and a passcode."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sub-meter</th>
                  <th>Number</th>
                  <th>Passcode</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const shown = revealed.has(person.id);
                  return (
                    <tr key={person.id}>
                      <td>
                        <PersonChip
                          submitter={person.submitter}
                          userName={person.user_name}
                          colorIndex={person.color_index}
                        />
                      </td>
                      <td className="font-mono text-xs">
                        {person.meter_number || "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">
                            {shown ? person.passcode : "••••••••"}
                          </span>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            onClick={() =>
                              setRevealed((current) => {
                                const next = new Set(current);
                                if (next.has(person.id)) next.delete(person.id);
                                else next.add(person.id);
                                return next;
                              })
                            }
                            aria-label={shown ? "Hide passcode" : "Show passcode"}
                          >
                            {shown ? (
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            onClick={() => copyPasscode(person)}
                            aria-label="Copy passcode"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          {confirming === person.id ? (
                            <>
                              <span className="text-xs font-medium text-rose-700">
                                Remove along with their readings and recharges?
                              </span>
                              <button
                                type="button"
                                className="btn-danger px-3 py-1.5 text-xs"
                                disabled={busy}
                                onClick={() => removePerson(person)}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-3 py-1.5 text-xs"
                                onClick={() => setConfirming(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-secondary px-3 py-1.5 text-xs"
                                onClick={() => startEdit(person)}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                                onClick={() => setConfirming(person.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Needs the people above to exist, so it comes last. */}
      <BaselinePanel
        key={`${meter.id}-${people.length}`}
        meterId={meter.id}
        onSaved={onPeopleChanged}
      />
    </div>
  );
}
