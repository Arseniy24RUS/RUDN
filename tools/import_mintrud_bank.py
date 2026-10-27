"""Import the preserved Mintrud v4 PDF, including its printed answer underlines.

This creates source evidence, not a declaration of current legal correctness.
Run with the bundled Python providing pdfplumber and pypdf. No network requests.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

import pdfplumber
from pypdf import PdfReader


SOURCE_URL = 'https://ombudsman-oren.ru/wp-content/uploads/2024/07/obshhie-testy-na-konkurs.pdf'
SOURCE_SHA256 = '0800769a95d70a69b82ea5187c714a28af303c27db5cfbb1ffcf7305ad904f24'
SECTIONS = {
    'I': ('russian', 'Русский язык'),
    'II': ('constitution', 'Конституция Российской Федерации'),
    'III': ('civil-service', 'Государственная и гражданская служба'),
    'IV': ('anti-corruption', 'Противодействие коррупции'),
    'V': ('ict', 'Информационно-коммуникационные технологии'),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def box(obj: dict[str, Any]) -> list[float]:
    return [round(float(obj[k]), 3) for k in ('x0', 'top', 'x1', 'bottom')]


def normalized(text: str) -> str:
    return ' '.join(text.replace('\u00ad', '').split())


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def import_pdf(pdf: Path, output: Path, assets: Path, report: Path, expected_sha: str) -> dict[str, Any]:
    sha = digest(pdf)
    if sha != expected_sha:
        raise ValueError(f'Source hash mismatch: expected {expected_sha}, got {sha}. Review a new source explicitly.')
    reader = PdfReader(pdf)
    metadata = {str(k): str(v) for k, v in (reader.metadata or {}).items()}
    records: list[dict[str, Any]] = []
    section_id = 'russian'
    current = None
    heading = False
    page_data: dict[int, dict[str, Any]] = {}
    assets.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(pdf) as book:
        for page in book.pages:
            pn = page.page_number
            if pn < 3:
                continue
            underlines = [r for r in page.rects if 0 < r['height'] <= 1.5 and r['width'] >= 3]
            page_data[pn] = {
                'width': page.width, 'height': page.height,
                'images': [box(x) for x in page.images],
            }
            for line in page.extract_text_lines(return_chars=True):
                text = line['text'].strip()
                if not text or (re.fullmatch(r'\d+', text) and line['top'] > page.height - 65):
                    continue
                chapter = re.match(r'^(I{1,3}|IV|V)\.\s+Тестовые вопросы', text)
                if chapter:
                    section_id = SECTIONS[chapter[1]][0]
                    heading = True
                    continue
                start = re.match(r'^(\d{1,3})\.\s+', text)
                is_start = start and int(start[1]) == len(records) + 1
                if is_start:
                    heading = False
                    number = int(start[1])
                    current = {
                        'id': f'MT4-{number:04d}', 'number': number,
                        'sectionId': section_id,
                        '_stem': [text[start.end():]], '_stemLines': [], '_graphicLines': [],
                        'options': [], 'sourcePage': pn, 'sourceEndPage': pn,
                        '_lines': [], '_anchor': {'page': pn, 'bbox': box(line)},
                    }
                    records.append(current)
                if current is None or heading:
                    continue
                evidence = {'page': pn, 'bbox': box(line), 'text': text}
                current['_lines'].append(evidence)
                current['sourceEndPage'] = pn
                if is_start:
                    current['_stemLines'].append(evidence)
                    continue
                if text.startswith(('•', '')):
                    current['options'].append({
                        'id': chr(97 + len(current['options'])), '_text': [],
                        'sourceLines': [], '_charCount': 0, '_underlinedCharCount': 0,
                        'sourceUnderlineEvidence': [],
                    })
                    text = text[1:].strip()
                if not current['options']:
                    if re.fullmatch(r'(?:Таблица|Рисунок|Фрагмент)\s+\d+', text):
                        current['_graphicLines'].append(evidence)
                        continue
                    current['_stem'].append(text)
                    current['_stemLines'].append(evidence)
                    continue
                option = current['options'][-1]
                option['_text'].append(text)
                option['sourceLines'].append(evidence)
                chars = [c for c in line['chars'] if c['text'].strip() and c['text'] not in ('•', '')]
                hit_rects: dict[tuple[float, ...], dict[str, Any]] = {}
                hits = 0
                for char in chars:
                    matching = [r for r in underlines if abs(r['top'] - char['bottom']) <= 2.5
                                and r['x0'] - .4 <= (char['x0'] + char['x1']) / 2 <= r['x1'] + .4]
                    if matching:
                        hits += 1
                        for rect in matching:
                            hit_rects[tuple(box(rect))] = {'page': pn, 'bbox': box(rect)}
                option['_charCount'] += len(chars)
                option['_underlinedCharCount'] += hits
                option['sourceUnderlineEvidence'].extend(hit_rects.values())
            if pn % 20 == 0:
                print(f'Extracted page {pn}/{len(book.pages)}; questions started: {len(records)}', flush=True)

        if [r['number'] for r in records] != list(range(1, 701)):
            raise ValueError(f'Expected exactly sequential questions 1..700; got {len(records)}.')
        for index, record in enumerate(records):
            record['stem'] = normalized(' '.join(record.pop('_stem')))
            record['stemSourceLines'] = record.pop('_stemLines')
            record['graphicSourceLines'] = record.pop('_graphicLines')
            record['correctOptionIds'] = []
            issues = []
            for option in record['options']:
                option['text'] = normalized(' '.join(option.pop('_text')))
                total = option.pop('_charCount')
                hits = option.pop('_underlinedCharCount')
                fraction = hits / max(total, 1)
                option['sourceUnderlineFraction'] = round(fraction, 6)
                option['sourceUnderlineCharacters'] = hits
                option['sourceTextCharacters'] = total
                if fraction >= .6:
                    record['correctOptionIds'].append(option['id'])
                elif fraction > 0:
                    issues.append('partial-option-underlining')
                if not option['text']:
                    issues.append('empty-option-text')
            if not 2 <= len(record['options']) <= 8:
                issues.append('unusual-option-count')
            if not record['correctOptionIds']:
                issues.append('no-unambiguous-underlined-key')
            if len(record['correctOptionIds']) == len(record['options']):
                issues.append('all-options-underlined')
            record['answerMode'] = 'multiple' if len(record['correctOptionIds']) > 1 else 'single'
            lines = record.pop('_lines')
            anchor = record.pop('_anchor')
            next_anchor = records[index + 1]['_anchor'] if index + 1 < len(records) else None
            regions = []
            media = []
            for pn in range(anchor['page'], (next_anchor['page'] if next_anchor else len(book.pages)) + 1):
                page = book.pages[pn - 1]
                top = anchor['bbox'][1] if pn == anchor['page'] else 20.
                bottom = next_anchor['bbox'][1] - 1 if next_anchor and pn == next_anchor['page'] else page.height - 40.
                if bottom <= top:
                    continue
                local_lines = [x for x in lines if x['page'] == pn]
                image_boxes = [b for b in page_data[pn]['images'] if b[3] > top and b[1] < bottom]
                if not local_lines and not image_boxes:
                    continue
                regions.append({'page': pn, 'bbox': [20., round(top, 3), round(page.width - 20, 3), round(bottom, 3)]})
                if image_boxes:
                    graphic_boxes = [x['bbox'] for x in record['graphicSourceLines'] if x['page'] == pn]
                    # Preserve complete image objects and separately printed
                    # table/figure captions. Tight bounds exclude fragments of
                    # the preceding question's glyph descenders and answer keys.
                    image_top = min(b[1] for b in image_boxes)
                    image_bottom = max(b[3] for b in image_boxes)
                    combined_boxes = image_boxes + graphic_boxes
                    crop_top = min(b[1] for b in combined_boxes)
                    crop_bottom = max(b[3] for b in combined_boxes)
                    if crop_bottom <= crop_top or any(b[1] < crop_top or b[3] > crop_bottom for b in image_boxes):
                        issues.append('image-crop-needs-review')
                    if crop_bottom > crop_top:
                        crop_box = (max(0., min(b[0] for b in combined_boxes) - 1), crop_top,
                                    min(page.width, max(b[2] for b in combined_boxes) + 1), crop_bottom)
                        name = f"{record['id']}-p{pn:03d}.png"
                        target = assets / name
                        page.crop(crop_box).to_image(resolution=144).save(target)
                        media.append({
                            'kind': 'question-graphic', 'path': target.relative_to(output.parent).as_posix(),
                            'sha256': digest(target), 'sourcePage': pn,
                            'sourceBbox': [round(x, 3) for x in crop_box],
                            'sourceImageBboxes': image_boxes, 'reviewStatus': 'review-needed',
                        })
                    else:
                        media.append({'kind': 'source-image-unresolved', 'sourcePage': pn, 'sourceImageBboxes': image_boxes, 'reviewStatus': 'review-needed'})
            if record['sectionId'] == 'ict' and not media and record['options'] and all(re.fullmatch(r'\d+(?:\s*[,;]\s*\d+)*', o['text']) for o in record['options']):
                if re.search(r'рисунк|изображ|кнопк|устройств|фрагмент|скриншот|таблиц', record['stem'], re.I):
                    issues.append('possible-missing-question-image')
            if media:
                issues.append('question-image-review-required')
            record['sourceRegions'] = regions
            record['media'] = media
            record['sourceKeyMethod'] = 'printed-option-underlines'
            record['reviewIssues'] = sorted(set(issues))
            record['reviewStatus'] = 'review-needed' if issues else 'source-extracted'
            record['legalFreshnessStatus'] = 'not-reviewed'

    summary = {
        'status': 'pass', 'sourceSha256': sha, 'sourcePages': len(reader.pages),
        'questionCount': len(records), 'sequentialNumbering': True,
        'sections': dict(Counter(r['sectionId'] for r in records)),
        'optionCountDistribution': dict(sorted(Counter(len(r['options']) for r in records).items())),
        'keyCountDistribution': dict(sorted(Counter(len(r['correctOptionIds']) for r in records).items())),
        'sourceExtractedCount': sum(r['reviewStatus'] == 'source-extracted' for r in records),
        'reviewNeededCount': sum(r['reviewStatus'] == 'review-needed' for r in records),
        'issueCounts': dict(Counter(issue for r in records for issue in r['reviewIssues'])),
        'questionsWithMedia': sum(bool(r['media']) for r in records),
        'rasterAssetCount': sum('path' in m for r in records for m in r['media']),
        'questionsWithUnresolvedMedia': [r['id'] for r in records if any('path' not in m for m in r['media'])],
        'notYetValidated': ['Current legal correctness', 'Human review of all translations', 'Equivalence to the live portal bank', 'Visual correctness of every extracted graphic'],
    }
    document = {
        'schemaVersion': 1,
        'source': {
            'url': SOURCE_URL, 'sha256': sha,
            'title': 'Комплекс тестовых вопросов с ответами на соответствие базовым квалификационным требованиям',
            'version': '4', 'publisherAttribution': 'Министерство труда и социальной защиты Российской Федерации (титульный лист)',
            'host': 'Сайт Уполномоченного по правам человека в Оренбургской области',
            'pdfPageCount': len(reader.pages), 'pdfMetadata': metadata,
            'observedDate': '2026-10-27',
            'dateCaveat': 'PDF metadata and upload URL dates do not certify the revision date or current legal validity of the questions.',
            'extraction': {
                'tool': 'tools/import_mintrud_bank.py', 'version': 1,
                'method': 'PDF text lines and printed underline rectangles; no inferred or independently solved keys.',
                'underlineRule': 'Filled horizontal rectangles 0<height<=1.5pt, width>=3pt, within 2.5pt of character bottom; >=60% non-space option characters.',
                'coordinateSystem': 'PDF points, [x0, top, x1, bottom], page origin top-left; sourcePage is 1-based.',
            },
        },
        'sections': [{'id': sid, 'title': title} for sid, title in SECTIONS.values()],
        'questions': records,
    }
    write_json(output, document)
    summary['outputSha256'] = digest(output)
    write_json(report, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--expected-sha256', default=SOURCE_SHA256)
    args = parser.parse_args()
    summary = import_pdf(args.pdf.resolve(), args.out.resolve(), args.assets.resolve(), args.report.resolve(), args.expected_sha256.lower())
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
