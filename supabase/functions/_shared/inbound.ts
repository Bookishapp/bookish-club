type Secret = () => Promise<string | undefined>;
type InboundDependencies = {
  secret: Secret;
  apiKey: Secret;
  forwardTo: Secret;
  status?: (id: string) => Promise<"new" | "send" | "done" | "expired">;
  begin: (id: string) => Promise<"send" | "done" | "expired">;
  complete: (id: string) => Promise<void>;
  fetcher?: typeof fetch;
  now?: () => number;
  logError?: (message: string) => void;
};
type Attachment = {
  id: string;
  filename: string;
  size: number;
  content_type?: string;
  content_id?: string;
  download_url: string;
};
type ForwardAttachment = {
  filename: string;
  content: string;
  content_type?: string;
  content_id?: string;
};
class DeliveryReviewRequired extends Error {}
const API = "https://api.resend.com";
const MAX_ATTACHMENTS = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, message: string) =>
  Response.json({ message }, {
    status,
    headers: { "cache-control": "no-store" },
  });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

function mailbox(value: string): string | undefined {
  if (/[\r\n]/.test(value)) return;
  const address = (value.match(/^[^<>]*<([^<>]+)>\s*$/)?.[1] ?? value).trim();
  const domain = address.match(/^[^\s@<>()",;:]+@([^@]+)$/)?.[1];
  if (!domain || domain.length > 253) return;
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    !labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
    )
  ) return;
  return address.toLowerCase();
}

