/**
 * Pure parsing of delivery status notifications (bounces, RFC 3464) – no runtime dependencies, so it is unit-tested.
 */

export type BounceKind = "hard" | "soft";

export type ParsedBounce = {
  email: string;
  /** Enhanced status code such as "5.1.1", "" when the notification has none. */
  status: string;
  kind: BounceKind;
  /** The receiving server's own words (Diagnostic-Code or the first error line), trimmed. */
  diagnostic: string;
  /** Short Czech explanation for the admin overview. */
  reason: string;
};

const MAX_DIAGNOSTIC = 500;
const EMAIL = /[^\s<>"';,()]+@[^\s<>"';,()]+\.[a-z]{2,}/i;

/** Joins folded header/field lines (continuation lines start with whitespace). */
const unfold = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");

const decodeQuotedPrintable = (text: string) =>
  text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

const field = (text: string, name: string) => {
  const match = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(text);
  return match?.[1]?.trim() ?? "";
};

/** Looks like a bounce: from a mailer daemon / postmaster, a delivery-status report, or Gmail's failure header. */
export const looksLikeBounce = (raw: string, envelopeFrom = "") => {
  const head = unfold(raw.slice(0, 20000));
  const from = field(head, "From").toLowerCase();
  return (
    envelopeFrom === "" ||
    envelopeFrom === "<>" ||
    /mailer-daemon|postmaster/.test(`${from} ${envelopeFrom.toLowerCase()}`) ||
    /report-type=["']?delivery-status/i.test(head) ||
    /^x-failed-recipients:/im.test(head)
  );
};

export const explainBounce = (status: string, diagnostic: string): string => {
  const text = diagnostic.toLowerCase();
  if (status.startsWith("4") || /delayed|temporar|try again|greylist/.test(text)) return "Dočasný problém, server doručení zkusí znovu";
  if (status === "5.1.1" || /user unknown|no such user|does not exist|unknown user|address not found|recipient address rejected|mailbox unavailable|invalid recipient|neexistuje/.test(text))
    return "Adresa neexistuje";
  if (status === "5.1.2" || status === "5.4.4" || /domain not found|host not found|no mx|unrouteable|unroutable|name service/.test(text))
    return "Doména neexistuje nebo nepřijímá poštu";
  if (status === "5.2.2" || /quota|mailbox full|over quota|insufficient storage|plná/.test(text)) return "Plná schránka";
  if (status === "5.2.1" || /disabled|inactive|suspended|deactivated/.test(text)) return "Schránka je zrušená nebo vypnutá";
  if (status.startsWith("5.7") || /spam|blocked|blacklist|blocklist|policy|rejected for policy|dmarc|not authorized|denied/.test(text))
    return "Odmítnuto filtrem nebo pravidly serveru";
  if (status.startsWith("5.3") || status.startsWith("5.4")) return "Chyba serveru příjemce";
  return status.startsWith("5") ? "Trvale nedoručitelné" : "Nedoručeno";
};

/** The failed recipients of one bounce message (usually one). Empty when it is not a parseable bounce. */
export const parseBounce = (rawInput: string): ParsedBounce[] => {
  const raw = unfold(decodeQuotedPrintable(rawInput));
  const results: ParsedBounce[] = [];

  // RFC 3464 per-recipient blocks: Final-Recipient / Action / Status / Diagnostic-Code.
  const blocks = raw.split(/\n(?=Final-Recipient:)/i).slice(1);
  for (const block of blocks) {
    const recipient = EMAIL.exec(field(block, "Final-Recipient"))?.[0] ?? EMAIL.exec(field(block, "Original-Recipient"))?.[0];
    if (!recipient) continue;
    const action = field(block, "Action").toLowerCase();
    if (action === "delivered" || action === "relayed" || action === "expanded") continue;
    const status = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(field(block, "Status"))?.[1] ?? "";
    const diagnostic = field(block, "Diagnostic-Code").replace(/^smtp;\s*/i, "").slice(0, MAX_DIAGNOSTIC);
    const kind: BounceKind = action === "delayed" || status.startsWith("4") ? "soft" : "hard";
    results.push({ email: recipient.toLowerCase(), status, kind, diagnostic, reason: explainBounce(status, diagnostic) });
  }
  if (results.length) return results;

  // Fallback: Gmail-style X-Failed-Recipients header with the reason in the text body.
  const failed = field(raw, "X-Failed-Recipients");
  const recipient = EMAIL.exec(failed)?.[0];
  if (!recipient) return [];
  const status = /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(raw)?.[1] ?? "";
  const diagnostic = (/^.*\b[45]\d\d[ -][45]\.\d{1,3}\.\d{1,3}\b.*$/m.exec(raw)?.[0] ?? "").trim().slice(0, MAX_DIAGNOSTIC);
  const kind: BounceKind = status.startsWith("4") ? "soft" : "hard";
  return [{ email: recipient.toLowerCase(), status, kind, diagnostic, reason: explainBounce(status, diagnostic) }];
};
