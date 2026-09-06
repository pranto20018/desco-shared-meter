import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fail, handler, ok, requireNumber } from "@/lib/api";
import { getLedger } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ledger?meterId=N
 *
 * The whole computed ledger for one main meter: people, every month's split,
 * recharges, settlements, running totals, and anything still unpriced.
 */
export const GET = handler(async (request: NextRequest) => {
  await requireAdmin();

  const meterId = requireNumber(
    request.nextUrl.searchParams.get("meterId"),
    "Meter id",
    { min: 1 }
  );

  const ledger = await getLedger(meterId);
  if (!ledger) return fail("No main meter found with that id.", 404);

  return ok({ ledger });
});
