#!/usr/bin/env python3
"""Fail-fast integrity checks for the GitHub Pages artifact."""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
GIT_BLOB_LIMIT = 100 * 1024 * 1024
PAGES_RECOMMENDED_LIMIT = 1024 * 1024 * 1024


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for name, value in attrs:
            if name in {"src", "href", "poster"} and value:
                self.references.append(value)


def fail(message: str) -> None:
    raise AssertionError(message)


def resolve_local(html_file: Path, value: str) -> Path | None:
    if value.startswith(("#", "data:", "mailto:", "tel:", "javascript:", "//")):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    if parsed.path.startswith("/"):
        fail(f"Root-relative Pages URL in {html_file.relative_to(ROOT)}: {value}")
    relative = Path(unquote(parsed.path))
    if not relative.name:
        return None
    return (html_file.parent / relative).resolve()


def validate_reference(source: Path, reference: str, errors: list[str]) -> None:
    """Check one statically resolvable asset without allowing Pages-root escapes."""
    try:
        target = resolve_local(source, reference)
    except AssertionError as error:
        errors.append(str(error))
        return
    if target is None:
        return
    try:
        target.relative_to(SITE.resolve())
    except ValueError:
        errors.append(f"URL escapes site root in {source.relative_to(ROOT)}: {reference}")
        return
    # GitHub Pages serves index.html for native module directory routes.
    if target.is_dir() and urlsplit(reference).path.endswith("/"):
        target = target / "index.html"
    if not target.is_file():
        errors.append(f"Missing asset in {source.relative_to(ROOT)}: {reference}")


