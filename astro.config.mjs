import { defineConfig, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { unified } from "@astrojs/markdown-remark";
import remarkReadingTime from "remark-reading-time";

export default defineConfig({
  site: "https://georgeduckling.com",
  base: "/vyberstredni",
  output: "server",
  trailingSlash: "always",
  adapter: cloudflare({
    configPath: "./wrangler.jsonc",
    persistState: true,
    prerenderEnvironment: "node",
  }),
  integrations: [sitemap(), icon()],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkReadingTime,
        () => {
          return function (_tree, file) {
            file.data.astro.frontmatter.minutesRead =
              file.data.readingTime.minutes;
          };
        },
      ],
    }),
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "viewport",
  },
  build: {
    inlineStylesheets: "always",
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: ["100 900"],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
