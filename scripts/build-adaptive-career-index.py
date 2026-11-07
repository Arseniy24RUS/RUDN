#!/usr/bin/env python3
"""Build the seminar's reproducible, evidence-limited functional vacancy index.

The complete saved bank is joined to its immutable enriched detail snapshot by
the exact page, employer, content hashes and UUID. Functional recommendations
require a concrete subtask in the retained source text. Titles, departments,
employer names and group/reserve-context records never supply work features.

No live request is made.  The byte-checked bank seed, the small portal snapshot,
the existing position materials, the territory dictionary and the explicit
taxonomy are the complete inputs.  Employer names never create work features.
"""
from __future__ import annotations

import argparse
import base64
from collections import Counter, defaultdict, OrderedDict, deque
from bisect import bisect_right
from concurrent.futures import ProcessPoolExecutor
import gzip
import hashlib
import html
import io
import json
import multiprocessing
import os
from pathlib import Path, PurePosixPath
import re
import tarfile
import tempfile
import time
from typing import Any
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "site/apps/career"
VERSION = "2.0.0"
SCHEMA = 2
COLUMNS = ["id", "title", "scope", "region", "locality", "salaryFrom",
           "salaryTo", "announcedAt", "expiresAt", "state", "archive",
           "sourceURL", "education", "professionalExperience", "governmentExperience"]
MAX_ALL_RAW = 128 * 1024 * 1024
MAX_NATIONAL_RAW = 32 * 1024 * 1024
MAX_SHARD_RAW = 16 * 1024 * 1024
MAX_DETAIL_RAW = 4 * 1024 * 1024
EVIDENCE_WEIGHT = {"duties": 1.0, "skills": .85, "knowledge": .45, "functional-other": .75}
EVIDENCE_PRIORITY = {"knowledge": 2, "functional-other": 3, "skills": 4, "duties": 5}
PACKED_COLUMNS = ["id", "title", "department", "employer", "regionId", "location",
                  "profile", "evidenceLevel", "responsibilityLevel", "status", "archive",
                  "sourceURL", "sourcePath", "sourceType", "sourceRecordCount", "detailPath"]
PACKED_STRINGS = {"title", "department", "location", "sourceURL", "sourcePath", "detailPath"}
GENERATED_AUDIT_FILES = {"build-report.json", "source-members.json.gz"}
OVERLAP_PRECEDENCE = {"inspection": {"tax_revenue", "customs_control", "competition_regulation"},
                      "records_archives": {"court_support", "registration_records"}}


def encode(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False, sort_keys=True).encode("utf-8")


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def norm(value: Any) -> str:
    value = html.unescape(str(value or ""))
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value.casefold().replace("ё", "е")).strip()


def text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def safe_url(value: Any) -> str:
    value = text(value)
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        return ""
    return value


def canonical_url(value: Any) -> str:
    """Only URL spelling is normalised; different records on a list remain distinct."""
    value = safe_url(value)
    return value.rstrip("/")


def region_key(value: Any) -> str:
    return re.sub(r"[\s–—-]+", " ", re.sub(r"^г\.?\s*", "", norm(value))).strip()


def region_lookup(territories: list[dict]) -> dict[str, str]:
    lookup = {region_key(r["name"]): r["id"] for r in territories}
    # Explicit spelling aliases.  A missing or overseas place is never national.
    aliases = {"Кемеровская область": "ru-42", "Республика Адыгея": "ru-01",
               "Республика Татарстан": "ru-16", "Чувашская Республика": "ru-21",
               "Ханты-Мансийский автономный округ": "ru-86",
               "Республика Северная Осетия-Алания": "ru-15"}
    lookup.update({region_key(k): v for k, v in aliases.items()})
    return lookup


def source_region(value: Any, lookup: dict[str, str]) -> str | None:
    return lookup.get(region_key(value))


def location_region(value: Any, lookup: dict[str, str]) -> str | None:
    """Portal locations have an explicit region followed by a comma/locality."""
    raw = text(value)
    first = raw.split(",", 1)[0]
    return source_region(first, lookup)


def load_bank(seed: Path) -> tuple[dict, dict, dict[str, bytes]]:
    manifest_raw = (seed / "seed.json").read_bytes()
    manifest = json.loads(manifest_raw)
    if manifest.get("schemaVersion") != 1 or manifest.get("datasetSchemaVersion") != 2:
        raise ValueError("unsupported saved-bank seed")
    parts = []
    for entry in manifest["parts"]:
        name = entry["path"]
        if PurePosixPath(name).name != name:
            raise ValueError("unsafe seed part")
        raw = (seed / name).read_bytes()
        if len(raw) != entry["bytes"] or sha(raw) != entry["sha256"]:
            raise ValueError("seed part checksum mismatch: " + name)
        parts.append(raw)
    raw = b"".join(parts)
    if len(raw) != manifest["archiveBytes"] or sha(raw) != manifest["archiveSha256"]:
        raise ValueError("seed archive checksum mismatch")
    blobs = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        for member in archive:
            rel = PurePosixPath(member.name)
            if (not member.isfile() or rel.is_absolute() or ".." in rel.parts
                    or member.name in blobs or member.size > 2 * 1024 * 1024
                    or not (member.name == "summary.json" or
                            member.name.endswith(".json.gz") and rel.parts[0] in ("pages", "employers"))):
                raise ValueError("unsafe saved-bank member")
            payload = archive.extractfile(member).read()
            if len(payload) != member.size:
                raise ValueError("truncated saved-bank member")
            blobs[member.name] = payload
    inventory = [(name, sha(payload), len(payload)) for name, payload in blobs.items()]
    inventory.sort()
    tree = "".join(f"{name}\0{digest}\0{size}\n" for name, digest, size in inventory).encode()
    if len(blobs) != manifest["fileCount"] or sha(tree) != manifest["treeSha256"]:
        raise ValueError("saved-bank tree checksum mismatch")
    return manifest, json.loads(blobs["summary.json"]), blobs


def decode_bank(blobs: dict[str, bytes]) -> tuple[dict, list[tuple[dict, dict]]]:
    employers = {}
    for path in sorted(blobs):
        if not path.startswith("employers/"):
            continue
        d = json.loads(gzip.decompress(blobs[path]))
        if d.get("employerId"):
            # Prefer the exact source profile to an alias of that profile.
            current = employers.get(d["employerId"])
            if current is None or d["authorityId"] == d["employerId"]:
                employers[d["employerId"]] = d
    rows = []
    seen = set()
    for path in sorted(blobs):
        if not path.startswith("pages/"):
            continue
        payload = json.loads(gzip.decompress(blobs[path]))
        if payload.get("schemaVersion") != 2 or payload.get("columns") != COLUMNS:
            raise ValueError("unsupported bank page")
        employer_id = payload["employerId"]
        if employer_id not in employers:
            raise ValueError("missing source employer descriptor")
        employer = employers[employer_id]
        page_map = {p["path"]: (index, p) for index, p in enumerate(employer["pages"])}
        if path not in page_map:
            raise ValueError("page not declared by employer")
        page_index, descriptor = page_map[path]
        compressed = blobs[path]
        uncompressed = gzip.decompress(compressed)
        if (len(compressed) != descriptor["bytes"] or sha(compressed) != descriptor["sha256"]
                or len(uncompressed) != descriptor["uncompressedBytes"]
                or sha(uncompressed) != descriptor["uncompressedSHA256"]):
            raise ValueError("page integrity mismatch")
        for row_index, cells in enumerate(payload["rows"]):
            if len(cells) != len(COLUMNS):
                raise ValueError("malformed bank row")
            row = dict(zip(COLUMNS, cells))
            if row["id"] in seen:
                raise ValueError("duplicate bank UUID")
            seen.add(row["id"])
            row["_sourcePath"] = path
            row["_sourcePageIndex"] = page_index
            row["_sourceRowIndex"] = row_index
            rows.append((row, employer))
    return employers, rows


DETAIL_CATEGORIES = ("duties", "knowledge", "skills", "knowledgeDescription",
                     "additionalRequirements", "departmentLabels", "otherRequirements")
BASE_PAGE_RE = re.compile(r"^pages/[a-f0-9]{2}/[a-f0-9]{24}/p[0-9]{4}-[a-f0-9]{16}\.json\.gz$")
PART_PAGE_RE = re.compile(r"^pages/[a-f0-9]{2}/[a-f0-9]{24}/p[0-9]{4}-[a-f0-9]{16}\.part[0-9]{4}\.json\.gz$")
HEX_RE = re.compile(r"^[a-f0-9]{64}$")
MAX_SOURCE_GZIP = 4 * 1024 * 1024
MAX_SOURCE_RAW = 8 * 1024 * 1024


def same_ids(actual, expected):
    return len(actual) == len(expected) and len(set(actual)) == len(actual) and set(actual) == set(expected)


def validate_detail_pack(pack, binding, expected_ids=None):
    """Mirror career-vacancy-details.mjs identity checks, without a fuzzy join."""
    if expected_ids is None:
        expected_ids = binding["uuids"]
    if (not isinstance(pack, dict) or pack.get("schemaVersion") != 1
            or any(pack.get(key) != binding[key] for key in
                   ("baseTreeSHA", "basePage", "basePageSHA256", "employerId"))):
        raise ValueError("Source detail/base-page identity mismatch")
    if isinstance(pack.get("shards"), list):
        if pack.get("records") or pack.get("recordCount") != len(binding["uuids"]):
            raise ValueError("Invalid detail index")
        ids, paths = [], set()
        for part in pack["shards"]:
            if (not isinstance(part, dict) or not PART_PAGE_RE.fullmatch(part.get("path", ""))
                    or not part["path"].startswith(binding["basePage"][:-8] + ".part")
                    or part["path"] in paths or not isinstance(part.get("uuids"), list)
                    or not part["uuids"] or not HEX_RE.fullmatch(part.get("sha256", ""))
                    or not HEX_RE.fullmatch(part.get("uncompressedSHA256", ""))
                    or type(part.get("bytes")) is not int or not 18 <= part["bytes"] <= MAX_SOURCE_GZIP
                    or type(part.get("uncompressedBytes")) is not int
                    or not 1 <= part["uncompressedBytes"] <= MAX_SOURCE_RAW):
                raise ValueError("Invalid bound source-detail shard")
            paths.add(part["path"])
            ids.extend(part["uuids"])
        if not same_ids(ids, binding["uuids"]):
            raise ValueError("Detail index UUID coverage mismatch")
    elif not isinstance(pack.get("records"), dict) or not same_ids(list(pack["records"]), expected_ids):
        raise ValueError("Source detail UUID coverage mismatch")
    return pack


def hydrate_detail_record(pack, vacancy_id):
    """Keep each source token and locator verbatim; only resolve page strings."""
    original = pack.get("records", {}).get(vacancy_id)
    if not isinstance(original, dict):
        raise ValueError("Missing selected source record")
    result = {}
    for category in DETAIL_CATEGORIES:
        tokens = original.get(category, [])
        if not isinstance(tokens, list):
            raise ValueError("Invalid source text category")
        output = []
        for token in tokens:
            if (not isinstance(token, dict) or not isinstance(token.get("sourceField"), str)
                    or not isinstance(token.get("sourcePointer"), str)
                    or not token["sourcePointer"].startswith("/")):
                raise ValueError("Invalid source text locator")
            value = token.get("text")
            if "textIndex" in token:
                index, strings = token["textIndex"], pack.get("strings")
                if (pack.get("tokenEncoding") != "page-strings-v1" or not isinstance(strings, list)
                        or type(index) is not int or not 0 <= index < len(strings)):
                    raise ValueError("Invalid source string reference")
                value = strings[index]
            if not isinstance(value, str):
                raise ValueError("Invalid source text")
            output.append({**{key: val for key, val in token.items() if key != "textIndex"}, "text": value})
        result[category] = output
    return result


