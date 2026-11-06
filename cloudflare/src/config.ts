// Pure configuration helpers for the Phaze container Worker. Kept free of
// `cloudflare:*` imports so they can be unit tested under plain Node.

/** Header the Worker sets to the visitor's real IP before proxying. */
export const CLIENT_IP_HEADER = "X-Phaze-Client-IP";

/**
 * R2 settings the container cannot run without. Its disk is wiped whenever
 * it sleeps or is redeployed, so without these the database and every
 * upload would silently vanish on the next restart.
 */
export const REQUIRED_STORAGE_SETTINGS = [
  "BUCKET_NAME",
  "AWS_ENDPOINT_URL_S3",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

/** Settings the Worker owns; a secret with the same name cannot override them. */
const FIXED_CONTAINER_ENV: Record<string, string> = {
  PORT: "8080",
  DB_PATH: "/data/nexus.db",
  PHAZE_BLOB_STORE: "s3",
  PHAZE_TRUST_PROXY_HEADER: CLIENT_IP_HEADER,
  // Tells the entrypoint the disk is wiped on restart: R2 is required and a
  // failed database restore stops the boot rather than starting empty.
  PHAZE_EPHEMERAL_DISK: "1",
};

/** Worker-only settings that mean nothing to the server. */
const WORKER_ONLY = new Set(["SLEEP_AFTER"]);

export const DEFAULT_SLEEP_AFTER = "30m";

/**
 * Builds the container's environment from the Worker's bindings: every
 * plain string binding (vars and secrets) is passed through, so app secrets
 * such as BREVO_API_KEY or VAPID_PRIVATE_KEY only need adding once, as
 * Worker secrets. Non-string bindings (the Durable Object namespace) are
 * skipped.
 */
export function containerEnv(env: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { AWS_REGION: "auto" };
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && !WORKER_ONLY.has(key)) {
      out[key] = value;
    }
  }
  return { ...out, ...FIXED_CONTAINER_ENV };
}

export function missingStorageSettings(env: Record<string, unknown>): string[] {
  return REQUIRED_STORAGE_SETTINGS.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function sleepAfter(env: Record<string, unknown>): string {
  const value = env.SLEEP_AFTER;
  if (typeof value === "string" && /^\d+[smh]$/.test(value.trim())) {
    return value.trim();
  }
  return DEFAULT_SLEEP_AFTER;
}

/**
 * Copies the request with the client IP header set from Cloudflare's own
 * CF-Connecting-IP. Any value the visitor sent is replaced, so the server
 * can trust the header for rate limits, bans and the admin allowlist.
 */
export function withClientIP(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) {
    headers.set(CLIENT_IP_HEADER, ip);
  }
  return new Request(request, { headers });
}
