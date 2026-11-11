# Průzkum zdrojů dat – průvodce výběrem SŠ (Praha + Středočeský kraj)

Stav k 11. 11. 2026. Všechny soubory označené ✅ jsem stáhl a ověřil jejich obsah, ne jen popis na webu.

## Shrnutí

| Požadavek | Zdroj | Stav | Klíč pro propojení |
|---|---|---|---|
| Seznam škol, obory, adresy | Rejstřík škol MŠMT (národní katalog otevřených dat) | ✅ ověřeno, JSON-LD, denně aktuální | REDIZO, IZO, KKOV, kód RÚIAN |
| Kapacita 1. ročníku, přihlášky, přijatí = **obsazenost** | CERMAT – agregovaná data JPZ po školách a oborech | ✅ ověřeno, XLSX, 2024–2026 | REDIZO, IZO, KKOV |
| **Náročnost přijímaček** (kolik % stačilo na přijetí) | CERMAT – stejný soubor, výsledky přijatých | ✅ ověřeno | REDIZO, KKOV |
| **Náročnost studia** (maturity) | CERMAT – výsledky MZ po školách | ✅ ověřeno, XLSX, 2015–2026 | REDIZO |
| **Hodnocení školy** | ČŠI – seznam inspekčních zpráv | ✅ ověřeno, CSV/JSON/XML, odkazy na PDF | REDIZO |
| **Dojezd** – poloha školy | RÚIAN (ČÚZK), CC BY 4.0 | ✅ ověřeno, 94 % míst výuky v Praze se napojí | kód RÚIAN |
| **Dojezd** – veřejná doprava | PID GTFS (Praha + Středočeský kraj, včetně vlaků), CC BY 4.0 | ✅ licence ověřena, data jsem nestahoval | – |
| Popisy oborů, uplatnění | infoabsolvent.cz (NPI ČR) | ⚠️ obsah existuje, chybí licence a otevřená data | KKOV |
| **Školné** | Jen weby soukromých a církevních škol | ❌ žádný centrální zdroj | ruční sběr |
| **Test zájmů** | O\*NET Interest Profiler (licence USDOL) | ⚠️ překlad povolen, ale s povinnou validační studií | RIASEC → KKOV |

**Rozsah regionu:** 373 středních škol (Praha 219, Středočeský kraj 154). V přijímacím řízení 2026 má CERMAT data pro 361 škol a 1 423 kombinací škola + obor. Z toho 804 kombinací má povinnou jednotnou přijímací zkoušku (JPZ).

---

## 1. Rejstřík škol a školských zařízení (MŠMT) ✅

- **Kde:** Národní katalog otevřených dat, datové sady po krajích.
  - Praha: `https://lkod-ftp.msmt.gov.cz/00022985/21e5fd4a-5378-4d64-90e9-759b15d01f28/RSSZ-Hl-m-Praha.jsonld`
  - Středočeský kraj: `https://lkod-ftp.msmt.gov.cz/00022985/3d7ec2fb-4d53-46c4-a80e-542487c989b3/RSSZ-Stredocesky-kraj.jsonld`
  - Celá ČR plus čtvrtletní snímky (vhodné pro historii) jsou také k dispozici.
- **Aktualita:** Stažený soubor měl `datumVystupu: 2026-11-11`, tedy dnešní datum.
- **Obsah:**
  - Právnická osoba: REDIZO, IČO, název, adresa s kódem RÚIAN, typ zřizovatele (veřejná, soukromá, církevní), e-maily, ředitel.
  - Škola (druh `C00` = střední škola): IZO, celková kapacita, místa výuky s adresou a kódem RÚIAN.
  - Obor: kód KKOV (např. `18-20-M/01`), název, forma (denní, dálková…), délka, jazyk, kapacita a příznak „dobíhající obor“.
- **Pozor:** Kapacita v rejstříku je **maximální počet žáků ve všech ročnících**, ne počet míst pro nové žáky. Ten je v datech CERMATu.
- **Podmínky užití:** Uvést MŠMT jako zdroj. MŠMT nezaručuje správnost dat.

## 2. CERMAT – přijímací řízení po školách a oborech ✅ (nejcennější zdroj)

