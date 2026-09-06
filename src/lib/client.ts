/**
 * Thin fetch wrapper for the JSON envelope every route returns:
 *   { ok: true, data } | { ok: false, error }
 *
 * Throws ApiError on a non-ok response so callers can `catch` and toast the
 * message rather than checking a flag at every call site.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/** `body` is an arbitrary value here, JSON-encoded below — not a raw BodyInit. */
type JsonInit = Omit<RequestInit, "body"> & { body?: unknown };

async function request<T>(url: string, init?: JsonInit): Promise<T> {
  const { body, ...rest } = init ?? {};

  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(rest.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Dashboards must never render a cached month after a save.
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      `The server returned an unreadable response (HTTP ${response.status}).`,
      response.status
    );
  }

  const envelope = payload as { ok?: boolean; data?: T; error?: string };

  if (!response.ok || envelope?.ok !== true) {
    throw new ApiError(
      envelope?.error ?? `Request failed (HTTP ${response.status}).`,
      response.status
    );
  }

  return envelope.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body }),
  put: <T>(url: string, body?: unknown) => request<T>(url, { method: "PUT", body }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
