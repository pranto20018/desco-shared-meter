// The /web entry point talks to Turso over plain HTTP with no native addon.
// The default entry resolves to the Node build, which loads the `libsql`
// native binding — that binding is not present in a Netlify Function bundle,
// so importing it there crashes the whole module before any handler runs.
// The trade-off is that file: URLs no longer work, so local dev also uses a
// real Turso database.
import { createClient, type Client } from "@libsql/client/web";

/**
 * A single libSQL client is reused across warm serverless invocations.
 * Netlify Functions keep the module scope alive between requests, so a
 * module-level singleton avoids re-opening a connection per request.
 */
let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Copy .env.example to .env.local (local) " +
        "or add it under Netlify → Site settings → Environment variables."
    );
  }

  if (url.startsWith("file:")) {
    throw new Error(
      "TURSO_DATABASE_URL must be an libsql:// URL. The HTTP client this app " +
        "uses cannot open a local file — point it at a Turso database for local " +
        "development too."
    );
  }

  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  return client;
}