class DetailSnapshot:
    """Verified immutable source tree; hydrate one source pack at a time.

    The public .b64 files are transport wrappers around the canonical .json.gz
    tree. Both sizes/digests and the complete canonical tree digest are checked.
    Decompressed strings remain bounded to one original page/part (8 MiB).
    """
    def __init__(self, directory: Path, hosting: dict):
        self.directory = Path(directory)
        if (self.directory / "career-vacancy-details").is_dir():
            self.directory /= "career-vacancy-details"
        self.hosting = hosting
        if (hosting.get("schemaVersion") != 1 or hosting.get("encoding") != "base64-gzip"
                or not HEX_RE.fullmatch(hosting.get("treeSHA", ""))
                or not HEX_RE.fullmatch(hosting.get("baseTreeSHA", ""))):
            raise ValueError("Unsupported source detail hosting")
        self.inventory = {}
        self.read_paths = set()
        total_bytes = hosted_bytes = 0
        for file in sorted(self.directory.rglob("*")):
            if not file.is_file():
                continue
            rel = file.relative_to(self.directory).as_posix()
            if file.is_symlink() or not rel.endswith(".b64"):
                raise ValueError("Unsafe source detail member")
            path = rel[:-4] + ".json.gz"
            if not (BASE_PAGE_RE.fullmatch(path) or PART_PAGE_RE.fullmatch(path)):
                raise ValueError("Unsafe source detail path")
            wrapper = file.read_bytes()
            compressed = base64.b64decode(wrapper, validate=True)
            if not 18 <= len(compressed) <= MAX_SOURCE_GZIP:
                raise ValueError("Oversized source detail gzip")
            self.inventory[path] = {"sha256": sha(compressed), "bytes": len(compressed)}
            total_bytes += len(compressed)
            hosted_bytes += len(wrapper)
        tree = "".join(f"{path}\0{entry['sha256']}\0{entry['bytes']}\n"
                       for path, entry in sorted(self.inventory.items())).encode()
        if (len(self.inventory) != hosting["fileCount"] or total_bytes != hosting["bytes"]
                or sha(tree) != hosting["treeSHA"]):
            raise ValueError("Source detail tree checksum mismatch")
        self.stats = {"files": len(self.inventory), "gzipBytes": total_bytes,
                      "hostedBytes": hosted_bytes, "treeSHA": sha(tree)}

    def read(self, path, binding, descriptor=None, expected_ids=None):
        if path not in self.inventory:
            raise ValueError("Missing source detail member")
        canonical = self.inventory[path]
        if descriptor and any(descriptor[key] != canonical[key] for key in ("sha256", "bytes")):
            raise ValueError("Source detail shard byte binding mismatch")
        compressed = base64.b64decode((self.directory / (path[:-8] + ".b64")).read_bytes(), validate=True)
        if len(compressed) != canonical["bytes"] or sha(compressed) != canonical["sha256"]:
            raise ValueError("Source details changed during build")
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
            raw = stream.read(MAX_SOURCE_RAW + 1)
        if len(raw) > MAX_SOURCE_RAW:
            raise ValueError("Oversized source detail JSON")
        raw_sha = sha(raw)
        if descriptor and (len(raw) != descriptor["uncompressedBytes"] or raw_sha != descriptor["uncompressedSHA256"]):
            raise ValueError("Source detail uncompressed checksum mismatch")
        pack = validate_detail_pack(json.loads(raw), binding, expected_ids)
        self.read_paths.add(path)
        return pack, {"path": path, **canonical, "uncompressedBytes": len(raw), "uncompressedSHA256": raw_sha}

    def records_for_page(self, base_path, base_compressed, base_page):
        binding = {"baseTreeSHA": self.hosting["baseTreeSHA"], "basePage": base_path,
                   "basePageSHA256": sha(base_compressed), "employerId": base_page["employerId"],
                   "uuids": [row[0] for row in base_page["rows"]]}
        if (not BASE_PAGE_RE.fullmatch(base_path) or not binding["uuids"]
                or len(binding["uuids"]) > 250 or not same_ids(binding["uuids"], binding["uuids"])):
            raise ValueError("Invalid source base-page binding")
        root, root_ref = self.read(base_path, binding)
        source_packs = ((part["path"], part, part["uuids"]) for part in root["shards"]) if "shards" in root else [(base_path, None, binding["uuids"])]
        for path, descriptor, ids in source_packs:
            pack, ref = (root, root_ref) if path == base_path else self.read(path, binding, descriptor, ids)
            provenance = {"baseTreeSHA": binding["baseTreeSHA"], "basePage": base_path,
                          "basePageSHA256": binding["basePageSHA256"], "employerId": binding["employerId"],
                          "detailsTreeSHA": self.hosting["treeSHA"], "sourceHosting": self.hosting["collectionRoot"],
                          "detailPage": path, "gzipSHA256": ref["sha256"],
                          "uncompressedSHA256": ref["uncompressedSHA256"],
                          "sourceDatabaseSHA256": pack.get("sourceDatabaseSHA256") or root.get("sourceDatabaseSHA256"),
                          "sourceFields": pack.get("sourceFields") or root.get("sourceFields")}
            for vacancy_id in ids:
                yield vacancy_id, hydrate_detail_record(pack, vacancy_id), {
                    **provenance, "recordJSONPointer": "/records/" + vacancy_id}

    def assert_complete(self):
        if self.read_paths != set(self.inventory):
            raise ValueError("Unbound or unread source detail files")


def mandatory_literal_hints(pattern: str) -> set[str]:
    """A safe regex prefilter, never a replacement for the actual expression.

    A sequence must contain every mandatory literal run. A branch must contain
    at least one of the selected hints of each alternative. Optional repeats,
    lookarounds and unsupported constructs supply no hint. One guaranteed
    alternative set is enough: failure to find all its alternatives can reject
    this regex without changing its meaning. Short or uncertain cases fall
    back to evaluating the original regex.
    """
    from re import _parser as parser, _constants as constants

    def choose(sequence):
        options, literals = [], []

        def flush():
            if literals:
                literal = "".join(literals).casefold()
                # Python IGNORECASE has extra Unicode equivalences for Latin
                # i/s/k. Only Cyrillic runs are used as authoritative hints;
                # all other expressions keep the original matcher fallback.
                runs = re.findall(r"[а-я0-9 ]{3,}", literal)
                if runs:
                    options.append({max(runs, key=len)})
                literals.clear()

        for operator, value in sequence:
            if operator is constants.LITERAL:
                literals.append(chr(value))
                continue
            flush()
            hints = set()
            if operator is constants.SUBPATTERN:
                hints = choose(value[-1])
            elif operator in (constants.MAX_REPEAT, constants.MIN_REPEAT):
                if value[0] >= 1:
                    hints = choose(value[2])
            elif operator is constants.BRANCH:
                branches = [choose(branch) for branch in value[1]]
                if branches and all(branches):
                    hints = set().union(*branches)
            if hints:
                options.append(hints)
        flush()
        return max(options, key=lambda hints: (min(map(len, hints)), -len(hints)), default=set())

    return choose(parser.parse(pattern, re.IGNORECASE))


