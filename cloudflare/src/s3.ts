// A small S3 API in front of the Worker's R2 binding, so the container can
// reach the bucket with no R2 API keys at all.
//
// The container sends plain HTTP to S3_HOST; the Containers runtime routes
// those requests here (see PhazeNexus.outboundByHost) and they never leave
// the machine. The S3 clients inside the container (Litestream and
// minio-go) still sign their requests, with placeholder keys; the
// signatures are not checked, because only this container can reach the
// handler. Requests are path-style: /<bucket>/<key>. The bucket in the
// path is ignored; every request goes to the bound bucket.
//
// Supported, which is everything Litestream 0.3 and minio-go use:
//   GET    /bucket?list-type=2 | /bucket   ListObjectsV2 / ListObjects
//   GET    /bucket?location                 GetBucketLocation
//   HEAD   /bucket                          HeadBucket
//   GET    /bucket/key  (Range supported)   GetObject
//   HEAD   /bucket/key                      HeadObject
//   PUT    /bucket/key                      PutObject
//   DELETE /bucket/key                      DeleteObject
//   POST   /bucket?delete                   DeleteObjects
//   POST   /bucket/key?uploads              CreateMultipartUpload
//   PUT    /bucket/key?partNumber&uploadId  UploadPart
//   POST   /bucket/key?uploadId             CompleteMultipartUpload
//   DELETE /bucket/key?uploadId             AbortMultipartUpload

/** Virtual hostname the container uses for storage. */
export const S3_HOST = "r2.phaze";
export const S3_ENDPOINT = `http://${S3_HOST}`;

/** The parts of R2Bucket this handler uses (a structural subset, for tests). */
export interface Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  createMultipartUpload(key: string, options?: R2MultipartOptions): Promise<R2MultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const S3_NS = "http://s3.amazonaws.com/doc/2006-03-01/";
const CURSOR_MARKER = "r2cursor:";
const MAX_KEYS = 1000;

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xml(body: string, status = 200): Response {
  return new Response(XML_HEADER + body, {
    status,
    headers: { "Content-Type": "application/xml" },
  });
}

function s3Error(status: number, code: string, message: string, resource = ""): Response {
  return xml(
    `<Error><Code>${code}</Code><Message>${escapeXml(message)}</Message>` +
      `<Resource>${escapeXml(resource)}</Resource><RequestId>r2-binding</RequestId></Error>`,
    status,
  );
}

function noSuchKey(key: string): Response {
  return s3Error(404, "NoSuchKey", "The specified key does not exist.", key);
}

/** Splits a path-style URL path into bucket and (decoded) key. */
export function parsePath(pathname: string): { bucket: string; key: string } {
  const trimmed = pathname.replace(/^\/+/, "");
  const slash = trimmed.indexOf("/");
  if (slash < 0) {
    return { bucket: decodeURIComponent(trimmed), key: "" };
  }
  return {
    bucket: decodeURIComponent(trimmed.slice(0, slash)),
    key: decodeURIComponent(trimmed.slice(slash + 1)),
  };
}

/**
 * Decodes an aws-chunked body ("<hex size>[;ext]\r\n<data>\r\n" ... a zero
 * chunk, optional trailer lines, then "\r\n"), which minio-go sends for
 * signed uploads over plain HTTP and newer SDKs send with trailing
 * checksums.
 */
