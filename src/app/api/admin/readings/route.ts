import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handler, ok, requireNumber, ValidationError } from "@/lib/api";
import { isValidMonthYear, previousMonthYear } from "@/lib/billing";
import {
  listMainReadings,
  listPeople,
  listReadings,
  saveReadingsBatch,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/readings?meterId=N&month=YYYY-MM
 *
 * One row per person: their closing reading for the month if it exists, and
 * the previous month's closing reading, which is what the units are measured
 * against.
 */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();

  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );
  const month = request.nextUrl.searchParams.get("month");
  if (!isValidMonthYear(month)) {
    throw new ValidationError("Month must be in YYYY-MM format.");
  }

  const previous = previousMonthYear(month);
  const [people, readings, mainReadings] = await Promise.all([
    listPeople(meterId),
    listReadings(meterId),
    listMainReadings(meterId),
  ]);

  const rows = people.map((person) => {
    const closing = readings.find(
      (r) => r.user_id === person.id && r.month_year === month
    );
    const opening = readings.find(
      (r) => r.user_id === person.id && r.month_year === previous
    );
    return {
      user_id: person.id,
      submitter: person.submitter,
      user_name: person.user_name,
      meter_number: person.meter_number,
      color_index: person.color_index,
      previous_reading: opening ? opening.reading : null,
      reading: closing ? closing.reading : null,
    };
  });

  const mainClosing = mainReadings.find((r) => r.month_year === month);
  const mainOpening = mainReadings.find((r) => r.month_year === previous);

  return ok({
    month,
    previous_month: previous,
    rows,
    main_reading: mainClosing ? mainClosing.reading : null,
    main_previous_reading: mainOpening ? mainOpening.reading : null,
  });
});

/** POST /api/admin/readings — save one month's closing readings. */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const meterId = requireNumber(body?.meterId, "Meter id", { min: 1 });
  const month = body?.monthYear;
  if (!isValidMonthYear(month)) {
    throw new ValidationError("Month must be in YYYY-MM format, e.g. 2026-08.");
  }

  const rawEntries = Array.isArray(body?.entries) ? body.entries : null;
  if (!rawEntries) {
    throw new ValidationError("entries must be an array of readings.");
  }
  if (rawEntries.length > 500) {
    throw new ValidationError("Too many rows in one batch (max 500).");
  }

  const people = await listPeople(meterId);
  const allowed = new Set(people.map((p) => p.id));

  const entries: Array<{ userId: number; reading: number | null }> = [];

  for (const raw of rawEntries) {
    const userId = Number(raw?.userId);
    if (!Number.isInteger(userId) || !allowed.has(userId)) {
      throw new ValidationError("Every row must belong to this main meter.");
    }

    // "" means the admin cleared the cell — delete the stored reading rather
    // than writing a zero, which would read as a meter that never moved.
    const value = raw?.reading;
    if (value === "" || value === null || value === undefined) {
      entries.push({ userId, reading: null });
      continue;
    }

    const reading = Number(value);
    if (!Number.isFinite(reading)) {
      throw new ValidationError("Readings must be numbers.");
    }
    if (reading < 0) {
      throw new ValidationError("Readings cannot be negative.");
    }
    entries.push({ userId, reading });
  }

  // A closing reading below the opening one means a meter ran backwards —
  // almost always a typo, and it would silently clamp that person to zero units.
  const previous = previousMonthYear(month);
  const stored = await listReadings(meterId);
  for (const entry of entries) {
    if (entry.reading == null) continue;
    const opening = stored.find(
      (r) => r.user_id === entry.userId && r.month_year === previous
    );
    if (opening && entry.reading < opening.reading) {
      const person = people.find((p) => p.id === entry.userId);
      throw new ValidationError(
        `${person?.submitter ?? "A sub-meter"}'s reading (${entry.reading}) is below last month's (${opening.reading}). A meter cannot run backwards.`
      );
    }
  }

  const mainRaw = body?.mainReading;
  const mainReading =
    mainRaw === "" || mainRaw === null || mainRaw === undefined
      ? null
      : Number(mainRaw);
  if (mainReading != null && (!Number.isFinite(mainReading) || mainReading < 0)) {
    throw new ValidationError("The main meter reading must be a positive number.");
  }

  const result = await saveReadingsBatch(meterId, month, entries, mainReading);
  return ok({ ...result, month });
});
