# Práce s Claude — příkazy, pravidla a kontrola

## Příkazy pluginu pefen-stack

### /work — strukturovaná práce

Hlavní příkaz pro zadávání úkolů. Claude pracuje ve třech fázích:

1. **Plán** — přečte relevantní soubory, vytvoří TODO list s konkrétními kroky, ověří vzory v MCP dokumentaci
2. **Provedení** — každý krok zpracuje, ověří a teprve pak označí za hotový
3. **Review** — na konci automaticky spustí `/review`

Kdy použít: Vždy když chceš aby Claude něco implementoval nebo změnil.

### /review — kontrola před commitem

Povinná kontrola všech změn. Claude:

- Přečte **celé** změněné soubory (ne jen diffy)
- Kontroluje logiku, CSS, pojmenování, mrtvý kód, ošetření chyb
- Ověřuje každý netriviální pattern proti aktuální dokumentaci přes MCP
- Pro každý nález uvede soubor a řádek

Výsledek: **OK** (v pořádku), **WARNING** (riziko, neblokuje), **PROBLEM** (musí se opravit).

### /deploy — nasazení

Commitne, pushne a ověří deployment přes GitHub Actions na Cloudflare Workers.

### /audit — hloubkový audit

Důkladnější než `/review`. Kontroluje celý changeset před PR nebo pushem — logiku, konzistenci, pojmenování, typy, ošetření chyb, best practices.

## Technologické skilly

Plugin obsahuje skilly pro konkrétní technologie. Claude je použije automaticky když pracuje s danou technologií:

| Skill | Kdy se aktivuje |
|---|---|
| `astro` | Práce s Astro 6 — stránky, API routes, middleware, content collections |
| `svelte5` | Svelte 5 komponenty — runes ($state, $derived, $effect) |
| `effect-ts` | Effect TS — services, error handling, layers, schémata |
| `cloudflare-workers` | Workers, D1, R2, KV, Vectorize, Workers AI |
| `daisyui` | daisyUI 5 komponenty a témata |

Každý skill vynucuje ověřování proti MCP dokumentaci a blokuje zastaralé vzory.

## Automatické kontroly (hooky)

Plugin automaticky spouští kontroly:

| Kdy | Co dělá |
|---|---|
| **Před zápisem do souboru** | Blokuje `as any`, `throw` v Effect kódu, `async/await` v Effect kódu, Svelte 4 vzory, `@ts-ignore` |
| **Po zápisu do souboru** | Spustí typecheck na změněném souboru |
| **Při ukončení** | Blokuje ukončení pokud jsou necommitnuré změny |

## MCP — proč je to důležité

`.mcp.json` v projektu dává Claude přístup k aktuální dokumentaci přes MCP servery. To znamená že by neměl střílet z hlavy ale ověřovat v docs.

Dostupné zdroje: Astro, Svelte, Cloudflare, Effect TS (a další přes worker-mcp).

**Bez MCP Claude často halucinuje** — používá zastaralé API, vymýšlí neexistující funkce, míchá verze. MCP to výrazně omezuje ale neodstraňuje úplně.

---

## Jak Claude hlídat

I s pluginem a MCP Claude občas:

- **Halucinuje** — tvrdí že něco funguje, i když to neověřil
- **Lže** — řekne že opravil chybu, ale ve skutečnosti jen přepsal kód jinak
- **Dělá líná řešení** — obejde problém místo aby ho vyřešil, přidá `as any`, zakomentuje test
- **Přidává zbytečnosti** — refaktoruje co nebylo potřeba, přidává "vylepšení" co nikdo nechtěl
- **Ignoruje kontext** — nepamatuje si co řekl před 5 zprávami

### Pravidla pro komunikaci

**1. Zadávej konkrétně**

Špatně:
> "Udělej to hezčí"

Dobře:
> "Na stránce /kontakt/ změň nadpis na 'Napište nám', přidej pole pro telefon a tlačítko 'Odeslat' zarovnej doprava"

**2. Vyžaduj důkazy, ne tvrzení**

Když Claude řekne "opraveno" nebo "funguje", ptej se:
- "Ukaž mi diff"
- "Co přesně jsi změnil a proč?"
- "Ověřil jsi to v MCP docs?"

Neakceptuj "mělo by to fungovat". Buď to funguje, nebo ne.

**3. Kontroluj výsledek na produkci**

Dev server lokálně může fungovat jinak než Cloudflare Workers. Po deployi vždy zkontroluj v prohlížeči.

**4. Nenech ho dělat víc než má**

Když ho požádáš o opravu bugu, neměl by refaktorovat okolní kód. Když chceš přidat tlačítko, neměl by předělávat celý layout. Pokud začne dělat víc:
> "Stop. Udělej jen to co jsem řekl, nic víc."

**5. Při pochybnostech si nech vysvětlit**

> "Vysvětli mi proč jsi to udělal takhle a ne jinak"
> "Jaké jsou alternativy?"
> "Co se stane když...?"

**6. Kontroluj commity**

Před pushnutím se podívej co je v commitu. `git diff HEAD~1` ti ukáže co se změnilo. Pokud tam je něco co jsi nechtěl, řekni mu ať to vrátí.

**7. Neboj se ho zastavit**

Pokud vidíš že jde špatným směrem, zastav ho hned. Je levnější zahodit špatnou práci brzo než pozdě.

### Červené vlajky

Dávej pozor když Claude:

- Říká "mělo by" místo "je" — znamená to že neověřil
- Mění soubory které neměl — zkontroluj `git status`
- Přidává komentáře typu `// TODO: fix later` — to je líné řešení
- Odpovídá moc rychle na složitou otázku — pravděpodobně neověřil v docs
- Tvrdí že "build prošel" ale nespustil ho — ověř sám
- Přidává `try/catch` kolem všeho — neřeší příčinu, schovává symptomy

### Užitečné fráze

- "Ověř to v MCP docs" — donutí ho skutečně zkontrolovat
- "Ukaž mi co jsi změnil" — musí ukázat konkrétní kód
- "Spusť build" — ověří že se to aspoň zkompiluje
- "Vrať to zpět" — když udělal něco špatně
- "Udělej jen X, nic jiného" — zabrání přidávání zbytečností
- "Nelži mi" — občas pomůže, i když je to smutné že to musíš říkat AI
