#!/usr/bin/env python3
"""Build a dependency-free local demonstration. Source modules remain separate in production."""
from pathlib import Path
import re, json, base64
root=Path(__file__).resolve().parents[1]
app=root/'site/apps/reception'
assets={} # Shared external WebP files are loaded on demand, not base64-embedded.
modules=[]
for name in ['calendar-model','calendar-bundled','calendar','calendar-providers','calendar-consultant','calendar-repository','policy','settings','catalog','evidence-catalog','evidence','case-time','cases','icons','source-policy','source-index','source-lifecycle','source-monitor-ui','graphics-data','characters','assignment','documents','legal-reference','engine','storage','pilot','confirm','app','standalone']:
 text=((root/'site/assets/js/legal-calendar.js') if name=='calendar' else (root/f'site/assets/js/{name}.js') if name.startswith('calendar-') else app/f'js/{name}.js').read_text(encoding='utf-8')
 text=re.sub(r'^import .*?;\s*$', '',text,flags=re.M)
 text=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))','',text)
 if name=='calendar-repository':
  text=text.replace("new URL('../data/calendars/current.json',import.meta.url).href","'https://arseniy24rus.github.io/RUDN/assets/data/calendars/current.json'")
 if name=='app':
  text=text.replace("const media=path=>new URL('../'+path,import.meta.url).href;",'const media=path=>path;')
  text=text.replace("new URL('../style.css?v=1.0.1',import.meta.url)","''")
 modules.append(text)
script='(function(){\nconst ASSET_DATA='+json.dumps(assets)+';\n'+'\n'.join(modules)+'''\nmountStandalone(document.getElementById('receptionApp'));\n})();'''
if 'import.meta' in script:raise RuntimeError('Unresolved module URL in standalone build')
css=(app/'style.css').read_text(encoding='utf-8')
html='''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="assets/gfx1/ui/U01.svg" type="image/svg+xml"><meta name="description" content="Учебный тренажёр работы с обращениями граждан: документы, правовые источники, сроки и решения."><meta name="theme-color" content="#0079c1"><title>Приёмная. Первая смена · РУДН · автономная тренировка</title><style>html{background:#eaf5fe}body{margin:0;padding:22px;font-family:'Segoe UI',Arial,sans-serif}#receptionApp{max-width:1460px;margin:auto;box-shadow:0 16px 65px #0b5d9220;border-radius:24px}@media(max-width:760px){body{padding:0}#receptionApp{border-radius:0}}</style><style id="rudn-reception-style-v101">'''+css+'''</style></head><body><div id="receptionApp"></div><noscript>Для игры требуется JavaScript.</noscript><script>'''+script.replace('</script','<\\/script')+'''</script></body></html>'''
out=app/'demo.html';out.write_text(html,encoding='utf-8');print(out, len(html.encode()))
