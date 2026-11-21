"""Check the exact Governor startup index, offline draft and return to the course."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Canonical free-play URL on localhost")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.hostname not in {"127.0.0.1", "localhost"} or url.query != "context=free":
        parser.error("Pass the loopback Governor entry with ?context=free")

    report = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
            "--no-proxy-server",
        ])
        try:
            page = browser.new_page(locale="en-US")
            page.goto(args.url)
            page.locator("#start-form button[type=submit]").wait_for()
            scope = page.evaluate("""() => {
              const r=window.__RUDN_RELEASE__;
              return {build:r.buildId,projection:r.fullManifestSha256,resources:Object.keys(r.resources).length};
            }""")
            assert scope["projection"], "Expected the verified Governor index at cold start"
            report["entry"] = scope
            page.locator("#start-form button[type=submit]").click()
            page.locator("[data-agenda-topic]:visible").first.wait_for()
            page.locator("#offline-status[data-platform-offline=ready]").wait_for(state="attached", timeout=120000)

            page.context.set_offline(True)
            page.reload()
            resume = page.locator("#continue-campaign")
            resume.wait_for()
            # Restoration also needs authored historical translations.
            assert page.evaluate("window.GovernorGame.ChineseCatalog.length") > 0
            resume.click()
            page.locator("[data-agenda-topic]:visible").first.wait_for()
            assert page.evaluate("window.__RUDN_RELEASE__.buildId") == scope["build"]
            report["offlineDraftRestored"] = True

            page.context.set_offline(False)
            page.locator("#platform-back").click()
            page.wait_for_url("**/#games")
            page.wait_for_function("""() => {
              const r=window.__RUDN_RELEASE__;
              return r && !r.fullManifestSha256 && Object.values(r.packs).length>2;
            }""")
            assert page.evaluate("window.__RUDN_RELEASE__.buildId") == scope["build"]
            report["returnToFullCourseManifest"] = True
            page.context.close()

            # A clean context receives an altered local index. The real release
            # pointer and full manifest remain unchanged and must be verified.
            ctx = browser.new_context(locale="en-US", service_workers="block")
            served = []
            def corrupt(route):
                served.append(route.request.url)
                route.fulfill(status=200, content_type="application/json", body='{"resources":{}}')
            ctx.route("**/governor-manifest.json", corrupt)
            damaged = ctx.new_page()
            damaged.goto(args.url)
            damaged.locator("#start-form button[type=submit]").wait_for()
            full = damaged.evaluate("""() => {const r=window.__RUDN_RELEASE__;return {
              build:r.buildId, count:Object.keys(r.resources).length,projection:Boolean(r.fullManifestSha256)
            }}""")
            assert served and full["build"] == scope["build"]
            assert not full["projection"] and full["count"] > scope["resources"]
            report["corruptIndexFallback"] = full
            ctx.close()
        finally:
            browser.close()
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
