import { describe, expect, it } from "vitest";
import { containerEnv } from "../src/config";
import { MAIL_ENDPOINT, MAIL_FROM, type MailBinding, handleMail, hasMailBinding, htmlToText } from "../src/mail";

type Sent = Parameters<MailBinding["send"]>[0];

function binding(fail?: { code: string; message: string }) {
  const sent: Sent[] = [];
  const mail: MailBinding = {
    async send(message) {
      if (fail) throw Object.assign(new Error(fail.message), { code: fail.code });
      sent.push(message);
      return { messageId: `m${sent.length}` };
    },
  };
  return { mail, sent };
}

function post(body: unknown, path = "/send", method = "POST") {
  return new Request(`http://mail.phaze${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const good = { to: "someone@example.com", subject: "Activate your Phaze account", html: "<p>Your code is <b>123456</b></p>" };

describe("handleMail", () => {
  it("sends from the fixed address with a text part", async () => {
    const { mail, sent } = binding();
    const res = await handleMail(post(good), mail);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messageId: "m1" });
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toEqual(MAIL_FROM);
    expect(sent[0].to).toBe("someone@example.com");
    expect(sent[0].subject).toBe(good.subject);
    expect(sent[0].html).toBe(good.html);
    expect(sent[0].text).toBe("Your code is 123456");
  });

  it("refuses anything but POST /send", async () => {
    const { mail, sent } = binding();
    expect((await handleMail(post(good, "/other"), mail)).status).toBe(404);
    expect((await handleMail(post(good, "/send", "GET"), mail)).status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it("rejects bad recipients, subjects and bodies without sending", async () => {
    const { mail, sent } = binding();
    for (const to of ["", "nobody", "a@b", "a@b.com, c@d.com", "Name <a@b.com>", "a@b.com\r\nBcc: x@y.com", 7]) {
      expect((await handleMail(post({ ...good, to }), mail)).status).toBe(400);
    }
    expect((await handleMail(post({ ...good, subject: "" }), mail)).status).toBe(400);
    expect((await handleMail(post({ ...good, subject: "x".repeat(301) }), mail)).status).toBe(400);
    expect((await handleMail(post({ ...good, html: "" }), mail)).status).toBe(400);
    expect((await handleMail(post("not json"), mail)).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("flattens line breaks in the subject", async () => {
    const { mail, sent } = binding();
    await handleMail(post({ ...good, subject: "Hi\r\nBcc: x@y.com" }), mail);
    expect(sent[0].subject).toBe("Hi Bcc: x@y.com");
  });

  it("reports the binding's error code", async () => {
    const { mail } = binding({ code: "E_SENDER_DOMAIN_NOT_AVAILABLE", message: "domain not onboarded" });
    const res = await handleMail(post(good), mail);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "domain not onboarded", code: "E_SENDER_DOMAIN_NOT_AVAILABLE" });
  });

  it("says so when the binding is missing", async () => {
    const res = await handleMail(post(good), undefined);
    expect(res.status).toBe(503);
  });
});

describe("mail wiring", () => {
  const storage = { BUCKET: { get() {}, put() {} } };

  it("points the server at the relay only when the binding exists", () => {
    const { mail } = binding();
    expect(hasMailBinding({ EMAIL: mail })).toBe(true);
    expect(hasMailBinding({})).toBe(false);
    expect(containerEnv({ ...storage, EMAIL: mail }).PHAZE_MAIL_RELAY).toBe(MAIL_ENDPOINT);
    expect(containerEnv({ ...storage })).not.toHaveProperty("PHAZE_MAIL_RELAY");
  });

  it("does not let a secret point mail elsewhere when the binding exists", () => {
    const { mail } = binding();
    const env = containerEnv({ ...storage, EMAIL: mail, PHAZE_MAIL_RELAY: "http://evil.example/send" });
    expect(env.PHAZE_MAIL_RELAY).toBe(MAIL_ENDPOINT);
  });
});

describe("htmlToText", () => {
  it("keeps link targets and drops tags", () => {
    expect(htmlToText('<p>Hi</p><p><a href="https://phazechat.world/x">Open</a></p>')).toBe("Hi\nOpen (https://phazechat.world/x)");
  });
});
