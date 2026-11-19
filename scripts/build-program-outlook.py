"""
Build src/data/program-outlook.json: how graduates of each currently offered program (obor) find work.

Source: Infoabsolvent.cz, run by the National Pedagogical Institute of the Czech Republic (NPI ČR).
  * Program card (https://www.infoabsolvent.cz/Obory/KartaOboru/<code>): the official "Uplatnění absolventů v oboru"
    text and the list of follow-on occupations ("Navazující povolání").
  * Graduate statistics for the education category + program group
    (https://www.infoabsolvent.cz/Obory/Sds/<category>/<group>/<code>): unemployment rate of fresh graduates
    registered at labour offices in April, for the category, the group and the individual programs.

The pages are HTML for people, so they are downloaded politely (one request per second, cached) and parsed with
the standard library. Numbers are stored raw; the verbal rating is derived in src/lib/program-outlook.ts.

Usage:
  python scripts/build-program-outlook.py [--cache-dir .cache/data-sources/infoabsolvent] [--refresh]
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOLS = ROOT / "src" / "data" / "official-schools.json"
OUT = ROOT / "src" / "data" / "program-outlook.json"
BASE_URL = "https://www.infoabsolvent.cz"
USER_AGENT = "vyberstredni-data-build/1.0"
REQUEST_DELAY = 1.0


def compact(code: str) -> str:
    """'65-51-H/01' -> '6551H01' (the form Infoabsolvent uses in URLs)."""
    return code.replace("-", "").replace("/", "")


def category_segment(code: str) -> str:
    """URL segment of the education category; L is split into L-0 (odborný výcvik) and L-5 (nástavba)."""
    level, suffix = code.split("-")[2].split("/")
    if level == "L":
        return "L-5" if suffix.startswith("5") else "L-0"
    return level


def card_url(code: str) -> str:
    return f"{BASE_URL}/Obory/KartaOboru/{compact(code)}"


def stats_url(code: str) -> str:
    return f"{BASE_URL}/Obory/Sds/{category_segment(code)}/{code[:2]}/{compact(code)}"


MISSING = "<!-- not found on Infoabsolvent -->"


def fetch(url: str, target: Path, *, refresh: bool) -> str:
    """Page HTML, or "" when Infoabsolvent has no such page (remembered in the cache as well)."""
    if target.exists() and not refresh:
        text = target.read_text(encoding="utf-8")
        return "" if text == MISSING else text
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}", file=sys.stderr)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        print(f"  not found: {url}", file=sys.stderr)
        text = MISSING
    partial = target.with_name(target.name + ".part")
    partial.write_text(text, encoding="utf-8")
    partial.replace(target)
    time.sleep(REQUEST_DELAY)
    return "" if text == MISSING else text


def clean(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", " ", fragment)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def parse_card(page: str) -> dict:
    """Official employment text and follow-on occupations from a program card."""
    employment = ""
    section = re.search(r"<h2>\s*Uplatnění absolventů v oboru\s*</h2>(.*?)</div>", page, re.S)
    if section:
        employment = " ".join(clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", section.group(1), re.S))
    occupations: list[str] = []
    listing = re.search(r"<div id='povolaniList'>(.*?)<div id='povolaniListNext'", page, re.S)
    if listing is None:
        listing = re.search(r"<div id='povolaniList'>(.*?)</div>", page, re.S)
    if listing:
        for item in re.findall(r"<li[^>]*>(.*?)</li>", listing.group(1), re.S):
            name = clean(item)
            if name and name not in occupations:
                occupations.append(name)
    return {"employment": employment, "occupations": occupations}


def number(value: str) -> float | None:
    value = clean(value).replace("%", "").replace(" ", "").replace(" ", "").replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def parse_stats(page: str) -> dict | None:
    """Unemployment table: first row = category, second = group, the rest = individual programs."""
    table = re.search(r"<table class=\"dStranka\">(.*?)</table>", page, re.S)
    if table is None:
        return None
    periods = [clean(cell) for cell in re.findall(r"<th rowspan='1'>(.*?)</th>", table.group(1), re.S)]
    rows = []
    for row in re.findall(r"<tr class=\"kt(?:Altern)?Row1\">(.*?)</tr>", table.group(1), re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 5:
            continue
        label = clean(cells[0])
        code_match = re.search(r"\((\d{2}-\d{2}-[A-Z]/\d{2})\)\s*$", label)
        rows.append({
            "label": re.sub(r"\s*\(\d{2}-\d{2}-[A-Z]/\d{2}\)\s*$", "", label),
            "code": code_match.group(1) if code_match else None,
            "graduates": number(cells[1]),
            "rate": number(cells[3]),
            "previousRate": number(cells[4]),
        })
    if len(rows) < 2:
        return None
    # Header cells: "duben 2026" (unemployed count), "duben 2026", "duben 2025" (rates), "změna".
    period = periods[1] if len(periods) > 1 else ""
    previous_period = periods[2] if len(periods) > 2 else ""
    return {"period": period, "previousPeriod": previous_period, "category": rows[0], "group": rows[1], "programs": rows[2:]}


def normalized(name: str) -> str:
    return re.sub(r"\s+", " ", name.replace("–", "-")).strip().casefold()


def rate_row(row: dict | None) -> dict | None:
    if row is None or row["rate"] is None:
        return None
    graduates = int(row["graduates"]) if row["graduates"] is not None else None
    return {"label": row["label"], "graduates": graduates, "rate": row["rate"], "previousRate": row["previousRate"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", default=str(ROOT / ".cache" / "data-sources" / "infoabsolvent"))
    parser.add_argument("--refresh", action="store_true", help="download all pages again")
    args = parser.parse_args()
    cache = Path(args.cache_dir)

    register = json.loads(SCHOOLS.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    for school in register["schools"]:
        for program in school["programs"]:
            if not program["isPhasingOut"]:
                names.setdefault(program["code"], program["name"])

    stats_by_page: dict[tuple[str, str], dict | None] = {}
    programs: dict[str, dict] = {}
    period = ""
    for code in sorted(names):
        card_page = fetch(card_url(code), cache / "cards" / f"{compact(code)}.html", refresh=args.refresh)
        card = parse_card(card_page)
        page_key = (category_segment(code), code[:2])
        if page_key not in stats_by_page:
            page = fetch(stats_url(code), cache / "stats" / f"{page_key[0]}_{page_key[1]}.html", refresh=args.refresh)
            stats_by_page[page_key] = parse_stats(page)
        stats = stats_by_page[page_key]

        unemployment = None
        if stats is not None:
            period = period or stats["period"]
            own = next((row for row in stats["programs"] if row["code"] == code), None)
            if own is None:
                own = next((row for row in stats["programs"] if row["code"] is None and normalized(row["label"]) == normalized(names[code])), None)
            # A group with a single program lists it without a code, with the group's numbers.
            if own is None and len(stats["programs"]) == 1 and stats["programs"][0]["code"] is None:
                own = stats["programs"][0]
            unemployment = {
                "period": stats["period"],
                "previousPeriod": stats["previousPeriod"],
                "program": rate_row(own),
                "group": rate_row(stats["group"]),
                "category": rate_row(stats["category"]),
            }

        programs[code] = {
            "employment": card["employment"],
            "occupations": card["occupations"],
            "cardUrl": card_url(code) if card_page else None,
            "statsUrl": stats_url(code) if unemployment else None,
            "unemployment": unemployment,
        }

    with_text = sum(1 for item in programs.values() if item["employment"])
    with_stats = sum(1 for item in programs.values() if item["unemployment"])
    with_own = sum(1 for item in programs.values() if item["unemployment"] and item["unemployment"]["program"])
    output = {
        "source": "Infoabsolvent.cz – Národní pedagogický institut České republiky (NPI ČR)",
        "sourceUrl": BASE_URL,
        "fetchedAt": date.today().isoformat(),
        "unemploymentPeriod": period,
        "programCount": len(programs),
        "programs": programs,
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(programs)} programs: {with_text} with employment text, {with_stats} with statistics "
          f"({with_own} with their own row)", file=sys.stderr)


if __name__ == "__main__":
    main()
