import { looksLikeBounce } from "./bounce-parse";

/** The parts of Cloudflare's ForwardableEmailMessage this module uses (kept small so tests can fake it). */
export type IncomingEmail = {
  readonly from: string;
  readonly raw: ReadableStream;
  // eslint-disable-next-line no-unused-vars
  forward(rcptTo: string): Promise<unknown>;
};

/**
 * Every message is forwarded to the inbox first; a bounce is then also recorded. Neither failure stops the other,
 * so a broken database never loses mail and a failed forward still records the bounce.
 */
export const routeIncomingEmail = async (
  message: IncomingEmail,
  forwardTo: string | undefined,
  // eslint-disable-next-line no-unused-vars
  record: (raw: string) => Promise<unknown>,
) => {
  const raw = await new Response(message.raw).text();
  const errors: unknown[] = [];
  if (forwardTo) {
    try {
      await message.forward(forwardTo);
    } catch (error) {
      errors.push(error);
      console.error("Forwarding incoming e-mail failed", error);
    }
  } else {
    console.error("MAIL_FORWARD_TO is not set; incoming e-mail was not forwarded");
  }
  if (looksLikeBounce(raw, message.from)) {
    try {
      await record(raw);
    } catch (error) {
      errors.push(error);
      console.error("Recording a bounce failed", error);
    }
  }
  return { raw, errors };
};
