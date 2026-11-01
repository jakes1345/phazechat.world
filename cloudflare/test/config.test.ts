import { describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  DEFAULT_SLEEP_AFTER,
  containerEnv,
  missingStorageSettings,
  sleepAfter,
  withClientIP,
} from "../src/config";

const storage = {
  BUCKET_NAME: "phaze",
  AWS_ENDPOINT_URL_S3: "https://acct.r2.cloudflarestorage.com",
  AWS_ACCESS_KEY_ID: "id",
  AWS_SECRET_ACCESS_KEY: "secret",
};

describe("containerEnv", () => {
  it("passes string bindings through and skips the rest", () => {
    const env = containerEnv({ ...storage, BREVO_API_KEY: "k", NEXUS: { idFromName() {} }, SLEEP_AFTER: "1h" });
    expect(env.BREVO_API_KEY).toBe("k");
    expect(env.BUCKET_NAME).toBe("phaze");
    expect(env).not.toHaveProperty("NEXUS");
    expect(env).not.toHaveProperty("SLEEP_AFTER");
  });

  it("pins the settings the deploy depends on", () => {
    const env = containerEnv({ ...storage, PHAZE_BLOB_STORE: "disk", DB_PATH: "/tmp/x.db", PORT: "1" });
    expect(env.PHAZE_BLOB_STORE).toBe("s3");
    expect(env.DB_PATH).toBe("/data/nexus.db");
    expect(env.PORT).toBe("8080");
    expect(env.PHAZE_TRUST_PROXY_HEADER).toBe(CLIENT_IP_HEADER);
    expect(env.PHAZE_EPHEMERAL_DISK).toBe("1");
  });

  it("defaults the R2 region but lets it be set", () => {
    expect(containerEnv(storage).AWS_REGION).toBe("auto");
    expect(containerEnv({ ...storage, AWS_REGION: "wnam" }).AWS_REGION).toBe("wnam");
  });
});

describe("missingStorageSettings", () => {
  it("is empty when R2 is configured", () => {
    expect(missingStorageSettings(storage)).toEqual([]);
  });

  it("names each missing or blank setting", () => {
    expect(missingStorageSettings({ ...storage, BUCKET_NAME: " ", AWS_SECRET_ACCESS_KEY: undefined })).toEqual([
      "BUCKET_NAME",
      "AWS_SECRET_ACCESS_KEY",
    ]);
  });
});

describe("sleepAfter", () => {
  it("accepts durations and falls back on anything else", () => {
    expect(sleepAfter({ SLEEP_AFTER: "2h" })).toBe("2h");
    expect(sleepAfter({ SLEEP_AFTER: "forever" })).toBe(DEFAULT_SLEEP_AFTER);
    expect(sleepAfter({})).toBe(DEFAULT_SLEEP_AFTER);
  });
});

describe("withClientIP", () => {
  it("sets the header from CF-Connecting-IP and drops a spoofed one", () => {
    const req = new Request("https://phazechat.world/api/v1/login", {
      method: "POST",
      body: "{}",
      headers: { "CF-Connecting-IP": "203.0.113.9", [CLIENT_IP_HEADER]: "1.1.1.1" },
    });
    const out = withClientIP(req);
    expect(out.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(out.method).toBe("POST");
    expect(out.url).toBe(req.url);
  });

  it("never forwards a visitor-supplied value when Cloudflare gave none", () => {
    const out = withClientIP(new Request("https://phazechat.world/", { headers: { [CLIENT_IP_HEADER]: "1.1.1.1" } }));
    expect(out.headers.has(CLIENT_IP_HEADER)).toBe(false);
  });
});
