import { Container, getContainer, type OutboundHandlerContext, type StopParams } from "@cloudflare/containers";
import {
  COLD_START_TIMEOUT_MS,
  containerEnv,
  hasStorageBinding,
  sleepAfter,
  withClientIP,
} from "./config";
import { S3_HOST, handleS3 } from "./s3";

// Outbound interception (the container reaching R2 through the Worker)
// needs this entrypoint exported.
export { ContainerProxy } from "@cloudflare/containers";

export interface Env {
  NEXUS: DurableObjectNamespace<PhazeNexus>;
  BUCKET: R2Bucket;
  [binding: string]: unknown;
}

/**
 * The Phaze Nexus server (nexus_server/Dockerfile) running as a Cloudflare
 * Container. There is exactly one instance: SQLite has a single writer, and
 * Litestream streams it to R2 so a restart or redeploy picks up where the
 * last instance stopped.
 *
 * The container reaches R2 at http://r2.phaze, which the Containers runtime
 * routes to handleS3 (s3.ts) on this machine; that answers with the BUCKET
 * binding, so there are no R2 API keys to create or rotate.
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

  /**
   * Starts the container with room for Litestream to restore the database
   * before the server listens. The package's own start allows 20 seconds
   * in total, which a cold start with a large database can overrun, and
   * the visitor then gets a 500 while the container is still coming up.
   */
  override async fetch(request: Request): Promise<Response> {
    const state = await this.getState();
    if (!this.ctx.container?.running || state.status !== "healthy") {
      try {
        await this.startAndWaitForPorts(this.defaultPort, {
          abort: request.signal,
          portReadyTimeoutMS: COLD_START_TIMEOUT_MS,
        });
      } catch (error) {
        // super.fetch retries the start and turns the failure into the
        // package's usual 503/429/500 response.
        console.error("[phaze] cold start did not finish", error);
      }
    }
    return super.fetch(request);
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

// Assigned through the static setter (not a class field) so the package
// registers the handler for this class.
PhazeNexus.outboundByHost = {
  [S3_HOST]: (request: Request, env: Env, _ctx: OutboundHandlerContext) => handleS3(request, env.BUCKET),
};

// One fixed name, so every request reaches the same instance.
const INSTANCE = "phaze-nexus";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!hasStorageBinding(env)) {
      // Refuse to start on an ephemeral disk with nowhere to save data.
      console.error("[phaze] not starting: the BUCKET R2 binding is missing");
      return new Response(
        "Phaze is being set up and will be back shortly.\n",
        { status: 503, headers: { "Retry-After": "300", "Content-Type": "text/plain" } },
      );
    }
    return getContainer(env.NEXUS, INSTANCE).fetch(withClientIP(request));
  },
} satisfies ExportedHandler<Env>;
