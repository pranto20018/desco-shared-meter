import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  fail,
  handler,
  ok,
  requireNumber,
  requireString,
  ValidationError,
} from "@/lib/api";
import {
  createPerson,
  deletePerson,
  listPeopleForAdmin,
  updatePerson,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(error.message)
  );
}

/** GET /api/admin/people?meterId=N — everyone on one main meter. */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();
  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );
  return ok({ people: await listPeopleForAdmin(meterId) });
});

/** POST /api/admin/people — add someone to a main meter. */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const input = {
    mainMeterId: requireNumber(body?.mainMeterId, "Meter id", { min: 1 }),
    submitter: requireString(body?.submitter, "Sub-meter label", 60),
    userName: requireString(body?.userName, "Name", 80),
    meterNumber:
      typeof body?.meterNumber === "string"
        ? body.meterNumber.trim().slice(0, 60)
        : "",
    passcode: requireString(body?.passcode, "Passcode", 128),
  };

  if (input.passcode.length < 4) {
    throw new ValidationError("Passcode must be at least 4 characters.");
  }

  try {
    return ok({ person: await createPerson(input) }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(
        "That sub-meter label is already used on this main meter.",
        409
      );
    }
    throw error;
  }
});

/** PUT /api/admin/people — edit someone. A blank passcode leaves it unchanged. */
export const PUT = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const id = requireNumber(body?.id, "Person id", { min: 1 });
  const passcode = typeof body?.passcode === "string" ? body.passcode.trim() : "";

  if (passcode.length > 0 && passcode.length < 4) {
    throw new ValidationError("Passcode must be at least 4 characters.");
  }

  try {
    const person = await updatePerson(id, {
      submitter: requireString(body?.submitter, "Sub-meter label", 60),
      userName: requireString(body?.userName, "Name", 80),
      meterNumber:
        typeof body?.meterNumber === "string"
          ? body.meterNumber.trim().slice(0, 60)
          : "",
      passcode,
    });
    return ok({ person });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail(
        "That sub-meter label is already used on this main meter.",
        409
      );
    }
    throw error;
  }
});

/**
 * DELETE /api/admin/people?id=N — removes the person along with their
 * readings, recharges, and settlements, since a ledger entry with no owner
 * would silently distort every month they appear in.
 */
export const DELETE = handler(async (request: NextRequest) => {
  await requireAdmin();
  const id = requireNumber(request.nextUrl.searchParams.get("id"), "Person id", {
    min: 1,
  });
  await deletePerson(id);
  return ok({ deleted: id });
});
