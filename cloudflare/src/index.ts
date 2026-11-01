import { Container, getContainer, type StopParams } from "@cloudflare/containers";
import { containerEnv, missingStorageSettings, sleepAfter, withClientIP } from "./config";

export interface Env {
  NEXUS: DurableObjectNamespace<PhazeNexus>;
  [binding: string]: unknown;
}

/**
 * The Phaze Nexus server (nexus_server/Dockerfile) running as a Cloudflare
 * Container. There is exactly one instance: SQLite has a single writer, and
 * Litestream streams it to R2 so a restart or redeploy picks up where the
 * last instance stopped.
 */
export class PhazeNexus extends Container<Env> {
  defaultPort = 8080;
  // /health answers once the database is open; Litestream restores first.
  pingEndpoint = "localhost/health";
  // Nova (Gemini), email, push and GeoIP all call out.
  enableInternet = true;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = containerEnv(env);
    this.sleepAfter = sleepAfter(env);
  }

  override onStart(): void {
    console.log("[phaze] container started");
  }

  override onStop(params: StopParams): void {
    console.log(`[phaze] container stopped: exit ${params.exitCode} (${params.reason})`);
  }

  override onError(error: unknown): void {
    console.error("[phaze] container error", error);
    throw error;
  }
}

// One fixed name, so every request reaches the same instance.
const INSTANCE = "phaze-nexus";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const missing = missingStorageSettings(env);
    if (missing.length > 0) {
      // Refuse to start on an ephemeral disk with nowhere to save data.
      console.error(`[phaze] not starting: missing ${missing.join(", ")}`);
      return new Response(
        "Phaze is being set up and will be back shortly.\n",
        { status: 503, headers: { "Retry-After": "300", "Content-Type": "text/plain" } },
      );
    }
    return getContainer(env.NEXUS, INSTANCE).fetch(withClientIP(request));
  },
} satisfies ExportedHandler<Env>;