export function decodeAwsChunked(body: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let pos = 0;
  const lineEnd = (from: number): number => {
    for (let i = from; i + 1 < body.length; i++) {
      if (body[i] === 0x0d && body[i + 1] === 0x0a) return i;
    }
    return -1;
  };
  for (;;) {
    const end = lineEnd(pos);
    if (end < 0) throw new Error("aws-chunked: missing chunk header");
    const header = new TextDecoder().decode(body.subarray(pos, end));
    const size = parseInt(header.split(";")[0].trim(), 16);
    if (!Number.isFinite(size) || size < 0) throw new Error(`aws-chunked: bad chunk size ${header}`);
    pos = end + 2;
    if (size === 0) break;
    if (pos + size > body.length) throw new Error("aws-chunked: truncated chunk");
    chunks.push(body.subarray(pos, pos + size));
    total += size;
    pos += size;
    if (body[pos] !== 0x0d || body[pos + 1] !== 0x0a) throw new Error("aws-chunked: missing chunk terminator");
    pos += 2;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function isAwsChunked(request: Request): boolean {
  const sha = request.headers.get("x-amz-content-sha256") ?? "";
  const enc = request.headers.get("content-encoding") ?? "";
  return sha.startsWith("STREAMING-") || enc.split(",").some((e) => e.trim() === "aws-chunked");
}

/** Reads the request body, undoing aws-chunked framing when present. */
export async function readBody(request: Request): Promise<ArrayBuffer> {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (!isAwsChunked(request)) return toArrayBuffer(raw);
  const decoded = decodeAwsChunked(raw);
  const expected = request.headers.get("x-amz-decoded-content-length");
  if (expected !== null && Number(expected) !== decoded.length) {
    throw new Error(`aws-chunked: decoded ${decoded.length} bytes, header says ${expected}`);
  }
  return toArrayBuffer(decoded);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function quoteEtag(etag: string): string {
  return etag.startsWith('"') ? etag : `"${etag}"`;
}

function unquoteEtag(etag: string): string {
  return etag.trim().replace(/^"+|"+$/g, "");
}

function objectHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  headers.set("ETag", obj.httpEtag);
  headers.set("Last-Modified", obj.uploaded.toUTCString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  return headers;
}

async function getObject(bucket: Bucket, key: string, request: Request, head: boolean): Promise<Response> {
  if (head) {
    const obj = await bucket.head(key);
    if (!obj) return new Response(null, { status: 404 });
    const headers = objectHeaders(obj);
    headers.set("Content-Length", String(obj.size));
    return new Response(null, { status: 200, headers });
  }
  const hasRange = request.headers.has("range");
  const obj = await bucket.get(key, hasRange ? { range: request.headers } : undefined);
  if (!obj) return noSuchKey(key);
  const headers = objectHeaders(obj);
  const body = "body" in obj ? obj.body : null;
  if (hasRange && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    let start: number;
    let length: number;
    if (r.suffix !== undefined) {
      length = Math.min(r.suffix, obj.size);
      start = obj.size - length;
    } else {
      start = r.offset ?? 0;
      length = r.length ?? obj.size - start;
    }
    headers.set("Content-Range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(body, { status: 206, headers });
  }
  headers.set("Content-Length", String(obj.size));
  return new Response(body, { status: 200, headers });
}

async function listObjects(bucket: Bucket, params: URLSearchParams, bucketName: string): Promise<Response> {
  const v2 = params.get("list-type") === "2";
  const prefix = params.get("prefix") ?? "";
  const delimiter = params.get("delimiter") ?? "";
  const maxKeysParam = Number(params.get("max-keys") ?? MAX_KEYS);
  const maxKeys = Number.isFinite(maxKeysParam) ? Math.max(1, Math.min(MAX_KEYS, maxKeysParam)) : MAX_KEYS;

  const options: R2ListOptions = { prefix, limit: maxKeys };
  if (delimiter) options.delimiter = delimiter;
  const token = v2 ? params.get("continuation-token") : params.get("marker");
  const startAfter = v2 ? params.get("start-after") : null;
  if (token) {
    if (token.startsWith(CURSOR_MARKER)) {
      options.cursor = token.slice(CURSOR_MARKER.length);
    } else {
      options.startAfter = token;
    }
  } else if (startAfter) {
    options.startAfter = startAfter;
  }

  const result = await bucket.list(options);
  const contents = result.objects
    .map(
      (o) =>
        `<Contents><Key>${escapeXml(o.key)}</Key><LastModified>${o.uploaded.toISOString()}</LastModified>` +
        `<ETag>${escapeXml(o.httpEtag)}</ETag><Size>${o.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
    )
    .join("");
  const prefixes = (result.delimitedPrefixes ?? [])
    .map((p) => `<CommonPrefixes><Prefix>${escapeXml(p)}</Prefix></CommonPrefixes>`)
    .join("");
  const next = result.truncated ? CURSOR_MARKER + result.cursor : "";
  let body =
    `<ListBucketResult xmlns="${S3_NS}"><Name>${escapeXml(bucketName)}</Name>` +
    `<Prefix>${escapeXml(prefix)}</Prefix><MaxKeys>${maxKeys}</MaxKeys>` +
    (delimiter ? `<Delimiter>${escapeXml(delimiter)}</Delimiter>` : "") +
    `<IsTruncated>${result.truncated}</IsTruncated>`;
  if (v2) {
    body += `<KeyCount>${result.objects.length + (result.delimitedPrefixes?.length ?? 0)}</KeyCount>`;
    if (token) body += `<ContinuationToken>${escapeXml(token)}</ContinuationToken>`;
    if (startAfter) body += `<StartAfter>${escapeXml(startAfter)}</StartAfter>`;
    if (next) body += `<NextContinuationToken>${escapeXml(next)}</NextContinuationToken>`;
  } else {
    body += `<Marker>${escapeXml(token ?? "")}</Marker>`;
    if (next) body += `<NextMarker>${escapeXml(next)}</NextMarker>`;
  }
  body += contents + prefixes + "</ListBucketResult>";
  return xml(body);
}

function tagValues(doc: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  return [...doc.matchAll(re)].map((m) => unescapeXml(m[1]));
}

async function deleteObjects(bucket: Bucket, request: Request): Promise<Response> {
  const doc = new TextDecoder().decode(await readBody(request));
  const objects = [...doc.matchAll(/<Object>([\s\S]*?)<\/Object>/g)];
  const keys = objects.flatMap((m) => tagValues(m[1], "Key"));
  const quiet = /<Quiet>\s*true\s*<\/Quiet>/i.test(doc);
  for (let i = 0; i < keys.length; i += MAX_KEYS) {
    await bucket.delete(keys.slice(i, i + MAX_KEYS));
  }
  const deleted = quiet ? "" : keys.map((k) => `<Deleted><Key>${escapeXml(k)}</Key></Deleted>`).join("");
  return xml(`<DeleteResult xmlns="${S3_NS}">${deleted}</DeleteResult>`);
}

async function completeMultipart(bucket: Bucket, bucketName: string, key: string, uploadId: string, request: Request): Promise<Response> {
  const doc = new TextDecoder().decode(await readBody(request));
  const parts = [...doc.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({
    partNumber: Number(tagValues(m[1], "PartNumber")[0]),
    etag: unquoteEtag(tagValues(m[1], "ETag")[0] ?? ""),
  }));
  if (parts.length === 0 || parts.some((p) => !Number.isInteger(p.partNumber) || !p.etag)) {
    return s3Error(400, "MalformedXML", "The XML you provided was not well-formed.", key);
  }
  const upload = bucket.resumeMultipartUpload(key, uploadId);
  const obj = await upload.complete(parts);
  return xml(
    `<CompleteMultipartUploadResult xmlns="${S3_NS}"><Location>${escapeXml(`${S3_ENDPOINT}/${bucketName}/${key}`)}</Location>` +
      `<Bucket>${escapeXml(bucketName)}</Bucket><Key>${escapeXml(key)}</Key>` +
      `<ETag>${escapeXml(obj.httpEtag)}</ETag></CompleteMultipartUploadResult>`,
  );
}

/** Answers one S3 request from the container using the bound R2 bucket. */
export async function handleS3(request: Request, bucket: Bucket): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const method = request.method.toUpperCase();
  let bucketName: string;
  let key: string;
  try {
    ({ bucket: bucketName, key } = parsePath(url.pathname));
  } catch {
    return s3Error(400, "InvalidURI", "Couldn't parse the specified URI.", url.pathname);
  }
  if (!bucketName) {
    return s3Error(400, "InvalidBucketName", "A bucket is required.", url.pathname);
  }

  try {
    if (!key) {
      if (method === "HEAD") return new Response(null, { status: 200 });
      if (method === "GET" && params.has("location")) {
        return xml(`<LocationConstraint xmlns="${S3_NS}"></LocationConstraint>`);
      }
      if (method === "GET") return await listObjects(bucket, params, bucketName);
      if (method === "POST" && params.has("delete")) return await deleteObjects(bucket, request);
      return s3Error(501, "NotImplemented", `${method} on a bucket is not supported.`, url.pathname);
    }

    const uploadId = params.get("uploadId");
    switch (method) {
      case "GET":
        return await getObject(bucket, key, request, false);
      case "HEAD":
        return await getObject(bucket, key, request, true);
      case "PUT": {
        if (params.has("x-id") && params.get("x-id") === "CopyObject") {
          return s3Error(501, "NotImplemented", "CopyObject is not supported.", key);
        }
        if (request.headers.has("x-amz-copy-source")) {
          return s3Error(501, "NotImplemented", "CopyObject is not supported.", key);
        }
        const body = await readBody(request);
        if (uploadId) {
          const partNumber = Number(params.get("partNumber"));
          if (!Number.isInteger(partNumber) || partNumber < 1) {
            return s3Error(400, "InvalidArgument", "Bad partNumber.", key);
          }
          const part = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, body);
          return new Response(null, { status: 200, headers: { ETag: quoteEtag(part.etag) } });
        }
        const contentType = request.headers.get("content-type") ?? "application/octet-stream";
        const obj = await bucket.put(key, body, { httpMetadata: { contentType } });
        return new Response(null, { status: 200, headers: obj ? { ETag: obj.httpEtag } : {} });
      }
      case "DELETE":
        if (uploadId) {
          await bucket.resumeMultipartUpload(key, uploadId).abort();
        } else {
          await bucket.delete(key);
        }
        return new Response(null, { status: 204 });
      case "POST":
        if (params.has("uploads")) {
          const contentType = request.headers.get("content-type") ?? "application/octet-stream";
          const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
          return xml(
            `<InitiateMultipartUploadResult xmlns="${S3_NS}"><Bucket>${escapeXml(bucketName)}</Bucket>` +
              `<Key>${escapeXml(key)}</Key><UploadId>${escapeXml(upload.uploadId)}</UploadId></InitiateMultipartUploadResult>`,
          );
        }
        if (uploadId) return await completeMultipart(bucket, bucketName, key, uploadId, request);
        return s3Error(501, "NotImplemented", "POST on an object is not supported.", key);
      default:
        return s3Error(405, "MethodNotAllowed", `${method} is not allowed.`, key);
    }
  } catch (error) {
    console.error(`[phaze] storage ${method} ${url.pathname} failed`, error);
    return s3Error(500, "InternalError", error instanceof Error ? error.message : String(error), url.pathname);
  }
}
