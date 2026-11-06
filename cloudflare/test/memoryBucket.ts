// An in-memory stand-in for the parts of R2Bucket that src/s3.ts uses,
// following R2's documented behaviour for list cursors, delimiters, ranges
// and multipart uploads.
import type { Bucket } from "../src/s3";

interface Stored {
  data: Uint8Array;
  contentType: string;
  uploaded: Date;
  etag: string;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function md5ish(data: Uint8Array): Promise<string> {
  // Real R2 uses MD5; SHA-256 truncated is fine for a test double.
  return hex(await crypto.subtle.digest("SHA-256", data)).slice(0, 32);
}

function toObject(key: string, s: Stored, range?: R2Range): R2Object {
  return {
    key,
    version: "1",
    size: s.data.length,
    etag: s.etag,
    httpEtag: `"${s.etag}"`,
    uploaded: s.uploaded,
    httpMetadata: { contentType: s.contentType },
    customMetadata: {},
    checksums: {} as R2Checksums,
    storageClass: "Standard",
    range,
    writeHttpMetadata() {},
  } as unknown as R2Object;
}

function parseRange(headers: Headers, size: number): { offset: number; length: number } | undefined {
  const value = headers.get("range");
  if (!value) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!m) return undefined;
  if (m[1] === "") {
    const suffix = Math.min(Number(m[2]), size);
    return { offset: size - suffix, length: suffix };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return { offset: start, length: end - start + 1 };
}

export class MemoryBucket implements Bucket {
  objects = new Map<string, Stored>();
  private uploads = new Map<string, { key: string; contentType: string; parts: Map<number, { etag: string; data: Uint8Array }> }>();
  private nextUpload = 1;

  async head(key: string): Promise<R2Object | null> {
    const s = this.objects.get(key);
    return s ? toObject(key, s) : null;
  }

  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null> {
    const s = this.objects.get(key);
    if (!s) return null;
    let data = s.data;
    let range: R2Range | undefined;
    if (options?.range instanceof Headers) {
      const r = parseRange(options.range, s.data.length);
      if (r) {
        data = s.data.subarray(r.offset, r.offset + r.length);
        range = r;
      }
    }
    const obj = toObject(key, s, range) as unknown as Record<string, unknown>;
    obj.body = new Response(data).body;
    return obj as unknown as R2ObjectBody;
  }

  async put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object> {
    const data = new Uint8Array(value.slice(0));
    const contentType = (options?.httpMetadata as R2HTTPMetadata | undefined)?.contentType ?? "application/octet-stream";
    const stored = { data, contentType, uploaded: new Date(), etag: await md5ish(data) };
    this.objects.set(key, stored);
    return toObject(key, stored);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }

  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    const prefix = options.prefix ?? "";
    const limit = options.limit ?? 1000;
    let keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    let after = options.startAfter;
    if (options.cursor) after = atob(options.cursor);
    if (after !== undefined) keys = keys.filter((k) => k > after!);

    const objects: R2Object[] = [];
    const prefixes: string[] = [];
    let last = "";
    let truncated = false;
    for (const k of keys) {
      if (objects.length + prefixes.length >= limit) {
        truncated = true;
        break;
      }
      if (options.delimiter) {
        const rest = k.slice(prefix.length);
        const i = rest.indexOf(options.delimiter);
        if (i >= 0) {
          const p = prefix + rest.slice(0, i + options.delimiter.length);
          if (!prefixes.includes(p)) prefixes.push(p);
          last = k;
          continue;
        }
      }
      objects.push(toObject(k, this.objects.get(k)!));
      last = k;
    }
    if (truncated && options.delimiter) {
      // Skip past every key under the last common prefix, as R2 does.
      const lp = prefixes[prefixes.length - 1];
      if (lp && last.startsWith(lp)) last = lp + "￿";
    }
    return truncated
      ? ({ objects, delimitedPrefixes: prefixes, truncated: true, cursor: btoa(last) } as R2Objects)
      : ({ objects, delimitedPrefixes: prefixes, truncated: false } as R2Objects);
  }

  async createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload> {
    const uploadId = `upload-${this.nextUpload++}`;
    const contentType = (options?.httpMetadata as R2HTTPMetadata | undefined)?.contentType ?? "application/octet-stream";
    this.uploads.set(uploadId, { key, contentType, parts: new Map() });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const bucket = this;
    const find = () => {
      const u = bucket.uploads.get(uploadId);
      if (!u || u.key !== key) throw new Error("NoSuchUpload");
      return u;
    };
    return {
      key,
      uploadId,
      async uploadPart(partNumber: number, value: ArrayBuffer | string): Promise<R2UploadedPart> {
        const u = find();
        const data = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array((value as ArrayBuffer).slice(0));
        const etag = await md5ish(data);
        u.parts.set(partNumber, { etag, data });
        return { partNumber, etag };
      },
      async abort(): Promise<void> {
        find();
        bucket.uploads.delete(uploadId);
      },
      async complete(parts: R2UploadedPart[]): Promise<R2Object> {
        const u = find();
        const chunks: Uint8Array[] = [];
        for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
          const stored = u.parts.get(p.partNumber);
          if (!stored || stored.etag !== p.etag) throw new Error(`InvalidPart ${p.partNumber}`);
          chunks.push(stored.data);
        }
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const data = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          data.set(c, off);
          off += c.length;
        }
        bucket.uploads.delete(uploadId);
        const stored = { data, contentType: u.contentType, uploaded: new Date(), etag: `${await md5ish(data)}-${parts.length}` };
        bucket.objects.set(key, stored);
        return toObject(key, stored);
      },
    } as unknown as R2MultipartUpload;
  }
}
