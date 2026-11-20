"""Download the public job-unit exports of Národní soustava povolání (nsp.cz/export/{id}/docx) into a local cache.

Each export lists the job unit's CZ-ISCO code, its current wages (ISPV) and the school programs (RVP codes) that
prepare for it. scripts/build-program-wages.py reads the cache. Missing ids are cached as empty marker files so a
re-run only fetches what is new.

Usage: python scripts/fetch-nsp-units.py [--max-id 4600] [--delay 0.5]
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "data-sources" / "nsp"
USER_AGENT = "vyberstredni-data-build/1.0"
EXPORT_URL = "https://nsp.cz/export/{id}/docx"
DOCX_MAGIC = b"PK"


def fetch(unit_id: int) -> bytes | None:
    request = urllib.request.Request(EXPORT_URL.format(id=unit_id), headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise
    # Unknown ids answer with the HTML front page instead of a document.
    return body if body.startswith(DOCX_MAGIC) else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-id", type=int, default=4600)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    fetched = found = 0
    for unit_id in range(1, args.max_id + 1):
        document = CACHE / f"{unit_id}.docx"
        missing = CACHE / f"{unit_id}.missing"
        if document.exists() or missing.exists():
            continue
        for attempt in range(3):
            try:
                body = fetch(unit_id)
                break
            except (urllib.error.URLError, TimeoutError) as error:
                print(f"{unit_id}: {error}, retrying", file=sys.stderr)
                time.sleep(5 * (attempt + 1))
        else:
            print(f"{unit_id}: giving up", file=sys.stderr)
            continue
        fetched += 1
        if body is None:
            missing.write_bytes(b"")
        else:
            document.write_bytes(body)
            found += 1
        if fetched % 250 == 0:
            print(f"{unit_id}: fetched {fetched}, documents {found}", flush=True)
        time.sleep(args.delay)
    print(f"done: fetched {fetched}, documents {found}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
