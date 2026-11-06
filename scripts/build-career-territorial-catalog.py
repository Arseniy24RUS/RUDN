#!/usr/bin/env python3
"""Build the seminar's territorial catalogue from the user's retained source corpus.

No network requests, invented employers or inferred vacancy eligibility. Pass the
extracted career-update-v9 directory via --source. Numeric opportunity coding is
an educational, editorial reuse of the existing career model, not a job norm.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site/apps/career/data"
DATE = "2026-11-06"


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value, pretty=False):
    Path(path).write_text(json.dumps(value, ensure_ascii=False,
        indent=2 if pretty else None, separators=None if pretty else (",", ":")) + "\n", encoding="utf-8")


def normalize(value):
    return re.sub(r"[^а-яa-z0-9]", "", str(value).casefold().replace("ё", "е"))


def text_values(value):
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, list):
        return [text for item in value for text in text_values(item)]
    if isinstance(value, dict):
        for key in ("text", "sourceText", "description", "title", "name"):
            if isinstance(value.get(key), str):
                return text_values(value[key])
    return []


def source_url(value):
    return isinstance(value, str) and urlsplit(value).scheme in {"https", "http"} and bool(urlsplit(value).netloc)


FAMILY_ALIASES = {
    "economy": "economic-development", "investment": "economic-development",
    "entrepreneurship": "economic-development", "business-support": "economic-development",
    "economic-regulation": "economic-development", "regional-development": "economic-development",
    "strategy": "economic-development", "trade": "industry", "innovation": "industry",
    "science": "higher-education", "digital": "digital-government", "information-security": "digital-government",
    "communications": "digital-government", "media": "digital-government",
    "public-communications": "digital-government", "forestry": "environment", "water": "environment",
    "natural-resources": "environment", "wildlife": "environment", "land": "property",
    "public-property": "property", "land-management": "property", "heritage": "culture",
    "construction": "construction-housing", "housing": "construction-housing",
    "utilities": "construction-housing", "urban-planning": "construction-housing",
    "spatial-planning": "construction-housing", "infrastructure": "construction-housing",
    "construction-supervision": "construction-housing", "housing-supervision": "construction-housing",
    "roads": "transport", "veterinary": "agriculture", "fisheries": "agriculture",
    "rural-development": "agriculture", "labor": "labour-employment", "labour": "labour-employment",
    "employment": "labour-employment", "social-dialogue": "labour-employment",
    "social": "social-protection", "social-support": "social-protection", "social-policy": "social-protection",
    "family": "social-protection", "child-protection": "social-protection",
    "budget": "finance", "tariff": "financial-control", "tariffs": "financial-control",
    "tariff-regulation": "financial-control", "audit": "financial-control",
    "competition": "procurement", "governance": "public-administration",
    "human-resources": "public-administration", "hr": "public-administration",
    "administrative-support": "public-administration", "project-management": "public-administration",
    "local-government": "public-administration", "intergovernmental-relations": "public-administration",
    "interregional-relations": "public-administration", "public-services": "public-administration",
    "civic-engagement": "public-administration", "records": "archives", "records-management": "archives",
    "civil-registration": "justice", "legal": "justice", "law": "justice", "legal-support": "justice",
    "anti-corruption": "justice", "licensing": "justice", "administrative-enforcement": "public-order",
    "national-policy": "nationalities", "cossacks": "nationalities", "volunteering": "youth",
    "civil-protection": "emergency", "civil-defense": "emergency", "emergency-management": "emergency",
    "public-safety": "public-order", "security": "public-order", "international-relations": "international",
    "inspection": "inspection", "oversight": "inspection", "supervision": "inspection",
    "technical-supervision": "technical-supervision", "consumer-protection": "consumer-protection",
    "consumer-market": "consumer-protection"
}

PROXY_ALIASES = {
    "mineconomy": "mineconom", "mincult": "minkult", "mintsifry": "mincifry",
    "rosarkhiv": "rosarchiv", "rosarchive": "rosarchiv", "udprf": "udp",
    "rosselhoznadzor": "rosselkhoznadzor", "rosleskhoz": "rosleshoz",
    "government": "udp", "presidential-administration": "udp", "suddep": "supreme-court-staff"
}

# Rules match documented descriptions/functions; titles only disambiguate a
# policy domain already mentioned there. They do not manufacture legal powers.
FAMILY_RULES = [
    ("finance", r"финанс|бюджет|налогов|долг(?:а|ом|у|овой)|казначей"),
    ("financial-control", r"финансов.{0,20}контрол|бюджетн.{0,20}контрол|контрольно.счет|тариф"),
    ("economic-development", r"экономическ.{0,20}развит|развити.{0,20}экономик|инвестиц|предпринимат|стратегическ.{0,20}планирован"),
    ("digital-government", r"цифров|информатизац|информационн.{0,20}(систем|технолог)|связи|телекоммуникац"),
    ("education", r"образовани|образовательн|педагог|воспитани"),
    ("higher-education", r"научн|науки|высш.{0,16}образовани"),
    ("culture", r"культур|наследи|музе|искусств|библиотек"),
    ("youth", r"молодеж|молодёж"), ("sport", r"спорт|физическ.{0,12}культур"),
    ("environment", r"эколог|природн|лес(?:а|ов|н|о)|недр|окружающ.{0,10}сред|животн.{0,10}мир|водн.{0,12}(объект|ресурс)"),
    ("agriculture", r"сельск.{0,14}хозяйств|аграрн|агропромышл|ветеринар|рыболов|рыбн.{0,10}хозяйств"),
    ("health", r"здравоохран|медицин|санитар|здоровь"),
    ("social-protection", r"социальн.{0,12}(защит|поддерж|обеспеч|обслужив)|пенсион|семьи|семейн|попечитель|опек"),
    ("labour-employment", r"занятост|безработ|труда|трудов"),
    ("construction-housing", r"строительств|жилищ|коммунальн|градостро|архитектур"),
    ("transport", r"транспорт|дорожн|дорог|перевоз"),
    ("industry", r"промышлен|производствен|промышленност|торговл"),
    ("energy", r"энергет|энергоснабж|топлив"),
    ("property", r"имуществ|земельн|землепользован|кадастр"),
    ("procurement", r"закупк|конкурентн|торгов|контрактн.{0,12}систем"),
    ("justice", r"юстиц|правов|юридическ|нормотвор|записи.{0,16}акт|записей.{0,16}акт|загс"),
    ("public-order", r"правопоряд|общественн.{0,12}безопасност|преступ|противодейств.{0,12}террор"),
    ("emergency", r"чрезвычай|гражданск.{0,12}оборон|мобилизац|пожар|спасател"),
    ("archives", r"архив|делопроизводств|документооборот"),
    ("public-administration", r"аппарат|кадров|государственн.{0,16}служб|внутренн.{0,12}политик|самоуправлен|администрац|организационн.{0,14}обеспеч"),
    ("tourism", r"туризм|турист|курорт"),
    ("international", r"международ|внешнеэконом|иностранн|внешних.{0,12}связ"),
    ("legislative-support", r"законодательн|парламент|депутат|законопроект"),
    ("judiciary-support", r"судебн|миров.{0,8}суд|деятельност.{0,12}суд"),
    ("nationalities", r"межнациональн|национальност|этническ|конфесси|коренн.{0,16}народ"),
    ("inspection", r"надзор|инспекц|контрольн"),
    ("technical-supervision", r"техническ.{0,12}состояни|самоходн|промышленн.{0,12}безопасност"),
    ("consumer-protection", r"защит.{0,12}прав.{0,12}потребител|потребительск.{0,12}рын"),
]


def family_map(source, donors):
    families = {f["id"]: f for f in read(source / "data/functional-families.json")["families"]}
    families.update({
        "inspection": {"proxyAuthorityId": "rostrud", "allowedTrackIds": ["INSPECT", "LEGAL", "SERVICE", "DIGITAL"]},
        "technical-supervision": {"proxyAuthorityId": "rostekhnadzor", "allowedTrackIds": ["INSPECT", "LEGAL", "TERRITORIAL", "DIGITAL"]},
        "consumer-protection": {"proxyAuthorityId": "rospotrebnadzor", "allowedTrackIds": ["INSPECT", "LEGAL", "SERVICE", "TERRITORIAL"]},
    })
    return families


def exclusion_reason(record):
    if record.get("current") is False:
        return "historical-or-noncurrent-identity"
    if record.get("recommendationHold") is True:
        return "explicit-identity-hold"
    if not text_values(record.get("description")):
        return "no-source-backed-description"
    if not any(source_url(s.get("url")) for s in record.get("sources", []) if isinstance(s, dict)):
        return "no-source-url"
    identity = str(record.get("identityStatus", "")).lower()
    content = str(record.get("contentStatus", "")).lower()
    temporal = str(record.get("temporalStatus", "")).lower()
    if any(term in identity for term in ("historical-name", "historical-pre-merger", "historical-employer", "abolition-and-function-transfer", "excluded-by-primary", "excluded-from-executive", "creation-act-current-operation-unconfirmed")):
        return "historical-or-unconfirmed-identity"
    if temporal in {"historical", "enacted-not-yet-effective"} or temporal.startswith("planned-body"):
        return "historical-or-future-identity"
    if "draft" in content or "historical-prepared" in content or content == "prepared-historical":
        return "draft-or-historical-card"
    quality = str(record.get("sourceQuality", "")).lower()
    if "secondary" in quality and "primary" not in quality:
        return "secondary-only-description"
    if record.get("employerType") in {"public-institution", "public-organization", "territorial-election-commission"}:
        return "outside-authority-or-corporation-scope"
    return None


def map_families(record, families, proxy_families):
    declared = list(dict.fromkeys(FAMILY_ALIASES.get(f, f) for f in record.get("functionalFamilyIds", []) or []))
    declared = [f for f in declared if f in families]
    if declared:
        return declared, "retained-editorial-functional-families"
    proxy = PROXY_ALIASES.get(record.get("proxyAuthorityId"), record.get("proxyAuthorityId"))
    if proxy in proxy_families:
        return [proxy_families[proxy]], "retained-editorial-proxy"
    description = " ".join(text_values(record.get("description")) + text_values(record.get("functions"))).casefold().replace("ё", "е")
    title = str(record.get("name", "")).casefold().replace("ё", "е")
    scored = []
    for family, pattern in FAMILY_RULES:
        # Specific domain in the name must be corroborated by its description.
        count = len(re.findall(pattern, description))
        if count:
            title_matches = len(re.findall(pattern, title))
            scored.append((5 * title_matches + min(count, 5), count, family))
    scored.sort(key=lambda row: (-row[0], -row[1], row[2]))
    if not scored:
        return [], "unmapped"
    cutoff = max(2, scored[0][0] * .55)
    selected = [family for score, _, family in scored if score >= cutoff][:3]
    # When only a single published role is named, no catch-all mandate is added.
    return selected, "editorial-description-and-function-coding"


def compact_sources(record):
    output = []
    seen = set()
    for source in record.get("sources", []):
        if not isinstance(source, dict) or not source_url(source.get("url")) or source["url"] in seen:
            continue
        seen.add(source["url"])
        output.append({key: source[key] for key in ("id", "url", "title", "checkedAt", "publishedAt", "documentDate", "sourceLocator", "locator", "supports", "sha256") if source.get(key) is not None})
    return output


def career_paths(mapped, families, donors):
    tracks = {}
    sectors = {}
    donor_ids = []
    for family_id in mapped:
        family = families[family_id]
        donor_id = family["proxyAuthorityId"]
        donor = donors.get(donor_id)
        if not donor:
            continue
        donor_ids.append(donor_id)
        for link in donor.get("tracks", []):
            if link["id"] not in family.get("allowedTrackIds", []):
                continue
            # Quantitative track salience is the established educational model.
            # Conditions and inferred employment requirements are never copied.
            key = link["id"]
            row = tracks.setdefault(key, {"id": key, "importance": 0, "sectors": {}})
            row["importance"] = max(row["importance"], link.get("importance", 1))
            for sector in link.get("sectors") or donor.get("sectors", []):
                row["sectors"][sector["id"]] = max(row["sectors"].get(sector["id"], 0), sector["weight"])
                sectors[sector["id"]] = max(sectors.get(sector["id"], 0), sector["weight"])
    for row in tracks.values():
        row["sectors"] = [{"id": key, "weight": value} for key, value in sorted(row["sectors"].items())]
    return list(tracks.values()), [{"id": key, "weight": value} for key, value in sorted(sectors.items())], list(dict.fromkeys(donor_ids))


def authority(record, families, donors, proxy_families, snapshot_at):
    mapped, method = map_families(record, families, proxy_families)
    tracks, sectors, donor_ids = career_paths(mapped, families, donors)
    if not tracks or not sectors:
        return None
    descriptions = text_values(record.get("description"))
    sources = compact_sources(record)
    source_dates = sorted(str(s.get("checkedAt", "")) for s in sources if s.get("checkedAt"))
    level = record["level"]
    return {
        "id": record["id"], "name": record["name"], "shortName": record.get("shortName") or "",
        "level": level, "regionId": record.get("regionId"),
        "entityType": "corporation" if level == "national-corporation" else level,
        "entityTypeLabel": {"regional": "Орган власти субъекта Российской Федерации", "municipal": "Орган местного самоуправления", "national-corporation": "Государственная корпорация"}[level],
        "employerType": record.get("employerType") or ("municipal-service-authority" if level == "municipal" else "regional-state-body"),
        "governmentUrl": record.get("officialUrl") if source_url(record.get("officialUrl")) else sources[0]["url"],
        "mission": descriptions[0], "descriptionParagraphs": descriptions,
        "descriptionSources": sources, "sectors": sectors, "tracks": tracks,
        "functionalFamilyIds": mapped, "familiarity": 1, "confidence": "limited",
        "verifiedAt": (source_dates[-1] if source_dates else snapshot_at[:10]),
        "sourceSnapshotAt": record.get("sourceSnapshotAt") or snapshot_at, "sourceDate": record.get("sourceBasisDate") or record.get("sourceDocumentDate") or None,
        "temporalStatus": record.get("temporalStatus") or "dated-source-snapshot",
        "sourceLimitations": list(dict.fromkeys(text_values(record.get("verificationNotes")) + text_values(record.get("contentLimitations")) + text_values(record.get("limitations")))),
        "scoringProvenance": {"kind": method, "familyVersion": "9.0.0-preparation.1", "donorIds": donor_ids, "numericModel": "existing-v8.1-editorial-track-coding", "workingConditionsInherited": False, "jobRequirementsInherited": False, "psychometricallyValidated": False},
        "evidenceStatus": {"institution": "retained-source-backed-identity", "functions": "retained-source-description", "weights": "editorial-functional-mapping", "conditions": "not-inferred"},
        "careerModel": {"status": "typical-model", "gmupRelevance": "high", "note": "Учебное сопоставление по направлениям деятельности. Должностные требования относятся к конкретному объявлению."},
        "entryRouteIds": [], "sourceRecordId": record["id"],
    }


def normalize_category(raw):
    category = str(raw or "other").lower()
    if any(term in category for term in ("eligibility", "citizenship", "security-clearance", "competition-admission", "selection-condition", "driving-license", "certificate")):
        return "eligibility"
    if "education" in category and "experience" in category:
        return "other"  # retain the entire conditional alternative, without splitting it
    if any(term in category for term in ("education", "specialt", "specialization")):
        return "education"
    if "experience" in category:
        return "experience"
    if "knowledge" in category and any(term in category for term in ("skill", "abilit")):
        return "other"  # mixed source paragraph is shown in full
    if "knowledge" in category:
        return "knowledge"
    if any(term in category for term in ("skill", "abilit", "language", "competency", "qualit", "electronic-document")) and "qualification" not in category:
        return "skills"
    return "other"


def normalize_state(raw):
    state = str(raw or "stated").lower()
    if state in {"explicitly_not_required", "explicitly-not-required", "not_required"}:
        return "explicitly_not_required"
    if state in {"source_not_stated", "source_not_retrieved", "externally-referenced-not-extracted"}:
        return "source_not_stated"
    if any(term in state for term in ("conflict", "unscoped", "ambiguity", "mixed-source-block", "numeric-source-value", "unit-of-duration-missing")):
        return "source_uncertain"
    if "prefer" in state or "desirable" in state or "recommendation" in state:
        return "preferred"
    return "stated"


def compact_requirement(row, position_id, index, sources):
    text = row.get("sourceText", "")
    if not isinstance(text, str):
        text = str(text or "")
    raw_category = row.get("category") or row.get("requirementType") or "other"
    state = normalize_state(row.get("requirementState"))
    primary_source = next((s for s in sources if s.get("id") in (row.get("sourceIds") or [row.get("sourceId"), row.get("evidenceSourceId")])), sources[0])
    eligible = bool(text.strip()) and state in {"stated", "preferred"} and row.get("selfAssessmentEligible") is not False
    result = {
        "id": row.get("id") or f"{position_id}--r{index + 1:03d}",
        "category": normalize_category(raw_category), "sourceCategory": raw_category,
        "sourceText": text, "sourceLocator": row.get("sourceLocator") or row.get("sourceLocators") or "",
        "requirementState": state, "sourceRequirementState": row.get("requirementState") or "stated",
        "evidenceSourceUrl": row.get("evidenceSourceUrl") if source_url(row.get("evidenceSourceUrl")) else primary_source["url"],
        "selfAssessmentEligible": eligible,
    }
    for key in ("competencyDomainId", "classificationProvenance", "scope", "sourceGroup", "sourceHeading", "sourceSubheadingAsPublished", "sourceSectionAsPublished", "scopeConditionAsPublished", "applicationScope", "interpretationNote", "editorialNote", "assessmentNote", "logicalStructure"):
        if row.get(key) is not None:
            result[key] = row[key]
    return result


def position_sources(record):
    sources = []
    own_source = record.get("source")
    if isinstance(own_source, dict):
        sources.append(own_source)
    sources.extend(s for s in record.get("sources", []) if isinstance(s, dict))
    result, seen = [], set()
    for source in sources:
        if source_url(source.get("url")) and source["url"] not in seen:
            seen.add(source["url"])
            result.append(source)
    return result


def compact_position(record, canonical_id, employer, snapshot_at):
    sources = position_sources(record)
    if not sources:
        return None, "no-source-url"
    if not record.get("requirements"):
        return None, "no-published-requirement-text"
    marker = " ".join(str(record.get(key) or "") for key in ("recordType", "materialType", "status", "contentStatus", "currentOpenStatus")).lower()
    if any(term in marker for term in ("title-only", "title-marker", "role-title-inventory", "collectivecadrereserve", "historical-group-cadre-reserve", "title-assignment-unresolved")):
        return None, "title-only-or-unresolved-scope"
    requirements = [compact_requirement(r, record["id"], i, sources) for i, r in enumerate(record["requirements"]) if isinstance(r, dict)]
    # Retain explicitly scoped common requirements only when the source assigns
    # them to all positions in this same announcement. Never borrow a law's text.
    for row in record.get("commonRequirements", []):
        scope = str(row.get("applicationScope") or row.get("scope") or "")
        if isinstance(row, dict) and ("all-announced-positions-in-this" in scope or "all-positions-in-this" in scope):
            requirements.append(compact_requirement(row, record["id"], len(requirements), sources))
    if not any(r["sourceText"].strip() and r["requirementState"] not in {"source_not_stated", "source_uncertain"} for r in requirements):
        return None, "no-specific-published-requirements"
    if not any(r["selfAssessmentEligible"] for r in requirements):
        return None, "requirements-not-ready-for-self-assessment"
    is_profile = any(term in marker for term in ("regulation", "normative", "not-a-vacancy", "not-an-open-vacancy", "not-open-vacancy", "notvacancy", "not-recruitment", "not-a-recruitment", "not-vacancy", "professional_position_profile", "reserve", "talent-pool", "cadre"))
    archive = record.get("archive")
    archived_flag = archive is True or (isinstance(archive, dict) and archive.get("isArchive") is True)
    is_archived = archived_flag or any(term in marker for term in ("archiv", "closed", "expired", "deadline-past", "historical", "past-relative"))
    kind = "position-profile" if is_profile else "archived-vacancy" if is_archived else "vacancy"
    first = sources[0]
    location = record.get("location") or {}
    dates = {"publishedAt": first.get("publishedAt") or record.get("sourcePublishedAt") or record.get("announcementDate") or record.get("sourceDocumentDate"), "retrievedAt": first.get("retrievedAt") or first.get("checkedAt") or record.get("observedAt") or snapshot_at[:10]}
    result = {
        "id": record["id"], "institutionId": canonical_id, "sourceInstitutionId": record["institutionId"],
        "title": record["title"], "employerName": employer["name"],
        "department": record.get("department") or record.get("unitNameAsPublished") or "",
        "employmentType": record.get("employmentType") or record.get("serviceType") or "unspecified",
        "kind": kind, "status": "profile" if is_profile else "archived" if is_archived else "unconfirmed",
        "originalStatus": record.get("status") or record.get("publicationStatus") or "source-snapshot",
        "url": first["url"], "source": {"title": first.get("title") or record["title"], "url": first["url"], **dates, "format": first.get("format")},
        "sources": [{k: s[k] for k in ("id", "url", "title", "publishedAt", "checkedAt", "retrievedAt", "sha256", "contentHash", "sourceLocator") if s.get(k) is not None} for s in sources],
        "regionId": record.get("regionId") or (location.get("regionId") if isinstance(location, dict) else None) or employer.get("regionId"),
        "location": location.get("text", "") if isinstance(location, dict) else str(location),
        "requirements": requirements,
        "duties": [{"sourceText": d, "sourceLocator": ""} if isinstance(d, str) else {"sourceText": d.get("sourceText") or d.get("text") or "", **{k: d[k] for k in ("sourceLocator", "evidenceSourceUrl") if k in d}} for d in record.get("duties", []) if isinstance(d, (str, dict))],
        "coverage": record.get("coverage") or {},
        "sourceSnapshotAt": snapshot_at,
        "currentRecruitmentVerified": False,
    }
    salary = record.get("salary")
    if salary:
        result["salary"] = salary.get("rawText", "") if isinstance(salary, dict) else str(salary)
    if record.get("fullDescription"):
        result["fullDescription"] = record["fullDescription"]
    notes = text_values(record.get("limitations")) + text_values(record.get("limits"))
    if notes:
        result["sourceLimitations"] = list(dict.fromkeys(notes))
    return result, None


def first_source_sentence(paragraph):
    match = re.search(r"^(.+?[.!?])(?:\s+[А-ЯA-Z«“]|$)", paragraph, flags=re.DOTALL)
    return match.group(1) if match and len(match.group(1)) >= 50 else paragraph


def write_catalogue_index(authorities, snapshot_at):
    templates, index, shards = {}, [], collections.defaultdict(list)
    for item in authorities:
        template = {"tracks": item["tracks"], "sectors": item["sectors"], "donorIds": item["scoringProvenance"]["donorIds"]}
        encoded = json.dumps(template, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        key = hashlib.sha256(encoded.encode()).hexdigest()[:12]
        templates[key] = template
        region_key = item["regionId"] or "national"
        detail_path = f"data/territorial-authorities/{region_key}.json"
        sources = item["descriptionSources"]
        preferred_source = next((s for s in sources if any(k in {"description", "functions", "institutional-remit", "identity"} for k in s.get("supports", []))), sources[0])
        row = {
            "id": item["id"], "name": item["name"], "level": item["level"], "regionId": item["regionId"],
            "mission": first_source_sentence(item["mission"]), "scoringKey": key,
            "governmentUrl": item["governmentUrl"], "sourceUrl": preferred_source["url"],
            "verifiedAt": item["verifiedAt"], "detailPath": detail_path,
            "coding": 0 if item["scoringProvenance"]["kind"] == "retained-editorial-functional-families" else 1,
        }
        if item["shortName"]:
            row["shortName"] = item["shortName"]
        if item.get("aliasIds"):
            row["aliasIds"] = item["aliasIds"]
        if item.get("sourceSnapshotAt") != snapshot_at:
            row["sourceSnapshotAt"] = item["sourceSnapshotAt"]
        index.append(row)
        shards[region_key].append(item)
    shard_dir = OUTPUT / "territorial-authorities"
    shard_dir.mkdir(exist_ok=True)
    for region, items in shards.items():
        write(shard_dir / f"{region}.json", {"schemaVersion": 1, "sourceSnapshotAt": snapshot_at, "authorities": items})
    write(OUTPUT / "territorial-authorities.json", {"schemaVersion": 1, "preparedAt": DATE, "sourceSnapshotAt": snapshot_at, "templates": templates, "authorities": index})


def write_position_shards(positions, catalog, snapshot_at):
    shards = collections.defaultdict(list)
    for item in positions:
        employer = catalog[item["institutionId"]]
        # Federal employers are national even when an announcement gives a city;
        # a territorial federal unit has not been relabelled as regional.
        region_key = employer.get("regionId") if employer.get("level") in {"regional", "municipal"} else "national"
        shards[region_key or "national"].append(item)
    shard_dir = OUTPUT / "position-materials"
    shard_dir.mkdir(exist_ok=True)
    records = []
    for region, items in sorted(shards.items()):
        path = f"data/position-materials/{region}.json"
        write(shard_dir / f"{region}.json", {"schemaVersion": 1, "sourceSnapshotAt": snapshot_at, "positions": items})
        records.append({"regionId": None if region == "national" else region, "path": path, "count": len(items)})
    national = next((r for r in records if r["regionId"] is None), None)
    write(OUTPUT / "sourced-position-materials.json", {"schemaVersion": 1, "preparedAt": DATE, "sourceSnapshotAt": snapshot_at, "total": len(positions), "national": national, "regions": [r for r in records if r["regionId"] is not None]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source = args.source
    source_catalog = read(source / "data/completion/assembled/institutions.json")
    source_positions = read(source / "data/completion/assembled/positions.json")
    snapshot_at = source_catalog["updatedAt"]
    supplement_path = OUTPUT / "territorial-supplement.json"
    supplement = read(supplement_path) if supplement_path.exists() else {"institutions": []}
    records = source_catalog["institutions"] + supplement["institutions"]
    baseline = read(OUTPUT / "authorities.json")
    donors = {a["id"]: a for a in baseline}
    for record in records:
        scoring = record.get("scoring") or {}
        if record["id"] not in donors and scoring.get("tracks"):
            donors[record["id"]] = {**record, **scoring}
    families = family_map(source, donors)
    proxy_families = {}
    for family_id, family in families.items():
        proxy_families.setdefault(family["proxyAuthorityId"], family_id)
    for proxy, family in {"fas": "financial-control", "rosselkhoznadzor": "agriculture", "rosleshoz": "environment", "rosrybolovstvo": "agriculture", "rosvodresursy": "environment", "rosreestr": "property", "rostekhnadzor": "technical-supervision", "fstek": "digital-government"}.items():
        proxy_families[proxy] = family
    baseline_ids = {a["id"] for a in baseline}
    region_ids = {r["id"] for r in read(OUTPUT / "territories.json")}
    candidates, omitted = [], []
    for record in records:
        if record["id"] in baseline_ids or record.get("level") not in {"regional", "municipal", "national-corporation"}:
            continue
        reason = exclusion_reason(record)
        if not reason and record.get("level") != "national-corporation" and record.get("regionId") not in region_ids:
            reason = "unresolved-territory"
        item = None if reason else authority(record, families, donors, proxy_families, snapshot_at)
        if not reason and item is None:
            reason = "no-supported-functional-coding"
        if reason:
            omitted.append({"id": record["id"], "name": record["name"], "regionId": record.get("regionId"), "reason": reason})
        else:
            candidates.append(item)
    # Exact normalized identity duplicates represent one employer. Keep the
    # earlier stable ID, retain alias IDs for all linked position materials.
    unique, aliases, seen = [], {}, {}
    for item in candidates:
        key = (item["level"], item["regionId"], normalize(item["name"]))
        if key in seen:
            old = seen[key]
            aliases[item["id"]] = old["id"]
            old.setdefault("aliasIds", []).append(item["id"])
            known = {s["url"] for s in old["descriptionSources"]}
            old["descriptionSources"].extend(s for s in item["descriptionSources"] if s["url"] not in known)
            continue
        seen[key] = item
        unique.append(item)
    for item in unique:
        aliases[item["id"]] = item["id"]
    for item in baseline:
        aliases[item["id"]] = item["id"]
    catalog = {item["id"]: item for item in baseline + unique}
    positions, omitted_positions = [], []
    for record in source_positions["vacancies"]:
        identifier = aliases.get(record["institutionId"])
        if not identifier:
            omitted_positions.append({"id": record["id"], "reason": "employer-outside-eligible-catalogue"})
            continue
        material, reason = compact_position(record, identifier, catalog[identifier], snapshot_at)
        if reason:
            omitted_positions.append({"id": record["id"], "reason": reason})
        else:
            positions.append(material)
    position_ids = set()
    for position in positions:
        assert position["id"] not in position_ids, f"Duplicate position ID: {position['id']}"
        position_ids.add(position["id"])
    assert len({a["id"] for a in unique}) == len(unique)
    coverage = []
    for region in read(OUTPUT / "territories.json"):
        employers = [a for a in unique if a["regionId"] == region["id"]]
        materials = [v for v in positions if v["institutionId"] in {a["id"] for a in employers}]
        assert len(employers) >= 3, (region["id"], len(employers))
        coverage.append({"id": region["id"], "name": region["name"], "authorities": len(employers), "regional": sum(a["level"] == "regional" for a in employers), "municipal": sum(a["level"] == "municipal" for a in employers), "positionMaterials": len(materials)})
    write_catalogue_index(unique, snapshot_at)
    write_position_shards(positions, catalog, snapshot_at)
    source_manifest = {"name": "RUDN_Career_v9_Stage5_2026-11-02.zip", "snapshotAt": snapshot_at, "institutionsSha256": hashlib.sha256((source / "data/completion/assembled/institutions.json").read_bytes()).hexdigest(), "positionsSha256": hashlib.sha256((source / "data/completion/assembled/positions.json").read_bytes()).hexdigest(), "supplement": {"path": "data/territorial-supplement.json", "reviewedAt": supplement.get("reviewedAt"), "institutions": len(supplement["institutions"]), "sha256": hashlib.sha256(supplement_path.read_bytes()).hexdigest() if supplement_path.exists() else None}}
    report = {"schemaVersion": 1, "preparedAt": DATE, "source": source_manifest, "counts": {"territories": len(coverage), "newEmployers": len(unique), "regional": sum(a["level"] == "regional" for a in unique), "municipal": sum(a["level"] == "municipal" for a in unique), "newCorporations": sum(a["level"] == "national-corporation" for a in unique), "sourcePositions": len(source_positions["vacancies"]), "positionMaterials": len(positions), "requirements": sum(len(v["requirements"]) for v in positions), "assessableRequirements": sum(r["selfAssessmentEligible"] for v in positions for r in v["requirements"]), "employersWithPositions": len({v["institutionId"] for v in positions}), "duplicateIdentitiesMerged": len(candidates) - len(unique)}, "positionKinds": dict(collections.Counter(v["kind"] for v in positions)), "coverage": coverage, "regionsWithoutMunicipalExamples": [r["id"] for r in coverage if not r["municipal"]], "excludedEmployerReasons": dict(collections.Counter(a["reason"] for a in omitted)), "excludedPositionReasons": dict(collections.Counter(a["reason"] for a in omitted_positions)), "excludedEmployers": omitted, "excludedPositions": omitted_positions, "identityAliases": {k: v for k, v in aliases.items() if k != v}, "method": {"roleScoring": "Existing educational career vectors with explicit functional-family coding; not a validated job norm.", "workingConditions": "Not inherited from federal donors; unknown remains neutral.", "requirements": "Only exact retained employer wording; unspecified and explicitly absent are distinct.", "vacancies": "Unconfirmed/archived postings and published role profiles remain different kinds.", "coverage": "Three or more described local/regional institutions for all 89 entries. Municipality examples are explicitly partial, not exhaustive."}}
    write(OUTPUT / "territorial-catalog-provenance.json", report, pretty=True)
    print(json.dumps({"counts": report["counts"], "positionKinds": report["positionKinds"], "excludedEmployerReasons": report["excludedEmployerReasons"], "excludedPositionReasons": report["excludedPositionReasons"], "minimumRegionalGroup": min(r["authorities"] for r in coverage), "regionsWithMunicipalExamples": sum(r["municipal"] > 0 for r in coverage)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
