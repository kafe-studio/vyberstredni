# Upgrade na Astro 7 — univerzální runbook

Přenositelný postup pro upgrade Astro 6 → 7 na **Cloudflare Workers** projektech
(`@astrojs/cloudflare`). Ověřeno proti oficiálnímu upgrade guide (`guides/upgrade-to/v7.mdx`)
a blogu `astro.build/blog/astro-7` (release 2026-06-22). Astro 7 je čistě o rychlosti —
build je 15–61 % rychlejší díky Rustu a Vite 8.

> **Pravidlo verifikace:** než zapíšeš jakýkoli config z tohoto dokumentu, ověř syntax
> proti aktuálním docs (D1 docs DB `library='astro'`, nebo context7 `/withastro/docs`).
> Tenhle runbook může za pár měsíců zastarat.

---

## 0) Nejdřív komplet bump VŠECH balíčků ve VŠECH package.json

Než začneš řešit Astro-specifické breaking changes, upgradni **celý dependency strom na latest**
— ne jen `astro` a adaptér. Astro 7 táhne Vite 8 / Rolldown a nové peer ranges, takže staré
verze tailwind pluginu, typescriptu, eslintu apod. by jinak hlásily peer konflikty nebo tiše
běžely na nekompatibilní verzi.

```bash
# 1) Najdi VŠECHNY package.json v repu (monorepo má víc než jeden)
find . -name package.json -not -path '*/node_modules/*'

# 2) Bump na latest — v každém workspace balíčku
#    pnpm workspace (root): projede všechny package.json najednou
pnpm -r up --latest
#    single-repo: stačí bez -r
pnpm up --latest
#    (yarn: `yarn up '*'` ; npm: `npx npm-check-updates -u` v každém package.json + `npm install`)

# 3) Přeinstaluj a přegeneruj lockfile
pnpm install
```

**Proč `-r` / všechny package.json:** v monorepu žije `astro`, adaptér, integrace a build-tooling
často v různých workspace balíčcích (`apps/web`, `packages/ui`, root devDeps). Bump jen v jednom
nechá ostatní na staré éře → peer konflikty a rozjeté verze napříč repem. Bumpni je **všechny
společně**.

**Pozor na majory, které latest přinese** (projeď changelog u každého): TypeScript, ESLint
(+ pluginy, které nemusí deklarovat peer na novou major — viz `eslint-plugin-jsx-a11y`),
`@cloudflare/workers-types` (major nemusí sedět s wrangler peer — neblokující warning),
`@types/node`. Po bumpu **spusť build + typecheck + lint** a oprav, co se rozbilo (kap. 3).

**CI gotcha:** commitni **root lockfile**; monorepo CI, které builduje z rootu, musí mít
build-tooling (`wrangler`, `@astrojs/check`) v **root** devDeps, ne jen ve workspace balíčku.

---

## 1) Bump dependencies

Astro 7 vyžaduje **major bumpy adaptéru i frameworkových integrací** (peer `astro ^7`).
Nelze je rozdělit — bumpují se společně, jinak pnpm hlásí peer konflikty.

```bash
# Z adresáře s package.json (u monorepa typicky apps/web)
pnpm add astro@^7 @astrojs/cloudflare@^14 \
  @astrojs/svelte@^9 @astrojs/react@^6
```

Co s čím (ověř `npm view <pkg> peerDependencies` pro svůj stack):

| balíček | astro 6 éra | astro 7 éra | poznámka |
|---|---|---|---|
| `astro` | ^6 | **^7** | engine **Node ≥22.12.0** |
| `@astrojs/cloudflare` | ^13 | **^14** | peer `astro ^7`, `wrangler ^4.83` |
| `@astrojs/svelte` | ^8 | **^9** | peer `svelte ^5.43.6`, `ts ^5\|\|^6` |
| `@astrojs/react` | ^5 | **^6** | nedeklaruje astro peer, ale v6 = astro-7 éra |
| `@astrojs/sitemap` | ^3 | ^3 | žádný astro peer constraint, beze změny |
| `@astrojs/check` | 0.9.x | 0.9.x | peer jen `typescript` |

**Monorepo + CI gotcha:** pokud CI builduje z rootu (codeploy `appDir: "."`), musí být
`wrangler` i `@astrojs/check` v **root** `package.json` devDeps, ne jen v `apps/web`.

---

## 2) Pre-flight checklist breaking changes

Většina projektů nepotřebuje žádné code změny. Projeď tenhle seznam — u každého bodu je
**grep**, kterým zjistíš, jestli se tě týká.

### 🔴 Rust compiler — JEDINÝ compiler, přísnější na HTML (hlavní riziko)

Go compiler je pryč. Nový Rust compiler (na `oxc` + Lightning CSS) **neopravuje nevalidní
HTML**:
- **Neuzavřené tagy** (`<div>Hello` bez `</div>`) a unterminated attrs = **build error**.
- **Nevalidní vnoření** (`<div>` uvnitř `<p>`, blokový prvek v inline) se už neopravuje —
  projde as-is → může změnit render.
- Kosmetické CSS rozdíly (named colors → hex, `url()` quoting) — neškodné.

