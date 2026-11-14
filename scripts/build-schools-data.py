"""
Build src/data/official-schools.json and src/data/towns.json for the whole Czech Republic.

Sources (all public, downloaded into a cache directory and treated as data only):
  * MŠMT school register, nationwide JSON-LD export (schools, components, programs, RÚIAN codes)
    https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld
  * MŠMT register directory export (phone, web, e-mail) – the "Export adresáře" button on https://isv.gov.cz/rssz/
  * ČÚZK RÚIAN map service (address point -> WGS84 coordinates)
  * Czech School Inspectorate open data (inspection reports per RED-IZO)
    https://opendata.csicr.cz/Transformation/Download/139/Distribution
  * CERMAT aggregated data per school: admissions (JPZ, 1st round) per program and the common part of the
    maturita exam per school. https://data.cermat.gov.cz/ (no explicit licence stated; credited as the source)

Usage:
  python scripts/build-schools-data.py [--cache-dir .cache/data-sources] [--refresh]

Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import csv
import re
import io
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

REGISTER_URL = "https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld"
DIRECTORY_URL = "https://isv.gov.cz/rssz/api/v1/sub/export/ADRESAR/CSV"
RUIAN_QUERY_URL = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/1/query"
INSPECTION_URL = "https://opendata.csicr.cz/Transformation/Download/139/Distribution"
CERMAT_YEAR = 2026
ADMISSION_URL = f"https://data.cermat.gov.cz/files/files/JPZ/agregovana_data_skoly/PZ{CERMAT_YEAR}_kolo1_skolobory_vysledky.xlsx"
MATURITA_URL = f"https://data.cermat.gov.cz/files/files/MZ/agregovana_data_skoly/MZ{CERMAT_YEAR}jap_SC_skolobory.xlsx"
ADMISSION_PAGE = "https://data.cermat.gov.cz/data-a-analyticke-vystupy-jednotna-prijimaci-zkouska/agregovana-data-jpz.html"
MATURITA_PAGE = "https://data.cermat.gov.cz/maturitni-zkouska/agregovana-data.html"

SCHOOL_KINDS = {"C00": "střední škola", "D00": "konzervatoř"}
FOUNDERS = {
    "1": "státní",
    "2": "obecní",
    "3": "jiný veřejný",
    "5": "soukromý",
    "6": "církevní",
    "7": "krajský",
}
USER_AGENT = "vyberstredni-data-build/1.0"

ROOT = Path(__file__).resolve().parent.parent
OUT_SCHOOLS = ROOT / "src" / "data" / "official-schools.json"
OUT_TOWNS = ROOT / "src" / "data" / "towns.json"
OUT_CERMAT = ROOT / "src" / "data" / "cermat.json"


def fetch(url: str, target: Path, *, refresh: bool, method: str = "GET", body: bytes | None = None) -> Path:
    if target.exists() and not refresh:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": USER_AGENT})
    if body is not None:
        request.add_header("Content-Type", "application/json")
    print(f"downloading {url}", file=sys.stderr)
    # Download to a temporary file first, so an interrupted transfer never leaves a truncated cache entry.
    partial = target.with_name(target.name + ".part")
    with urllib.request.urlopen(request, timeout=600) as response:
        partial.write_bytes(response.read())
    partial.replace(target)
    return target


def format_address(address: dict | None) -> str:
    if not address:
        return ""
    number = str(address.get("cisloDomovni") or "")
    if address.get("cisloOrientacni"):
        number += f"/{address['cisloOrientacni']}{address.get('dodatekOrientacnihoCisla') or ''}"
    street = address.get("ulice") or address.get("castObce") or address.get("obec") or ""
    first = f"{street} {number}".strip()
    town = address.get("cisloObvoduPrahy") or address.get("obec") or ""
    part = address.get("castObce")
    parts = [first]
    if part and part not in (street, address.get("obec")):
        parts.append(part)
    parts.append(f"{address.get('psc') or ''} {town}".strip())
    return ", ".join(p for p in parts if p)


def town_of(address: dict | None) -> str:
    """Town shown in the quiz: Prague districts separately ("Praha 5"), elsewhere the municipality."""
    if not address:
        return ""
    return address.get("cisloObvoduPrahy") or address.get("obec") or ""


def czech_date(value: str | None) -> str:
    if not value:
        return ""
    year, month, day = value[:10].split("-")
    return f"{day}.{month}.{year}"


def load_directory(path: Path) -> dict[str, dict[str, str]]:
    text = path.read_bytes().decode("utf-8-sig")
    rows = csv.DictReader(io.StringIO(text), delimiter=";")
    return {row["RED_IZO"]: row for row in rows if row.get("RED_IZO")}


def load_inspections(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_bytes().decode("utf-8-sig"))
    by_school: dict[str, list[dict]] = defaultdict(list)
    for row in data["rows"]:
        by_school[row["REDIZO"]].append(row)
    result = {}
    for red_izo, rows in by_school.items():
        latest = max(rows, key=lambda row: row.get("DatumDo") or row.get("DatumOd") or "")
        result[red_izo] = {
            "date": (latest.get("DatumDo") or latest.get("DatumOd") or "")[:10],
            "reportUrl": latest.get("LinkIZ") or "",
            "portalUrl": latest.get("PortalLink") or "",
            "count": len(rows),
        }
    return result


XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_xlsx(path: Path) -> list[dict[str, str]]:
    """Rows of the first sheet as {column letter: text}, using only the standard library."""
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(f"{XLSX_NS}t")) for si in root.findall(f"{XLSX_NS}si")]
        # Resolve the first sheet through workbook.xml and its relationships (file names are not guaranteed).
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        first_sheet = workbook.find(f"{XLSX_NS}sheets")[0]
        relation_id = first_sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(rel.get("Target") for rel in relations if rel.get("Id") == relation_id)
        sheet_path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        rows = []
        for _, element in ET.iterparse(archive.open(sheet_path)):
            if element.tag != f"{XLSX_NS}row":
                continue
            row = {}
            for cell in element.findall(f"{XLSX_NS}c"):
                column = re.match(r"[A-Z]+", cell.get("r") or "")
                value = cell.find(f"{XLSX_NS}v")
                inline = cell.find(f"{XLSX_NS}is")
                if not column:
                    continue
                if cell.get("t") == "s" and value is not None:
                    row[column.group(0)] = shared[int(value.text)]
                elif inline is not None:
                    row[column.group(0)] = "".join(t.text or "" for t in inline.iter(f"{XLSX_NS}t"))
                elif value is not None and value.text is not None:
                    row[column.group(0)] = value.text
            rows.append(row)
            element.clear()
        return rows


def by_header(rows: list[dict[str, str]], header_index: int) -> list[dict[str, str]]:
    """Re-key rows by the header row's names."""
    header = rows[header_index]
    return [{header.get(column, column): value for column, value in row.items()} for row in rows[header_index + 1:]]


