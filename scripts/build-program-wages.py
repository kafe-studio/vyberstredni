"""
Build src/data/program-wages.json: what the typical occupation of each program (obor) earns, how it developed and
the official outlook for wage growth.

Sources (all public, downloaded into .cache/data-sources/):
  * Národní soustava povolání (NSP, MPSV), job-unit exports https://nsp.cz/export/<id>/docx, fetched by
    scripts/fetch-nsp-units.py. Each job unit names its CZ-ISCO occupation and the school programs (RVP codes) that
    prepare for it. This links a program to occupations.
  * ISPV (Informační systém o průměrném výdělku, MPSV), annual results 2017-2025 in Excel, sheets M8 (gross monthly
    wage by CZ-ISCO 4-digit unit group): employees, median, quartiles, for the wage sphere (MZS, mostly private
    employers) and the salary sphere (PLS, public sector).
  * Ministerstvo financí, Makroekonomická predikce (table 3.3.1): nominal growth of the average gross monthly wage
    for the forecast and outlook years.

Only raw numbers are stored; the forecast lines are computed in src/lib/program-wages.ts.

Usage:
  python scripts/build-program-wages.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "data-sources"
NSP_CACHE = CACHE / "nsp"
ISPV_CACHE = CACHE / "ispv"
MF_FILE = CACHE / "mf" / "predikce-2026-11.xlsx"
OUTLOOK = ROOT / "src" / "data" / "program-outlook.json"
SCHOOLS = ROOT / "src" / "data" / "official-schools.json"
OUT = ROOT / "src" / "data" / "program-wages.json"

NSP_URL = "https://nsp.cz"
NSP_UNIT_URL = "https://nsp.cz/export/{id}/pdf"
ISPV_URL = "https://mpsv.gov.cz/publikace-ispv-ke-stazeni"
MF_URL = "https://mf.gov.cz/cs/rozpoctova-politika/makroekonomika/makroekonomicka-predikce/2026/makroekonomicka-predikce-listopad-2026-65661"
MF_LABEL = "Makroekonomická predikce MF ČR, listopad 2026"

# Annual ISPV publications: year -> (wage sphere file, salary sphere file).
ISPV_FILES = {
    2017: ("ISPV_174_MZS.xlsx", "ISPV_174_PLS.xlsx"),
    2018: ("ISPV_184_MZS.xlsx", "ISPV_184_PLS.xlsx"),
    2019: ("ISPV_194_MZS.xlsx", "ISPV_194_PLS.xlsx"),
    2020: ("ISPV_204_MZS.xlsx", "ISPV_204_PLS.xlsx"),
    2021: ("ISPV_214_MZS.xlsx", "ISPV_214_PLS.xlsx"),
    2022: ("CR_224_MZS.xlsx", "CR_224_PLS.xlsx"),
    2023: ("ISPV_234_MZS.xlsx", "ISPV_234_PLS.xlsx"),
    2024: ("ISPV_MZS_244.xlsx", "ISPV_PLS_244.xlsx"),
    2025: ("ISPV_MZS_254.xlsx", "ISPV_PLS_254.xlsx"),
}

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


# --- xlsx (standard library only) ---------------------------------------------------------------------------------


def read_sheets(path: Path, wanted) -> dict[str, list[dict[str, str]]]:
    """Rows of the sheets whose name passes `wanted`, each row as {column letter: text}."""
    archive = zipfile.ZipFile(path)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in archive.namelist():
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall(f"{MAIN}si"):
            shared.append("".join(text.text or "" for text in item.iter(f"{MAIN}t")))
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {relation.get("Id"): relation.get("Target") for relation in relations}
    sheets: dict[str, list[dict[str, str]]] = {}
    for sheet in workbook.find(f"{MAIN}sheets"):
        name = sheet.get("name") or ""
        if not wanted(name):
            continue
        target = (targets[sheet.get(REL_ID)] or "").lstrip("/")
        target = target if target.startswith("xl/") else f"xl/{target}"
        rows = []
        for row in ET.fromstring(archive.read(target)).iter(f"{MAIN}row"):
            cells: dict[str, str] = {}
            for cell in row.findall(f"{MAIN}c"):
                value = cell.find(f"{MAIN}v")
                text = value.text if value is not None and value.text is not None else ""
                if cell.get("t") == "s" and text:
                    text = shared[int(text)]
                elif cell.get("t") == "inlineStr":
                    text = "".join(part.text or "" for part in cell.iter(f"{MAIN}t"))
                cells[re.sub(r"\d+", "", cell.get("r") or "")] = text
            rows.append(cells)
        sheets[name] = rows
    return sheets


def to_number(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


# --- ISPV -----------------------------------------------------------------------------------------------------------


UNIT_GROUP = re.compile(r"^\s*(\d{4})\s+(.+?)\s*$")


def parse_ispv(path: Path) -> dict[str, dict]:
    """CZ-ISCO 4-digit unit groups of sheet M8: employees (thousands), median and quartiles in CZK per month."""
    rows = next(iter(read_sheets(path, lambda name: name.endswith("-M8")).values()))
    groups: dict[str, dict] = {}
    for row in rows:
        match = UNIT_GROUP.match(row.get("A", ""))
        if not match:
            continue
        median = to_number(row.get("C", ""))
        if median is None:
            continue
        groups[match.group(1)] = {
            "name": re.sub(r"\s+", " ", match.group(2)),
            "employees": to_number(row.get("B", "")),
            "median": round(median),
            "q1": round(value) if (value := to_number(row.get("E", ""))) is not None else None,
            "q3": round(value) if (value := to_number(row.get("F", ""))) is not None else None,
        }
    return groups


def load_ispv() -> dict[int, dict[str, dict[str, dict]]]:
    """year -> sphere ('wage' | 'salary') -> CZ-ISCO -> figures."""
    years: dict[int, dict[str, dict[str, dict]]] = {}
    for year, (wage_file, salary_file) in ISPV_FILES.items():
        years[year] = {"wage": parse_ispv(ISPV_CACHE / wage_file), "salary": parse_ispv(ISPV_CACHE / salary_file)}
        if not years[year]["wage"]:
            sys.exit(f"ISPV {year}: no CZ-ISCO rows in {wage_file}")
    return years


# --- MF forecast ----------------------------------------------------------------------------------------------------


def load_mf_forecast() -> dict:
    """Nominal growth of the average wage per year, from table 3.3.1 (Trh práce – roční)."""
    rows = read_sheets(MF_FILE, lambda name: name.strip() == "T 3.3.1")["T 3.3.1"]
    header = next(row for row in rows if sum(1 for value in row.values() if re.fullmatch(r"20\d\d", value)) >= 5)
    year_columns = {column: int(value) for column, value in header.items() if re.fullmatch(r"20\d\d", value)}
    kind_row = next(row for row in rows if any(value in ("Predikce", "Výhled") for value in row.values()))
    start = next(index for index, row in enumerate(rows) if "Průměrná hrubá měsíční mzda" in row.values())
    nominal = next(index for index in range(start, len(rows)) if "Nominální" in rows[index].values())
    growth_row = rows[nominal + 1]
    if "růst v %" not in growth_row.values():
        sys.exit("MF table 3.3.1: growth row of the nominal average wage not found")
    growth = {}
    for column, year in sorted(year_columns.items(), key=lambda item: item[1]):
        kind = kind_row.get(column, "")
        value = to_number(growth_row.get(column, ""))
        if kind in ("Predikce", "Výhled") and value is not None:
            growth[str(year)] = {"growth": round(value, 1), "kind": "forecast" if kind == "Predikce" else "outlook"}
    if not growth:
        sys.exit("MF table 3.3.1: no forecast years found")
    return {"label": MF_LABEL, "url": MF_URL, "years": growth}


# --- NSP --------------------------------------------------------------------------------------------------------


RVP_CODE = re.compile(r"\b(\d{2}-\d{2}-[A-Z]/\d{2})\b")
ISCO_ROW = re.compile(r"^(\d{4})$")
# A whole group of programs, e.g. "23-xx-H/xx" (vocational engineering programs). "xx-xx-H/xx" (any program of the
# level) says nothing about the program and is not matched.
GROUP_CODE = re.compile(r"\b(\d{2}-(?:\d{2}|xx)-[A-Z]/xx)\b")
ALSO_SUITABLE = "Vhodnou školní přípravu poskytují také"
BARE_AMPERSAND = re.compile(r"&(?!#?\w+;)")


def docx_rows(path: Path) -> tuple[str, list[list[str]], str]:
    """Title, table rows (cell texts) and the whole text of a job-unit export."""
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    # Some exports contain a bare "&" (e.g. "T&T"), which is not well-formed XML.
    document = ET.fromstring(BARE_AMPERSAND.sub("&amp;", xml))
    body = document.find(f"{WORD}body")
    paragraphs = ["".join(text.text or "" for text in paragraph.iter(f"{WORD}t")) for paragraph in body.iter(f"{WORD}p")]
    title = next((text.strip() for text in paragraphs if text.strip()), "")
    rows = []
    for row in body.iter(f"{WORD}tr"):
        rows.append(["".join(text.text or "" for text in cell.iter(f"{WORD}t")).strip() for cell in row.findall(f"{WORD}tc")])
    return title, rows, "\n".join(paragraphs)


def parse_unit(path: Path) -> dict | None:
    title, rows, text = docx_rows(path)
    isco = next((cells[0] for cells in rows if cells and ISCO_ROW.match(cells[0])), None)
    if not title or not isco:
        return None
    # Programs listed before the "also suitable" heading prepare directly for the job.
    split = text.find(ALSO_SUITABLE)
    direct_text, also_text = (text, "") if split < 0 else (text[:split], text[split:])
    direct = set(RVP_CODE.findall(direct_text))
    also = set(RVP_CODE.findall(also_text)) - direct
    groups = set(GROUP_CODE.findall(text))
    qualification = next((cells[1] for cells in rows if len(cells) > 1 and cells[0].startswith("Kvalifikační úroveň")), "")
    return {"id": int(path.stem), "title": title, "isco": isco, "direct": sorted(direct), "also": sorted(also),
            "groups": sorted(groups), "qualification": qualification}


# Qualification wording NSP uses for the education a program ends with, by the level letter of the program code.
LEVEL_QUALIFICATIONS = {
    "M": "maturitní zkouškou",
    "L": "maturitní zkouškou",
    "H": "výučním listem",
    "E": "výučním listem",
}


def fits_level(unit: dict, code: str) -> bool:
    """Whether the job is meant for people with the program's education level (all jobs when NSP gives no level)."""
    wording = LEVEL_QUALIFICATIONS.get(code[6])
    return wording is None or not unit["qualification"] or wording in unit["qualification"]


