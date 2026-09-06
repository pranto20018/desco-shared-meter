import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Session } from "./types";

const COOKIE_NAME = "desco_session";
const SESSION_TTL = "12h";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Constant-time string comparison. Guards the admin passcode check against
 * timing attacks — a plain `===` leaks how many leading characters matched.
 */
export function safeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  // Compare a fixed number of bytes regardless of length so the loop count
  // does not itself reveal the secret's length.
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role === "admin") return { role: "admin" };
    if (
      payload.role === "user" &&
      typeof payload.userId === "number" &&
      typeof payload.mainMeterId === "number" &&
      typeof payload.submitter === "string" &&
      typeof payload.userName === "string"
    ) {
      return {
        role: "user",
        userId: payload.userId,
        mainMeterId: payload.mainMeterId,
        submitter: payload.submitter,
        userName: payload.userName,
      };
    }
    return null;
  } catch {
    // Expired or tampered token — treat as signed out.
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Throws unless the caller holds an admin session. */
export async function requireAdmin(): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new UnauthorizedError("Admin authentication required.");
  }
}

/**
 * Returns the signed-in person's session. Their main meter id comes from here,
 * never from the request, so a signed-in person can only ever read the ledger
 * of the meter they belong to.
 */
export async function requireUser(): Promise<
  Extract<Session, { role: "user" }>
> {
  const session = await getSession();
  if (!session || session.role !== "user") {
    throw new UnauthorizedError("User authentication required.");
  }
  return session;
}

export class UnauthorizedError extends Error {}
