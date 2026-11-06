import { describe, expect, it } from "vitest";
import { S3_ENDPOINT, decodeAwsChunked, escapeXml, handleS3, parsePath, unescapeXml } from "../src/s3";
import { MemoryBucket } from "./memoryBucket";

const B = `${S3_ENDPOINT}/phazechat-data`;

function req(method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(`${B}${path}`, { method, body, headers });
}

function chunked(data: string, chunkSize: number, trailer = false): string {
  let out = "";
  for (let i = 0; i < data.length; i += chunkSize) {
    const c = data.slice(i, i + chunkSize);
    out += `${c.length.toString(16)};chunk-signature=${"a".repeat(64)}\r\n${c}\r\n`;
  }
  out += `0;chunk-signature=${"b".repeat(64)}\r\n`;
  out += trailer ? "x-amz-checksum-crc32c:AAAAAA==\r\n\r\n" : "\r\n";
  return out;
}

describe("parsePath", () => {
  it("splits bucket and key and decodes the key", () => {
    expect(parsePath("/phazechat-data/uploads/a%20b.png")).toEqual({ bucket: "phazechat-data", key: "uploads/a b.png" });
    expect(parsePath("/phazechat-data")).toEqual({ bucket: "phazechat-data", key: "" });
    expect(parsePath("/phazechat-data/")).toEqual({ bucket: "phazechat-data", key: "" });
  });
});

describe("xml escaping", () => {
  it("round-trips", () => {
    const s = `a&b<c>"d"'e'`;
    expect(unescapeXml(escapeXml(s))).toBe(s);
    expect(unescapeXml("&#65;&#x42;")).toBe("AB");
  });
});

describe("decodeAwsChunked", () => {
  it("decodes signed chunks and ignores trailers", () => {
    const enc = new TextEncoder();
    expect(new TextDecoder().decode(decodeAwsChunked(enc.encode(chunked("hello world", 4))))).toBe("hello world");
    expect(new TextDecoder().decode(decodeAwsChunked(enc.encode(chunked("hello world", 100, true))))).toBe("hello world");
    expect(decodeAwsChunked(enc.encode("0\r\n\r\n")).length).toBe(0);
  });

  it("rejects a truncated body", () => {
    expect(() => decodeAwsChunked(new TextEncoder().encode("10\r\nabc"))).toThrow();
  });
});

describe("handleS3 objects", () => {
  it("puts, heads, gets, ranges and deletes", async () => {
    const bucket = new MemoryBucket();
    const put = await handleS3(req("PUT", "/uploads/x.txt", "0123456789", { "Content-Type": "text/plain" }), bucket);
    expect(put.status).toBe(200);
    expect(put.headers.get("ETag")).toMatch(/^".+"$/);

    const head = await handleS3(req("HEAD", "/uploads/x.txt"), bucket);
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("10");
    expect(head.headers.get("Content-Type")).toBe("text/plain");

    const get = await handleS3(req("GET", "/uploads/x.txt"), bucket);
    expect(await get.text()).toBe("0123456789");

    const part = await handleS3(req("GET", "/uploads/x.txt", undefined, { Range: "bytes=2-4" }), bucket);
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 2-4/10");
    expect(await part.text()).toBe("234");

    const suffix = await handleS3(req("GET", "/uploads/x.txt", undefined, { Range: "bytes=-3" }), bucket);
    expect(suffix.headers.get("Content-Range")).toBe("bytes 7-9/10");
    expect(await suffix.text()).toBe("789");

    expect((await handleS3(req("DELETE", "/uploads/x.txt"), bucket)).status).toBe(204);
    const gone = await handleS3(req("GET", "/uploads/x.txt"), bucket);
    expect(gone.status).toBe(404);
    expect(await gone.text()).toContain("<Code>NoSuchKey</Code>");
    expect((await handleS3(req("HEAD", "/uploads/x.txt"), bucket)).status).toBe(404);
  });

  it("stores the decoded body of an aws-chunked upload", async () => {
    const bucket = new MemoryBucket();
    const res = await handleS3(
      req("PUT", "/avatars/u.png", chunked("pixels!", 3), {
        "x-amz-content-sha256": "STREAMING-AWS4-HMAC-SHA256-PAYLOAD",
        "x-amz-decoded-content-length": "7",
        "Content-Encoding": "aws-chunked",
      }),
      bucket,
    );
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(bucket.objects.get("avatars/u.png")!.data)).toBe("pixels!");
  });

  it("refuses an aws-chunked body whose length doesn't match", async () => {
    const bucket = new MemoryBucket();
    const res = await handleS3(
      req("PUT", "/a", chunked("abc", 3), { "x-amz-content-sha256": "STREAMING-UNSIGNED-PAYLOAD-TRAILER", "x-amz-decoded-content-length": "9" }),
      bucket,
    );
    expect(res.status).toBe(500);
    expect(bucket.objects.has("a")).toBe(false);
  });
});