class Extractor:
    def __init__(self, taxonomy: dict):
        self.patterns = []
        self.parents = {}
        feature_ids = set()
        for facet in taxonomy["facets"]:
            self._add(facet["id"], facet["patterns"], feature_ids)
            for question in facet["questions"]:
                if not question.get("broad"):
                    self._add(question["id"], question.get("patterns", []), feature_ids)
                    self.parents[question["id"]] = facet["id"]
        self.cache = OrderedDict()
        self.token_cache = OrderedDict()
        self.token_cache_chars = 0
        self.hint_patterns = defaultdict(set)
        self.unfiltered_patterns = set()
        self.pattern_lookup, self.pattern_order = {}, {}
        for feature, patterns in self.patterns:
            for index, (pattern, _) in enumerate(patterns):
                key = (feature, index)
                self.pattern_order[key] = len(self.pattern_order)
                self.pattern_lookup[key] = patterns[index]
                hints = mandatory_literal_hints(pattern)
                if not hints:
                    self.unfiltered_patterns.add(key)
                for hint in hints:
                    self.hint_patterns[hint].add(key)
        hints = sorted(self.hint_patterns, key=lambda item: (-len(item), item))
        # Lookahead permits overlapping literal runs. Longest-first alternatives
        # can hide shorter prefixes, so a hit also enables every contained hint.
        self.hint_hits = {value: set().union(*(self.hint_patterns[short]
                            for short in hints if short in value)) for value in hints}
        self.hint_regex = re.compile("(?=(" + "|".join(re.escape(value) for value in hints) + "))") if hints else None

    def _add(self, feature_id: str, patterns: list[str], feature_ids: set):
        if feature_id in feature_ids or not patterns:
            raise ValueError("feature must have a unique id and explicit patterns: " + feature_id)
        feature_ids.add(feature_id)
        self.patterns.append((feature_id, [(p, re.compile(p, re.IGNORECASE)) for p in patterns]))

    def matches(self, value: str, prefilter: bool = True) -> list[tuple]:
        cleaned = norm(value)
        if not cleaned:
            return []
        cached = self.cache.get(cleaned) if prefilter else None
        if cached is not None:
            return cached
        possible = None
        if prefilter:
            possible = set(self.unfiltered_patterns)
            if self.hint_regex:
                for hit in self.hint_regex.finditer(cleaned):
                    possible.update(self.hint_hits[hit.group(1)])
        found, matched = [], set()
        keys = self.pattern_order if possible is None else sorted(possible, key=self.pattern_order.__getitem__)
        for key in keys:
            feature_id = key[0]
            if feature_id in matched:
                continue
            pattern, compiled = self.pattern_lookup[key]
            hit = next((candidate for candidate in compiled.finditer(cleaned)
                        if asserted_function(cleaned, candidate, feature_id)), None)
            if hit is not None:
                found.append((feature_id, pattern, hit.group(0), hit.start(), hit.end()))
                matched.add(feature_id)
        specific_domains = [(self.parents[hit[0]], hit[3], hit[4]) for hit in found if hit[0] in self.parents]
        found = [hit for hit in found if not any(
            domain in OVERLAP_PRECEDENCE.get(self.parents.get(hit[0], hit[0]), set())
            and hit[3] < end and start < hit[4] for domain, start, end in specific_domains)]
        if re.search(r"межбюджетн|бюджет(?:ам|у)\s+(?:субъект|муниципальн|городск|поселени|республик)|"
                     r"бюджет(?:ам|у)\s+[а-я-]+(?:\s+[а-я-]+)?\s+(?:област|кра[яю]|округ|федераци)|"
                     r"использован[а-я ]*муниципальн[а-я]*\s+образовани[а-я]*[^.;]{0,100}средств[^.;]{0,60}бюджет", cleaned):
            # An explicit budget recipient is an intergovernmental transfer,
            # not a second vote for a grant to a person or organisation.
            found = [hit for hit in found if self.parents.get(hit[0], hit[0]) != "grant_administration"]
        if re.search(r"в\s+качестве\s+представител|представля[а-я ]+интерес[а-я]*\s+[^.;]{0,40}суд", cleaned):
            found = [hit for hit in found if hit[0] != "court_support_4"]
            if not any(self.parents.get(hit[0]) == "court_support" for hit in found):
                found = [hit for hit in found if hit[0] != "court_support"]
        if prefilter:
            self.cache[cleaned] = found
            if len(self.cache) > 100000:
                self.cache.popitem(last=False)
        return found

    def analyze_token(self, value: str, source_field: str) -> list[dict]:
        key = (source_field, value)
        cached = self.token_cache.get(key)
        if cached is not None:
            return cached
        field = source_field
        features, evidence = {}, {}
        citation_quotes = normative_quote_ranges(value)
        for start, end, segment in source_segments(value):
            field = framed_category(segment, field)
            if common_qualification(segment) or source_placeholder(segment) or recruitment_instruction(segment):
                continue
            if source_field == "functional-other" and not work_action(segment):
                continue
            if field == "knowledge" and generic_knowledge(segment):
                continue
            matches = self.matches(segment)
            narrow_parents = {self.parents[fid] for fid, *_ in matches if fid in self.parents}
            if field == "knowledge":
                matches = [hit for hit in matches if hit[0] in self.parents or hit[0] in narrow_parents]
                citation_start = normative_citation_start(norm(segment))
                if citation_start is not None:
                    # A verb inside a cited act's title describes the act's
                    # subject, not this employee's task. A specialised method
                    # stated before a citation remains admissible knowledge.
                    matches = [hit for hit in matches if hit[3] < citation_start]
            if not matches:
                continue
            locate = normalized_locator(segment)
            for feature_id, pattern, match, match_start, match_end in matches:
                weight = EVIDENCE_WEIGHT[field]
                raw_start, raw_end = locate(match_start, match_end)
                if any(left <= start + raw_start and start + raw_end <= right for left, right in citation_quotes):
                    continue
                excerpt_start, excerpt_end = excerpt_bounds(segment, raw_start, raw_end)
                for target in (feature_id, self.parents.get(feature_id)):
                    if target is not None and weight > features.get(target, 0):
                        features[target] = weight
                        evidence[target] = {"featureId": target, "field": field, "inputField": source_field,
                                            "pattern": pattern, "match": match,
                                            "sourceSegmentStart": start, "sourceSegmentEnd": end,
                                            "sourceTextStart": start + excerpt_start,
                                            "sourceTextEnd": start + excerpt_end,
                                            "matchStart": start + raw_start, "matchEnd": start + raw_end,
                                            "sourceText": segment[excerpt_start:excerpt_end]}
                        if target != feature_id:
                            evidence[target]["viaSubtask"] = feature_id
        confirmed_parents = {self.parents[feature] for feature in evidence if feature in self.parents}
        result = [item for feature, item in evidence.items() if item["field"] != "knowledge"
                  or feature in self.parents or feature in confirmed_parents]
        # This cache is keyed by the entire exact token and its input category.
        # No source locator/index is cached: those are attached for each UUID.
        self.token_cache[key] = result
        self.token_cache_chars += len(value)
        while len(self.token_cache) > 30000 or self.token_cache_chars > 10000000:
            removed, _ = self.token_cache.popitem(last=False)
            self.token_cache_chars -= len(removed[1])
        return result

    def extract(self, title: str, department: str, duties: list[str], requirements: list[dict]) -> tuple[dict, str | None, list]:
        # Titles/units are metadata. Source content, including its own section
        # headings, is the only evidence of functions. A field named "duties"
        # may actually contain a qualification section and is handled as such.
        fields = [("duties", i, value) for i, value in enumerate(duties)]
        for i, requirement in enumerate(requirements):
            category = requirement["category"]
            if category in ("skills", "knowledge", "functional-other"):
                fields.append((category, i, requirement["sourceText"]))
        features, evidence = {}, {}
        for source_field, index, value in fields:
            for item in self.analyze_token(value, source_field):
                feature_id, field = item["featureId"], item["field"]
                weight = EVIDENCE_WEIGHT[field]
                if weight > features.get(feature_id, 0):
                    features[feature_id] = weight
                    evidence[feature_id] = {**item, "sourceIndex": index}
        strongest = max((item["field"] for item in evidence.values()), key=EVIDENCE_PRIORITY.__getitem__, default=None)
        level = "functional" if strongest == "functional-other" else strongest
        return features, level, list(evidence.values())


def source_segments(value: str):
    """Separate clauses/lists but keep line-wraps inside an original sentence.

    OCR and copied PDF text often wrap an action and its object onto different
    lines. Only blank paragraphs, list markers and sentence punctuation create
    boundaries; a lone line-wrap remains part of the verbatim source segment.
    """
    start = 0
    boundary = (r";+|\r?\n[ \t]*\r?\n+|"
                r"\r?\n(?=[ \t]*(?:[•●▪–—-]\s|\d+(?:\.\d+)*[.)]\s|[а-яА-Я][)]\s))|"
                r"(?<=[.!?])\s+(?=[А-ЯA-Zа-яa-z])")
    for match in re.finditer(boundary, value):
        if match.group(0).startswith(";") and re.search(r"&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*)$", value[max(0, match.start() - 40):match.start()]):
            continue
        if match.start() > start:
            yield start, match.start(), value[start:match.start()]
        start = match.end()
    if start < len(value):
        yield start, len(value), value[start:]


def normalized_spans(value: str) -> tuple[str, list[tuple[int, int]]]:
    """The same normalization as norm(), with original-character boundaries."""
    # Unescape first, including escaped tags, to mirror norm's exact order.
    chars, spans = [], []
    for token in re.finditer(r"&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);?|[\s\S]", value):
        decoded = html.unescape(token.group(0))
        for char in decoded:
            chars.append(char)
            spans.append((token.start(), token.end()))
    unescaped = "".join(chars)
    visible, bounds = [], []
    cursor = 0
    for tag in re.finditer(r"<[^>]+>", unescaped):
        visible.extend(chars[cursor:tag.start()])
        bounds.extend(spans[cursor:tag.start()])
        visible.append(" ")
        bounds.append((spans[tag.start()][0], spans[tag.end() - 1][1]))
        cursor = tag.end()
    visible.extend(chars[cursor:])
    bounds.extend(spans[cursor:])
    output, positions = [], []
    for char, bound in zip(visible, bounds):
        for folded in char.casefold().replace("ё", "е"):
            if folded.isspace():
                if output and output[-1] == " ":
                    positions[-1] = (positions[-1][0], bound[1])
                elif output:
                    output.append(" "); positions.append(bound)
            else:
                output.append(folded); positions.append(bound)
    if output and output[-1] == " ":
        output.pop(); positions.pop()
    return "".join(output), positions


def normalized_locator(value: str):
    """Map match boundaries without allocating one object per source character.

    Plain source text only changes case and whitespace, so word runs are exact
    affine mappings. HTML/entity or multi-character case folds retain the full
    normalization path above. Both return the same original slice boundaries.
    """
    folded = value.casefold().replace("ё", "е")
    if "&" in value or "<" in value or len(folded) != len(value):
        _, positions = normalized_spans(value)
        return lambda start, end: (positions[start][0], positions[end - 1][1])
    starts, runs = [], []
    cursor, previous_end = 0, None
    for word in re.finditer(r"\S+", folded):
        if previous_end is not None:
            starts.append(cursor); runs.append((previous_end, word.start(), False)); cursor += 1
        starts.append(cursor); runs.append((word.start(), word.end(), True))
        cursor += word.end() - word.start()
        previous_end = word.end()

    def locate(start, end):
        left, right = bisect_right(starts, start) - 1, bisect_right(starts, end - 1) - 1
        a, _, linear_a = runs[left]
        b, c, linear_b = runs[right]
        return (a + start - starts[left] if linear_a else a,
                b + end - starts[right] if linear_b else c)
    return locate


