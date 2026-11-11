# Kostra — manuál

Kostra je šablona pro nové webové projekty. Stáhneš si ji, upravíš pár věcí a necháš Claude udělat zbytek.

## Co to je

- Astro 6 projekt s Cloudflare Workers
- Připravený na web + admin (admin se přidá podle potřeby)
- Tailwind CSS 4 pro stylování
- Volitelně: Svelte 5 (interaktivní komponenty), Effect TS (backend logika)
- SEO, sitemap, RSS, robots.txt — všechno už je v tom
- Blog s content collections jako základ

## Co je v tom připraveno

```
src/
  components/       # Navbar, Footer, SEO komponenty
  config/site.ts    # Základní nastavení webu (název, popis, odkazy...)
  content/blog/     # Ukázkový článek
  layouts/          # Hlavní layout stránky
  pages/            # Stránky webu (index, blog, 404, RSS, robots)
  styles/           # Globální styly + dark/light téma
  types/            # TypeScript typy
```

## Důležité soubory

| Soubor | K čemu je |
|---|---|
| `src/config/site.ts` | Název webu, popis, kontakty, navigace |
| `wrangler.jsonc` | Cloudflare konfigurace (název workeru, bindungy) |
| `package.json` | Název balíčku, závislosti |
| `.mcp.json` | MCP servery pro Claude (dokumentace Astro, Svelte, CF...) |
| `astro.config.mjs` | Nastavení Astra (adaptér, site URL, fonty...) |

## Tech stack

| Technologie | Použití |
|---|---|
| **Astro 6** | Framework — stránky, routing, SSR |
| **Cloudflare Workers** | Hosting a runtime (D1, R2, KV podle potřeby) |
| **Tailwind CSS 4** | Stylování |
| **TypeScript** | Typová bezpečnost |
| **Svelte 5** | Interaktivní části (volitelné, přidá se podle potřeby) |
| **Effect TS** | Backend logika (volitelné, přidá se podle potřeby) |

## Jak to funguje s Claude

Celý workflow je řízený přes Claude Code s nainstalovaným pluginem **pefen-stack**. To znamená:

1. **Claude používá MCP** — nestřílí z hlavy, ověřuje v dokumentaci (Astro, Svelte, Cloudflare, Effect)
2. **Plugin hlídá kvalitu** — blokuje špatné patterny (Svelte 4 syntax, `as any`, `throw` v Effectu...)
3. **Příkazy pluginu:**
   - `/work` — strukturovaný režim práce (plán → provedení → review)
   - `/review` — povinný self-review před commitem
   - `/deploy` — commit, push, ověření deploymentu

### Pravidla která plugin vynucuje

- Žádný `as any` — používej správné typy
- Žádný `throw` v Effect kódu — použij `Data.TaggedError`
- Žádný `async/await` v Effect kódu — použij `Effect.gen`
- Žádné Svelte 4 vzory (`export let`, `$:`, `on:click`)
- Žádný `@ts-ignore` nebo `eslint-disable`
- Před ukončením musí být všechno commitnuté

## Cloudflare bindungy v Astro 6

V Astro 6 se k Cloudflare bindingům (D1, R2, KV, secrets) přistupuje přes:

```ts
import { env } from 'cloudflare:workers';
```

**Nepoužívej** `Astro.locals.runtime` — to je staré API a v Astro 6 nefunguje.

## Poznámky

- **Dev server** může být nespolehlivý lokálně — ověřuj na produkci (commit + push + deploy)
- **Komunikace s Claude je česky**
- Admin sekce se vytváří až podle potřeby konkrétního projektu — viz [create-admin.md](create-admin.md)