def normalized(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().casefold()


# Programs whose best-matching NSP job falls in an unrelated CZ-ISCO group (reviewed by hand on 2026-11-20).
# A wrong wage misleads more than none, so these show no wage until the sources improve.
MISMATCHED_PROGRAMS = {
    "16-01-M/01": "Ekologie a životní prostředí -> teachers of vocational subjects",
    "26-41-L/51": "Mechanik elektrotechnik (nástavba) -> transport and logistics clerks",
    "28-42-L/51": "Chemik operátor (nástavba) -> sales and complaints clerks",
    "53-41-M/03": "Praktická sestra -> childcare workers",
    "75-41-E/01": "Pečovatelské služby -> university-level social work specialists",
    "82-41-M/17": "Multimediální tvorba -> purchasers",
    "82-42-M/01": "Konzervátorství a restaurátorství -> records and archive clerks",
    "82-51-L/01": "Uměleckořemeslné zpracování kovů -> toolmakers",
}

# Words in many program and job names that say nothing about the trade ("výroba", "práce", "služby", "technik", …).
GENERIC_STEMS = {"vyrob", "prace", "pracov", "sluzb", "provo", "zprac", "zbozi", "cinno", "prumy", "zariz", "techn",
                 "obecn", "prakt", "obslu", "pomoc", "zakla", "strojn", "vedou"}


def word_stems(name: str) -> set[str]:
    """First five letters of each longer word, without diacritics: "Zedník" and "zednické" share "zedni"."""
    plain = unicodedata.normalize("NFKD", name.casefold())
    plain = "".join(character for character in plain if not unicodedata.combining(character))
    return {word[:5] for word in re.findall(r"[a-z]{5,}", plain)} - GENERIC_STEMS


def program_names() -> dict[str, str]:
    """Program code -> name, from the school register export."""
    register = json.loads(SCHOOLS.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    for school in register["schools"]:
        for program in school["programs"]:
            names.setdefault(program["code"], program["name"])
    return names


def load_units() -> list[dict]:
    units = []
    for path in sorted(NSP_CACHE.glob("*.docx"), key=lambda item: int(item.stem)):
        try:
            unit = parse_unit(path)
        except (zipfile.BadZipFile, ET.ParseError, KeyError) as error:
            print(f"NSP {path.name}: {error}", file=sys.stderr)
            continue
        if unit:
            units.append(unit)
    return units


# --- assembly -------------------------------------------------------------------------------------------------------


def series_for(isco: str, ispv: dict[int, dict[str, dict[str, dict]]]) -> dict | None:
    """Yearly figures of one CZ-ISCO unit group in the sphere where most of its employees work."""
    latest = max(ispv)
    employees = {
        sphere: (ispv[latest][sphere].get(isco) or {}).get("employees") or 0.0 for sphere in ("wage", "salary")
    }
    sphere = "salary" if employees["salary"] > employees["wage"] else "wage"
    points = []
    name = None
    for year in sorted(ispv):
        row = ispv[year][sphere].get(isco)
        if row is None:
            continue
        name = row["name"]
        points.append({"year": year, **{key: row[key] for key in ("median", "q1", "q3", "employees")}})
    if not points or points[-1]["year"] != latest:
        return None
    return {"name": name, "sphere": sphere, "series": points}


def main() -> None:
    outlook = json.loads(OUTLOOK.read_text(encoding="utf-8"))
    program_codes = sorted(outlook["programs"])
    ispv = load_ispv()
    mf = load_mf_forecast()
    units = load_units()
    if len(units) < 1000:
        sys.exit(f"Only {len(units)} NSP job units parsed; run scripts/fetch-nsp-units.py first")

    direct_units: dict[str, list[dict]] = defaultdict(list)
    also_units: dict[str, list[dict]] = defaultdict(list)
    for unit in units:
        for code in unit["direct"]:
            direct_units[code].append(unit)
        for code in unit["also"]:
            also_units[code].append(unit)

    units_by_title: dict[str, list[dict]] = defaultdict(list)
    for unit in units:
        units_by_title[normalized(unit["title"])].append(unit)

    group_patterns: dict[str, list[dict]] = defaultdict(list)
    for unit in units:
        for pattern in unit["groups"]:
            group_patterns[pattern].append(unit)

    def group_units(code: str) -> list[dict]:
        """Units naming a whole program group that contains this program, the most specific pattern first."""
        group, field, level = code[:2], code[3:5], code[6]
        return group_patterns.get(f"{group}-{field}-{level}/xx") or group_patterns.get(f"{group}-xx-{level}/xx") or []

    occupations: dict[str, dict] = {}
    programs: dict[str, dict] = {}
    latest = max(ispv)
    names = program_names()
    for code in program_codes:
        # Gymnázia prepare for university, not for an occupation.
        if code[6] == "K" or code in MISMATCHED_PROGRAMS:
            continue

        def usable_units(candidates: list[dict]) -> list[dict]:
            # NSP keeps several versions of many units under the same title; each title counts once.
            unique = {normalized(unit["title"]): unit for unit in candidates if fits_level(unit, code)}
            return list(unique.values())

        # The follow-on occupations Infoabsolvent (NPI) lists for the program are NSP job units; NSP itself names the
        # programs that prepare best for each unit. Both lists are broad, so an occupation in both counts double.
        listed = usable_units([
            unit for name in outlook["programs"][code].get("occupations", []) for unit in units_by_title.get(normalized(name), [])
        ])
        direct = usable_units(direct_units.get(code, []))
        tier = 0
        usable = usable_units(listed + direct)
        if not usable:
            # Only related programs or the whole program group: weaker evidence, said so on the page.
            tier = 1
            usable = usable_units(also_units.get(code, [])) or usable_units(group_units(code))
        if not usable:
            continue
        listed_titles = {normalized(unit["title"]) for unit in listed}
        direct_titles = {normalized(unit["title"]) for unit in direct}
        name_stems = word_stems(names.get(code, ""))
        scores: Counter[str] = Counter()
        # A job named like the program ("Zedník" for Zedník) is its typical job, however many other jobs it lists.
        named: set[str] = set()
        for unit in usable:
            title = normalized(unit["title"])
            scores[unit["isco"]] += 1 + (title in listed_titles and title in direct_titles)
            if name_stems & word_stems(unit["title"]):
                named.add(unit["isco"])

        def weight(isco: str) -> tuple[bool, int, float]:
            employees = max((ispv[latest][sphere].get(isco) or {}).get("employees") or 0.0 for sphere in ("wage", "salary"))
            return isco in named, scores[isco], employees

        isco = max(scores, key=weight)
        if isco not in occupations:
            series = series_for(isco, ispv)
            # ISPV does not publish every unit group (e.g. photographers, hairdressers). Showing a weaker match
            # instead would mislead, so such programs get no wage.
            if series is None:
                continue
            occupations[isco] = series
        programs[code] = {
            "isco": isco,
            # Occupations named for the program itself, not only for related programs or its group.
            "direct": tier == 0,
            "units": [
                {"title": unit["title"], "url": NSP_UNIT_URL.format(id=unit["id"])}
                for unit in sorted(usable, key=lambda unit: (unit["isco"] != isco, unit["title"]))
            ][:6],
        }

    payload = {
        "fetchedAt": date.today().isoformat(),
        "sources": {
            "nsp": {"label": "Národní soustava povolání (MPSV)", "url": NSP_URL},
            "ispv": {"label": "ISPV – Informační systém o průměrném výdělku (MPSV)", "url": ISPV_URL},
            "mf": {"label": mf["label"], "url": mf["url"]},
        },
        "mfForecast": mf["years"],
        "occupations": dict(sorted(occupations.items())),
        "programs": programs,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    direct = sum(1 for program in programs.values() if program["direct"])
    print(f"{len(units)} NSP units, {len(programs)}/{len(program_codes)} programs with wages ({direct} direct), "
          f"{len(occupations)} occupations -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
