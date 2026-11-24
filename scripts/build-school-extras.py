"""
Build src/data/school-extras.json: open days, admission details per program and social profiles of each school.

Sources:
  * Infoabsolvent.cz school card (https://www.infoabsolvent.cz/Skoly/Skola/<RED-IZO>), run by NPI ČR from what the
    schools report: "Den otevřených dveří" dates and, per program, the admission exams and "Jiná kritéria přijímání"
    (e.g. "body za prospěch" = points for school report grades).
  * The school's own website from the MŠMT register: links to its Facebook, Instagram, YouTube and TikTok profiles.

Pages are fetched politely (Infoabsolvent one request per second; school websites a few at a time, each host once)
and cached in .cache/data-sources/. Only facts are stored; wording for the pages is in src/lib/school-extras.ts.

Usage:
  python scripts/build-school-extras.py [--refresh] [--skip-social]
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOLS = ROOT / "src" / "data" / "official-schools.json"
OUT = ROOT / "src" / "data" / "school-extras.json"
CACHE = ROOT / ".cache" / "data-sources"
CARD_CACHE = CACHE / "infoabsolvent" / "schools"
WEB_CACHE = CACHE / "school-websites"
CARD_URL = "https://www.infoabsolvent.cz/Skoly/Skola/{red_izo}"
USER_AGENT = "vyberstredni-data-build/1.0"
REQUEST_DELAY = 1.0
MISSING = "<!-- not available -->"


def fetch(url: str, target: Path, *, refresh: bool, timeout: float = 30) -> str:
    """Cached GET. Failures are cached as MISSING so a re-run does not hammer a dead site."""
    if target.exists() and not refresh:
        return target.read_text(encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "cs"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(3_000_000)
            charset = response.headers.get_content_charset() or "utf-8"
        text = body.decode(charset, errors="replace")
    except (urllib.error.URLError, TimeoutError, ValueError, ConnectionError, OSError) as error:
        print(f"  {url}: {error}", file=sys.stderr)
        text = MISSING
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    return text


def clean(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", fragment)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t]+", " ", html.unescape(text)).strip()


# --- Infoabsolvent school card ------------------------------------------------------------------------------------

DATE = re.compile(r"\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b")
PROGRAM_CODE = re.compile(r'<span class="kodOboru">\s*(\d{2}-\d{2}-[A-Z]/\d{2,3})\s*</span>')
ADMISSION_BLOCK = re.compile(r'id="prijimacky\d+"(.*?)Přihlášky podejte do', re.S)
ROW = re.compile(r'<td class="popisek"><span[^>]*>(.*?)</span></td>\s*<td class="info">(.*?)</td>', re.S)
EXAMS = {
    "Ústní zkouška:": "oral",
    "Písemná zkouška:": "written",
    "Talentová zkouška:": "talent",
    "Praktická zkouška:": "practical",
}


def parse_open_days(page: str) -> dict | None:
    match = re.search(r'Den otevřených dveří:\s*</span>\s*<span class="data">(.*?)</span>', page, re.S)
    if not match:
        return None
    text = clean(match.group(1))
    dates = sorted({date(int(y), int(m), int(d)).isoformat() for d, m, y in DATE.findall(text) if 1 <= int(m) <= 12 and 1 <= int(d) <= 31})
    return {"text": text, "dates": dates}


def parse_admissions(page: str) -> dict[str, dict]:
    """Per program code: the school's own exams and other criteria (several study variants are merged)."""
    codes = [(match.start(), match.group(1)) for match in PROGRAM_CODE.finditer(page)]
    programs: dict[str, dict] = {}
    for block in ADMISSION_BLOCK.finditer(page):
        preceding = [code for position, code in codes if position < block.start()]
        if not preceding:
            continue
        code = preceding[-1]
        # criteria stays None when the card has no "Jiná kritéria" row: then nothing is known about grades.
        entry = programs.setdefault(code, {"unifiedExam": None, "exams": [], "criteria": None})
        for label, value in ROW.findall(block.group(1)):
            label = clean(label)
            text = clean(value)
            if label.startswith("Jednotná"):
                entry["unifiedExam"] = text or None
            elif label in EXAMS and text and text != "nekoná se" and EXAMS[label] not in entry["exams"]:
                entry["exams"].append(EXAMS[label])
            elif label.startswith("Jiná kritéria"):
                criteria = entry["criteria"] if entry["criteria"] is not None else []
                for item in (part.strip(" ;,") for part in text.split("\n")):
                    if item and item not in criteria:
                        criteria.append(item)
                entry["criteria"] = criteria
    return programs


