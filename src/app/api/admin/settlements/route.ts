import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  handler,
  ok,
  requireNumber,
  requireString,
  ValidationError,
} from "@/lib/api";
import { monthOf, suggestSettlements } from "@/lib/billing";
import {
  createSettlement,
  deleteSettlement,
  getLedger,
  getPerson,
  listSettlements,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function requireTimestamp(value: unknown, field: string): string {
  const raw = requireString(value, field, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    throw new ValidationError(`${field} must look like 2026-08-31T12:00.`);
  }
  if (!monthOf(raw)) {
    throw new ValidationError(`${field} does not contain a usable month.`);
  }
  return raw.slice(0, 16);
}

/**
 * GET /api/admin/settlements?meterId=N
 *
 * Returns what has been settled, plus the shortest set of transfers that would
 * clear the current balances — so the admin can record what people actually
 * need to hand over rather than working it out by hand.
 */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();
  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );

  const [settlements, ledger] = await Promise.all([
    listSettlements(meterId),
    getLedger(meterId),
  ]);

  const suggested = ledger
    ? suggestSettlements(
        ledger.totals.map((t) => ({
          user_id: t.user_id,
          submitter: t.submitter,
          balance: t.balance,
        }))
      )
    : [];

  return ok({ settlements, suggested });
});

/** POST /api/admin/settlements — record one person paying another. */
export const POST = handler(async (request: NextRequest) => {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));

  const mainMeterId = requireNumber(body?.mainMeterId, "Meter id", { min: 1 });
  const fromUserId = requireNumber(body?.fromUserId, "Payer", { min: 1 });
  const toUserId = requireNumber(body?.toUserId, "Recipient", { min: 1 });

  if (fromUserId === toUserId) {
    throw new ValidationError("A settlement needs two different people.");
  }

  const [from, to] = await Promise.all([
    getPerson(fromUserId),
    getPerson(toUserId),
  ]);
  if (
    !from ||
    !to ||
    from.main_meter_id !== mainMeterId ||
    to.main_meter_id !== mainMeterId
  ) {
    throw new ValidationError("Both people must be on this main meter.");
  }

  const settlement = await createSettlement({
    mainMeterId,
    fromUserId,
    toUserId,
    settledAt: requireTimestamp(body?.settledAt, "Date & time"),
    amount: requireNumber(body?.amount, "Amount", { min: 0.01, max: 1e7 }),
    note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "",
  });

  return ok({ settlement }, 201);
});

/** DELETE /api/admin/settlements?id=N */
export const DELETE = handler(async (request: NextRequest) => {
  await requireAdmin();
  const id = requireNumber(
    request.nextUrl.searchParams.get("id"),
    "Settlement id",
    { min: 1 }
  );
  await deleteSettlement(id);
  return ok({ deleted: id });
});
