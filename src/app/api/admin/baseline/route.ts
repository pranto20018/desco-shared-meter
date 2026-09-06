import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handler, ok, requireNumber, ValidationError } from "@/lib/api";
import {
  currentMonthYear,
  isValidMonthYear,
  previousMonthYear,
} from "@/lib/billing";
import { listPeople, readingMonths, saveBaseline } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/baseline?meterId=N
 *
 * Tells the setup screen whether this meter needs opening readings, and which
 * month they would be filed under.
 */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();

  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );

  const [people, months] = await Promise.all([
    listPeople(meterId),
    readingMonths(meterId),
  ]);

  // Filing the opening readings under last month means the current month is the
  // first one that gets priced — the admin does not have to wait a cycle.
  const suggestedMonth = previousMonthYear(currentMonthYear());

  return ok({
    started: months.length > 0,
    baseline_month: months[0] ?? suggestedMonth,
    suggested_month: suggestedMonth,
    people: people.map((person) => ({
      user_id: person.id,
      submitter: person.submitter,
      user_name: person.user_name,
      meter_number: person.meter_number,
      color_index: person.color_index,
    })),
  });
});

/**
 * POST /api/admin/baseline — record where every meter stood at the start.
 *
 * Without this, the first month a meter is used has no opening reading, so it
 * cannot be priced and its recharges sit in "pending" until a second month is
 * entered.
 */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const meterId = requireNumber(body?.meterId, "Meter id", { min: 1 });

  const month = body?.baselineMonth;
  if (!isValidMonthYear(month)) {
    throw new ValidationError(
      "The starting month must be in YYYY-MM format, e.g. 2026-07."
    );
  }

  const rawEntries = Array.isArray(body?.entries) ? body.entries : null;
  if (!rawEntries) {
    throw new ValidationError("entries must be an array of opening readings.");
  }

  const people = await listPeople(meterId);
  const allowed = new Set(people.map((p) => p.id));

  const entries: Array<{ userId: number; reading: number }> = [];

  for (const raw of rawEntries) {
    const userId = Number(raw?.userId);
    if (!Number.isInteger(userId) || !allowed.has(userId)) {
      throw new ValidationError("Every row must belong to this main meter.");
    }

    const value = raw?.reading;
    if (value === "" || value === null || value === undefined) {
      // Every sub-meter needs a starting point, or the months that follow
      // cannot be priced for that person — which is the whole problem this
      // route exists to prevent.
      const person = people.find((p) => p.id === userId);
      throw new ValidationError(
        `Enter a starting reading for ${person?.submitter ?? "every sub-meter"}.`
      );
    }

    const reading = Number(value);
    if (!Number.isFinite(reading) || reading < 0) {
      throw new ValidationError("Starting readings must be positive numbers.");
    }
    entries.push({ userId, reading });
  }

  if (entries.length !== people.length) {
    throw new ValidationError(
      "Enter a starting reading for every sub-meter on this meter."
    );
  }

  const mainRaw = body?.mainReading;
  const mainReading =
    mainRaw === "" || mainRaw === null || mainRaw === undefined
      ? null
      : Number(mainRaw);
  if (mainReading != null && (!Number.isFinite(mainReading) || mainReading < 0)) {
    throw new ValidationError("The main meter reading must be a positive number.");
  }

  const result = await saveBaseline(meterId, month, entries, mainReading);
  return ok({ ...result, baseline_month: month });
});
