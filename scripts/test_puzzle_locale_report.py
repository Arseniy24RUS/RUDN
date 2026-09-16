"""Fail closed for the full EN/ZH release-layout supplement."""
import argparse
from collections import Counter
import json
from pathlib import Path
from prepare_puzzle_catalog import build_catalog, write_json

VIEWPORTS = [(320,568),(360,800),(390,844),(412,915),(768,1024),
             (1024,1366),(1366,768),(1920,1080),(568,320),(800,360),
             (844,390),(915,412)]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts',type=Path,required=True)
    args=parser.parse_args()
    maps=build_catalog()
    expected={(browser,entry['id'],locale,width,height)
              for browser in ('chromium','firefox','webkit')
              for entry in maps for locale in ('en','zh') for width,height in VIEWPORTS}
    rows=[]
    errors=[]
    reports=list(args.artifacts.rglob('supplemental-locale-layout-*.json'))
    for path in reports:
        report=json.loads(path.read_text(encoding='utf-8'))
        if not report.get('success'):
            errors.append('Unsuccessful report: '+str(path))
        rows.extend(report['rows'])
    keys=Counter((r['browser'],r['map'],r['locale'],r['width'],r['height']) for r in rows)
    missing=expected-set(keys)
    extra=set(keys)-expected
    duplicate=[key for key,count in keys.items() if count!=1]
    failed=[r for r in rows if r['status']!='passed']
    if missing or extra or duplicate or failed:
        errors.append(f'Missing={len(missing)} extra={len(extra)} duplicate={len(duplicate)} failed={len(failed)}')
    summary={'maps':len(maps),'locales':['en','zh'],'engines':3,'viewports':12,
             'expected':len(expected),'observed':len(rows),'reports':len(reports),
             'passed':len(rows)-len(failed),'missingCount':len(missing),
             'duplicateCount':len(duplicate),'failedCount':len(failed),
             'success':not errors,'errors':errors,'missing':sorted(missing)[:30]}
    write_json(args.artifacts/'localized-layout-summary.json',summary)
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return int(bool(errors))

if __name__=='__main__':
    raise SystemExit(main())
