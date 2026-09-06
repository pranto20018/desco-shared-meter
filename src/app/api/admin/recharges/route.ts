import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  handler,
  ok,
  requireNumber,
  requireString,
  ValidationError,
} from "@/lib/api";
import { monthOf } from "@/lib/billing";
import {
  createRecharge,
  deleteRecharge,
  getPerson,
  listRecharges,
  updateRecharge,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Accepts "2026-08-16T10:16" as produced by <input type="datetime-local">. */
function requireTimestamp(value: unknown, field: string): string {
  const raw = requireString(value, field, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    throw new ValidationError(`${field} must look like 2026-08-16T10:16.`);
  }
  if (!monthOf(raw)) {
    throw new ValidationError(`${field} does not contain a usable month.`);
  }
  return raw.slice(0, 16);
}

/**
 * The payer must belong to the meter being recharged, otherwise a recharge
 * could be attributed across buildings and quietly skew both ledgers.
 */
async function assertPayerOnMeter(payerId: number, meterId: number) {
  const payer = await getPerson(payerId);
  if (!payer || payer.main_meter_id !== meterId) {
    throw new ValidationError("That payer is not on this main meter.");
  }
}

/** GET /api/admin/recharges?meterId=N — newest first. */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();
  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );
  return ok({ recharges: await listRecharges(meterId) });
});

/** POST /api/admin/recharges — log money put into the main meter. */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const mainMeterId = requireNumber(body?.mainMeterId, "Meter id", { min: 1 });
  const payerId = requireNumber(body?.payerId, "Payer", { min: 1 });
  await assertPayerOnMeter(payerId, mainMeterId);

  const amount = requireNumber(body?.amount, "Amount", { min: 0.01, max: 1e7 });

  const recharge = await createRecharge({
    mainMeterId,
    payerId,
    rechargedAt: requireTimestamp(body?.rechargedAt, "Date & time"),
    amount,
    note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "",
  });

  return ok({ recharge }, 201);
});

/** PUT /api/admin/recharges — correct a logged recharge. */
export const PUT = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const id = requireNumber(body?.id, "Recharge id", { min: 1 });
  const mainMeterId = requireNumber(body?.mainMeterId, "Meter id", { min: 1 });
  const payerId = requireNumber(body?.payerId, "Payer", { min: 1 });
  await assertPayerOnMeter(payerId, mainMeterId);

  const recharge = await updateRecharge(id, {
    payerId,
    rechargedAt: requireTimestamp(body?.rechargedAt, "Date & time"),
    amount: requireNumber(body?.amount, "Amount", { min: 0.01, max: 1e7 }),
    note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "",
  });

  return ok({ recharge });
});

/** DELETE /api/admin/recharges?id=N */
export const DELETE = handler(async (request: NextRequest) => {
  await requireAdmin();
  const id = requireNumber(
    request.nextUrl.searchParams.get("id"),
    "Recharge id",
    { min: 1 }
  );
  await deleteRecharge(id);
  return ok({ deleted: id });
});
