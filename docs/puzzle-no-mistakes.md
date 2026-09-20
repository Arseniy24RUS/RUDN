# Removing puzzle mistake counters

The puzzle no longer counts unsuccessful placements in either context. An
unmatched piece stays movable; placement tolerance, elapsed time, hints and the
3/4/5 difficulty marks are unchanged. The stage has only placed-count and time
metrics in ordinary and fullscreen layouts. Leaderboard order and XLSX columns
continue to use difficulty and time, never historical mistake counts.

## Existing student data

- Loading an old draft ignores its optional `errors` field. The next normal
  checkpoint omits it, preserving the attempt ID, exact geometry, piece order,
  locked pieces, movable-piece position, zoom, hints and elapsed time.
- New completion requests and attempt records omit `errors`.
- Completed drafts, immutable attempts, historical grades and already queued
  deliveries are not migrated or rewritten. Their legacy `errors` property may
  remain in stored historical payloads but is never read or shown by the game.
- Storage keys, schema versions, Firebase validation and idempotent delivery are
  unchanged. No production database cleanup is required.
- The service-worker cache generation changes so prepared/offline modules receive
  the new engine and markup together when the site next updates online.

## Focused regression

`scripts/test_puzzle_no_mistakes.py` creates drafts with the actual previous
release (`93698d6`) and real game input, then activates the current service worker
in the same isolated browser. It covers all three difficulties in both contexts:
restore partial progress, another unmatched placement, offline reload, placement
of every remaining piece, the unchanged difficulty mark and reopening the result
without duplicates. It separately compares previously completed attempts, grades,
drafts and queued deliveries before and after the update. Completed local rows
must still appear in the leaderboard. All identities and writes are local fixtures.
The two-metric layout is also checked in RU/EN/ZH at desktop, 320px mobile and
landscape fullscreen sizes.

```sh
node --test scripts/puzzle_snap_test.mjs scripts/test_puzzle_leaderboard.mjs
python scripts/test_puzzle_no_mistakes.py --output /tmp/puzzle-no-mistakes
```

The existing XLSX test reads application-generated workbooks independently with
openpyxl. The focused Pages release runs these checks; normal full puzzle CI also
includes the migration regression. Browser automation is not a physical-device
test, and this scoped change does not repeat the full catalog/performance matrix.
