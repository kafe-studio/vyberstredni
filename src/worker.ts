import { handle } from "@astrojs/cloudflare/handler";
import { ONE_CLICK_UNSUBSCRIBE_PATH, handleOneClickUnsubscribe } from "./lib/unsubscribe";

const PRIMARY_HOST = "jaknaskolu.cz";
const BASE_PATH = "/vyberstredni";

/**
 * On jaknaskolu.cz the site lives under /vyberstredni/: www goes to the bare domain and anything outside the base
 * path (the root, typos) goes to the site's home. Prerendered pages are served from assets before this runs.
 */
const redirectFor = (url: URL): string | null => {
  if (url.hostname !== PRIMARY_HOST && url.hostname !== `www.${PRIMARY_HOST}`) return null;
  const insideBase = url.pathname === BASE_PATH || url.pathname.startsWith(`${BASE_PATH}/`);
  if (url.hostname === PRIMARY_HOST && insideBase) return null;
  const path = insideBase ? `${url.pathname}${url.search}` : `${BASE_PATH}/`;
  return `https://${PRIMARY_HOST}${path}`;
};

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const target = redirectFor(url);
    if (target) return Response.redirect(target, 301);
    if (url.pathname === ONE_CLICK_UNSUBSCRIBE_PATH) return handleOneClickUnsubscribe(request);
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
