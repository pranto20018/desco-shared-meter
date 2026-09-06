import type { NextRequest } from "next/server";
import { createSession, safeEqual } from "@/lib/auth";
import { fail, handler, ok, requireString } from "@/lib/api";
import { checkRateLimit, clearRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/auth/admin — exchange the admin secret key for a session cookie. */
export const POST = handler(async (request: NextRequest) => {
  const ip = request.headers.get("x-nf-client-connection-ip") ?? "local";
  const limit = checkRateLimit(`admin:${ip}`);
  if (!limit.allowed) {
    return fail(
      `Too many attempts. Try again in ${limit.retryAfter} seconds.`,
      429
    );
  }

  const body = await request.json().catch(() => ({}));
  const secret = requireString(body?.secret, "Admin secret key", 256);

  const expected = process.env.ADMIN_SECRET_KEY;
  if (!expected) {
    return fail(
      "ADMIN_SECRET_KEY is not configured on the server. Set it in your environment variables.",
      500
    );
  }

  if (!safeEqual(secret, expected)) {
    return fail("Incorrect admin secret key.", 401);
  }

  clearRateLimit(`admin:${ip}`);
  await createSession({ role: "admin" });
  return ok({ role: "admin" });
});
