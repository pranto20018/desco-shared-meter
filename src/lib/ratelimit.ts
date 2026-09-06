/**
 * Best-effort in-memory throttle for the login endpoints. Serverless instances
 * are short-lived and not shared, so this slows down a casual passcode guesser
 * rather than being a hard guarantee — the real protection is that passcodes
 * are compared in constant time and never enumerated by the API.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

export function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function clearRateLimit(key: string): void {
  attempts.delete(key);
}
