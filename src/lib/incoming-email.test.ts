import { describe, expect, it, vi } from "vitest";
import { routeIncomingEmail, type IncomingEmail } from "./incoming-email";

const fakeMessage = (from: string, raw: string, forward = vi.fn(() => Promise.resolve())) => {
  const message: IncomingEmail = { from, raw: new Response(raw).body ?? new ReadableStream(), forward };
  return { message, forward };
};

const bounce = "From: MAILER-DAEMON@mx.skola.cz\nSubject: Undelivered\n\nFinal-Recipient: rfc822; x@skola.cz\nAction: failed\nStatus: 5.1.1\n";
const reply = "From: ucitel@skola.cz\nSubject: Re: Pomoc rodičům\n\nDěkujeme.";

describe("routeIncomingEmail", () => {
  it("forwards ordinary mail without recording it", async () => {
    const { message, forward } = fakeMessage("ucitel@skola.cz", reply);
    const record = vi.fn(() => Promise.resolve());
    await routeIncomingEmail(message, "inbox@example.com", record);
    expect(forward).toHaveBeenCalledWith("inbox@example.com");
    expect(record).not.toHaveBeenCalled();
  });

  it("forwards and records a bounce with its raw text", async () => {
    const { message, forward } = fakeMessage("", bounce);
    const record = vi.fn(() => Promise.resolve());
    await routeIncomingEmail(message, "inbox@example.com", record);
    expect(forward).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(bounce);
  });

  it("still records when forwarding fails, and still forwards when recording fails", async () => {
    const failingForward = vi.fn(() => Promise.reject(new Error("forward down")));
    const { message } = fakeMessage("", bounce, failingForward);
    const record = vi.fn(() => Promise.reject(new Error("db down")));
    const result = await routeIncomingEmail(message, "inbox@example.com", record);
    expect(failingForward).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(result.errors).toHaveLength(2);
  });
});
