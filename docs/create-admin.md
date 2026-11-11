# Kostra — jak přidat admin

Admin není součástí kostry — přidává se až podle potřeby konkrétního projektu. Tady je návod co říct Claude a na co dávat pozor.

## Jak to funguje

Admin je samostatná část webu na cestě `/admin/`. Skládá se z:

- **Admin stránky** (`src/pages/admin/`) — Astro stránky s layoutem
- **API routes** (`src/pages/api/admin/`) — REST endpointy pro CRUD operace
- **Svelte komponenty** (`src/components/admin/`) — interaktivní editory
- **Admin layout** (`src/layouts/AdminLayout.astro`) — sidebar + navigace

## Co říct Claude

Dej mu jasné zadání. Například:

> "Přidej admin sekci. Potřebuju spravovat tyto entity:
> - Produkty (název, popis, cena, fotka, kategorie)
> - Kategorie (název, pořadí)
> - Kontaktní formulář (zobrazit odeslané zprávy)
>
> Použij D1 databázi a R2 pro obrázky. Admin zabezpeč přes Cloudflare Access."

### Co je důležité uvést

1. **Jaké entity** se budou spravovat (co má jaký atribut)
2. **Jestli potřebuješ obrázky** — pokud ano, bude R2 bucket
3. **Jak zabezpečit admin** — typicky Cloudflare Access
4. **Jestli je web vícejazyčný** — admin pak musí podporovat locale

## Co Claude udělá

1. Přidá do `wrangler.jsonc` potřebné bindungy (D1, R2, KV)
2. Vytvoří databázové schéma (Drizzle ORM)
3. Vytvoří admin layout se sidebarem
4. Pro každou entitu vytvoří:
   - Admin stránku (seznam + formulář)
   - API route (GET, POST, PUT, DELETE)
   - Svelte komponentu (editor)
5. Nastaví middleware pro autentizaci
6. Nastaví migraci databáze

## Cloudflare bindungy

Admin typicky potřebuje:

| Binding | Slouží k |
|---|---|
| `DB` (D1) | Databáze — všechna data |
| `R2_IMAGES` (R2) | Ukládání obrázků |
| `CACHE` (KV) | Cache pro zrychlení |

Tyto se nastavují ve `wrangler.jsonc` a musí být vytvořeny na Cloudflare dashboardu (nebo přes `wrangler`):

```bash
# Vytvoření D1 databáze
npx wrangler d1 create muj-projekt-db

# Vytvoření R2 bucketu
npx wrangler r2 bucket create muj-projekt-images

# Vytvoření KV namespace
npx wrangler kv namespace create CACHE
```

Výsledné ID pak dej do `wrangler.jsonc`.

### Přístup k bindingům v kódu (Astro 6)

V Astro 6 se k bindingům přistupuje přes `cloudflare:workers`:

```ts
import { env } from 'cloudflare:workers';

const db = env.DB;           // D1 databáze
const r2 = env.R2_IMAGES;   // R2 bucket
const kv = env.CACHE;        // KV namespace
```

Nepoužívej `Astro.locals.runtime` — to je zastaralé a v Astro 6 nefunguje.

## Zabezpečení adminu

Nejjednodušší je **Cloudflare Access**:

1. Na Cloudflare dashboardu jdi do Zero Trust > Access > Applications
2. Vytvoř aplikaci pro `tvoje-domena.cz/admin/*`
3. Nastav pravidla kdo se může přihlásit (email, skupina...)

**To je vše pro základní zabezpečení.** Cloudflare Access zablokuje neautorizované uživatele dříve než požadavek dorazí k tvému workeru. Nepřihlášený člověk se k `/admin/` vůbec nedostane.

### Volitelně: JWT validace v middleware

Cloudflare Access přidá k požadavkům JWT token v hlavičce `Cf-Access-Jwt-Assertion`. Můžeš ho ověřovat v Astro middleware jako extra pojistku — CF docs to doporučují jako "defense in depth", ale pro projekty běžící čistě na CF Workers to není nutné (worker nemá veřejnou IP kterou by šlo obejít).

Pokud ji chceš, řekni Claude:

> "Přidej JWT validaci Cloudflare Access tokenu v middleware pro admin routes."

Claude použije knihovnu `jose` a ověří token proti Cloudflare JWKS endpointu.

## Na co dávat pozor

- **Admin používá Svelte 5** — plugin hlídá aby Claude nepoužíval Svelte 4 vzory
- **API routes musí ošetřovat chyby** — co když neexistuje záznam, co když upload selže
- **Obrázky přes R2** — neukládej obrázky přímo do databáze, jen cestu/klíč
- **Po přidání D1/R2 do wrangleru** je třeba `pnpm build` aby se vygenerovaly typy
- **Migrace** — po změně schématu spusť `drizzle-kit generate` a `npx wrangler d1 migrations apply <nazev-db> --remote` (bez `--remote` se migrace aplikuje jen lokálně!)
