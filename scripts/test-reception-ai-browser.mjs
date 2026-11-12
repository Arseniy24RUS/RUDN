#!/usr/bin/env node
/** Compatibility entry for the four-page workspace browser suite.
 * Run with --cases /private/cases; the script starts an isolated mock server.
 * An optional --url must point to reception-ai-workspace-qa.mjs, which provides
 * the shell fixture and a mock-only health endpoint. See --help for all options.
 */
await import('./test-reception-ai-workspace-browser.mjs');
