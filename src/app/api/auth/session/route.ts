import { getSession } from "@/lib/auth";
import { handler, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — who am I? Used by the client to route on load. */
export const GET = handler(async () => {
  const session = await getSession();
  return ok({ session });
});
