# Kostra — krok za krokem

Jak z kostry udělat nový projekt.

## 0. Co potřebuješ mít

- **Node.js** (v24+, Astro 6) a **pnpm** — `npm install -g pnpm`
- **Claude Code** — nainstalovaný a přihlášený
- **Plugin pefen-stack** — nainstaluj takto:
  1. V Claude Code otevři `/manage-plugins`
  2. V záložce **Marketplace** přidej URL: `https://github.com/pfncl/pefen-stack`
  3. Přepni na záložku **Plugins**, klikni **Install** u pefen-stack
  4. Zeptá se jak instalovat — vyber **For you** (do všech projektů)
  5. Klikni **Restart Claude** aby se plugin načetl
- **Cloudflare účet** — pro deploy (stačí free tier)
- **GitHub CLI** (`gh`) — volitelné, pro snadné vytvoření repa

## 1. Stažení kostry

```bash
# Naklonuj si kostru do nového adresáře
# "muj-projekt" nahraď názvem svého projektu — bez diakritiky, bez mezer, malými písmeny
# příklady: kavarna, eshop-bio, portfolio-jan
git clone https://github.com/kafe-studio/kostra.git muj-projekt
cd muj-projekt

# Odpoj od původního repa
rm -rf .git
git init
```

## 2. Úprava názvů a konfigurace

### package.json

Změň `name` na název tvého projektu:

```json
{
  "name": "muj-projekt"
}
```

### wrangler.jsonc

Změň `name` (název Cloudflare Workeru):

```jsonc
{
  "name": "muj-projekt"
}
```

Pokud už máš worker vytvořený na Cloudflare, přidej `account_id`. Pokud budeš potřebovat databázi (D1), storage (R2) nebo cache (KV), přidej bindungy — Claude ti s tím pomůže.

### src/config/site.ts

Uprav základní údaje webu:

```ts
export const siteConfig = {
  name: "Můj Projekt",
  description: "Popis mého webu.",
  url: "https://muj-projekt.cz/",
  lang: "cs",
  locale: "cs_CZ",
  author: "Tvoje jméno",
  email: "info@muj-projekt.cz",
  // ... další údaje
};
```

### astro.config.mjs

Změň `site` na svou URL:

```js
site: "https://muj-projekt.cz/",
```

## 3. Instalace závislostí

```bash
pnpm install
```

## 4. Ověření že to funguje

```bash
pnpm build
```

Pokud build projde, základ je v pořádku.

## 5. Připojení k Gitu a GitHubu

```bash
git add .
git commit -m "init from kostra"
gh repo create muj-projekt --private --source=. --push
```

## 6. Práce s Claude

Otevři projekt v Claude Code a zadej, co chceš. Například:

> "Chci web pro kavárnu. Hlavní stránka s hero sekcí, nabídkou a kontaktem. Použij Tailwind, žádný Svelte zatím nepotřebuju."

Nebo:

> "Potřebuju web s adminem. V adminu se budou spravovat produkty (název, popis, cena, fotka). Použij D1 databázi a R2 pro obrázky."

Claude použije `/work` a bude postupovat strukturovaně:

1. Přečte si co už v projektu je
2. Vytvoří plán (TODO list)
3. Postupně implementuje a ověřuje každý krok
4. Na konci spustí `/review`
5. Commitne až když je všechno OK

### Důležité

- **Nech Claude používat MCP** — to je celá pointa. Díky `.mcp.json` má přístup k aktuální dokumentaci
- **Neposkakuj mu do řeči** zbytečně — ať dopracuje krok, než zadáš další
- **Kontroluj výsledek** na produkci, ne jen lokálně
- Pokud chceš admin, řekni to hned na začátku — viz [create-admin.md](create-admin.md)

## 7. Deploy

Buď ručně:

```bash
pnpm build && npx wrangler deploy
```

Nebo přes Claude:

> "/deploy"

### Automatický deploy přes GitHub Actions

Cloudflare nabízí oficiální GitHub Action. Vytvoř soubor `.github/workflows/deploy.yml`:

```yaml
name: Deploy Worker
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - name: Build & Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

V GitHubu nastav secrets `CLOUDFLARE_API_TOKEN` a `CLOUDFLARE_ACCOUNT_ID`. Po každém push do main se worker automaticky buildne a deployne.

## 8. Další vývoj

Prostě zadávej požadavky Claude a nech ho pracovat. Plugin hlídá aby nepoužíval zastaralé patterny a ověřoval vše v dokumentaci.

Pokud je třeba přidat novou technologii (Svelte, Effect TS, D1, R2...), stačí to říct — Claude to nastaví a nainstaluje.