describe("handleS3 listing", () => {
  async function seeded(): Promise<MemoryBucket> {
    const bucket = new MemoryBucket();
    for (const k of [
      "nexus.db/generations/aaa/snapshots/0000.snapshot.lz4",
      "nexus.db/generations/aaa/wal/0000/0000.wal.lz4",
      "nexus.db/generations/bbb/snapshots/0000.snapshot.lz4",
      "uploads/1.png",
      "uploads/2.png",
      "uploads/3.png",
    ]) {
      await bucket.put(k, new TextEncoder().encode(k).buffer as ArrayBuffer);
    }
    return bucket;
  }

  it("lists V2 with a delimiter as common prefixes", async () => {
    const bucket = await seeded();
    const res = await handleS3(req("GET", "?list-type=2&prefix=nexus.db/generations/&delimiter=/"), bucket);
    const body = await res.text();
    expect(body).toContain("<CommonPrefixes><Prefix>nexus.db/generations/aaa/</Prefix></CommonPrefixes>");
    expect(body).toContain("<CommonPrefixes><Prefix>nexus.db/generations/bbb/</Prefix></CommonPrefixes>");
    expect(body).not.toContain("<Contents>");
    expect(body).toContain("<IsTruncated>false</IsTruncated>");
  });

  it("pages V2 with continuation tokens", async () => {
    const bucket = await seeded();
    const keys: string[] = [];
    let token: string | null = null;
    for (let i = 0; i < 10; i++) {
      const q: string = `?list-type=2&prefix=uploads/&max-keys=2${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
      const body = await (await handleS3(req("GET", q), bucket)).text();
      keys.push(...[...body.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1]));
      token = /<NextContinuationToken>(.*?)<\/NextContinuationToken>/.exec(body)?.[1] ?? null;
      if (!token) break;
    }
    expect(keys).toEqual(["uploads/1.png", "uploads/2.png", "uploads/3.png"]);
  });

  it("pages V1 with markers, including a plain last-key marker", async () => {
    const bucket = await seeded();
    const first = await (await handleS3(req("GET", "?prefix=uploads/&max-keys=2"), bucket)).text();
    expect(first).toContain("<IsTruncated>true</IsTruncated>");
    const next = /<NextMarker>(.*?)<\/NextMarker>/.exec(first)![1];
    const second = await (await handleS3(req("GET", `?prefix=uploads/&marker=${encodeURIComponent(next)}`), bucket)).text();
    expect([...second.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1])).toEqual(["uploads/3.png"]);

    const byKey = await (await handleS3(req("GET", "?prefix=uploads/&marker=uploads/1.png"), bucket)).text();
    expect([...byKey.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1])).toEqual(["uploads/2.png", "uploads/3.png"]);
  });

  it("answers bucket location and head", async () => {
    const bucket = new MemoryBucket();
    expect((await handleS3(req("HEAD", ""), bucket)).status).toBe(200);
    expect(await (await handleS3(req("GET", "?location"), bucket)).text()).toContain("<LocationConstraint");
  });

  it("deletes many keys at once", async () => {
    const bucket = await seeded();
    const doc =
      '<?xml version="1.0"?><Delete><Quiet>false</Quiet>' +
      "<Object><Key>uploads/1.png</Key></Object><Object><Key>uploads/2.png</Key></Object></Delete>";
    const res = await handleS3(req("POST", "?delete", doc), bucket);
    expect(await res.text()).toContain("<Deleted><Key>uploads/1.png</Key></Deleted>");
    expect([...bucket.objects.keys()].filter((k) => k.startsWith("uploads/"))).toEqual(["uploads/3.png"]);
  });
});

describe("handleS3 multipart", () => {
  it("creates, uploads parts, completes", async () => {
    const bucket = new MemoryBucket();
    const init = await (await handleS3(req("POST", "/big.bin?uploads", undefined, { "Content-Type": "application/x-test" }), bucket)).text();
    const uploadId = /<UploadId>(.*?)<\/UploadId>/.exec(init)![1];

    const p1 = await handleS3(req("PUT", `/big.bin?partNumber=1&uploadId=${uploadId}`, "aaaa"), bucket);
    const p2 = await handleS3(
      req("PUT", `/big.bin?partNumber=2&uploadId=${uploadId}`, chunked("bb", 1), {
        "x-amz-content-sha256": "STREAMING-AWS4-HMAC-SHA256-PAYLOAD",
        "x-amz-decoded-content-length": "2",
      }),
      bucket,
    );
    const done =
      `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>${p1.headers.get("ETag")}</ETag></Part>` +
      `<Part><PartNumber>2</PartNumber><ETag>&quot;${p2.headers.get("ETag")!.replace(/"/g, "")}&quot;</ETag></Part></CompleteMultipartUpload>`;
    const res = await handleS3(req("POST", `/big.bin?uploadId=${uploadId}`, done), bucket);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<CompleteMultipartUploadResult");
    const stored = bucket.objects.get("big.bin")!;
    expect(new TextDecoder().decode(stored.data)).toBe("aaaabb");
    expect(stored.contentType).toBe("application/x-test");
  });

  it("aborts", async () => {
    const bucket = new MemoryBucket();
    const init = await (await handleS3(req("POST", "/x?uploads"), bucket)).text();
    const uploadId = /<UploadId>(.*?)<\/UploadId>/.exec(init)![1];
    expect((await handleS3(req("DELETE", `/x?uploadId=${uploadId}`), bucket)).status).toBe(204);
    expect((await handleS3(req("PUT", `/x?partNumber=1&uploadId=${uploadId}`, "a"), bucket)).status).toBe(500);
  });
});
