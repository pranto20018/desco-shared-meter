import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fail, handler, ok, requireNumber, requireString } from "@/lib/api";
import {
  createMeter,
  deleteMeter,
  meterSummaries,
  updateMeter,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(error.message)
  );
}

/** GET /api/admin/meters — every main meter with a headline summary. */
export const GET = handler(async () => {
  await requireAdmin();
  return ok({ meters: await meterSummaries() });
});

/** POST /api/admin/meters — add a main meter. */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const name = requireString(body?.name, "Meter name", 80);
  const label =
    typeof body?.meterLabel === "string" ? body.meterLabel.trim().slice(0, 60) : "";

  try {
    return ok({ meter: await createMeter(name, label) }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("A main meter with that name already exists.", 409);
    }
    throw error;
  }
});

/** PUT /api/admin/meters — rename a main meter or change its DESCO label. */
export const PUT = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const id = requireNumber(body?.id, "Meter id", { min: 1 });
  const name = requireString(body?.name, "Meter name", 80);
  const label =
    typeof body?.meterLabel === "string" ? body.meterLabel.trim().slice(0, 60) : "";

  try {
    return ok({ meter: await updateMeter(id, name, label) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("A main meter with that name already exists.", 409);
    }
    throw error;
  }
});

/**
 * DELETE /api/admin/meters?id=N — removes the meter and everything under it.
 * Requires ?confirm=1 as well, because this takes the whole ledger with it.
 */
export const DELETE = handler(async (request: NextRequest) => {
  await requireAdmin();
  const id = requireNumber(request.nextUrl.searchParams.get("id"), "Meter id", {
    min: 1,
  });

  if (request.nextUrl.searchParams.get("confirm") !== "1") {
    return fail(
      "Deleting a main meter also deletes its people, readings, recharges, and settlements. Re-send with confirm=1.",
      400
    );
  }

  await deleteMeter(id);
  return ok({ deleted: id });
});