- **Kde:** `https://data.cermat.gov.cz/data-a-analyticke-vystupy-jednotna-prijimaci-zkouska/agregovana-data-jpz.html`
  - `PZ{rok}_kolo{1|2}_skolobory_kapacity.xlsx`
  - `PZ{rok}_kolo{1|2}_skolobory_prihlasky.xlsx`
  - `PZ{rok}_kolo{1|2}_skolobory_vysledky.xlsx`
  - Roky 2024, 2025 a 2026, obě kola. Starší roky 2017–2023 jsou jen po skupinách oborů a bez dat o přijetí.
  - Už je zveřejněno i `PZ2027_kolo1_konzervatore_kapacity.xlsx`, takže data pro příští rok začínají přibývat.
- **Řádek** = škola + obor + zaměření + forma studia. Obsahuje REDIZO, IZO, KKOV, zřizovatele, typ školy, maturitní či nematuritní obor a povinnost JPZ.
- **Sloupce důležité pro aplikaci:**

| Co ukážeme | Sloupec |
|---|---|
| Kolik míst se otevírá | `KAPACITA` (počet míst pro 1. ročník) |
| Jak moc se tam hlásí lidi | `INDEX POPTÁVKY` (přihlášky / kapacita), `PŘIHLÁŠKY CELKEM`, přihlášky podle priorit 1–5 |
| Kolik lidí vzali | `PŘIJATÍ`, přijatí podle priorit |
| Kolik bylo potřeba na přijetí | `ČJ+MA – % SKÓR – MIN (PŘIJATI)`, `ČJ – … MIN`, `MA – … MIN`, průměr přijatých |
| Jak si stojí přijatí vůči celé ČR | `PERCENTIL – PRŮMĚR/MIN (PŘIJATI)` |
| Proč nepřijali | `NEPŘIJATI – NEDOSTATEČNÁ KAPACITA`, `– NESPLNĚNÍ PODMÍNEK`, `– PŘIJAT NA VYŠŠÍ PRIORITU` |

- Výsledky JPZ jsou v **% skóru**, ne v bodech, protože body nejsou srovnatelné u uchazečů s uzpůsobenými podmínkami. Pro teenagery je navíc srozumitelný **percentil**: „přijatí byli lepší než X % všech, kdo psali přijímačky“.
- **Omezení:**
  - Školní část přijímaček (pohovory, talentovky, prospěch) v datech není. Minimální skóre přijatého proto není čistá hranice pro přijetí, protože škola mohla přidat body i za jiná kritéria. V aplikaci to musí být jasně napsané.
  - Obory bez JPZ (učební obory) mají jen počty přihlášených a přijatých, bez skóre.
- **Podmínky užití:** Na portálu jsem výslovnou licenci nenašel. **Je potřeba ji ověřit u CERMATu (info@cermat.cz).**

## 3. CERMAT – výsledky maturit po školách ✅

- **Kde:** `https://data.cermat.gov.cz/maturitni-zkouska/agregovana-data.html`, soubory `MZ{rok}{j|jap}_SC_skolobory.xlsx` za 2015–2026 (jarní a jarní + podzimní období).
- **Obsah:** společná část maturity podle školy (REDIZO) a skupiny oborů. Počty přihlášených, konajících a úspěšných, podíl úspěšných, čistá neúspěšnost a pro každý předmět (ČJ, MA, AJ, NJ…) průměrný % skór a percentil.
- **Využití:** nepřímý ukazatel náročnosti a kvality výuky. Vhodné je srovnání s průměrem stejného typu školy, ne s gymnázii obecně.

## 4. Česká školní inspekce ✅ (s výhradou)

- **Kde:** `https://opendata.csicr.cz/Transformation/Download/139/Distribution` (JSON, k dispozici také CSV a XML).
- **Obsah:** REDIZO, název, datum inspekce, odkaz na PDF inspekční zprávy a odkaz na profil školy na portal.csicr.cz.
- **Pokrytí:** 352 z 373 středních škol v regionu má aspoň jednu zprávu. U většiny je poslední zpráva z let 2022–2026, u 63 škol je starší než z roku 2021.
- **Omezení:**
  - **Žádné číselné hodnocení.** Zpráva je slovní text v PDF.
  - Návrh: zobrazovat odkaz na nejnovější zprávu s datem. Případně připravit krátké shrnutí, ale jen s ruční kontrolou nebo jasným označením „shrnutí“.
  - Žádné vlastní „hvězdičky“ vytvářet nebudeme.
