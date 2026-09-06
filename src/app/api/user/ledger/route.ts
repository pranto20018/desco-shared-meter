import { requireUser } from "@/lib/auth";
import { fail, handler, ok } from "@/lib/api";
import { getLedger } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/ledger — the ledger of the meter the caller belongs to.
 *
 * Everyone sharing a main meter can see everyone else's units, what they put
 * in, and where they stand: the whole point is that the split is checkable by
 * the people it applies to. What they cannot do is read another meter's ledger
 * or anyone's passcode — the meter id comes from the signed session, never
 * from the request, and passcodes are dropped before the ledger is assembled.
 *
 * This route is read-only. Every change goes through the admin routes.
 */
export const GET = handler(async () => {
  const session = await requireUser();

  const ledger = await getLedger(session.mainMeterId);
  if (!ledger) {
    return fail("Your main meter no longer exists. Ask your admin.", 404);
  }

  return ok({ ledger, viewerId: session.userId });
});
