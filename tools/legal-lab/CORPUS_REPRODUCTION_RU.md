# Воспроизведение корпуса Legal Lab

Версия содержания: `legal-lab-2026-10-15.2`. Это воспроизводимое приобретение и проверка учебного корпуса, а не юридическое заключение человека. Исторический 122-ФЗ и два московских акта сведены по опубликованным исходным поправкам; все операции сохранены в receipts.

## Зависимости и размещение

Python 3.11+; точные использованные версии в `corpus-requirements.txt`. Устанавливать в отдельное окружение проекта, не менять глобальную конфигурацию. Нужны стандартная библиотека, BeautifulSoup, pdfplumber, pypdfium2 и Pillow. `requests`, внешние API, ключи и Playwright этим инструментам не нужны.

Файлы из tools можно перенести вместе в `tools/legal-lab/`. До запуска установить `LEGAL_LAB_WORK_ROOT` на рабочий каталог приобретения, `LEGAL_LAB_DATA_DIR` на `site/apps/legal-lab/data` и `LEGAL_LAB_EVIDENCE_DIR` на папку отчётов. `sources.json` находится рядом с инструментами. В рабочем каталоге сохраняются raw receipts, кандидаты и резервные копии; это не студентский public-каталог.

## Сверка установленного комплекта

```
python -X utf8 tools/legal-lab/review_corpus.py --staged site/apps/legal-lab/data --structural-report evidence/corpus-structure.json
python -X utf8 -m unittest discover -s tools/legal-lab/tests -p corpus_regression_test.py -v
```

Regression test поддерживает исходное расположение `tests` рядом с `tools` и размещение в `tools/legal-lab/tests`. Сам тест проверяет дефекты загрузчика, DOM-контейнеров примечаний, cache checksum/expiry, вложенных абзацев и PDF-примечаний; это 11 новых адресных тестов. Исходные baseline-тесты ZIP остаются отдельно.

## Точное повторение текста без обращения к сети

```
python -X utf8 tools/legal-lab/rebuild_corpus_snapshot.py --source-archive evidence/source-snapshots.zip --archive-sha256 98508214430211dc9e28eb119d247698f380c90c4503560452ee2a6e3bec9106 --reference-data site/apps/legal-lab/data --work-dir corpus-rebuild
```

Папка `corpus-rebuild` должна быть новой/пустой. Команда проверяет SHA архива, безопасно извлекает исходники, проверяет каждый raw receipt, восстанавливает московские поправки и исторический срез, повторно получает все страницы оглавлений из зафиксированных исходников и сравнивает units SHA всех 16 документов. Сетевой fallback отсутствует; отсутствие исходника завершает работу ошибкой. Результат — кандидаты и `corpus-rebuild/evidence/reproduction.json`, без установки и публикации. SHA файла кандидата отличается из-за локальных путей происхождения и review metadata; текст, порядок, IDs, sections, графические ссылки и sourceUrl входят в проверяемый units SHA.

## Новое приобретение

```
python -X utf8 tools/legal-lab/acquire_corpus.py --ids constitution koap spatial civil79 municipal25 system58 local33 procurement44 corruption273 goals309 ekb archive122 realty218 --output .pending-corpus --max-cache-age-hours 24
python -X utf8 tools/legal-lab/prepare_supplements.py
python -X utf8 tools/legal-lab/apply_moscow_amendments.py
python -X utf8 tools/legal-lab/acquire_corpus.py --ids moscow3 moscow35 moscow50 --local-dir .supplement-blocks --output .pending-supplements
```

Для PDF и московских поправок нужны публичные исходные файлы и receipts из source-provenance-manifest; повторная загрузка должна сохранить URL, время получения и raw SHA. При изменении байтов источника редакцию и даты вступления поправок требуется перепроверить; код не объявляет новую сетевую загрузку автоматически полной и пригодной. Возврат `needs-fix` из-за неразрешённого anchor запрещает установку до исправления. Минимальные размеры — только диагностический фильтр, а не доказательство полноты.

`clean_corpus.py`, `reconstruct_archive122.py`, `prepare_final_cleanup.py` и `finalize_candidates.py` сохраняют source-based преобразования. Для исходной исторической страницы используется каталог `.pending-archive-fixed`, затем синтетическая реконструкция пяти поздних положений до 12.07.2012. Проверенная последовательность для замороженного выпуска автоматизирована в snapshot rebuild; запуск устаревших промежуточных stage поверх финальных кандидатов недопустим.

## Проверка и установка

```
python -X utf8 tools/legal-lab/review_corpus.py --template
python -X utf8 tools/legal-lab/review_corpus.py --attestation evidence/corpus-review-attestation.json
python -X utf8 tools/legal-lab/review_corpus.py --attestation evidence/corpus-review-attestation.json --install
```

Шаблон имеет все флажки false. Только после фактической проверки каждой редакции, приложений, ссылок и очистки указываются reviewer, дата, per-document evidence и SHA. `reviewKind` различает `synthetic-source-audit` и `human-source-audit`; модель не выдает свой review за человеческий. Установка сохраняет backup, изменяет только catalog/documents и внутренний review report. Банк, оценки, профиль, Firebase и публикация не затрагиваются.

## Доказательства этого выпуска

`source-provenance-manifest.json` — 1888 исходных записей, ни одного отсутствующего raw SHA; `source-snapshots.zip` — внутренние HTML/PDF и receipts. `archive122-historical-reconstruction.json`, `amendment-application-receipts.json`, `pdf-cleanup-receipts.json`, `anchor-corrections.json` — точные изменения с источниками. `structural-review.json`, `focused-tests.json`, независимая папка `corpus-review` и финальный units/file manifest подтверждают фактические проверки. Raw источники и служебные отчёты не включать в интерфейс студента.