- Další datové sady ČŠI (hospitační záznamy, dotazníky pro ředitele) jsou anonymizované celostátní sběry. Pro hodnocení jednotlivých škol se nehodí.

## 5. Dojezd ✅

- **Poloha školy:** RÚIAN – adresní místa v CSV po obcích, CC BY 4.0, měsíční aktualizace.
  - Praha: `https://vdp.cuzk.gov.cz/vymenny_format/csv/20261031_OB_554782_ADR.csv.zip`
  - Celá ČR: `…/20260930_OB_ADR_csv.zip` (63 MB)
  - Souřadnice jsou v S-JTSK (EPSG:5514), je potřeba je převést na WGS84.
  - Z 333 míst výuky pražských středních škol se 313 (94 %) přímo napojí přes kód RÚIAN. Zbytek jsou pravděpodobně místa výuky mimo Prahu, která se dohledají v souborech jiných obcí.
- **Veřejná doprava:** PID GTFS `https://data.pid.cz/PID_GTFS.zip`. Obsahuje všechny linky PID (metro, tramvaje, autobusy, vlaky) v Praze a Středočeském kraji, jízdní řády na 14 dní a denní aktualizaci, licence CC BY 4.0.
  - Návrh: jednou týdně předpočítat dojezdové časy (z každé zastávky ke každé škole v ranní špičce) a ukládat je do databáze. Za běhu pak žádné API potřeba nebude.
  - Pro systematické využití PID žádá o kontakt na opendata@pid.cz.
- **Bydliště uživatele:** stačí obec nebo zastávka, není potřeba přesná adresa (kvůli ochraně dat).

## 6. Popisy oborů a uplatnění ⚠️

- **infoabsolvent.cz (NPI ČR):** popisy oborů podle KKOV, uplatnění, nezaměstnanost absolventů a vlastní orientační test „Profitest“.
  - Nemá otevřená data ani uvedenou licenci.
  - **Nekopírovat, odkazovat.** Případně požádat NPI (infoabsolvent@npi.cz) o data a svolení.
- **Rámcové vzdělávací programy (RVP):** oficiální dokumenty MŠMT ke každému oboru. Jako úřední dílo by mohly být volně použitelné (§ 3 autorského zákona), to je ale potřeba ověřit. Jsou ovšem psané pro učitele, takže je pro teenagery přepíšeme vlastními slovy.
- **Nezaměstnanost absolventů:** NPI vydává zprávy jen v PDF, podle skupin oborů a krajů. Pro první verzi se to hodí nanejvýš jako kontext u skupiny oborů.

## 7. Školné ❌

- Neexistuje žádný centrální zdroj. Soukromé školy si školné stanovují samy a není povinnost ho nikam hlásit.
- Rozsah: v Praze je zhruba 95 soukromých a 10 církevních zřizovatelů, ve Středočeském kraji 36 soukromých a 3 církevní (počty subjektů se SŠ podle typu zřizovatele v rejstříku).
- **Návrh:**
  - Ruční sběr z webů škol, u každé hodnoty odkaz a datum ověření.
  - Školám pošleme e-mail s žádostí o potvrzení.
  - Hodnoty starší než 12 měsíců označíme jako „neověřeno“.
  - Veřejné školy jsou bez školného, to vyplývá přímo ze zákona.

## 8. Test zájmů ⚠️ – nutné rozhodnutí s poradcem

**Opravuji svou dřívější informaci:** O\*NET Interest Profiler **není** public domain. Licence:

- **CC BY-ND 4.0:** jen beze změn, tedy bez překladu. Pro nás to nestačí.
- **O\*NET Tools Developer License:** povoluje překlad i úpravy a je bez poplatků, včetně komerčního použití. Podmínky:
  - Při úpravě obsahu nebo účelu je povinná **validační studie**, která prokáže platnost pro zamýšlené publikum, tedy české žáky 8.–9. tříd, podle *Standards for Educational and Psychological Testing*.
  - Povinné upozornění: „includes information from the O\*NET Career Exploration Tools… USDOL/ETA has not approved, endorsed, or tested these modifications“ a popis provedených změn.
  - Existuje recenzovaná německá adaptace (Roemer a kol., 2023, *Psychological Test Adaptation and Development*), kterou lze použít jako metodický vzor.

