# Reception display localization

`cases.js`, evidence records, assignment manifests, source snapshots, answer IDs and
stored student work remain canonical. Localization is a presentation operation;
it must never rewrite an answer, identifier, reference URL or a scoring key.

`node site/apps/reception/localization/extract.mjs` creates the deterministic
inventory in `source/inventory.json`. Its SHA-256-derived IDs are stable when
unrelated entries are added. Contexts identify the authored field or UI source.
Shared sentences have one entry even if many case variants use them.

Translation batches live in `translations/<batch>.json`. Each batch is an object
whose keys are inventory IDs and values are `{ "en": "…", "zh": "…" }`.
Both translations must preserve all `{{datePlaceholder}}` variables, numbers,
URLs and substantive details. Do not abbreviate scenarios or replace missing
translations with a generic explanation. Proper names can be transliterated.

`ui.js` contains display-only UI strings and explicit dynamic templates. The
runtime excludes editable controls and explicitly marked user-content elements.
It does not translate free-text answers, names, saved snapshots or exports of
the user's original answers.

The inventory is deliberately more inclusive than the student UI: it also
contains authoring diagnostics and editor-only tools. Coverage checks report
missing translations rather than treating a Russian fallback as completion.

Publication of a locale is gated on complete coverage and rendered-flow tests.
An incomplete catalog must not be described as a fully localized module.

## Lazy build and browser contract

`compile.mjs` writes no release catalogs until inventory coverage and validation
pass. It then uses `pack-builder.mjs` to produce a small manifest per language,
one common pack, 178 individual case packs, and explicit catalog/source-index
packs. Immutable filenames contain the SHA-256 prefix; the manifest is written
last. Build inputs, translations, fixtures and scripts are not browser assets
and must not be precached. `content/build.mjs` must run before this compiler if
canonical authored content changes. Do not regenerate `--batches` while assigned
translation batches are in progress.

The display loader accepts the exact template IDs from an existing assignment:

```js
const loader = createReceptionCatalogLoader();
const translator = await loadReceptionTranslator(language, {
  loader,
  templateIds: state.assignment.manifest.map(row => row.templateId),
  contentVersion: state.contentVersion,
  signal,
  includeCatalog: false,
  includeSourceIndex: false,
});
```

Only opening the optional bank/editor should set its corresponding flag. Reuse
the loader while a module is mounted so adding one case fetches only that case's
translation pack. Pass the saved content version; a different version is rejected
rather than changing the assignment or displaying an unrelated pack. A failed
load leaves the existing language and all work untouched. The caller must also
discard a successful response if its language request or active owner changed.
Do not apply translated values back to `state`, snapshots, IDs or user input.

Verified packs use a separate `rudn-reception-locales-v2` CacheStorage cache for
offline display. Network and optional cache operations have finite deadlines.
Only SHA-verified complete packs are returned; cached corruption never counts
as a successful translation. This cache contains public display text, not work.

Checks:

- `node site/apps/reception/localization/test.mjs` — immutable inputs/state and
  RU→EN→ZH→RU display contract (isolated synthetic DOM).
- `node site/apps/reception/localization/pack-test.mjs` — all source inventory
  entries covered, per-case loading, explicit catalog/editor, offline/cache
  integrity, deadlines and cancellation in Chromium and WebKit. Synthetic
  translations exist only in memory and never enter `compiled/`.

These contracts are supplemented by `scripts/test_reception_complete.cjs`, the
release gate that enters all answers through the real interface for eight cases
in each of RU/EN/ZH. It checks maximum grading, hidden assessment feedback,
mid-shift language changes and reload, one final attempt and unchanged work.
It uses an isolated local backend and never contacts production Firebase.

## Renderer integration

`presentation.js` provides `createReceptionPresentation` with these explicit
boundaries: the existing root, read-only `getState`/`getOwner`, canonical
`renderCanonical`, and the module's local-only `flush`. No new-shift factory or
Firebase write is passed. The caller can use `setLocale` for language changes
and `afterRender` after every canonical markup/status update. `destroy` cancels
pending display work. Successful and failed stale requests are ignored when
the owner, attempt, assigned templates or requested language has changed.

The host `main.js` and reception `app.js` now use this adapter. Locale refresh
does not create a shift. Same-locale refresh is a no-op when already ready;
failed translation loads leave inputs, focus and a separate retry status intact.
`scripts/test_reception_locale_race.cjs` checks delayed success, rapid reversal,
and HTTP503 while a student changes tabs and types, in Chromium and WebKit.

Mark profile labels and rendered entered answers as `data-rx-user-content`.
`markReceptionUserContent` handles the current profile/history-date slots when
the caller supplies the current state and `profileIsUserContent`; any new
free-text display slots need the same explicit boundary. `localizedReplyParts`
returns authored/literal parts rather than translating a user's unknown saved
choice. It does not recalculate the student's selected deadline.

Use `filterLocalizedCaseCatalog` and `localizedCatalogTopics` for catalog display
and search. They search genuine translated labels, retain canonical option
values and return the original case objects. Chinese text is not stripped out.
Use `localizedMonthLabel` for month/year captions; numeric date inputs and their
saved values stay unchanged. External confirmation dialogs should translate
their authored message through the presenter before displaying it; they must
not be mistaken for a new task or a state reset.

`presentation-test.mjs` covers real DOM controls with small genuine translations:
nested labels, date interpolation, CJK search, exact typo evidence, input values,
focus/selection, RU→EN→ZH→RU, and stale language/owner/error handling. It is not
a complete translated-shift QA and generates no placeholder release packs.

## Equivalent typed answers, without changing the pedagogical key

The complete compiler also writes `compiled/evidence-aliases.js`: a small static
code dependency containing both EN and ZH translations of canonical accepted
text/role answers. It contains no case documents or student data. Import and
register `aliases` through `registerEvidenceLocaleAliases` before any restored
assignment is evaluated, including in RU. Keep this mandatory code with the
release-pinned module shell so an EN answer remains valid after an offline RU
reload without requiring a separate service call. The compiler emits this file
only after full coverage validation, with the content version and source hash.

Each alias is bound to the task ID, normalisation kind and exact original
accepted-answer array. A changed historical snapshot receives no unrelated
current overlay. Saved free text is never rewritten. Wrong facts, incorrect
source binding and wrong task IDs do not gain credit. The JSON manifest/hash
alternative remains available through `prepareReceptionEvidenceAliases`; it
has finite waits, cache-integrity checks and shared loads, but is not required
by the statically bundled application.

`answer-alias-test.mjs` verifies two real text/role tasks in both languages and
all 458 legacy accepted answers without changed scores. `reference-locale-test.mjs`
checks explicit localised instrument names, FZ suffixes, code parts and rejection
of wrong types or extra words/IDs. Its 2,706 legacy inputs use 159 deduplicated
frozen outputs from release `0b61194`, with the original parser's SHA-256 in the
fixture, rather than comparing the new parser to itself after a future commit.