// Svix signs the original bytes, with a five-minute replay tolerance.
async function signed(req: Request, body: string, secret: string, now: number) {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signatures = req.headers.get("svix-signature");
  if (
    !id || !/^\d+$/.test(timestamp) || !signatures ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  ) return false;
  try {
    const bytes = Uint8Array.from(
      atob(secret.replace(/^whsec_/, "")),
      (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const payload = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const part of signatures.split(/\s+/)) {
      const [version, value] = part.split(",");
      if (version !== "v1" || !value) continue;
      try {
        const signature = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
        if (await crypto.subtle.verify("HMAC", key, signature, payload)) {
          return true;
        }
      } catch { /* A malformed rotated signature does not hide a valid one. */ }
    }
  } catch { /* Bad signatures and malformed keys fail closed. */ }
  return false;
}

async function readBounded(
  response: Response,
  max: number,
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function base64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(parts.join(""));
}

async function loadAttachments(
  emailId: string,
  api: (path: string) => Promise<unknown>,
  fetcher: typeof fetch,
): Promise<{ files: ForwardAttachment[]; omitted: string[] }> {
  const metadata: Attachment[] = [];
  const seen = new Set<string>();
  let after = "";
  do {
    const page = await api(
      `/emails/receiving/${emailId}/attachments?limit=100${
        after ? `&after=${encodeURIComponent(after)}` : ""
      }`,
    );
    if (
      !record(page) || !Array.isArray(page.data) ||
      typeof page.has_more !== "boolean"
    ) {
      throw Error("Invalid attachment list");
    }
    for (const item of page.data) {
      if (
        !record(item) || typeof item.id !== "string" || !item.id ||
        seen.has(item.id) ||
        typeof item.filename !== "string" || typeof item.size !== "number" ||
        !Number.isSafeInteger(item.size) || item.size < 0 ||
        typeof item.download_url !== "string" ||
        (item.content_type != null && typeof item.content_type !== "string") ||
        (item.content_id != null && typeof item.content_id !== "string")
      ) throw Error("Invalid attachment");
      metadata.push(item as Attachment);
      seen.add(item.id);
    }
    if (page.has_more && page.data.length === 0) {
      throw Error("Invalid attachment cursor");
    }
    after = page.has_more ? metadata.at(-1)!.id : "";
  } while (after);
  const names = metadata.map((item) => item.filename || "unnamed attachment");
  if (
    metadata.reduce((total, item) => total + item.size, 0) > MAX_ATTACHMENTS
  ) {
    return { files: [], omitted: names };
  }
  const files: ForwardAttachment[] = [];
  let total = 0;
  for (const item of metadata) {
    const url = new URL(item.download_url);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw Error("Invalid download URL");
    }
    const response = await fetcher(url.toString(), {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) throw Error("Attachment unavailable");
    const bytes = await readBounded(response, MAX_ATTACHMENTS - total);
    if (!bytes) return { files: [], omitted: names };
    total += bytes.length;
    files.push({
      filename: item.filename || "unnamed attachment",
      content: base64(bytes),
      ...(item.content_type ? { content_type: item.content_type } : {}),
      ...(item.content_id ? { content_id: item.content_id } : {}),
    });
  }
  return { files, omitted: [] };
}

export function inboundHandler(deps: InboundDependencies) {
  const fetcher = deps.fetcher ?? fetch;
  const expired = (emailId: string) => {
    (deps.logError ?? console.error)(
      `Inbound email ${emailId} expired unsent after 23 hours; operator review required.`,
    );
    return reply(503, "Inbound delivery requires operator review.");
  };
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, "POST required.");
    try {
      const secret = await deps.secret();
      if (!secret) return reply(503, "Inbound mail is not configured.");
      // Receiving webhooks contain metadata only, never the full message.
      const raw = await readBounded(new Response(req.body), 256 * 1024);
      if (!raw) return reply(413, "Webhook too large.");
      const body = new TextDecoder("utf-8", { fatal: true }).decode(raw);
      if (!await signed(req, body, secret, (deps.now ?? Date.now)())) {
        return reply(401, "Invalid webhook signature.");
      }
      let event: unknown;
      try {
        event = JSON.parse(body);
      } catch {
        return reply(400, "Invalid event.");
      }
      if (!record(event) || typeof event.type !== "string") {
        return reply(400, "Invalid event.");
      }
      if (event.type !== "email.received") return reply(200, "Event ignored.");
      if (
        !record(event.data) || typeof event.data.email_id !== "string" ||
        !UUID.test(event.data.email_id)
      ) {
        return reply(400, "Invalid received email ID.");
      }
      const emailId = event.data.email_id.toLowerCase();
      const [key, target] = await Promise.all([
        deps.apiKey(),
        deps.forwardTo(),
      ]);
      const to = target ? mailbox(target) : undefined;
      if (!key || !to) return reply(503, "Inbound mail is not configured.");
      // Inspect existing attempts without starting the clock for a new send.
      const existing = await deps.status?.(emailId);
      if (existing === "done") return reply(200, "Already forwarded.");
      if (existing === "expired") return expired(emailId);
      const api = async (path: string): Promise<unknown> => {
        const response = await fetcher(`${API}${path}`, {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw Error("Received mail unavailable");
        return await response.json();
      };
      const email = await api(`/emails/receiving/${emailId}?html_format=cid`);
      if (
        !record(email) || email.id !== emailId ||
        typeof email.from !== "string" ||
        !Array.isArray(email.to) ||
        (email.subject != null && typeof email.subject !== "string") ||
        (email.text != null && typeof email.text !== "string") ||
        (email.html != null && typeof email.html !== "string")
      ) throw Error("Invalid received mail");
      // A Bcc delivery may have no To header. Scope account-wide webhooks to
      // Bookish using every recipient field, including Resend's received_for.
      const recipients = new Set<string>();
      for (const list of [email.received_for, email.to, email.cc, email.bcc]) {
        if (list == null) continue;
        if (!Array.isArray(list)) throw Error("Invalid recipients");
        for (const value of list) {
          const address = typeof value === "string"
            ? mailbox(value)
            : undefined;
          if (!address) continue;
          if (address.endsWith("@meetbookish.com")) recipients.add(address);
        }
      }
      if (!recipients.size) return reply(200, "Recipient ignored.");
      const sender = mailbox(email.from);
      if (sender) {
        const domain = sender.split("@")[1];
        if (
          domain === "meetbookish.com" || domain.endsWith(".meetbookish.com") ||
          sender === to
        ) {
          return reply(200, "Loop ignored.");
        }
      }
      const { files, omitted } = await loadAttachments(emailId, api, fetcher);
      const header = `From: ${email.from} To: ${[...recipients].join(", ")}`;
      const note = omitted.length
        ? `\n\nAttachments omitted (over 10 MB total):\n${omitted.join("\n")}`
        : "";
      const payload = {
        from: "Bookish Inbox <inbox@meetbookish.com>",
        to: [to],
        ...(sender ? { reply_to: sender } : {}),
        subject: `[Bookish] ${email.subject || "(no subject)"}`,
        text: `${header}\n\n${email.text ?? ""}${note}`,
        ...(email.html
          ? {
            html: `<p>${escapeHtml(header)}</p>\n${email.html}${
              note ? `<pre>${escapeHtml(note.trim())}</pre>` : ""
            }`,
          }
          : {}),
        ...(files.length ? { attachments: files } : {}),
      };
      // Start the provider's retry clock only once the complete payload is ready.
      const state = await deps.begin(emailId);
      if (state === "done") return reply(200, "Already forwarded.");
      if (state !== "send") {
        return expired(emailId);
      }
      const send = async (
        message: Record<string, unknown>,
        variant = "",
      ): Promise<boolean> => {
        const sent = await fetcher(`${API}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            "Idempotency-Key": `bookish-inbound/${emailId}${variant}`,
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(20000),
        });
        if (!sent.ok) {
          if (sent.status === 409) {
            const error: unknown = await sent.json().catch(() => null);
            if (
              record(error) && error.name === "concurrent_idempotent_requests"
            ) throw Error("Concurrent forward pending");
            if (
              record(error) && error.name === "invalid_idempotent_request"
            ) {
              (deps.logError ?? console.error)(
                `Inbound email ${emailId} has an idempotency payload conflict; operator review required.`,
              );
              throw new DeliveryReviewRequired();
            }
          }
          if (sent.status >= 400 && sent.status < 500 && sent.status !== 429) {
            return false;
          }
          throw Error("Forward unavailable");
        }
        const result: unknown = await sent.json();
        if (!record(result) || typeof result.id !== "string" || !result.id) {
          throw Error("Invalid send receipt");
        }
        return true;
      };
      if (!await send(payload)) {
        const fallbackNote = files.length
          ? `\n\nAttachments omitted (forward rejected):\n${
            files.map((file) => file.filename).join("\n")
          }`
          : "";
        const withoutAttachments = {
          ...payload,
          attachments: undefined,
          text: `${payload.text}${fallbackNote}`,
          ...(payload.html && fallbackNote
            ? {
              html: `${payload.html}<pre>${
                escapeHtml(fallbackNote.trim())
              }</pre>`,
            }
            : {}),
        };
        if (!await send(withoutAttachments, "/without-attachments")) {
          const notice = {
            from: payload.from,
            to: payload.to,
            subject: "[Bookish] Inbound delivery notice",
            text:
              `Bookish could not forward the original email.\n\n${header}\nSubject: ${
                email.subject || "(no subject)"
              }\n\n${email.text ?? ""}${note}${fallbackNote}`,
          };
          if (!await send(notice, "/notice")) {
            (deps.logError ?? console.error)(
              `Inbound email ${emailId} permanently rejected, including its plain-text notice; operator review required.`,
            );
            return reply(200, "Inbound delivery requires operator review.");
          }
        }
      }
      await deps.complete(emailId);
      return reply(200, "Forwarded.");
    } catch (error) {
      if (error instanceof DeliveryReviewRequired) {
        return reply(200, "Inbound delivery requires operator review.");
      }
      // Never include provider bodies, email content, addresses, or secret values.
      return reply(503, "Inbound delivery is unavailable. Please retry.");
    }
  };
}