→ **Projeví se až při buildu.** Žádný spolehlivý grep; riziko jsou ručně psané
`.astro` templaty a generovaný HTML (page-buildery apod.). Spoléhej na build + vizuální smoke.

### 🟡 `compressHTML` default `true` → `'jsx'`

Whitespace se nově stripuje JSX pravidly (jako React). Záměrná mezera mezi inline elementy
zmizí (`<span>a</span> <em>b</em>` → `ab`).

```bash
grep -rn "compressHTML" astro.config.*   # pokud nenastaveno → jede nový default
```

→ Oprava jednotlivé mezery: `{" "}`. Návrat starého chování: `compressHTML: true`
(HTML-aware) nebo `false` (zachovat vše).

### 🟡 Markdown processor → Sätteri (native Rust)

`@astrojs/markdown-remark` se už **neinstaluje** by default. Sätteri má built-in GFM,
smartypants, heading IDs, directives, math, frontmatter, wikilinks.

```bash
grep -rn "remarkPlugins\|rehypePlugins\|remarkRehype" astro.config.*
```

→ Pokud **používáš remark/rehype pluginy**: `pnpm add @astrojs/markdown-remark` a v configu
`markdown: { processor: unified({ remarkPlugins: [...] }) }`. Jinak nic neřešíš.

### 🟡 Experimental flagy stabilizovány / odstraněny

`logger`, `queuedRendering`, `rustCompiler`, `advancedRouting`, `cache` (route caching).

```bash
grep -rn "experimental" astro.config.*
```

→ Vyjmi je z `experimental` bloku. `cache` + `routeRules` se přesouvají na top-level configu.

### 🟡 Reserved file `src/fetch.ts`

Advanced routing je nově default a používá `src/fetch.ts` (jako `src/middleware.ts`).

```bash
ls src/fetch.ts src/fetch.js 2>/dev/null
```

→ Pokud takový soubor máš pro jiný účel: přejmenuj, nebo v configu `fetchFile: './src/router.ts'`
(jiný název) / `fetchFile: null` (vypnout advanced routing).

### 🔴 Odstraněno (build spadne, pokud používáš)

```bash
grep -rn "@astrojs/db" package.json src astro.config.*           # → Drizzle / node:sqlite
grep -rn "createAnimationScope\|TRANSITION_\|isTransitionBefore" src   # transitions internals
```

→ `@astrojs/db` je pryč. Z `astro:transitions` zmizely interní helpery (`TRANSITION_*`,
`isTransition*Event`, `createAnimationScope`). **`ClientRouter` (public komponenta) zůstává.**

### 🟢 Deprecace (funguje, ale aktualizuj)

```bash
grep -rn "getContainerRenderer" src
```

→ `getContainerRenderer()` se importuje z dedikovaného entrypointu:
`@astrojs/<x>/container-renderer` místo rootu balíčku.

---

## 3) Verifikace

```bash
pnpm build   # = wrangler types && astro check && astro build
```

`astro check` (typecheck) + `astro build` (Rust compiler) je nejdůležitější gate — chytne
nevalidní HTML i breaking changes v integracích. **Build musí projít čistě.**

Po deployi smoke test:
1. Otevři každou dotčenou stránku v prohlížeči, zkontroluj že mezery mezi inline prvky sedí
   (compressHTML `'jsx'`).
2. 0 errorů v runtime logách za posledních pár minut.

---

## 4) Co je nově k dispozici (volitelné)

- **Advanced routing** — opt-in `src/fetch.ts` přebírá kontrolu nad request pipeline.
  `astro/fetch` (`FetchState`, `astro()`) nebo **`astro/hono`** (composable handlery
  `actions/middleware/pages/i18n/sessions` jako Hono middleware → auth před actions, plná
  kontrola, mix s Hono ekosystémem). Na CF default entrypoint adaptéru řeší CF setup sám
  (session KV, `ASSETS`, `Astro.locals.cfContext`, `cf-connecting-ip`, `waitUntil`).
- **Route caching** (stable) — `cache: { provider: memoryCache() }` z `astro/config` +
  `Astro.cache.set({ maxAge, swr, tags })` / `routeRules` / `cache.invalidate()`.
  ⚠️ Na Workers je `memoryCache` **per-isolate ephemeral** (každý isolate má vlastní).
- **AI dev server** — `astro dev --background|stop|status|logs`, auto-detekce agenta,
  JSON logy (`logHandlers.json()`), health endpoint `/_astro/status`.

---

## ⚠️ Cloudflare-specifické pasti

- **`cacheCloudflare()` (`@astrojs/cloudflare/cache`, adapter 14.0.0) = PRIVATE BETA.**
  Vyžaduje Cloudflare Workers Cache feature, která je v uzavřené betě. Bez beta accessu se
  cache headers **ignorují** a `cache.invalidate()` **vyhodí error**. Pro route caching
  teď použij `memoryCache()`, ne CF provider. (Až vyjde z bety, půjde to přepnout.)
- **Lockfile se po bumpu výrazně zmenší** — Vite 8 nese Rolldown (Rust bundler) místo
  esbuild + Rollup, takže odpadne spousta sub-dependencies. To je očekávané, ne chyba.
