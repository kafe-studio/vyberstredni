# Vyber střední

Produkční aplikace je dostupná na [georgeduckling.com/vyberstredni/](https://georgeduckling.com/vyberstredni/); hlavní web zůstává na kořenové adrese.

Webová aplikace, která pomáhá žákům 8.–9. tříd a jejich rodičům procházet střední školy a konzervatoře v Praze a Středočeském kraji. Katalog vychází z exportu Rejstříku škol MŠMT z 11. 11. 2026 a obsahuje 381 záznamů, včetně soukromých a církevních škol.

U všech škol je podle IZO doplněno 1 619 záznamů oborů z regionálních exportů MŠMT; dobíhající obory jsou označené. Osm otázek testu pokrývá 12 tematických oblastí — včetně matematiky a přírodních věd, zvířat a přírody, zdravotnictví, bezpečnosti a IZS, techniky, umění, podnikání, pedagogiky, gastronomie a řemesel. Odpovědi se propojují s kódy a názvy skutečně evidovaných oborů a test doporučuje konkrétní školy podle těchto oborů a přesné adresy bydliště. Našeptávač adres pro Prahu a Středočeský kraj využívá Photon/OpenStreetMap; po zadání alespoň 4 znaků odešle hledaný text službě Photon a aplikace ho neukládá. Výsledková stránka přehledně vypíše šest nejlépe hodnocených škol, mapa ale zobrazí všechny školy odpovídající zájmům a nastavenému limitu vzdálenosti. Bydliště lze také určit polohou zařízení, výběrem města nebo kliknutím do rozbalovací mapy. Při shodě oborů rozhoduje bližší škola. Vzdálenost se počítá vzdušnou čarou. Přijímací podmínky, otevření oboru, školné ani skutečný čas dojezdu ověř přímo u školy. Zobrazené tematické oblasti škol jsou orientačně odvozené z názvu. Poloha 378 škol je doplněna z adresních bodů RÚIAN.

V navigaci je také katalog všech evidovaných oborů s filtrováním podle názvu, kódu a kraje. Po výběru oboru zobrazí všechny školy s daným zápisem a jejich polohy na mapě; lze omezit výpis na aktuálně evidované nabídky. Na stránce testu lze celý výběr kdykoliv resetovat z horní navigace.

Postaveno na šabloně [kostra](https://github.com/kafe-studio/kostra) (Astro + Cloudflare Workers).

## Dokumentace

- [Průzkum zdrojů dat](docs/research/data-sources.md) — odkud bereme data o školách, licence, co chybí
- [Manuál šablony](docs/manual.md)
- [Krok za krokem](docs/step-by-step.md)
- [Jak přidat admin](docs/create-admin.md)
- [Práce s Claude](docs/claude-commands.md)

## Vývoj

```bash
corepack pnpm install
corepack pnpm dev
```

### Administrace

Přístup do administrace vyžaduje Worker secrets `ADMIN_PASSWORD` a `ADMIN_SESSION_SECRET`. Nastav je v Cloudflare před přihlášením; v lokálním vývoji použij soubor `.dev.vars` a nikdy ho necommituj.

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put ADMIN_SESSION_SECRET
```

Každý příkaz bezpečně vyzve k zadání hodnoty. Bez obou secrets zůstává přihlášení do administrace vypnuté. Pro `ADMIN_SESSION_SECRET` použij náhodnou hodnotu s alespoň 32 bajty entropie.
