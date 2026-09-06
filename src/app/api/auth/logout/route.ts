import { destroySession } from "@/lib/auth";
import { handler, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clears the session cookie for either role. */
export const POST = handler(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
