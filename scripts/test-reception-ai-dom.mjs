#!/usr/bin/env node
/** Compatibility entry for the four-page workspace DOM suite.
 * Arguments remain --cases /private/cases --jsdom /path/jsdom/lib/api.js [--out /reports].
 * The new suite preserves retry, idempotency, follow-up and authored-assessment coverage.
 */
await import('./test-reception-ai-workspace-dom.mjs');