def number(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "", "x") else None
    except ValueError:
        return None


def load_admissions(path: Path) -> dict[tuple[str, str], dict]:
    """JPZ 1st round per (IZO, program code): places, applications, admitted and percentiles of admitted."""
    rows = read_xlsx(path)
    required = {"IZO", "KKOV", "FORMA VZDĚLÁVÁNÍ", "ZKRÁCENÉ STUDIUM", "KAPACITA", "PŘIHLÁŠKY CELKEM", "PŘIJATÍ",
                "POVINNOST JPZ", "ČJ+MA - KONALI (PŘIJATI)", "ČJ+MA - PERCENTIL - PRŮMĚR (PŘIJATI)",
                "ČJ+MA - PERCENTIL - MIN (PŘIJATI)"}
    missing = required - set(rows[0].values())
    if missing:
        raise SystemExit(f"Unexpected admissions file layout, missing columns: {sorted(missing)}")
    groups: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for row in by_header(rows, 0):
        # Day study only ("den", "den2"); shortened study is for adults who already have a qualification.
        if not (row.get("FORMA VZDĚLÁVÁNÍ") or "").startswith("den") or row.get("ZKRÁCENÉ STUDIUM") == "ano":
            continue
        izo = (row.get("IZO") or "").removeprefix("izo_")
        if izo and row.get("KKOV"):
            groups[(izo, row["KKOV"])].append(row)
    result = {}
    for key, rows in groups.items():
        total = lambda column: int(sum(number(r.get(column)) or 0 for r in rows))
        weights = [(number(r.get("ČJ+MA - PERCENTIL - PRŮMĚR (PŘIJATI)")), number(r.get("ČJ+MA - KONALI (PŘIJATI)")) or 0) for r in rows]
        weighted = [(value, weight) for value, weight in weights if value is not None and weight > 0]
        minimums = [number(r.get("ČJ+MA - PERCENTIL - MIN (PŘIJATI)")) for r in rows]
        minimums = [value for value in minimums if value is not None]
        result[key] = {
            "capacity": total("KAPACITA"),
            "applications": total("PŘIHLÁŠKY CELKEM"),
            "admitted": total("PŘIJATÍ"),
            "entranceExam": any(r.get("POVINNOST JPZ") == "1" for r in rows),
            "percentileAvg": round(sum(v * w for v, w in weighted) / sum(w for _, w in weighted)) if weighted else None,
            "percentileMin": round(min(minimums)) if minimums else None,
        }
    return result


