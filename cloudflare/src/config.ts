// Pure configuration helpers for the Phaze container Worker. Kept free of
// `cloudflare:*` imports so they can be unit tested under plain Node.

import { MAIL_ENDPOINT, hasMailBinding } from "./mail";
import { S3_ENDPOINT } from "./s3";

/** Header the Worker sets to the visitor's real IP before proxying. */
export const CLIENT_IP_HEADER = "X-Phaze-Client-IP";

/** The R2 bucket bound to the Worker as BUCKET (see wrangler.jsonc). */
export const BUCKET_NAME = "phazechat-data";

/**
 * Placeholder S3 keys for the container. Its S3 clients insist on signing
 * requests, but storage is reached through the Worker's R2 binding (see
 * s3.ts), which does not check signatures, so no real R2 API key exists
 * anywhere in this setup.
 */
const PLACEHOLDER_KEY = "r2-binding";

/** Settings the Worker owns; a secret with the same name cannot override them. */
const FIXED_CONTAINER_ENV: Record<string, string> = {
  PORT: "8080",
  DB_PATH: "/data/nexus.db",
  PHAZE_BLOB_STORE: "s3",
  PHAZE_TRUST_PROXY_HEADER: CLIENT_IP_HEADER,
  // Tells the entrypoint the disk is wiped on restart: R2 is required and a
  // failed database restore stops the boot rather than starting empty.
  PHAZE_EPHEMERAL_DISK: "1",
  // Storage goes through the Worker's R2 binding, not R2's S3 API, so any
  // leftover AWS_* or BUCKET_NAME secrets are overridden here.
  BUCKET_NAME,
  AWS_ENDPOINT_URL_S3: S3_ENDPOINT,
  AWS_REGION: "auto",
  AWS_ACCESS_KEY_ID: PLACEHOLDER_KEY,
  AWS_SECRET_ACCESS_KEY: PLACEHOLDER_KEY,
};

/** Worker-only settings that mean nothing to the server. */
const WORKER_ONLY = new Set(["SLEEP_AFTER"]);

export const DEFAULT_SLEEP_AFTER = "30m";

/**
 * How long a cold start may take before the first request gives up: the
 * entrypoint restores the database from R2 before the server opens its port.
 */
export const COLD_START_TIMEOUT_MS = 120_000;

/**
 * Builds the container's environment from the Worker's bindings: every
 * plain string binding (vars and secrets) is passed through, so app secrets
 * such as BREVO_API_KEY or VAPID_PRIVATE_KEY only need adding once, as
 * Worker secrets. Non-string bindings (the Durable Object namespace) are
 * skipped.
 */
export function containerEnv(env: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && !WORKER_ONLY.has(key)) {
      out[key] = value;
    }
  }
  const fixed: Record<string, string> = { ...FIXED_CONTAINER_ENV };
  // Mail goes through the Worker's EMAIL binding (see mail.ts) when it has
  // one; the server then needs no mail provider key.
  if (hasMailBinding(env)) {
    fixed.PHAZE_MAIL_RELAY = MAIL_ENDPOINT;
  }
  return { ...out, ...fixed };
}

/** True when the Worker has its R2 bucket binding. */
export function hasStorageBinding(env: Record<string, unknown>): boolean {
  const bucket = env.BUCKET as { get?: unknown; put?: unknown } | undefined;
  return typeof bucket === "object" && bucket !== null && typeof bucket.get === "function" && typeof bucket.put === "function";
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
