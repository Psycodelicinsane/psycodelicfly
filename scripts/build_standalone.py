#!/usr/bin/env python3
"""Inline the app's local CSS and JavaScript into psycodelicmosca.html."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
OUTPUT = ROOT / "psycodelicmosca.html"


def inline_stylesheet(document: str) -> str:
    pattern = re.compile(r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*>', re.IGNORECASE)
    matches = list(pattern.finditer(document))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one local stylesheet link, found {len(matches)}")

    tag = matches[0].group(0)
    href_match = re.search(r'\bhref=["\']([^"\']+)["\']', tag, re.IGNORECASE)
    if not href_match:
        raise RuntimeError("Stylesheet link has no href")
    stylesheet_path = urlsplit(href_match.group(1)).path.lstrip("./")
    stylesheet = (ROOT / stylesheet_path).read_text(encoding="utf-8").rstrip()
    replacement = "<style>\n" + stylesheet + "\n    </style>"
    return document[: matches[0].start()] + replacement + document[matches[0].end() :]


def inline_scripts(document: str) -> str:
    pattern = re.compile(
        r"<script(?P<attrs>[^>]*)\bsrc=[\"'](?P<src>[^\"']+)[\"'](?P<tail>[^>]*)>\s*</script>",
        re.IGNORECASE | re.DOTALL,
    )

    def replace(match: re.Match[str]) -> str:
        src = match.group("src")
        parsed = urlsplit(src)
        if parsed.scheme or parsed.netloc:
            return match.group(0)
        script_path = parsed.path.lstrip("./")
        source = (ROOT / script_path).read_text(encoding="utf-8").rstrip()
        attrs = match.group("attrs") + match.group("tail")
        attrs = re.sub(r"\s+src=[\"'][^\"']+[\"']", "", attrs, flags=re.IGNORECASE)
        return (
            f"<script{attrs}>\n\n"
            f"// === {script_path} ===\n"
            f"{source}\n"
            "    </script>"
        )

    result, count = pattern.subn(replace, document)
    if count == 0:
        raise RuntimeError("No local script tags were inlined")
    return result


def main() -> None:
    document = INDEX.read_text(encoding="utf-8")
    document = inline_stylesheet(document)
    document = inline_scripts(document)
    with OUTPUT.open("w", encoding="utf-8", newline="\n") as output:
        output.write(document)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