def group_label(name: str) -> str:
    """"SOŠ EKONOMICKÉ" -> "SOŠ ekonomické", "GYMNÁZIUM 4LETÉ" -> "Gymnázium 4leté"."""
    words = [word.upper() if word in ("soš", "sou") else word for word in name.lower().split()]
    text = " ".join(words)
    return text[:1].upper() + text[1:]


def load_maturita_raw(path: Path) -> dict:
    """
    Common part of the maturita per RED-IZO. Subject blocks repeat the same header names, so columns are read by
    letter (checked against the header row): N přihlášení, O konali, S podíl úspěšných, AB ČJ průměrný % skór,
    AH MA konali, AL MA průměrný % skór, AQ podíl volby MA, J/K skupina oborů (SMO16).
    """
    rows = read_xlsx(path)
    header = rows[1]
    expected = {"C": "TŘÍDĚNÍ", "E": "REDIZO", "J": "SMO16", "K": "SMO16 - NÁZEV", "N": "PŘIHLÁŠENI", "O": "KONALI",
                "P": "USPĚLI", "S": "PODÍL ÚSPĚŠNÝCH (%)", "AB": "PRŮMĚRNÝ % SKÓR", "AH": "KONALI", "AL": "PRŮMĚRNÝ % SKÓR",
                "AQ": "PODÍL VOLBY PŘEDMĚTU (%)"}
    for column, name in expected.items():
        if header.get(column) != name:
            raise SystemExit(f"Unexpected maturita file layout: column {column} is {header.get(column)!r}, expected {name!r}")
    if rows[0].get("W") != "ČESKÝ JAZYK" or rows[0].get("AG") != "MATEMATIKA":
        raise SystemExit("Unexpected maturita file layout: subject blocks moved")

    data = rows[2:]
    national = next((number(r.get("S")) for r in data if r.get("C") == "total"), None)
    sums: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for row in data:
        if row.get("C") == "kraj_smo16":
            sums[row.get("J") or ""][0] += number(row.get("P")) or 0
            sums[row.get("J") or ""][1] += number(row.get("N")) or 0
    national_group = {code: 100 * passed / registered for code, (passed, registered) in sums.items() if registered}

    def rounded(value: float | None, digits: int = 0):
        return None if value is None else round(value, digits) if digits else round(value)

    schools: dict[str, dict] = {}
    for row in data:
        red_izo = row.get("E")
        if not red_izo or red_izo == "x":
            continue
        entry = schools.setdefault(red_izo, {"groups": []})
        if row.get("C") == "redizo":
            math_takers = number(row.get("AH")) or 0
            entry.update({
                "registered": int(number(row.get("N")) or 0),
                "takers": int(number(row.get("O")) or 0),
                "successRate": rounded(number(row.get("S")), 1),
                "czechScore": rounded(number(row.get("AB"))),
                "mathScore": rounded(number(row.get("AL"))) if math_takers else None,
                "mathShare": rounded(number(row.get("AQ"))),
            })
        elif row.get("C") == "redizo_smo16":
            code = row.get("J") or ""
            if not number(row.get("N")):
                continue
            entry["groups"].append({
                "code": code,
                "label": group_label(row.get("K") or ""),
                "registered": int(number(row.get("N")) or 0),
                "successRate": rounded(number(row.get("S")), 1),
                "nationalSuccessRate": rounded(national_group.get(code), 1),
            })
    schools = {red_izo: entry for red_izo, entry in schools.items() if entry.get("registered")}
    for entry in schools.values():
        entry["groups"].sort(key=lambda group: -group["registered"])
    return {"schools": schools, "nationalSuccessRate": rounded(national, 1)}