# --- social profiles from school websites -------------------------------------------------------------------------

SOCIAL = {
    "facebook": re.compile(r"https?://(?:www\.|m\.|cs-cz\.)?facebook\.com/(?!sharer|share|plugins|dialog|tr\b|login|groups/?$|events|watch|photo|permalink)[^\s\"'<>?#]+", re.I),
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/(?!p/|reel/|explore|accounts|share)[A-Za-z0-9_.]+/?", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:@[^\s\"'<>/?#]+|channel/[^\s\"'<>/?#]+|c/[^\s\"'<>/?#]+|user/[^\s\"'<>/?#]+)", re.I),
    "tiktok": re.compile(r"https?://(?:www\.)?tiktok\.com/@[A-Za-z0-9_.]+", re.I),
}


def website_url(raw: str) -> str | None:
    raw = raw.strip().split()[0] if raw.strip() else ""
    if not raw:
        return None
    url = raw if raw.startswith("http") else f"https://{raw}"
    parsed = urllib.parse.urlparse(url)
    return url if parsed.netloc and "." in parsed.netloc else None


def social_links(page: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for network, pattern in SOCIAL.items():
        for match in pattern.finditer(html.unescape(page)):
            url = match.group(0).rstrip("/").replace("http://", "https://")
            if network == "facebook" and re.search(r"facebook\.com/(?:pages/?$|profile\.php$|people/?$)", url):
                continue
            found.setdefault(network, url)
            break
    return found


def fetch_socials(schools: list[dict], refresh: bool) -> dict[str, dict[str, str]]:
    def one(school: dict) -> tuple[str, dict[str, str]]:
        url = website_url(school.get("website", ""))
        if not url:
            return school["id"], {}
        page = fetch(url, WEB_CACHE / f"{school['id']}.html", refresh=refresh, timeout=20)
        return school["id"], {} if page == MISSING else social_links(page)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(pool.map(one, schools))
    # A profile linked from many schools belongs to their founder (a region, a church), not to the school.
    counts = Counter(url for links in results.values() for url in links.values())
    shared = {url for url, count in counts.items() if count > 2}
    return {school_id: {network: url for network, url in links.items() if url not in shared} for school_id, links in results.items()}


# --- main ------------------------------------------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--skip-social", action="store_true")
    args = parser.parse_args()
    register = json.loads(SCHOOLS.read_text(encoding="utf-8"))
    schools = register["schools"]

    cards: dict[str, dict] = {}
    for index, school in enumerate(schools, start=1):
        target = CARD_CACHE / f"{school['redIzo']}.html"
        cached = target.exists() and not args.refresh
        page = fetch(CARD_URL.format(red_izo=school["redIzo"]), target, refresh=args.refresh)
        if not cached:
            time.sleep(REQUEST_DELAY)
        if index % 100 == 0:
            print(f"{index}/{len(schools)} school cards", flush=True)
        if page == MISSING:
            continue
        cards[school["id"]] = {"openDays": parse_open_days(page), "admissions": parse_admissions(page)}

    socials = {} if args.skip_social else fetch_socials(schools, args.refresh)

    payload = {
        "fetchedAt": date.today().isoformat(),
        "sources": {
            "infoabsolvent": {"label": "Infoabsolvent.cz (NPI ČR)", "url": "https://www.infoabsolvent.cz/", "cardUrl": CARD_URL},
        },
        "schools": {
            school["id"]: {
                "redIzo": school["redIzo"],
                **cards.get(school["id"], {"openDays": None, "admissions": {}}),
                "social": socials.get(school["id"], {}),
            }
            for school in schools
        },
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    values = payload["schools"].values()
    print(
        f"{len(cards)} cards, {sum(1 for s in values if s['openDays'] and s['openDays']['dates'])} with open-day dates, "
        f"{sum(1 for s in values if any('prospěch' in c for a in s['admissions'].values() for c in (a['criteria'] or [])))} counting grades, "
        f"{sum(1 for s in values if s['social'])} with social profiles -> {OUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
