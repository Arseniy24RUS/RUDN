# SheetJS Community Edition 0.20.3

Vendored, unchanged standalone build from the official SheetJS CDN:

- https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE

Downloaded 2026-09-17. The full Apache 2.0 license is retained in `LICENSE`.

SHA-256 of `xlsx-0.20.3.full.min.js`:
`cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

The puzzle loads this local copy only for XLSX export. Its service-worker shell
also caches the file so export does not depend on a third-party connection.