def load_coordinates(codes: list[int], cache: Path, refresh: bool) -> dict[int, tuple[float, float]]:
    known: dict[int, tuple[float, float]] = {}
    if cache.exists() and not refresh:
        known = {int(k): tuple(v) for k, v in json.loads(cache.read_text(encoding="utf-8")).items()}
    missing = [code for code in sorted(set(codes)) if code not in known]
    for start in range(0, len(missing), 150):
        batch = missing[start:start + 150]
        params = urllib.parse.urlencode({
            "where": f"kod in ({','.join(str(code) for code in batch)})",
            "outFields": "kod",
            "outSR": "4326",
            "returnGeometry": "true",
            "f": "json",
        })
        request = urllib.request.Request(f"{RUIAN_QUERY_URL}?{params}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read())
        for feature in payload.get("features", []):
            geometry = feature.get("geometry") or {}
            if "x" in geometry and "y" in geometry:
                known[int(feature["attributes"]["kod"])] = (geometry["y"], geometry["x"])
        print(f"coordinates {min(start + 150, len(missing))}/{len(missing)}", file=sys.stderr)
        time.sleep(0.3)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({str(k): v for k, v in known.items()}), encoding="utf-8")
    return known


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", default=str(ROOT / ".cache" / "data-sources"))
    parser.add_argument("--refresh", action="store_true", help="download all sources again")
    args = parser.parse_args()
    cache = Path(args.cache_dir)

    register_path = fetch(REGISTER_URL, cache / "RSSZ-cela-CR.jsonld", refresh=args.refresh)
    directory_path = fetch(DIRECTORY_URL, cache / "adresar.csv", refresh=args.refresh, method="POST", body=b"{}")
    inspection_path = fetch(INSPECTION_URL, cache / "csi-inspekcni-zpravy.json", refresh=args.refresh)

    admission_path = fetch(ADMISSION_URL, cache / f"PZ{CERMAT_YEAR}_kolo1_skolobory_vysledky.xlsx", refresh=args.refresh)
    maturita_path = fetch(MATURITA_URL, cache / f"MZ{CERMAT_YEAR}jap_SC_skolobory.xlsx", refresh=args.refresh)
    admissions = load_admissions(admission_path)
    maturita = load_maturita_raw(maturita_path)

    register = json.loads(register_path.read_text(encoding="utf-8"))
    directory = load_directory(directory_path)
    inspections = load_inspections(inspection_path)

    raw: list[tuple[dict, dict]] = [
        (entity, component)
        for entity in register["list"]
        for component in entity.get("skolyAZarizeni") or []
        if component.get("druh") in SCHOOL_KINDS
    ]

    def location_address(entity: dict, component: dict) -> dict:
        """
        Where the school actually teaches. The legal seat is often just an office (private schools), and the list of
        places of teaching can start with a branch in another town (a Prague school with a branch in Brno), so:
        1. a single place of teaching is the school,
        2. with several places, take those in the seat's town; among them the one at the headmaster's (directory)
           or seat address, otherwise the first one,
        3. with places only outside the seat's town, the first of them (the seat is then just an office),
        4. without a usable place of teaching, the seat.
        """
        seat = entity.get("adresa") or {}
        places = [place.get("adresa") or {} for place in component.get("mistaVyuky") or []]
        places = [place for place in places if place.get("kodRUIAN")]
        if len(places) == 1:
            return places[0]
        local = [place for place in places if place.get("obec") == seat.get("obec")]
        if local:
            contact = directory.get(entity["redIzo"], {})
            wanted = {
                ((contact.get("Ulice") or "").strip().casefold(), (contact.get("Č. p.") or "").strip()),
                ((seat.get("ulice") or "").strip().casefold(), str(seat.get("cisloDomovni") or "")),
            }
            for place in local:
                if ((place.get("ulice") or "").strip().casefold(), str(place.get("cisloDomovni") or "")) in wanted:
                    return place
            return local[0]
        # No place of teaching in the seat's town: the school teaches elsewhere, the seat is just an office.
        if places:
            return places[0]
        return seat

    codes = [location_address(e, c).get("kodRUIAN") for e, c in raw]
    coordinates = load_coordinates([code for code in codes if code], cache / "ruian-coordinates.json", args.refresh)

    schools = []
    cermat_schools: dict[str, dict] = {}
    components_per_entity: dict[str, int] = defaultdict(int)
    for entity, _ in raw:
        components_per_entity[entity["redIzo"]] += 1
    program_count = active_count = 0
    for entity, component in raw:
        red_izo = entity["redIzo"]
        contact = directory.get(red_izo, {})
        place = location_address(entity, component)
        ruian = place.get("kodRUIAN")
        lat_lon = coordinates.get(int(ruian)) if ruian else None
        capacity = next(
            (str(item["nejvyssiPovolenyPocet"]) for item in component.get("kapacity") or [] if item.get("mernaJednotka") == "01"),
            "",
        )
        emails = [value.strip() for value in (contact.get("Email 1"), contact.get("Email 2"), *(entity.get("emaily") or [])) if value and value.strip()]
        programs = [
            {
                "code": program["kod"],
                "name": program["nazev"],
                "studyModeCode": program.get("formaVzdelavani") or "",
                "durationCode": program.get("delkaVzdelavani") or "",
                "languageCode": program.get("jazykOboru") or "",
                "capacity": program.get("kapacita"),
                "capacityUnitCode": program.get("mernaJednotkaKapacit"),
                "isPhasingOut": bool(program.get("dobihajiciObor")),
            }
            for program in component.get("obory") or []
        ]
        program_count += len(programs)
        active_count += sum(not program["isPhasingOut"] for program in programs)
        founder_code = str(entity.get("typZrizovatele") or "")
        schools.append({
            "id": f"msmt-{component['izo']}",
            "name": " ".join(entity["uplnyNazev"].split()),
            "region": entity["kraj"],
            "town": town_of(place) or town_of(entity.get("adresa")),
            "type": SCHOOL_KINDS[component["druh"]],
            "officialTypeCode": component["druh"],
            "redIzo": red_izo,
            "ico": entity.get("ico") or "",
            "izo": component["izo"],
            "founderCode": founder_code,
            "founder": FOUNDERS.get(founder_code, "jiný"),
            "address": format_address(place) or format_address(entity.get("adresa")),
            "capacity": capacity,
            "phone": (contact.get("Telefon") or "").strip(),
            "email": emails[0] if emails else "",
            "website": (contact.get("WWW") or "").strip(),
            "startedAt": czech_date(component.get("datumZahajeniCinnosti")),
            "ruian": str(ruian) if ruian else None,
            "latitude": lat_lon[0] if lat_lon else None,
            "longitude": lat_lon[1] if lat_lon else None,
            "inspection": inspections.get(red_izo),
            "programs": programs,
        })

        # CERMAT data lives in a separate file used only by the school detail page.
        school_id = f"msmt-{component['izo']}"
        admission_by_code = {
            program["code"]: admissions[(component["izo"], program["code"])]
            for program in programs
            # Day study ("10") of current programs only: CERMAT numbers are for day study.
            if program["studyModeCode"] == "10" and not program["isPhasingOut"]
            and (component["izo"], program["code"]) in admissions
        }
        school_maturita = maturita["schools"].get(red_izo)
        if admission_by_code or school_maturita:
            cermat_schools[school_id] = {
                "admission": admission_by_code,
                "maturita": school_maturita,
                # One legal entity with several school components shares one maturita record.
                "maturitaSharedByComponents": school_maturita is not None and components_per_entity[red_izo] > 1,
            }

    schools.sort(key=lambda school: (school["region"], school["name"], school["izo"]))
    export_date = register.get("datumVystupu") or date.today().isoformat()
    output = {
        "source": "https://isv.gov.cz/rssz/",
        "registerExport": REGISTER_URL,
        "exportedAt": export_date,
        "schoolCount": len(schools),
        "coordinateSource": RUIAN_QUERY_URL.rsplit("/query", 1)[0],
        "coordinateCount": sum(school["latitude"] is not None for school in schools),
        "inspectionSource": INSPECTION_URL,
        "inspectionCount": sum(school["inspection"] is not None for school in schools),
        "programSource": [REGISTER_URL],
        "programsExportedAt": export_date,
        "programCount": program_count,
        "activeProgramCount": active_count,
        "phasingOutProgramCount": program_count - active_count,
        "schools": schools,
    }
    # Compact: the file is bundled into the worker (admin seed) and imported by every prerendered page.
    OUT_SCHOOLS.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    cermat_output = {
        "year": CERMAT_YEAR,
        "admissionSource": ADMISSION_PAGE,
        "maturitaSource": MATURITA_PAGE,
        "nationalMaturitaSuccessRate": maturita["nationalSuccessRate"],
        "programsWithAdmission": sum(len(entry["admission"]) for entry in cermat_schools.values()),
        "schoolsWithMaturita": sum(entry["maturita"] is not None for entry in cermat_schools.values()),
        "schools": cermat_schools,
    }
    OUT_CERMAT.write_text(json.dumps(cermat_output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    # Towns for the quiz: every municipality (Prague by district) that has a school with coordinates.
    points: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for school in schools:
        if school["latitude"] is not None and school["town"]:
            points[(school["region"], school["town"])].append((school["latitude"], school["longitude"]))
    towns = [
        {
            # Same region names as the site (src/lib/regions.ts shortens Prague).
            "region": "Praha" if region == "Hlavní město Praha" else region,
            "name": name,
            "latitude": round(statistics.fmean(p[0] for p in values), 5),
            "longitude": round(statistics.fmean(p[1] for p in values), 5),
        }
        for (region, name), values in points.items()
    ]
    # Natural order, so "Praha 2" comes before "Praha 10".
    towns.sort(key=lambda town: (
        town["region"],
        [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", town["name"])],
    ))
    OUT_TOWNS.write_text(json.dumps(towns, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"schools {len(schools)}, with coordinates {output['coordinateCount']}, "
        f"with inspection {output['inspectionCount']}, programs {program_count}, towns {len(towns)}, "
        f"programs with admission data {cermat_output['programsWithAdmission']}, "
        f"schools with maturita {cermat_output['schoolsWithMaturita']}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
