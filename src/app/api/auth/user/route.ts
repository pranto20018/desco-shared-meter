import type { NextRequest } from "next/server";
import { createSession, safeEqual } from "@/lib/auth";
import { fail, handler, ok, requireString } from "@/lib/api";
import { checkRateLimit, clearRateLimit } from "@/lib/ratelimit";
import { findPeopleByIdentifier } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** POST /api/auth/user — sub-meter label (or number) + passcode → session. */
export const POST = handler(async (request: NextRequest) => {
  const ip = request.headers.get("x-nf-client-connection-ip") ?? "local";
  const limit = checkRateLimit(`user:${ip}`);
  if (!limit.allowed) {
    return fail(
      `Too many attempts. Try again in ${limit.retryAfter} seconds.`,
      429
    );
  }

  const body = await request.json().catch(() => ({}));
  const identifier = requireString(body?.identifier, "Sub-meter label or number");
  const passcode = requireString(body?.passcode, "Passcode", 256);

  // A label like "B1" is only unique within one main meter, so several people
  // can match. The passcode decides which — and every candidate is compared
  // even after one matches, so the time taken does not reveal how many share
  // that label.
  const candidates = await findPeopleByIdentifier(identifier);
  let person: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (safeEqual(passcode, candidate.passcode) && person === null) {
      person = candidate;
    }
  }

  // The same message whether the label is unknown or the passcode is wrong, so
  // the endpoint cannot be used to find out which sub-meters exist.
  if (!person) return fail("Incorrect sub-meter or passcode.", 401);

  clearRateLimit(`user:${ip}`);
  await createSession({
    role: "user",
    userId: person.id,
    mainMeterId: person.main_meter_id,
    submitter: person.submitter,
    userName: person.user_name,
  });

  return ok({
    role: "user",
    submitter: person.submitter,
    userName: person.user_name,
  });
});