- **Bindings:** `import { env } from 'cloudflare:workers'`, NE `Astro.locals.runtime`
  (to platí už od Astro 6, ale připomínka — Astro 7 to nemění).

---

## Aplikováno v tomto projektu (hodinovystrejda, 2026-07-06)

Konkrétní provedení tohoto runbooku na tomhle repu:

- **Bumpy:** `astro@7.0.6`, `@astrojs/cloudflare@14.1.1`, `wrangler@4.107.0` + full `pnpm up --latest`
  (TypeScript 6, ESLint 10, eslint-plugin-astro 2, `@cloudflare/workers-types@5`, `@types/node@26`,
  tailwindcss 4.3.2 → Vite 8).
- **Sätteri:** projekt používá `remark-reading-time` → přidán `@astrojs/markdown-remark` a config
  přepsán z `markdown.remarkPlugins` na `markdown.processor: unified({ remarkPlugins: [...] })`.
- **Build failure fix (nesouvisel s Astro 7):** `astro check` padal na
  `src/lib/email.ts` → `import { env } from "cloudflare:workers"` (ts 2307). Příčina: chyběl
  `worker-configuration.d.ts` (nikdy se nespouštělo `wrangler types`). Řešení: `wrangler types`
  přidán do build scriptu (`"build": "wrangler types && astro check && astro build"`), soubor
  gitignorován. **Vite 8 to sám nevyřešil** — je to typová konfigurace, ne bundler.
- **Rust compiler:** prošlo všech 71 souborů bez jediné chyby (žádné neuzavřené tagy / nevalidní vnoření).
- **Drobnost:** `no-var` v inline theme scriptu `BaseLayout.astro` → `let`/`const` (eslint-plugin-astro 2).
- **Peer warningy (neblokující):** `eslint-plugin-jsx-a11y` nedeklaruje eslint 10; `wrangler` chce
  workers-types `^4` (máme `^5`). Build ani lint to nerozbíjí.
- **Gates:** build exit 0, `tsc --noEmit` (TS 6) exit 0, `eslint .` exit 0.

---

## Aplikováno v tomto projektu (kostra, 2026-07-06)

Konkrétní provedení tohoto runbooku na šabloně kostra (single-repo, Node 24.14, pnpm 10.12):

- **Bumpy (`pnpm up --latest`, sekce 0):** `astro@7.0.6`, `@astrojs/cloudflare@14.1.1`,
  `wrangler@4.107.0`, TypeScript 6.0.3, ESLint 10.6, `eslint-plugin-astro@2.1.1`,
  `@eslint/js@10`, `@cloudflare/workers-types@5`, `@types/node@26`, `tailwindcss@4.3.2`,
  `@tailwindcss/vite@4.3.2` → Vite 8, `vitest@4.1.10`, `sharp@0.35.3`. Range v package.json
  rozšířen na `astro@^7.0.6`, `@astrojs/cloudflare@^14.1.1`.
- **Sätteri:** projekt používá `remark-reading-time` (+ inline plugin pro `minutesRead`) →
  přidán `@astrojs/markdown-remark@7.2.1` a config přepsán z `markdown.remarkPlugins` na
  `markdown.processor: unified({ remarkPlugins: [...] })` (`import { unified } from "@astrojs/markdown-remark"`).
  Ověřeno proti D1 docs (`library='astro'`, `reference/configuration-reference.mdx`).
- **Rust compiler:** prošlo všech 18 souborů bez chyby (`astro check` 0 errors / 0 warnings /
  0 hints); markdown blog (`/blog/prvni-clanek/`) se prerenderoval, `minutesRead` z unified
  pipeline funguje.
- **compressHTML:** nebylo nastaveno → naběhl nový `'jsx'` default. Žádný ruční zásah; ověřit
  smoke testem mezery mezi inline prvky.
- **Nic dalšího z pre-flight se netýká:** žádný `experimental` blok, `src/fetch.ts`, `@astrojs/db`,
  transitions internals ani `getContainerRenderer`. Projekt nemá svelte/react integrace (jen
  sitemap + astro-icon + rss).
- **Peer warningy (neblokující, dle runbooku):** `eslint-plugin-jsx-a11y` nedeklaruje eslint 10;
  `wrangler` chce workers-types `^4` (máme `^5`). Build ani lint to nerozbíjí.
- **Gates:** `pnpm build` exit 0, `tsc --noEmit` (TS 6) exit 0, `eslint .` exit 0 (2 warningy jen
  v gitignorovaném generovaném `worker-configuration.d.ts`).

---

## TL;DR rychlá cesta (čistý projekt bez markdown pluginů a experimental flagů)

```bash
pnpm add astro@^7 @astrojs/cloudflare@^14 @astrojs/svelte@^9 @astrojs/react@^6
grep -rn "compressHTML\|experimental\|@astrojs/db\|createAnimationScope" astro.config.* src
ls src/fetch.ts 2>/dev/null
pnpm build   # musí projít — Rust compiler je přísný na nevalidní HTML
# commit + deploy + smoke test živých stránek
```
