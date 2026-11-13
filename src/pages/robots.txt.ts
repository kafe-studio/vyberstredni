import type { APIRoute } from "astro";
import { siteConfig } from "../config/site";
import { withBase } from "../lib/urls";

export const prerender = true;

const robotsTxt = `
User-agent: *
Allow: /

Sitemap: ${new URL(withBase("sitemap-index.xml"), siteConfig.url).href}
`.trim();

export const GET: APIRoute = () => {
  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
