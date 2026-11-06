// Email for the container, sent through Cloudflare Email Service.
//
// The server posts {to, subject, html} to http://mail.phaze/send. The
// Containers runtime routes that host to handleMail on this machine, which
// sends the message with the Worker's EMAIL (send_email) binding. There is no
// mail provider account or API key anywhere: the binding is the credential,
// and only the container can reach mail.phaze.

export const MAIL_HOST = "mail.phaze";
export const MAIL_ENDPOINT = `http://${MAIL_HOST}/send`;

/** Every message goes out from this address on the onboarded domain. */
export const MAIL_FROM = { email: "noreply@phazechat.world", name: "Phaze" };

const MAX_SUBJECT = 300;
const MAX_HTML = 512 * 1024;
// One address, no display name, no header injection. Anything the server
// sends is a plain address it read from the users table.
const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** The part of the send_email binding this file uses. */
export interface MailBinding {
  send(message: {
    from: { email: string; name?: string };
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ messageId: string }>;
}

export function hasMailBinding(env: Record<string, unknown>): boolean {
  const mail = env.EMAIL as { send?: unknown } | undefined;
  return typeof mail === "object" && mail !== null && typeof mail.send === "function";
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Rough text version for mail clients that show text only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function handleMail(request: Request, mail: MailBinding | undefined): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || path !== "/send") {
    return json(404, { error: "not found" });
  }
  if (!mail) {
    return json(503, { error: "the EMAIL binding is missing", code: "E_NO_BINDING" });
  }
  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "body must be JSON" });
  }
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  if (!ADDRESS.test(to)) return json(400, { error: "invalid recipient" });
  if (!subject || subject.length > MAX_SUBJECT) return json(400, { error: "invalid subject" });
  if (!html || html.length > MAX_HTML) return json(400, { error: "invalid body" });

  try {
    const sent = await mail.send({ from: MAIL_FROM, to, subject, html, text: htmlToText(html) });
    return json(200, { messageId: sent.messageId });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "E_UNKNOWN";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail] send failed: ${code} ${message}`);
    return json(502, { error: message, code });
  }
}
