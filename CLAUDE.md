# Project rules

## Docs verification — mandatory (D1-direct)

NEVER write framework code from memory. Before writing ANY code that uses a framework, library, SDK, or CLI API (Svelte, Astro, Tailwind, Drizzle, Effect, Hono, daisyUI, Cloudflare Workers APIs, …), verify it against current docs.

**Primary = direct D1 docs-DB query** (`cloudflare-bindings` MCP, account 5 Kafe). Raw chunks + citations, **no AI synthesis**. `ask_docs` is **not** used — it's the AI layer that can hallucinate.

- DB `worker-mcp-docs`, `database_id` `a686d183-efab-472e-b43a-9a32fc692584` (account 5 Kafe `b945870b3bb5d6a40266336cb1e88693`)
- `docs(id, library, path, title, content, heading_chain, commit_sha, updated_at)` + FTS5 `docs_fts`
- Query (`mcp__plugin_cloudflare_cloudflare-bindings__d1_database_query`):

```sql
SELECT d.path, d.heading_chain, d.content
FROM docs_fts f JOIN docs d ON d.id = f.rowid
WHERE docs_fts MATCH ?1 AND d.library = ?2
ORDER BY f.rank LIMIT 8;
```

- `library` enum (`SELECT DISTINCT library FROM docs`). Effect v4 beta → `library='effect-v4'`. FTS5 nestemuje (`binding`≠`bindings`); `:`, `$` a `-` jsou operátory → kvotovat (`"cloudflare:workers"`, `"$state"`, `"bge-m3"`).

**Fallback** (D1 prázdno/slabě): `mcp__worker-mcp__search_docs(library=<lib>, max_results=5, snippet_length=600)` — server-side hybrid (FTS5 + vektor), raw chunks. Eskalace = 0 řádků NEBO řádky se vrátí ale po přečtení neodpovídají. Libs mimo D1 enum → `mcp__context7__query-docs`.

**Cloudflare API/platform:** `mcp__plugin_cloudflare_cloudflare-docs__search_cloudflare_documentation` (docs) + `cloudflare-bindings`/`-builds`/`-observability` (live ops). NEVER deprecated `mcp__cloudflare-api__*`.

## Tech stack

- **Astro 6** with `@astrojs/cloudflare` adapter (Workers, not Pages)
- **Svelte 5** — runes only ($state, $derived, $effect, $props). No Svelte 4 patterns.
- **Effect TS** — generators, TaggedError, Context.Tag, Layers. No async/await, no throw.
- **Cloudflare Workers** — D1, R2, KV, Vectorize, Workers AI
- **daisyUI 5** + Tailwind CSS 4
- **Bindings** via `import { env } from 'cloudflare:workers'`, not `Astro.locals.runtime`

## Forbidden patterns

- `as any`, `@ts-ignore`, `@ts-nocheck`
- `throw` in Effect code — use `Data.TaggedError`
- `async/await` in Effect code — use `Effect.gen` + `yield*`
- `export let` in Svelte — use `$props()`
- `on:click` in Svelte — use `onclick`
- `$:` reactive declarations — use `$derived`
- `createEventDispatcher` — use callback props
- `Astro.locals.runtime` — use `cloudflare:workers`
- Content collections without `loader`

## Workflow

- Use `/work` for structured sprint work (plan → execute → review → handoff)
- Use `/review` before every commit
- Use `/checkmcp` to audit MCP coverage or search docs quickly
- Use `/handoff` to document sprint and prepare next one
- Use `/tests` to generate tests via test-writer agent
- Commit only after /review passes with no PROBLEMs
- Never add Co-Authored-By or AI signatures to commits

## Communication

- Czech with the user
- English in code, commit messages, file names

## Commands

| Command | What it does | Co to dělá |
|---------|-------------|------------|
| `/start` | Bootstrap new project from kostra template | Nový projekt z šablony kostra |
| `/init` | Create PROJECT.md, register in dashboard, first sprint | Inicializace projektu a dashboardu |
| `/work` | Structured sprint — plan, execute, review, handoff | Strukturovaný sprint s review a handoffem |
| `/review` | Deep self-review before commit — reads full files, traces logic | Self-review před commitem, čtení celých souborů |
| `/audit` | Pre-PR audit — all changes since diverging from main | Hluboký audit před PR/push |
| `/full-audit` | Sequential file-by-file audit of entire codebase | Kompletní audit celého projektu |
| `/lint` | Run all checks — typecheck, astro check, svelte-check, eslint, tests | Všechny code quality checky najednou |
| `/fix` | Fetch open bugs from dashboard and fix them | Stažení a oprava bugů z dashboardu |
| `/deploy` | Commit, push, verify GitHub → CF Workers deploy | Commit, push, ověření deploye |
| `/checkmcp` | Audit MCP usage or search docs (`/checkmcp effect Layer`) | Audit MCP použití nebo rychlé hledání v docs |
| `/handoff` | Document finished sprint, create next sprint | Dokumentace sprintu + vytvoření dalšího |
| `/tests` | Generate tests for changed or specified files | Generování testů pro změněné soubory |
| `/status` | Quick project status — bugs, sprint, phase | Rychlý přehled stavu projektu |

