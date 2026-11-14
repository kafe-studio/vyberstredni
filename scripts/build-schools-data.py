"""
Build src/data/official-schools.json and src/data/towns.json for the whole Czech Republic.

Sources (all public, downloaded into a cache directory and treated as data only):
  * MŠMT school register, nationwide JSON-LD export (schools, components, programs, RÚIAN codes)
    https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld
  * MŠMT register directory export (phone, web, e-mail) – the "Export adresáře" button on https://isv.gov.cz/rssz/
  * ČÚZK RÚIAN map service (address point -> WGS84 coordinates)
  * Czech School Inspectorate open data (inspection reports per RED-IZO)
    https://opendata.csicr.cz/Transformation/Download/139/Distribution

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
from collections import defaultdict
from datetime import date
from pathlib import Path

REGISTER_URL = "https://lkod-ftp.msmt.gov.cz/00022985/88a7c12b-6084-4e47-8b50-46097c6e683f/RSSZ-cela-CR.jsonld"
DIRECTORY_URL = "https://isv.gov.cz/rssz/api/v1/sub/export/ADRESAR/CSV"
RUIAN_QUERY_URL = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/1/query"
INSPECTION_URL = "https://opendata.csicr.cz/Transformation/Download/139/Distribution"

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


def fetch(url: str, target: Path, *, refresh: bool, method: str = "GET", body: bytes | None = None) -> Path:
    if target.exists() and not refresh:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": USER_AGENT})
    if body is not None:
        request.add_header("Content-Type", "application/json")
    print(f"downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(request, timeout=600) as response:
        target.write_bytes(response.read())
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
        f"with inspection {output['inspectionCount']}, programs {program_count}, towns {len(towns)}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