def excerpt_bounds(value: str, start: int, end: int, limit: int = 540) -> tuple[int, int]:
    if len(value) <= limit:
        return 0, len(value)
    remaining = max(0, limit - (end - start))
    left = max(0, start - min(150, remaining // 3))
    right = min(len(value), max(end, left + limit))
    left = max(0, right - limit) if right == len(value) else left
    if left > 0:
        boundary = re.search(r"\s", value[left:start])
        if boundary:
            left += boundary.end()
    if right < len(value):
        boundaries = list(re.finditer(r"\s", value[end:right]))
        if boundaries:
            right = end + boundaries[-1].start()
    return min(left, start), max(right, end)


def framed_category(value: str, previous: str) -> str:
    """Content headings override a mislabeled source field conservatively."""
    cleaned = norm(value)
    if re.search(r"(?:должностн[а-я ]+обязанност[а-я]*\s*[:]|обязан\s*[:]|обязанности\s*[:])", cleaned):
        return "duties"
    skill = re.search(r"(?:должен\s+(?:обладать\s+)?(?:уметь|навык)|(?:^|\s)(?:умения|навыки)\s*[:]|(?:^|\s)умение\s)", cleaned)
    knowledge = re.search(r"(?:должен\s+(?:обладать\s+(?:[а-я]+\s+){0,3})?(?:знать|знани)|(?:^|\s)знания\s*[:]|(?:^|\s)знани[ея]\s)", cleaned)
    if knowledge and (not skill or knowledge.start() < skill.start()):
        return "knowledge"
    if skill:
        return "skills"
    return previous


def generic_knowledge(value: str) -> bool:
    cleaned = norm(value)
    if re.match(r'^[«"]о(?:б)?\s', cleaned):
        return True
    if re.search(r"(?:знани[ея]|перечень|список)\s+нормативн[а-я ]+правов[а-я ]+акт", cleaned):
        return True
    return bool(re.search(
        r"(?:базов[а-я ]+знани|знани[а-я ]+основ\s+(?:информационн[а-я ]+безопасност|конституци)|"
        r"общ[а-я ]+принцип[а-я ]+функционировани[а-я ]+систем[а-я ]+электронн[а-я ]+документооборот|"
        r"поняти[а-я ,]+(?:норм[а-я ]+права|процедур[а-я ]+рассмотрени[а-я ]+обращени)|"
        r"функциональн[а-я ]+знани[а-я ]+при\s+нормативн[а-я -]+регулировани|"
        r"(?:^|\s)(?:основные\s+)?понятия\s+(?:нормы\s+права|обращения\s+граждан))", cleaned))


def recruitment_instruction(value: str) -> bool:
    return bool(re.search(r"(?:метод[а-я ]+оценки|конкурсн[а-я ]+комисси[а-я ]+оценива|"
                          r"оценк[а-я ]+(?:уровня\s+)?(?:владени[а-я ]+)?кандидат[а-я ]+(?:на\s+замещени|по\s+вакантн)|"
                          r"конкурс\s+заключается\s+в\s+оценке|для\s+оценки\s+знаний\s+и\s+умений|"
                          r"по\s+которой\s+формируется\s+кадровый\s+резерв|"
                          r"(?:^|\s)при\s+проведении\s+конкурса|в\s+случае\s+проведения\s+конкурса|"
                          r"самопроверк|тестов[а-я ]+вопрос[а-я ]+(?:размещ|представ)|"
                          r"собеседовани[а-я ]+с\s+кандидат[а-я ]+[^.;]{0,100}обязательн|"
                          r"право\s+на\s+участие\s+в\s+конкурсе|кандидат[а-я ]+предоставля|"
                          r"тестировани[а-я ]*[,;:]\s*(?:и\s+)?индивидуальн[а-я ]+собеседовани)", norm(value)))


LAW_NOUN = r"закон(?:а|у|ом|е|ы|ов|ам|ами|ах)?"
NORMATIVE_NAME = (r"(?:федеральн[а-я-]*\s+(?:конституционн[а-я-]*\s+)?" + LAW_NOUN + r"|"
                  r"(?:областн|краев|республиканск)[а-я-]*\s+" + LAW_NOUN + r"|" + LAW_NOUN + r"|"
                  r"(?:[а-я-]+(?:ый|ий|ой|ого|ему|ом|ая|ые|ых)\s+){0,2}кодекс[а-я-]*|"
                  r"устав(?:а|у|ом|е|ы|ов)?|конституци[а-я-]*|постановлени[а-я-]*|"
                  r"приказ[а-я-]*|распоряжени[а-я-]*|указ(?:а|ы|ов|ом|е)?)")
NORMATIVE_PREFIX = re.compile(r"^(?:\d+[.)]\s*|[а-я]\)\s*|[-•–—]\s*)*"
    r"(?:(?:должен\s+знать|знани[ея]|знать|основн[а-я]*\s+положени[а-я]*)\s*:?\s*)?"
    r"(?:" + NORMATIVE_NAME + r"\b|[n№]\s*\d)")
NORMATIVE_CITATION = re.compile(NORMATIVE_NAME + r"[^.;]{0,180}(?:\bот\s+\d{1,2}[.\s]|[№n]\s*\d)|"
                                + NORMATIVE_NAME + r'\s*[«“"]|' +
                                r"(?:^|\s)[n№]\s*\d[\d./-]*\s*[-–]?\s*(?:фз|фкз)")


def normative_citation_start(cleaned: str) -> int | None:
    prefix = NORMATIVE_PREFIX.search(cleaned)
    citation = NORMATIVE_CITATION.search(cleaned)
    starts = [match.start() for match in (prefix, citation) if match is not None]
    return min(starts) if starts else None


def normative_quote_ranges(value: str) -> list[tuple[int, int]]:
    """Keep legal-title scope across semicolons and copied line breaks."""
    result = []
    occupied = []
    for opening in re.finditer(r"[«“]", value):
        start = opening.start()
        if any(left <= start < right for left, right in occupied):
            continue
        closing = value.find("»" if opening.group() == "«" else "”", start + 1)
        if closing < 0:
            # Published source text occasionally mixes « with a closing ".
            closing = value.rfind('"', start + 1)
        end = closing + 1 if closing >= 0 else len(value)
        occupied.append((start, end))
    for quoted in re.finditer(r'"[^"\n]*"', value):
        if not any(left <= quoted.start() < right for left, right in occupied):
            occupied.append((quoted.start(), quoted.end()))
    for start, end in occupied:
        prefix = norm(value[max(0, start - 400):start])
        if normative_citation_start(prefix) is not None or re.search(NORMATIVE_NAME + r"\s*$", prefix):
            result.append((start, end))
    return result


def source_placeholder(value: str) -> bool:
    cleaned = norm(value).strip(" .:;–—-•()")
    return not cleaned or bool(re.fullmatch(
        r"(?:нет|отсутству[а-я]*|не (?:указан[а-я]*|предъявля[а-я ]*|требу[а-я ]*)|"
        r"(?:согласно|в соответствии с|в соответствие с) (?:должностн[а-я ]+(?:инструкци[а-я]*|регламент[а-я]*)|"
        r"положени[а-я ]+)|(?:должностн[а-я ]+(?:инструкци[а-я]*|регламент[а-я]*)))", cleaned))


def work_action(value: str) -> bool:
    """Additional requirements contribute only an explicit operational action."""
    return bool(re.search(r"(?:подготов|разработ|составл|провед|провод|обеспеч|осуществл|"
                          r"организаци|организов|контрол|провер|анализ|аналитич|мониторинг|"
                          r"расчет|формир|ведени|вести|администр|настро|сопровожд|"
                          r"рассмотрени|консультирован|представлени|управлени)", norm(value)))


def detail_requirements(detail: dict) -> list[dict]:
    """Qualification text is preserved, including locators and alternatives."""
    result = []
    categories = {"knowledge": "knowledge", "skills": "skills", "knowledgeDescription": "knowledge",
                  "additionalRequirements": "functional-other", "otherRequirements": "other"}
    education_fields = {"educationLevelName", "trainingTypes", "trainingTypesCollection",
                        "targetedTrainingEducationLevelName", "academicPerformanceRequirements"}
    experience_fields = {"governmentExperienceName", "professionalExperienceName"}
    for field, category in categories.items():
        for token_index, token in enumerate(detail.get(field, [])):
            if not token["text"].strip():
                continue
            current = category
            if field == "otherRequirements":
                current = "education" if token["sourceField"] in education_fields else "experience" if token["sourceField"] in experience_fields else "other"
            result.append({"category": current, "sourceText": token["text"],
                           "sourceCategory": field, "sourceTokenIndex": token_index,
                           **{key: val for key, val in token.items() if key != "text"}})
    return result


def asserted_function(value: str, hit: re.Match, feature_id: str) -> bool:
    """Reject explicit negation/delegation and routine user-level IT literacy.

    This deliberately small guard does not attempt semantic inference.  Its
    purpose is to avoid promoting plainly contrary source wording, e.g.
    'не программист, программисты другие будут делать', into a developer role.
    """
    # A stem is never allowed to begin inside another word: e.g. «ведения»
    # inside «сведения» does not assert maintaining a register. The taxonomy
    # intentionally permits Russian inflection at the right edge only.
    # Some bounded-acronym regexes include their leading delimiter. Inspect
    # the first word character rather than rejecting that explicit boundary.
    first_symbol = re.search(r"\w", hit.group(0))
    word_start = hit.start() + first_symbol.start() if first_symbol else hit.start()
    if word_start and (value[word_start - 1].isalnum() or value[word_start - 1] == "_"):
        return False
    # Reject a passive first action, not a passive object elsewhere in a real
    # duty. «Проведенных проверках» describes already performed inspections;
    # «проведение проверок представленных деклараций» is still active work.
    first_word = re.search(r"[а-яa-z][а-яa-z-]*", hit.group(0))
    if first_word and re.fullmatch(
            r"(?:(?:проведен|предоставлен|перераспределен|разработан|подготовлен|"
            r"составлен|оформлен|зарегистрирован|осуществлен|утвержден|выдан|"
            r"оказан|согласован|рассмотрен|направлен|представлен|установлен)"
            r"(?:н[а-я]*|о|а|ы)?|(?:проводим|разрабатываем|предоставляем|"
            r"осуществляем|рассматриваем)(?:ый|ая|ое|ые|ого|ой|ых|ому|ым|ыми|ую|ом|ою))",
            first_word.group(0)):
        return False
    before = value[max(0, hit.start() - 70):hit.start()]
    after = value[hit.end():hit.end() + 70]
    if first_word and first_word.group(0).startswith("учет") and re.search(r"(?:^|\s)с\s+$", before):
        # «С учетом сведений» means taking information into account, not
        # operating the accounts or register mentioned later in the sentence.
        return False
    if re.search(r"(?:орган[а-я]*|организаци[а-я]*)(?:\s*\([^)]*\))?\s+по\s+$", before):
        # A request recipient's specialised function is not the sender's job.
        return False
    if (first_word and re.match(r"(?:осуществляющ|проводящ|выполняющ|ведущ|обеспечивающ|"
                                r"предоставляющ|рассматривающ|регистрирующ|организующ)", first_word.group(0))
            and re.search(r"(?:орган[а-я]*|организаци[а-я]*|учреждени[а-я]*)\b[^.;]{0,50},\s*$", before)):
        # E.g. a transaction «в органе, осуществляющем регистрацию»: the
        # participle explicitly names the external agency as the actor.
        return False
    if (feature_id == "property_land_3"
            and re.search(r"(?:по\s+вопрос[а-я]*|сведения\s+о|информаци[а-я]*\s+о)\s+(?:[а-я]+\s+){0,3}$", before)):
        return False
    if (feature_id == "court_support_3"
            and re.search(r"(?:проверк[а-я]*|контрол[а-я]*)\s+(?:за\s+)?(?:своевременн[а-я]*\s+)?$", before)):
        return False
    if (feature_id in {"registration_records_2", "tax_revenue_2", "inspection_3"}
            and re.search(r"(?:(?:с\s+целью|в\s+целях|для)\s+(?:[а-я]+\s+){0,3}|"
                          r"(?:действи[а-я]*|мероприяти[а-я]*)[ ,]+связанн[а-я]*\s+с\s+|"
                          r"(?:до|после)\s+(?:начала\s+)?)$", before)):
        # Filing or preparatory activity for a later registration/check is
        # not a statement that this worker performs that later operation.
        return False
    if (feature_id == "registration_records_2" and re.search(
            r"(?:подгот[а-я]*|готов[а-я]*)\s+документ[а-я]*\s+и\s+обеспеч[а-я]*\s+$", before)):
        # The owner's preparation/submission of documents and ensuring a
        # later registration does not establish making registry decisions.
        return False
    if (feature_id in {"inspection_3", "tax_revenue_2"}
            and re.search(r"отбор[а-я]*[^.;]{0,50}(?:для\s+включени[а-я]*\s+в\s+план|в\s+план)", hit.group(0))):
        return False
    if ((feature_id.startswith("inspection") or feature_id == "tax_revenue_2")
            and re.search(r"контрол[а-я]*\s+(?:полноты|законности|своевременности)\s+"
                          r"(?:проводим|проведен)[а-я]*", hit.group(0))):
        # Legal review of somebody else's control measures is not evidence
        # that this employee personally performs those control measures.
        return False
    if (feature_id == "tax_revenue_2" and re.search(
            r"контрол[а-я]*\s+(?:полноты|законности|своевременности)\s+"
            r"(?:проводим|проведен)[а-я]*[^.;,]{0,40}\s+при\s*$", before)):
        return False
    if (feature_id.startswith("inspection") and first_word
            and re.match(r"(?:провер|контрол)", first_word.group(0))
            and re.search(r"(?:налогов|таможенн|антимонопольн)[а-я]*\s+$", before)):
        # Domain-qualified checks do not become generic inspection merely
        # because another specific match was rejected as passive wording.
        return False
    if (feature_id == "tax_revenue_2" and re.search(
            r"проведенн[а-я]*\s+(?:(?:выездн|камеральн)[а-я]*\s+)?налогов[а-я]*\s+проверк", hit.group(0))):
        # Collecting a debt after an already completed tax check does not
        # establish conducting that check. This is local to its object.
        return False
    if (feature_id == "tax_revenue_4" and "неналог" in hit.group(0)
            and not re.search(r"(?<![а-я])(?:налог[а-я]*|недоим[а-я]*)(?![а-я])", hit.group(0))):
        return False
    # Names of legislation can contain the same verbs as job tasks. Preserve
    # the citation in the source, but do not promote its quoted title to work.
    for quotation in re.finditer(r'«[^»]*»|“[^”]*”|"[^"]*"', value):
        if quotation.start() <= hit.start() and hit.end() <= quotation.end():
            if normative_citation_start(value[:quotation.start()]) is not None:
                return False
    if feature_id.startswith("digital_systems") and re.match(r"разработанн|разрабатываем", hit.group(0)):
        return False
    if (feature_id.startswith("integrity_compliance")
            and re.search(r"по\s+(?:его|своему|собственному)\s+заявлени[а-я ]+служебн[а-я ]+проверк", value)):
        return False
    if (feature_id.startswith("registration_records")
            and re.search(r"(?:контрол[а-я]*|надзор[а-я]*|регулировани[а-я]*)[^.;]{0,55}в\s+сфер[еа][^.;]*$", before)):
        # Supervising a registrar's field is not performing its registrations.
        return False
    left_clause = re.split(r"[.;!?]", before)[-1]
    if (re.search(r"\bне(?:\s+[а-я-]+){0,3}\s+$", left_clause)
            and not re.search(r"\bне\s+(?:только|менее|реже|позднее)\b", left_clause)):
        return False
    if re.search(r"\bбез(?:\s+(?:знани[а-я]*|навык[а-я]*|опыт[а-я]*|необходимост[а-я]*|требовани[а-я]*)){0,3}\s+$", left_clause):
        return False
    if re.search(r"^[а-я-]*\s+(?:другие|другим|сторонние|сторонним)\b", after):
        return False
    if re.search(r"^[а-я-]*\s+(?:занимаются|выполняют|делают|выполняться\s+будут)\s+другие\b", after):
        return False
    if re.search(r"^[а-я-]*\s+(?:не\s+требуется|не\s+требуются|не\s+нужно)\b", after):
        return False
    start = max(value.rfind(separator, 0, hit.start()) for separator in ".;!?") + 1
    ends = [value.find(separator, hit.end()) for separator in ".;!?"]
    end = min((point for point in ends if point >= 0), default=len(value))
    clause = value[start:end]
    if feature_id.startswith("information_security"):
        routine = re.search(r"соблюд[а-я]*[^.;]{0,100}(информационн[а-я]* безопасност|защит[а-я]*[^.;]{0,20}данн|персональн[а-я]* данн)", clause)
        technical = re.search(r"криптограф|кибер|несанкционирован|инцидент|средств[а-я]* защит|сзи|скзи|техническ[а-я]* защит|администрир|мониторинг[а-я]* сет", clause)
        if routine and not technical:
            return False
    if feature_id.startswith("digital_systems"):
        user_operation = re.search(r"пользовател|использовани[а-я]*|пользовани[а-я]*|работ[а-я]* (?:в|с) ", clause)
        technical = re.search(r"администрир|разработ|сопровожд|обновлен|внедрен|внедрени|настрой|настрои|программир|эксплуатац|архитектур|интеграц|техническ[а-я]* обслуживан", clause)
        if user_operation and not technical and not re.search(r"цифров[а-я]* трансформац", clause):
            return False
    return True


def common_qualification(value: str) -> bool:
    """Universal legal/office literacy alone does not identify a work function."""
    cleaned = norm(value)
    if NORMATIVE_PREFIX.search(cleaned):
        return True
    # Repeated civil-service competencies/obligations are not specific work.
    # Frequency alone never removes a genuine specialised recurring duty.
    if re.search(r"(?:умени[ея]\s+(?:мыслить\s+системно|управлять\s+изменениями|"
                 r"планировать,?\s+рационально\s+использовать\s+(?:служебное|рабочее)\s+время)|"
                 r"коммуникативные\s+умения|умени[ея]\s+по\s+применению\s+персонального\s+компьютера|"
                 r"знани[яе]\s+государственного\s+языка|"
                 r"(?:знания\s+и\s+умения|знания)\s+в\s+области\s+информационно-коммуникационных\s+технологий|"
                 r"умение\s+готовить\s+служебные\s+письма,?\s+включая\s+ответы\s+на\s+обращения|"
                 r"(?:беречь|сохранять)\s+государственное\s+имущество|"
                 r"поддерживать\s+уровень\s+квалификации|совершенствовать\s+свой\s+профессиональный\s+уровень|"
                 r"не\s+разглашать\s+сведения|сообщать\s+представителю\s+нанимателя\s+о\s+личной\s+заинтересованности)", cleaned):
        return True
    return bool(re.fullmatch(
        r"(?:знание |знания |знать |основные положения )?(?:конституци[яию].{0,170}|"
        r"федеральн[а-я ]+закон.{0,80}(?:79[ -]?фз|59[ -]?фз|273[ -]?фз).{0,170}|"
        r"(?:основы |правила )?(?:государственн[а-я ]+служб|служебн[а-я ]+распорядк|"
        r"делов[а-я ]+этикет|пользован[а-я ]+компьютер).{0,170})[.;]?[ ]*", cleaned))


def requirement_rows(values: Any) -> list[dict]:
    result = []
    if not isinstance(values, list):
        return result
    for source_index, value in enumerate(values):
        if not isinstance(value, dict) or not text(value.get("sourceText")):
            continue
        category = value.get("category", "other")
        if category == "skill":
            category = "skills"
        row = {"category": category, "sourceText": value["sourceText"], "sourceArrayIndex": source_index}
        for key in ("sourceLocator", "evidenceSourceUrl", "requirementState"):
            if value.get(key):
                row[key] = value[key]
        result.append(row)
    return result


def duty_rows(values: Any) -> list[str]:
    if isinstance(values, str):
        return [values] if values.strip() else []
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        raw = value if isinstance(value, str) else value.get("sourceText", "") if isinstance(value, dict) else ""
        if text(raw):
            result.append(raw)
    return result


def source_status(archive: Any, state: Any, expires: Any, snapshot_date: str) -> str:
    if archive is True or re.search(r"закрыт|архив|отмен[её]н|заверш[её]н|истек", norm(state)):
        return "archived"
    date = text(expires)[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) and date < snapshot_date:
        return "archived"
    # The data is a saved source observation, never a live vacancy guarantee.
    return "unconfirmed"


def formal_requirements(row: dict) -> list[dict]:
    result = []
    for key, cat, label in (("education", "education", ""),
                            ("professionalExperience", "experience", ""),
                            ("governmentExperience", "experience", "")):
        if text(row.get(key)):
            result.append({"category": cat, "sourceText": row[key], "sourceLocator": key})
    return result


def responsibility_level(title: str) -> str:
    """Only explicit role wording establishes management responsibility.

    Seniority words such as 'главный' do not make a specialist a manager.
    A head's assistant/adviser remains an individual contributor; the name
    of the head in a department or employer is never a responsibility signal.
    """
    value = re.sub(r"^\d+[.)]\s*", "", norm(title))
    # A compound title may state a second actual role after a dash.  Match
    # nominative role names, not the head mentioned in 'помощник руководителя'.
    segments = re.split(r"\s*[—–]\s*|\s+-\s+|;\s*|-(?=начальник|руководитель|директор|заместитель)", value)
    for segment in segments:
        if re.match(r"^(?:(?:первый|старший)\s+)?(?:заместитель|зам\.)\s+(?:начальника|руководителя|директора|министра|председателя|главного\s+бухгалтера|главы|заведующего)\b", segment):
            return "leadership"
        if re.match(r"^(?:начальник|руководитель|директор|министр|председатель|заведующий|заведующая|глава)\b", segment):
            return "leadership"
        if re.match(r"^главный\s+бухгалтер\b", segment):
            return "leadership"
    if re.match(r"^(?:(?:главн[а-я]*|ведущ[а-я]*|старш[а-я]*|младш[а-я]*|государственн[а-я]*|налогов[а-я]*|таможенн[а-я]*|муниципальн[а-я]*)\s+)*(?:консультант|специалист|инспектор|советник|секретарь|помощник|эксперт|референт|бухгалтер|программист|системный\s+администратор|инженер|экономист|аналитик|юрисконсульт|казначей|(?:судебный\s+)?пристав(?:[ -]исполнитель)?|архивариус)\b", value):
        return "specialist"
    return "unspecified"


def base_candidate(row_id: str, title: str, department: str, employer_id: str,
                   employer_name: str, region_id: str | None, location: str,
                   features: dict, level: str, status: str, archive: Any,
                   url: str, source_path: str, source_type: str) -> dict:
    return {"id": row_id, "title": title, "department": department,
            "employerId": employer_id, "employerName": employer_name,
            "regionId": region_id, "location": location, "features": features,
            "responsibilityLevel": responsibility_level(title),
            "evidenceLevel": level, "status": status, "archive": archive,
            "sourceURL": url, "sourcePath": source_path, "sourceType": source_type,
            "sourceRecordCount": 1}


def dump_compressed(out: Path, relative: str, value: Any, max_raw: int) -> dict:
    raw = encode(value)
    if len(raw) > max_raw:
        raise ValueError(f"{relative} exceeds decompressed limit: {len(raw)} > {max_raw}")
    zipped = gzip.compress(raw, compresslevel=9, mtime=0)
    path = out / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(zipped)
    return {"path": "data/adaptive-index/" + relative,
            "bytes": len(zipped), "uncompressedBytes": len(raw), "sha256": sha(zipped),
            "uncompressedSHA256": sha(raw)}


def verified_bank_pages(blobs: dict[str, bytes]):
    employers = {}
    for path in sorted(blobs):
        if not path.startswith("employers/"):
            continue
        descriptor = json.loads(gzip.decompress(blobs[path]))
        employer_id = descriptor.get("employerId")
        if employer_id and (employer_id not in employers or descriptor["authorityId"] == employer_id):
            employers[employer_id] = descriptor
    maps = {key: {entry["path"]: (index, entry) for index, entry in enumerate(value["pages"])}
            for key, value in employers.items()}
    for path in sorted(blobs):
        if not path.startswith("pages/"):
            continue
        compressed = blobs[path]
        raw = gzip.decompress(compressed)
        page = json.loads(raw)
        if page.get("schemaVersion") != 2 or page.get("columns") != COLUMNS:
            raise ValueError("Unsupported base bank page")
        employer_id = page["employerId"]
        if employer_id not in maps or path not in maps[employer_id]:
            raise ValueError("Base page not declared by exact employer")
        page_index, descriptor = maps[employer_id][path]
        if (len(compressed) != descriptor["bytes"] or sha(compressed) != descriptor["sha256"]
                or len(raw) != descriptor["uncompressedBytes"] or sha(raw) != descriptor["uncompressedSHA256"]):
            raise ValueError("Base page byte binding mismatch")
        rows = {}
        for index, cells in enumerate(page["rows"]):
            if len(cells) != len(COLUMNS) or cells[0] in rows:
                raise ValueError("Malformed or duplicate base record")
            rows[cells[0]] = (dict(zip(COLUMNS, cells)), index)
        yield path, compressed, page, employers[employer_id], page_index, rows


def packed_payload(rows: list[dict], version: str) -> dict:
    strings, employers, profiles = [], [], []
    string_ids, employer_ids, profile_ids = {}, {}, {}

    def string_index(value):
        if not isinstance(value, str):
            raise ValueError("Packed text must remain a string")
        if value not in string_ids:
            string_ids[value] = len(strings); strings.append(value)
        return string_ids[value]

    tuples = []
    for row in rows:
        employer = (row["employerId"], row["employerName"])
        if employer not in employer_ids:
            employer_ids[employer] = len(employers); employers.append(list(employer))
        profile_id = row["profileId"]
        if profile_id not in profile_ids:
            profile_ids[profile_id] = len(profiles)
            profiles.append({"id": profile_id, "features": row["features"]})
        cells = []
        for key in PACKED_COLUMNS:
            if key in PACKED_STRINGS:
                cells.append(string_index(row[key]))
            elif key == "employer":
                cells.append(employer_ids[employer])
            elif key == "profile":
                cells.append(profile_ids[profile_id])
            else:
                cells.append(row[key])
        tuples.append(cells)
    return {"schemaVersion": SCHEMA, "version": version, "encoding": "career-candidates-dictionary-v1",
            "columns": PACKED_COLUMNS,
            "dictionaries": {"strings": strings, "employers": employers, "profiles": profiles}, "rows": tuples}


def unpack_payload(payload: dict) -> list[dict]:
    """Reference decoder for integrity tests; the browser validates separately."""
    if (payload.get("schemaVersion") != SCHEMA or payload.get("encoding") != "career-candidates-dictionary-v1"
            or payload.get("columns") != PACKED_COLUMNS):
        raise ValueError("Unsupported packed candidate schema")
    dictionaries = payload["dictionaries"]
    rows = []
    for cells in payload["rows"]:
        if len(cells) != len(PACKED_COLUMNS):
            raise ValueError("Invalid packed tuple width")
        row = {}
        for key, value in zip(PACKED_COLUMNS, cells):
            if key in PACKED_STRINGS:
                row[key] = dictionaries["strings"][value]
            elif key == "employer":
                row["employerId"], row["employerName"] = dictionaries["employers"][value]
            elif key == "profile":
                profile = dictionaries["profiles"][value]
                row["profileId"], row["features"] = profile["id"], profile["features"]
            else:
                row[key] = value
        rows.append(row)
    return rows


def public_evidence(evidence: list[dict], duties: list[str], requirements: list[dict],
                    source_detail: dict | None = None, vacancy_id: str = "", position_index: int | None = None,
                    source_position: dict | None = None) -> list[dict]:
    result = []
    for item in evidence:
        index = item["sourceIndex"]
        if item["inputField"] == "duties":
            value = duties[index]
            token = source_detail["duties"][index] if source_detail is not None else {}
            source_category, source_index = "duties", index
            field = token.get("sourceField", "duties")
            pointer = token.get("sourcePointer")
            if pointer is None:
                original = source_position.get("duties", []) if source_position else []
                if isinstance(original, str):
                    pointer = f"/positions/{position_index}/duties"
                else:
                    originals = [(i, item) for i, item in enumerate(original)
                                 if text(item if isinstance(item, str) else item.get("sourceText", "") if isinstance(item, dict) else "")]
                    actual_index, actual = originals[index] if index < len(originals) else (index, {})
                    pointer = f"/positions/{position_index}/duties/{actual_index}" + ("" if isinstance(actual, str) else "/sourceText")
        else:
            token = requirements[index]
            value = token["sourceText"]
            source_category = token.get("sourceCategory", "requirements")
            source_index = token.get("sourceTokenIndex", index)
            field = token.get("sourceField", "requirements")
            pointer = token.get("sourcePointer", f"/positions/{position_index}/requirements/{token.get('sourceArrayIndex', index)}/sourceText")
        if value[item["sourceTextStart"]:item["sourceTextEnd"]] != item["sourceText"]:
            raise ValueError("Evidence is not an exact source substring")
        if norm(value[item["matchStart"]:item["matchEnd"]]) != item["match"]:
            # Entity boundaries can include neighbouring decoded characters;
            # the complete excerpt must still retain the asserted match.
            if not re.search(item["pattern"], norm(item["sourceText"]), re.IGNORECASE):
                raise ValueError("Evidence match is absent from exact excerpt")
        category = "skills" if item["field"] == "functional-other" else item["field"]
        entry = {"featureId": item["featureId"], "category": category, "sourceText": item["sourceText"],
                 "sourcePointer": pointer, "sourceField": field,
                 "sourceTextStart": item["sourceTextStart"], "sourceTextEnd": item["sourceTextEnd"],
                 "matchStart": item["matchStart"], "matchEnd": item["matchEnd"],
                 "pattern": item["pattern"], "match": item["match"]}
        if source_detail is not None:
            entry["snapshotPointer"] = f"/records/{vacancy_id}/{source_category}/{source_index}"
        for key in ("sourceNamespace", "sourceProvenance", "sourceLocator", "evidenceSourceUrl", "representation"):
            if token.get(key):
                entry[key] = token[key]
        if item.get("viaSubtask"):
            entry["viaSubtask"] = item["viaSubtask"]
        result.append(entry)
    return result


_WORKER_EXTRACTOR = None
_WORKER_SNAPSHOT = None


def init_classification_worker(taxonomy: dict, snapshot: DetailSnapshot):
    global _WORKER_EXTRACTOR, _WORKER_SNAPSHOT
    _WORKER_EXTRACTOR = Extractor(taxonomy)
    _WORKER_SNAPSHOT = snapshot


def classify_source_page(task: tuple) -> dict:
    """Pure source-page work; the parent consumes results in base-page order."""
    path, compressed, page, rankable = task
    extractor, snapshot = _WORKER_EXTRACTOR, _WORKER_SNAPSHOT
    source_rows = {cells[0]: dict(zip(COLUMNS, cells)) for cells in page["rows"]}
    records, read_paths = [], {path}
    raw_rows, nonplaceholder, token_counts, field_counts = Counter(), Counter(), Counter(), Counter()
    for vacancy_id, detail, reference in snapshot.records_for_page(path, compressed, page):
        read_paths.add(reference["detailPage"])
        for category in DETAIL_CATEGORIES:
            nonempty = [token for token in detail[category] if token["text"].strip()]
            raw_rows[category] += bool(nonempty)
            nonplaceholder[category] += any(not source_placeholder(token["text"]) for token in nonempty)
            token_counts[category] += len(nonempty)
            field_counts.update(category + "|" + token["sourceField"] for token in nonempty)
        duties = [token["text"] for token in detail["duties"]]
        requirements = detail_requirements(detail)
        features, level, evidence = extractor.extract("", "", duties, requirements)
        specific = bool(set(features) & set(extractor.parents))
        bank = source_rows[vacancy_id]
        eligible = rankable and bank["scope"] == "individual-role" and specific
        departments = list(dict.fromkeys(token["text"] for token in detail["departmentLabels"]
                                         if token["text"].strip() and not source_placeholder(token["text"])))
        records.append({"id": vacancy_id, "features": features, "level": level, "specific": specific,
                        "departments": departments, "reference": reference,
                        "categories": sorted({item["field"] for item in evidence}),
                        "subtaskCategories": sorted({item["field"] for item in evidence if item["featureId"] in extractor.parents}),
                        "evidence": public_evidence(evidence, duties, requirements, detail, vacancy_id) if eligible else []})
    return {"records": records, "readPaths": sorted(read_paths), "sourceCategoryRows": dict(raw_rows),
            "sourceNonPlaceholderCategoryRows": dict(nonplaceholder), "sourceTokenCounts": dict(token_counts),
            "sourceFieldTokenCounts": dict(field_counts)}


def classified_bank_pages(blobs: dict, taxonomy: dict, snapshot: DetailSnapshot, workers: int):
    pages = iter(verified_bank_pages(blobs))
    if workers == 1:
        init_classification_worker(taxonomy, snapshot)
        for page in pages:
            yield page, classify_source_page((page[0], page[1], page[2], page[3].get("rankable") is True))
        return
    context = multiprocessing.get_context("fork" if "fork" in multiprocessing.get_all_start_methods() else "spawn")
    with ProcessPoolExecutor(max_workers=workers, mp_context=context,
                             initializer=init_classification_worker, initargs=(taxonomy, snapshot)) as pool:
        pending = deque()

        def submit_next():
            page = next(pages, None)
            if page is None:
                return False
            task = (page[0], page[1], page[2], page[3].get("rankable") is True)
            pending.append((page, pool.submit(classify_source_page, task)))
            return True

        for _ in range(workers * 2):
            if not submit_next():
                break
        while pending:
            page, future = pending.popleft()
            result = future.result()
            snapshot.read_paths.update(result["readPaths"])
            submit_next()
            yield page, result


def build(root: Path, out: Path, audit_out: Path, details_root: Path, progress_path: Path | None = None, workers: int = 4) -> dict:
    app = root / "site/apps/career"
    started = time.monotonic()
    source_pins = []

    def progress(stage: str, **values):
        payload = {"stage": stage, "elapsedSeconds": round(time.monotonic() - started, 1), **values}
        print(json.dumps(payload, ensure_ascii=False), flush=True)
        if progress_path:
            progress_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = progress_path.with_name(progress_path.name + ".tmp")
            temporary.write_bytes(encode(payload))
            temporary.replace(progress_path)

    def load(path: Path) -> Any:
        raw = path.read_bytes()
        source_pins.append({"path": path.relative_to(root).as_posix(), "bytes": len(raw), "sha256": sha(raw)})
        return json.loads(raw)

    taxonomy = load(app / "data/adaptive-taxonomy.json")
    if taxonomy.get("schemaVersion") != 1:
        raise ValueError("Unsupported taxonomy")
    extractor = Extractor(taxonomy)
    subtask_ids = set(extractor.parents)
    territories = load(app / "data/territories.json")
    region_by_name = region_lookup(territories)
    region_ids = {r["id"] for r in territories}
    hosting = load(root / "source-audit/career-vacancies/details-hosting.json")
    source_snapshot = DetailSnapshot(details_root, hosting)
    seed, bank_summary, bank_blobs = load_bank(root / "source-audit/career-vacancies")
    if seed["treeSha256"] != hosting["baseTreeSHA"] or seed["vacancies"] != hosting["vacancies"]:
        raise ValueError("Enriched source belongs to another base snapshot")
    snapshot_date = seed["sourceSnapshotDate"]
    source_pins.append({"path": "source-audit/career-vacancies/seed.json",
                        "sha256": sha((root / "source-audit/career-vacancies/seed.json").read_bytes()),
                        "treeSha256": seed["treeSha256"], "vacancies": seed["vacancies"]})
    portal = load(app / "data/vacancies/gossluzhba.json")
    portal_by_id = {r["id"]: r for r in portal["vacancies"]}
    if len(portal_by_id) != len(portal["vacancies"]):
        raise ValueError("Duplicate portal UUID")
    rich = []
    for path in sorted((app / "data/position-materials").glob("*.json")):
        payload = load(path)
        rich.extend((row, "data/position-materials/" + path.name, index) for index, row in enumerate(payload["positions"]))
    fingerprint = sha(encode({"sources": source_pins, "taxonomy": taxonomy,
                              "bankTree": seed["treeSha256"], "detailsTree": hosting["treeSHA"],
                              "builderSHA256": sha(Path(__file__).read_bytes())}))[:12]
    version = "functional-" + VERSION + "-" + fingerprint
    progress("verified-source-inventory", version=version, **source_snapshot.stats)

    counts = Counter(sourceBank=0, rich=len(rich), portal=len(portal_by_id), portalMergedByUUID=0,
                     richExactSourceDuplicates=0)
    exclusions, raw_category_rows, nonplaceholder_rows = Counter(), Counter(), Counter()
    token_counts, source_field_counts, content_category_rows = Counter(), Counter(), Counter()
    scope_counts, source_region_counts, title_counts = Counter(), Counter(), Counter()
    all_function_counts, eligible_function_counts, subtask_counts = Counter(), Counter(), Counter()
    evidence_counts, rankable_kinds, feature_counts, profile_counts = Counter(), Counter(), Counter(), Counter()
    unique_profiles, seen_ids, seen_portal, rich_identity = {}, set(), set(), {}
    source_database_hashes = Counter()
    candidates, provenance = [], []
    detail_descriptors, detail_batch = [], []
    detail_bytes = 0
    out.mkdir(parents=True, exist_ok=True)
    for old in out.rglob("*.json.gz"):
        old.unlink()

    def flush_details():
        nonlocal detail_batch, detail_bytes
        if not detail_batch:
            return
        relative = f"details/d{len(detail_descriptors):04d}.json.gz"
        descriptor = dump_compressed(out, relative, {"schemaVersion": SCHEMA, "version": version,
                                                      "rows": [pair[1] for pair in detail_batch]}, MAX_DETAIL_RAW)
        descriptor["count"] = len(detail_batch)
        detail_descriptors.append(descriptor)
        for candidate, _ in detail_batch:
            candidate["detailPath"] = descriptor["path"]
        detail_batch, detail_bytes = [], 0

    def add_candidate(candidate, detail, member):
        nonlocal detail_bytes
        profile_id = sha(encode(candidate["features"]))
        shared = unique_profiles.setdefault(profile_id, candidate["features"])
        if shared != candidate["features"]:
            raise ValueError("Functional profile digest collision")
        candidate["features"], candidate["profileId"] = shared, profile_id
        size = len(encode(detail))
        if detail_batch and (len(detail_batch) >= 100 or detail_bytes + size > MAX_DETAIL_RAW - 2048):
            flush_details()
        if size > MAX_DETAIL_RAW - 2048:
            raise ValueError("A single exact-evidence detail exceeds the limit")
        detail_batch.append((candidate, detail)); detail_bytes += size
        candidates.append(candidate)
        evidence_counts[candidate["evidenceLevel"]] += 1
        rankable_kinds[candidate["sourceType"]] += 1
        feature_counts.update(candidate["features"].keys())
        profile_counts[profile_id] += 1
        subtask_counts[len(set(candidate["features"]) & subtask_ids)] += 1
        provenance.append({**member, "disposition": "ranked-source", "representativeId": candidate["id"]})

    for page_number, (page_info, page_result) in enumerate(classified_bank_pages(bank_blobs, taxonomy, source_snapshot, workers), 1):
        path, compressed, page, employer, page_index, base_rows = page_info
        raw_category_rows.update(page_result["sourceCategoryRows"])
        nonplaceholder_rows.update(page_result["sourceNonPlaceholderCategoryRows"])
        token_counts.update(page_result["sourceTokenCounts"])
        source_field_counts.update(page_result["sourceFieldTokenCounts"])
        for classified in page_result["records"]:
            vacancy_id, source_ref = classified["id"], classified["reference"]
            if vacancy_id in seen_ids:
                raise ValueError("Duplicate bank UUID")
            seen_ids.add(vacancy_id)
            bank, row_index = base_rows[vacancy_id]
            counts["sourceBank"] += 1
            supplement = portal_by_id.get(vacancy_id)
            if supplement:
                seen_portal.add(vacancy_id); counts["portalMergedByUUID"] += 1
            source_database_hashes[source_ref["sourceDatabaseSHA256"]] += 1
            title = text(bank["title"])
            departments = classified["departments"]
            department = "; ".join(departments) or (text(supplement.get("department")) if supplement else "")
            region_id = source_region(bank["region"], region_by_name)
            location = ", ".join(part for part in [text(bank["region"]), text(bank["locality"])] if part)
            source_region_counts[region_id or "unknown"] += 1
            title_counts[title] += 1
            scope_counts[bank["scope"]] += 1
            features, level, specific = classified["features"], classified["level"], classified["specific"]
            all_function_counts["withAnyFeature"] += bool(features)
            all_function_counts["withSpecificSubtask"] += specific
            content_category_rows.update(classified["categories"])
            eligible = bank["scope"] == "individual-role" and employer.get("rankable") is True
            if eligible:
                eligible_function_counts["records"] += 1
                eligible_function_counts["withAnyFeature"] += bool(features)
                eligible_function_counts["withSpecificSubtask"] += specific
                for category in EVIDENCE_WEIGHT:
                    eligible_function_counts["withSubtaskFrom:" + category] += category in classified["subtaskCategories"]
            member = {"sourceType": "bank", "id": vacancy_id, "sourcePath": path,
                      "employerId": employer["employerId"], "sourcePageIndex": page_index,
                      "sourceRowIndex": row_index, "detailPage": source_ref["detailPage"]}
            reason = ("group-or-unknown-context" if bank["scope"] != "individual-role" else
                      "unresolved-employer-identity" if employer.get("rankable") is not True else
                      "no-functional-evidence" if not features else
                      "no-specific-functional-evidence" if not specific else None)
            if reason:
                exclusions[reason] += 1
                provenance.append({**member, "disposition": reason})
                continue
            url = safe_url(bank["sourceURL"])
            if not url:
                raise ValueError("Unsafe bank source URL")
            source_path = "career-vacancy-details/" + source_ref["detailPage"]
            candidate = base_candidate(vacancy_id, title, department, employer["employerId"], text(employer["name"]),
                                       region_id, location, features, level,
                                       source_status(bank["archive"], bank["state"], bank["expiresAt"], snapshot_date),
                                       bank["archive"], url, source_path, "bank")
            card = {"id": vacancy_id, "sourceId": vacancy_id, "sourceURL": url, "sourcePath": source_path,
                    "sourceSnapshotAt": bank_summary["snapshotAt"], "sourceRecordCount": 1,
                    "sourceReference": source_ref, "sourceScope": bank["scope"],
                    "sourceDetailURL": hosting["collectionRoot"] + source_ref["detailPage"][:-8] + ".b64",
                    "evidence": classified["evidence"],
                    "departmentLabels": departments, "publishedAt": bank["announcedAt"],
                    "expiresAt": bank["expiresAt"], "sourceState": bank["state"]}
            add_candidate(candidate, card, member)
        if page_number % 400 == 0:
            progress("classifying-source-pages", pages=page_number, records=counts["sourceBank"],
                     candidates=len(candidates), profiles=len(unique_profiles), detailsBytes=sum(d["bytes"] for d in detail_descriptors),
                     allFunctional=dict(all_function_counts), eligibleFunctional=dict(eligible_function_counts),
                     workers=workers)
    source_snapshot.assert_complete()
    if counts["sourceBank"] != seed["vacancies"]:
        raise ValueError("Complete bank/source coverage does not reconcile")
    del bank_blobs

    # Portal records are joined by UUID only. Unmatched records have no retained
    # work text in this small snapshot and cannot supply a functional fallback.
    for position in portal["vacancies"]:
        if position["id"] in seen_portal:
            continue
        vacancy_id = position["id"]
        if vacancy_id in seen_ids:
            raise ValueError("Unexpected unmatched portal UUID")
        seen_ids.add(vacancy_id)
        member = {"sourceType": "portal", "id": vacancy_id, "sourcePath": "data/vacancies/gossluzhba.json"}
        reason = "group-or-unknown-context" if position.get("sourceType") == 2 else "no-functional-evidence"
        exclusions[reason] += 1; provenance.append({**member, "disposition": reason})
        source_region_counts[location_region(position.get("location"), region_by_name) or "unknown"] += 1

    for position, source_path, position_index in rich:
        vacancy_id = position["id"]
        duties = duty_rows(position.get("duties"))
        requirements = requirement_rows(position.get("requirements"))
        content_identity = sha(encode({"duties": duties, "requirements": [
            {"category": row["category"], "sourceText": row["sourceText"]} for row in requirements]}))
        identity = (canonical_url(position.get("url")), norm(position.get("title")), norm(position.get("department")),
                    position.get("institutionId"), content_identity)
        member = {"sourceType": "position", "id": vacancy_id, "sourcePath": source_path}
        if vacancy_id in seen_ids:
            raise ValueError("Position source ID collides")
        if identity in rich_identity and identity[0]:
            counts["richExactSourceDuplicates"] += 1
            provenance.append({**member, "disposition": "duplicate-source-role", "representativeId": rich_identity[identity]})
            continue
        rich_identity[identity] = vacancy_id
        seen_ids.add(vacancy_id)
        title, department = text(position["title"]), text(position.get("department"))
        features, level, evidence = extractor.extract(title, department, duties, requirements)
        region_id = position.get("regionId") if position.get("regionId") in region_ids else None
        source_region_counts[region_id or "unknown"] += 1
        url = safe_url(position.get("url"))
        reason = ("no-functional-evidence" if not features else "no-specific-functional-evidence"
                  if not set(features) & subtask_ids else "missing-source-url" if not url else None)
        if reason:
            exclusions[reason] += 1; provenance.append({**member, "disposition": reason})
            continue
        status = position.get("status") if position.get("status") in ("archived", "profile", "unconfirmed") else "unconfirmed"
        candidate = base_candidate(vacancy_id, title, department, position.get("institutionId", ""),
                                   text(position.get("employerName")), region_id, text(position.get("location")),
                                   features, level, status, True if status == "archived" else None,
                                   url, source_path, "position")
        card = {"id": vacancy_id, "sourceId": vacancy_id, "sourceURL": url, "sourcePath": source_path,
                "sourceSnapshotAt": position.get("sourceSnapshotAt"), "sourceRecordCount": 1,
                "sourceReference": {**member, "positionIndex": position_index},
                "evidence": public_evidence(evidence, duties, requirements, position_index=position_index, source_position=position),
                "publishedAt": position.get("source", {}).get("publishedAt")}
        add_candidate(candidate, card, member)
    flush_details()

    candidates.sort(key=lambda row: row["id"])
    counts.update(uniqueSources=len(seen_ids), rankableSources=len(candidates), rows=len(candidates),
                  sourceRecordsCovered=len(candidates), collapsedRepeatedAnnouncements=0,
                  unclassifiedSources=exclusions["no-functional-evidence"] + exclusions["no-specific-functional-evidence"],
                  groupContextSources=exclusions["group-or-unknown-context"],
                  unresolvedEmployerSources=exclusions["unresolved-employer-identity"], uniqueProfiles=len(unique_profiles))
    if counts["uniqueSources"] != counts["sourceBank"] + counts["rich"] + counts["portal"] - counts["portalMergedByUUID"] - counts["richExactSourceDuplicates"]:
        raise ValueError("Unique source union does not reconcile")
    if counts["uniqueSources"] != counts["rows"] + sum(exclusions.values()):
        raise ValueError("Ranked/excluded source union does not reconcile")
    if len({row["id"] for row in candidates}) != len(candidates):
        raise ValueError("Candidate UUIDs are not unique")
    progress("encoding-candidates", candidates=len(candidates), profiles=len(unique_profiles),
             detailsBytes=sum(descriptor["bytes"] for descriptor in detail_descriptors))
    all_descriptor = dump_compressed(out, "all.json.gz", packed_payload(candidates, version), MAX_ALL_RAW)
    all_descriptor["count"] = len(candidates)
    national_parts = []
    offset = 0
    while offset < len(candidates):
        end = min(offset + 50000, len(candidates))
        payload = packed_payload(candidates[offset:end], version)
        while len(encode(payload)) > MAX_NATIONAL_RAW:
            if end - offset <= 1:
                raise ValueError("A single candidate exceeds the national-part limit")
            end = offset + (end - offset) // 2
            payload = packed_payload(candidates[offset:end], version)
        descriptor = dump_compressed(out, f"national/n{len(national_parts):04d}.json.gz", payload, MAX_NATIONAL_RAW)
        descriptor["count"] = end - offset
        national_parts.append(descriptor)
        offset = end
    by_region = defaultdict(list)
    for row in candidates:
        by_region[row["regionId"] or "unknown"].append(row)
    shards = []
    for region in [r["id"] for r in territories] + ["unknown"]:
        rows = by_region[region]
        descriptor = dump_compressed(out, f"regions/{region}.json.gz", packed_payload(rows, version), MAX_SHARD_RAW)
        descriptor.update(regionId=None if region == "unknown" else region, count=len(rows), sourceRecordCount=len(rows))
        shards.append(descriptor)
    if sum(descriptor["count"] for descriptor in shards) != len(candidates):
        raise ValueError("Regional coverage does not reconcile")

    coverage = {"bankColumns": COLUMNS, "bankScopeCounts": dict(scope_counts),
                "bankHasDepartment": True, "bankHasDuties": True,
                "bankArchiveCount": bank_summary["archiveCount"], "bankNonArchiveCount": bank_summary["nonArchiveCount"],
                "bankUniqueTitles": len(title_counts), "sourceDetailSnapshot": source_snapshot.stats,
                "sourceDatabaseSHA256": dict(source_database_hashes), "sourceCategoryRows": dict(raw_category_rows),
                "sourceNonPlaceholderCategoryRows": dict(nonplaceholder_rows), "sourceTokenCounts": dict(token_counts),
                "sourceFieldTokenCounts": dict(source_field_counts),
                "bankFunctionalEvidence": dict(all_function_counts), "eligibleBankFunctionalEvidence": dict(eligible_function_counts),
                "bankEvidenceCategoryRows": dict(content_category_rows), "excluded": dict(exclusions),
                "evidenceLevels": dict(evidence_counts), "recordEvidenceLevels": dict(evidence_counts),
                "rankableSourceKinds": dict(rankable_kinds),
                "facetRows": {facet["id"]: feature_counts[facet["id"]] for facet in taxonomy["facets"]},
                "featureRows": dict(feature_counts), "specificSubtaskCountHistogram": dict(subtask_counts),
                "responsibilityLevels": dict(Counter(row["responsibilityLevel"] for row in candidates)),
                "sourceRegions": dict(source_region_counts), "unknownRegionRows": len(by_region["unknown"]),
                "employerNamesUsedAsFunctionalEvidence": False, "titlesUsedAsFunctionalEvidence": False,
                "departmentsUsedAsFunctionalEvidence": False, "genericTitlesPromotedToSpecificDepartments": False,
                "geographyInferredFromEmployer": False, "currentRecruitmentVerified": False}
    limits = {"allUncompressedBytes": MAX_ALL_RAW, "shardUncompressedBytes": MAX_SHARD_RAW,
              "nationalPartUncompressedBytes": MAX_NATIONAL_RAW, "nationalPartRows": 50000,
              "detailUncompressedBytes": MAX_DETAIL_RAW, "detailRows": 100,
              "actualAllBytes": all_descriptor["bytes"], "actualAllUncompressedBytes": all_descriptor["uncompressedBytes"],
              "actualMaxShardBytes": max(descriptor["bytes"] for descriptor in shards),
              "actualMaxShardUncompressedBytes": max(descriptor["uncompressedBytes"] for descriptor in shards),
              "actualMaxNationalPartBytes": max((descriptor["bytes"] for descriptor in national_parts), default=0),
              "actualMaxNationalPartUncompressedBytes": max((descriptor["uncompressedBytes"] for descriptor in national_parts), default=0),
              "actualMaxDetailBytes": max((descriptor["bytes"] for descriptor in detail_descriptors), default=0),
              "actualMaxDetailUncompressedBytes": max((descriptor["uncompressedBytes"] for descriptor in detail_descriptors), default=0)}
    manifest = {"schemaVersion": SCHEMA, "version": version, "snapshotDate": snapshot_date,
                "taxonomyVersion": taxonomy["version"], "encoding": "career-candidates-dictionary-v1",
                "all": all_descriptor, "nationalParts": national_parts, "shards": shards, "details": detail_descriptors, "counts": dict(counts),
                "coverage": coverage, "limits": limits, "sourcePins": source_pins,
                "classification": {"method": "exact-source-clause-regex-with-safe-literal-prefilter",
                    "weights": EVIDENCE_WEIGHT, "aggregation": "maximum-per-feature; identical vectors shared",
                    "minimumEvidence": "at least one concrete subtask in source content",
                    "missingFeatureMeaning": "not-observed-in-retained-source",
                    "duplicates": "each individual source UUID retained; exact rich-source content duplicates removed",
                    "responsibilityRule": "direct title only; explicit head/deputy/chief-accountant=leadership; explicit individual occupation=specialist; otherwise unspecified",
                    "sourceFieldIsNotAutomaticallyEvidenceCategory": True,
                    "knowledgeNeedsSpecificSubtask": True, "negatedAndThirdPartyTasksExcludedFromFeatures": True,
                    "psychologicalResultsUsed": False, "isEmployerAssessment": False}}
    (out / "manifest.json").write_bytes(encode(manifest))

    audit_out.mkdir(parents=True, exist_ok=True)
    provenance.sort(key=lambda row: (row["sourceType"], row["sourcePath"], row.get("sourceRowIndex", 0), row["id"]))
    audit_paths = sorted({row["sourcePath"] for row in provenance} | {row["detailPage"] for row in provenance if row.get("detailPage")})
    audit_employers = sorted({row["employerId"] for row in provenance if row.get("employerId")})
    representatives = sorted({row["representativeId"] for row in provenance if row.get("representativeId")})
    dispositions = sorted({row["disposition"] for row in provenance})
    types = ["bank", "portal", "position"]
    path_ids = {value: index for index, value in enumerate(audit_paths)}
    employer_ids = {value: index for index, value in enumerate(audit_employers)}
    representative_ids = {value: index for index, value in enumerate(representatives)}
    disposition_ids = {value: index for index, value in enumerate(dispositions)}
    audit_rows = [[row["id"], types.index(row["sourceType"]), path_ids[row["sourcePath"]],
                   employer_ids.get(row.get("employerId")), row.get("sourcePageIndex"), row.get("sourceRowIndex"),
                   disposition_ids[row["disposition"]], representative_ids.get(row.get("representativeId")),
                   path_ids.get(row.get("detailPage"))] for row in provenance]
    audit_raw = encode({"schemaVersion": SCHEMA, "version": version, "snapshotDate": snapshot_date,
                        "seedTreeSha256": seed["treeSha256"], "detailsTreeSHA": hosting["treeSHA"],
                        "columns": ["id", "sourceTypeIndex", "sourcePathIndex", "employerIndex", "sourcePageIndex",
                                    "sourceRowIndex", "dispositionIndex", "representativeIndex", "detailPageIndex"],
                        "sourceTypes": types, "sourcePaths": audit_paths, "employers": audit_employers,
                        "dispositions": dispositions, "representatives": representatives, "rows": audit_rows})
    (audit_out / "source-members.json.gz").write_bytes(gzip.compress(audit_raw, compresslevel=9, mtime=0))
    report = {"schemaVersion": SCHEMA, "status": "pass", "version": version, "counts": dict(counts),
              "coverage": coverage, "limits": limits,
              "siteAssetBytes": sum(path.stat().st_size for path in out.rglob("*") if path.is_file()),
              "detailAssetBytes": sum(descriptor["bytes"] for descriptor in detail_descriptors),
              "auditBytes": (audit_out / "source-members.json.gz").stat().st_size,
              "auditUncompressedBytes": len(audit_raw), "manifestSHA256": sha(encode(manifest)),
              "sourceMemberCount": len(provenance), "networkRequests": 0,
              "sourceBankIntegrityVerified": True, "sourceDetailsIntegrityVerified": True,
              "everySourceDetailReadAndBound": True, "fullSourceUnionReconciled": True,
              "allIndexIdsUnique": True, "allRegionalCountsReconciled": True,
              "unknownGeographyKeptUnknown": True, "sourceEvidenceRetainedVerbatim": True,
              "buildScriptSHA256": sha(Path(__file__).read_bytes())}
    (audit_out / "build-report.json").write_bytes(encode(report))
    progress("complete", version=version, counts=dict(counts), siteAssetBytes=report["siteAssetBytes"],
             limits=limits, detailAssetBytes=report["detailAssetBytes"])
    return report

def tree_hashes(path: Path) -> dict[str, str]:
    return {p.relative_to(path).as_posix(): sha(p.read_bytes()) for p in path.rglob("*") if p.is_file()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--audit-out", type=Path)
    parser.add_argument("--details-root", type=Path, required=True,
                        help="local immutable career-vacancy-details tree from details-hosting.json")
    parser.add_argument("--progress", type=Path, help="write atomic intermediate progress outside generated assets")
    parser.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 1),
                        help="parallel source-page workers; output order and bytes remain deterministic")
    parser.add_argument("--check", action="store_true", help="rebuild privately and compare every generated byte")
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error("--workers must be in 1..8")
    root = args.root.resolve()
    out = args.out.resolve() if args.out else root / "site/apps/career/data/adaptive-index"
    audit_out = args.audit_out.resolve() if args.audit_out else root / "source-audit/adaptive-career"
    if args.check:
        with tempfile.TemporaryDirectory(prefix="rudn-adaptive-index-") as tmp:
            generated = Path(tmp) / "index"
            audit_generated = Path(tmp) / "audit"
            report = build(root, generated, audit_generated, args.details_root, args.progress, args.workers)
            actual_audit = {name: sha((audit_out / name).read_bytes()) for name in GENERATED_AUDIT_FILES}
            if tree_hashes(out) != tree_hashes(generated) or actual_audit != tree_hashes(audit_generated):
                raise ValueError("generated adaptive index is stale or differs from reproducible source build")
            print(json.dumps({"status": "pass", "check": "deterministic-byte-rebuild", "rows": report["counts"]["rows"],
                              "sourceBank": report["counts"]["sourceBank"], "siteAssetBytes": report["siteAssetBytes"]}))
    else:
        report = build(root, out, audit_out, args.details_root, args.progress, args.workers)
        print(json.dumps({"status": report["status"], "counts": report["counts"], "coverage": report["coverage"],
                          "limits": report["limits"], "siteAssetBytes": report["siteAssetBytes"],
                          "auditBytes": report["auditBytes"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
