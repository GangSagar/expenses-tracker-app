#!/usr/bin/env python3
"""Create a private, unlabeled review worksheet from the local SMS export.

The output remains under the Git-ignored data/ directory. This script never
prints message bodies, senders, dates, IDs, or parser predictions.
"""

import argparse
import hashlib
import json
import random
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "extracted_messages.json"
OUTPUT = ROOT / "data" / "phase2-v2-evaluation-draft.json"
SEED = 20261027


def normalized_body(body: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", body).strip().casefold().split())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=100, help="maximum unique inbox messages to sample (default: 100)")
    parser.add_argument("--force", action="store_true", help="replace an existing local draft")
    args = parser.parse_args()

    if args.count < 1 or args.count > 500:
        parser.error("--count must be between 1 and 500")
    if not SOURCE.is_file():
        parser.error("local data/extracted_messages.json was not found")
    if OUTPUT.exists() and not args.force:
        parser.error("local evaluation draft already exists; use --force to replace it")

    records = json.loads(SOURCE.read_text(encoding="utf-8"))
    unique: dict[str, str] = {}
    for record in records:
        if record.get("type") != "INBOX":
            continue
        body = record.get("body")
        if not isinstance(body, str) or not body.strip():
            continue
        key = normalized_body(body)
        unique.setdefault(key, body)

    # Stable pseudo-random ordering avoids selecting only the earliest messages.
    candidates = list(unique.items())
    random.Random(SEED).shuffle(candidates)
    selected = candidates[: args.count]

    worksheet = []
    for index, (_, body) in enumerate(selected, start=1):
        worksheet.append({
            "id": f"DEV-DRAFT-{index:04d}",
            "message": body,
            "isTransaction": None,
            "expected": {
                "amount": None,
                "currency": None,
                "direction": None,
                "merchant": None,
                "category": None,
                "referencePresent": None,
            },
            "reviewStatus": "unreviewed",
        })

    OUTPUT.write_text(json.dumps(worksheet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created private evaluation draft with {len(worksheet)} unique inbox messages; no message content was printed.")
    print("Fill labels only after independent human review. The draft is not a sanitized test fixture.")


if __name__ == "__main__":
    main()