def main() -> int:
    required = [
        SITE / "index.html",
        SITE / "404.html",
        SITE / "manifest.webmanifest",
        SITE / "service-worker.js",
        SITE / "assets/js/main.js",
        SITE / "assets/js/backend.js",
        SITE / "assets/js/puzzle-bootstrap.js",
        SITE / "apps/puzzle.html",
        SITE / "data/course.json",
        SITE / "data/questions.json",
        SITE / "apps/career/entry.mjs",
        SITE / "apps/career/runtime.bundle.mjs",
        SITE / "apps/career/surface.html",
        SITE / "apps/career/module.css",
        SITE / "apps/governor/index.html",
        SITE / "apps/governor/platform-bridge.js",
        SITE / "apps/governor/platform-contract.js",
    ]
    missing_required = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing_required:
        fail(f"Missing required files: {missing_required}")

    html_errors: list[str] = []
    for html_file in SITE.rglob("*.html"):
        parser = AssetParser()
        parser.feed(html_file.read_text(encoding="utf-8"))
        for reference in parser.references:
            try:
                target = resolve_local(html_file, reference)
            except AssertionError as error:
                html_errors.append(str(error))
                continue
            if target is None:
                continue
            try:
                target.relative_to(SITE.resolve())
            except ValueError:
                html_errors.append(
                    f"URL escapes site root in {html_file.relative_to(ROOT)}: {reference}"
                )
                continue
            if not target.exists():
                html_errors.append(
                    f"Missing asset in {html_file.relative_to(ROOT)}: {reference}"
                )
    if html_errors:
        fail("\n".join(html_errors))

    json_files = list(SITE.rglob("*.json")) + list(SITE.rglob("*.geojson"))
    json_errors: list[str] = []
    for path in json_files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:  # noqa: BLE001 - include exact malformed file
            json_errors.append(f"{path.relative_to(ROOT)}: {error}")
    if json_errors:
        fail("Invalid JSON:\n" + "\n".join(json_errors))

    course = json.loads((SITE / "data/course.json").read_text(encoding="utf-8"))
    questions = json.loads((SITE / "data/questions.json").read_text(encoding="utf-8"))
    if len(course.get("topics", [])) != 8:
        fail("course.json must contain 8 topics")
    if len(questions) != 195:
        fail(f"questions.json must contain 195 questions, found {len(questions)}")
    if course.get("max_points") != 100:
        fail("course max_points must equal 100")
    if course.get("coursework_points", 0) + course.get("exam_points", 0) != 100:
        fail("coursework_points plus exam_points must equal 100")

    referenced_data_assets: set[str] = set()

    def collect_assets(value: object) -> None:
        if isinstance(value, dict):
            for nested in value.values():
                collect_assets(nested)
        elif isinstance(value, list):
            for nested in value:
                collect_assets(nested)
        elif isinstance(value, str) and value.startswith(("assets/", "apps/", "data/")):
            referenced_data_assets.add(value)

    collect_assets(course)
    collect_assets(questions)
    missing_data_assets = [
        value for value in sorted(referenced_data_assets) if not (SITE / value).is_file()
    ]
    if missing_data_assets:
        fail("Missing assets referenced by course/question data: " + ", ".join(missing_data_assets))

    manifest = json.loads((SITE / "manifest.webmanifest").read_text(encoding="utf-8"))
    if not str(manifest.get("start_url", "")).startswith("./"):
        fail("manifest start_url must stay relative for project Pages")
    if manifest.get("scope") != "./":
        fail("manifest scope must be './' for project Pages")

    module_errors: list[str] = []
    # Static imports, re-exports, side-effect imports and literal dynamic imports.
    # Bare package names and remote URLs are not filesystem references.
    import_pattern = re.compile(
        r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['\"])([./][^'\"]+)\1"
    )
    module_url_pattern = re.compile(
        r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+)\1\s*,\s*import\.meta\.url\s*\)"
    )
    scripts = sorted({
        script
        for folder in [SITE / "assets/js", SITE / "apps/career", SITE / "apps/governor"]
        for script in folder.rglob("*")
        if script.suffix in {".js", ".mjs"}
    })
    for script in scripts:
        source = script.read_text(encoding="utf-8")
        for _quote, specifier in import_pattern.findall(source):
            validate_reference(script, specifier, module_errors)
        for _quote, reference in module_url_pattern.findall(source):
            # A directory URL is a valid base for subsequent runtime URLs.
            if not reference.endswith("/"):
                validate_reference(script, reference, module_errors)

    css_url_pattern = re.compile(r"\burl\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
    career_styles = sorted((SITE / "apps/career").rglob("*.css"))
    for stylesheet in career_styles:
        for reference in css_url_pattern.findall(stylesheet.read_text(encoding="utf-8")):
            validate_reference(stylesheet, reference.strip(), module_errors)

    # A broken precache URL rejects service-worker installation as a whole.
    worker = SITE / "service-worker.js"
    worker_header = worker.read_text(encoding="utf-8").split("self.addEventListener", 1)[0]
    precache_paths = re.findall(r"['\"](\./[^'\"]+)['\"]", worker_header)
    for reference in precache_paths:
        validate_reference(worker, reference, module_errors)
    if module_errors:
        fail("\n".join(module_errors))

    municipal_maps = list((SITE / "assets/puzzle/data/municipal").glob("subject-*.geojson"))
    if len(municipal_maps) != 89:
        fail(f"Expected 89 municipal maps, found {len(municipal_maps)}")

    files = [path for path in SITE.rglob("*") if path.is_file()]
    oversize = [path for path in files if path.stat().st_size >= GIT_BLOB_LIMIT]
    if oversize:
        fail("Files exceed GitHub's 100 MiB blob limit: " + ", ".join(map(str, oversize)))
    site_bytes = sum(path.stat().st_size for path in files)
    if site_bytes >= PAGES_RECOMMENDED_LIMIT:
        fail(f"Pages artifact is too large: {site_bytes} bytes")

    report = {
        "html_files": len(list(SITE.rglob("*.html"))),
        "json_files": len(json_files),
        "questions": len(questions),
        "topics": len(course["topics"]),
        "validated_modules": len(scripts),
        "validated_career_styles": len(career_styles),
        "validated_precache_paths": len(precache_paths),
        "municipal_maps": len(municipal_maps),
        "site_files": len(files),
        "site_bytes": site_bytes,
        "status": "ok",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"Static validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
