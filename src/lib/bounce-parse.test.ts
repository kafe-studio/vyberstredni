import { describe, expect, it } from "vitest";
import { explainBounce, looksLikeBounce, parseBounce } from "./bounce-parse";

const gmailNdr = [
  "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
  "To: info@jaknaskolu.cz",
  "Subject: Delivery Status Notification (Failure)",
  "X-Failed-Recipients: reditel@neexistujici-skola.cz",
  'Content-Type: multipart/report; boundary="b1"; report-type=delivery-status',
  "",
  "--b1",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "Address not found",
  "",
  "--b1",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; googlemail.com",
  "",
  "Final-Recipient: rfc822; reditel@neexistujici-skola.cz",
  "Action: failed",
  "Status: 5.1.1",
  "Diagnostic-Code: smtp; 550 5.1.1 <reditel@neexistujici-skola.cz>: Recipient",
  " address rejected: User unknown in virtual mailbox table",
  "",
  "--b1--",
].join("\r\n");

const postfixFull = [
  "From: MAILER-DAEMON@mx.skola.cz (Mail Delivery System)",
  "Subject: Undelivered Mail Returned to Sender",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="x"',
  "",
  "--x",
  "Content-Type: message/delivery-status",
  "",
  "Final-Recipient: rfc822; Info@Skola.cz",
  "Original-Recipient: rfc822;info@skola.cz",
  "Action: failed",
  "Status: 5.2.2",
  "Diagnostic-Code: smtp; 552 5.2.2 Mailbox full",
  "--x--",
].join("\n");

const delayed = [
  "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
  "Subject: Delivery Status Notification (Delay)",
  "",
  "Final-Recipient: rfc822; pomaly@skola.cz",
  "Action: delayed",
  "Status: 4.4.1",
  "Diagnostic-Code: smtp; 421 4.4.1 Connection timed out",
].join("\n");

describe("parseBounce", () => {
  it("reads Gmail's delivery-status report with a folded diagnostic", () => {
    expect(parseBounce(gmailNdr)).toEqual([
      {
        email: "reditel@neexistujici-skola.cz",
        status: "5.1.1",
        kind: "hard",
        diagnostic: "550 5.1.1 <reditel@neexistujici-skola.cz>: Recipient address rejected: User unknown in virtual mailbox table",
        reason: "Adresa neexistuje",
      },
    ]);
  });

  it("lower-cases the recipient and explains a full mailbox", () => {
    const [bounce] = parseBounce(postfixFull);
    expect(bounce?.email).toBe("info@skola.cz");
    expect(bounce?.reason).toBe("Plná schránka");
    expect(bounce?.kind).toBe("hard");
  });

  it("marks delay notices as soft", () => {
    const [bounce] = parseBounce(delayed);
    expect(bounce?.kind).toBe("soft");
    expect(bounce?.reason).toBe("Dočasný problém, server doručení zkusí znovu");
  });

  it("falls back to X-Failed-Recipients", () => {
    const raw = "X-Failed-Recipients: a@b.cz\nSubject: x\n\n550 5.7.1 Message rejected as spam\n";
    expect(parseBounce(raw)).toEqual([
      { email: "a@b.cz", status: "5.7.1", kind: "hard", diagnostic: "550 5.7.1 Message rejected as spam", reason: "Odmítnuto filtrem nebo pravidly serveru" },
    ]);
  });

  it("ignores ordinary mail", () => {
    expect(parseBounce("From: ucitel@skola.cz\nSubject: Re: Pomoc rodičům\n\nDěkujeme, předáme.")).toEqual([]);
  });
});

describe("looksLikeBounce", () => {
  it("detects daemons, reports and the null sender", () => {
    expect(looksLikeBounce(gmailNdr, "")).toBe(true);
    expect(looksLikeBounce(postfixFull, "bounce@x.cz")).toBe(true);
    expect(looksLikeBounce("From: ucitel@skola.cz\nSubject: Re: x\n\nhi", "ucitel@skola.cz")).toBe(false);
  });
});

describe("explainBounce", () => {
  it("maps unknown domains", () => {
    expect(explainBounce("5.1.2", "")).toBe("Doména neexistuje nebo nepřijímá poštu");
  });
});