**Alternativy:**

| Možnost | Pro | Proti |
|---|---|---|
| A) Adaptace O\*NET IP (60 položek, RIASEC) | Nejlépe zdokumentovaný volný nástroj, existuje mapování RIASEC → povolání | Validační studie: sběr dat od žáků, psychometrická analýza |
| B) RIASEC marker scales (Armstrong, Allison, Rounds 2008), 8 položek na škálu | Krátké, deklarované jako public domain | Položky vycházejí z O\*NET, status je potřeba ověřit u autorů. Validováno na vysokoškolácích, ne na 14letých |
| C) Spolupráce s NPI (Profitest) | Česká, už hotová, napojená na obory | Licence neznámá, v aplikaci by byl jen jako odkaz |
| D) Vlastní dotazník poradce, postavený na teorii RIASEC | Plná kontrola, česká terminologie | Nejvíc práce. Bez validace by šlo jen o „orientační dotazník“, ne o test |

**Doporučení:** začít variantou **A**. Poradce zkontroluje překlad, aplikace poběží s označením „pilotní verze“ a anonymní výsledky (se souhlasem) poslouží jako data pro validační studii. Teprve po ní bude test „ostrý“. Mapování RIASEC → obory KKOV navrhne poradce, já připravím nástroj na jeho úpravu.

Otázky pro poradce:
1. Souhlasí s RIASEC jako hlavním rámcem? Chce přidat schopnosti a styl učení jako Profitest?
2. Kdo provede validaci (psychometrik, spolupráce s PedF nebo FF UK)?
3. Jak formulovat výsledky, aby nepůsobily jako diagnóza?

## 9. Ochrana dat

- Uživatelům je 13–15 let a souhlas se zpracováním osobních údajů mohou dát až od 15 let (zákon 110/2019 Sb.). → **Žádné účty**, výsledky se ukládají v prohlížeči a sdílejí se odkazem.
- Validační data: jen anonymní odpovědi, s výslovným souhlasem. U dětí mladších 15 let se souhlasem rodiče. Nutná konzultace s poradcem a případně s právníkem.

---

## Datový model (návrh)

```
school (redizo PK, ico, name, founder_type, address, ruian, lat, lon, web, csi_last_report_url, csi_last_date)
program (id PK, redizo FK, izo, kkov, name, focus, form, length, maturita, jpz_required, register_capacity)
admission_stats (program_id FK, year, round, capacity, applications, applications_p1..p5, admitted,
                 min_pct_admitted, avg_pct_admitted, min_percentile_admitted, rejected_capacity, …)
maturita_stats (redizo FK, year, group, success_rate, cj_avg_pct, ma_avg_pct, …)
tuition (redizo FK, program_id FK NULL, amount_czk_year, source_url, verified_at)
kkov_riasec (kkov, r, i, a, s, e, c)        -- mapování navržené poradcem
commute (stop_id, redizo, minutes_am_peak)   -- předpočítané z GTFS
source (dataset, url, downloaded_at, license) -- u každého údaje se zobrazuje zdroj
```

Propojení: rejstřík (REDIZO, IZO, KKOV) ↔ CERMAT přijímačky (REDIZO, IZO, KKOV) ↔ CERMAT maturity (REDIZO) ↔ ČŠI (REDIZO) ↔ RÚIAN (kód adresního místa).

## Co ověřit před spuštěním

- [ ] Licenci nebo podmínky užití dat CERMATu (info@cermat.cz)
- [ ] Podmínky užití obsahu infoabsolvent.cz (infoabsolvent@npi.cz)
- [ ] Ohlásit systematické využití PID (opendata@pid.cz)
- [ ] Zaregistrovat se jako vývojář O\*NET (nepovinné, doporučené)
- [ ] Ověřit status RIASEC markers u autorů (pokud zvolíme variantu B)
