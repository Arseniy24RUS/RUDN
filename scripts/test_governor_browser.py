#!/usr/bin/env python3
"""Real-browser native Governor integration checks with LOCAL-ONLY fixture identity.

Run with installed Python Playwright and a Chromium executable, for example:
  PYTHONPATH=/path/to/playwright python scripts/test_governor_browser.py \
    --chromium /path/to/chromium --output /tmp/governor-browser-qa

The loopback HTTP server serves the actual site beneath /RUDN/. Only backend.init
is replaced in the HTTP response: synthetic identity, open/closed access, and an
offline cloud transport. Runtime files are never modified. saveAttempt, outbox,
best-grade logic, DOM, localStorage, Web Locks, downloads, and service worker are
real. Every campaign decision is made through visible controls. This suite does
not claim to validate Firebase authentication, permissions, or cloud delivery.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
import traceback
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


REPO = Path(__file__).resolve().parents[1]
PROFILE_KEY = "rudn.profile.v1"
FIXTURE_KEY = "qa.native.local-only"
STUDENT_A = {
    "ticket": "990000001", "email": "990000001@rudn.ru", "studentKey": "990000001",
    "fullName": "Учебная проверка А", "group": "ГГУбд-01-26",
}
STUDENT_B = {
    "ticket": "990000002", "email": "990000002@rudn.ru", "studentKey": "990000002",
    "fullName": "Учебная проверка Б", "group": "ГГУбд-02-26",
}
LOCAL_FIXTURE = r"""
// Explicit loopback-only QA fixture; no credentials or cloud calls.
backend.init=async()=>{
  const fixture=JSON.parse(localStorage.getItem('qa.native.local-only')||'{}');
  backend.authReady=true;
  backend.user=fixture.role==='teacher'
    ?{uid:'qa-native-teacher',email:CONFIG.adminEmails[0],displayName:'Учебная проверка преподавателя'}
    :{uid:'qa-native-shared-uid',isAnonymous:true};
  backend.profile=backend.migrateProfile(JSON.parse(localStorage.getItem('rudn.profile.v1')||'null'));
  backend.mode='local';backend.connected=false;
  backend.accessOverrides={};
  for(let year=2025;year<=2035;year++)backend.accessOverrides[year]={'topic-7':{state:fixture.access||'open'}};
  backend.emitStatus();return backend.status();
};
"""


class LocalFixtureServer:
    def __enter__(self):
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(REPO / "site"), **kwargs)

            def log_message(self, *_args):
                pass

            def do_GET(self):
                if not self.path.startswith("/RUDN/"):
                    self.send_error(404)
                    return
                self.path = self.path[len("/RUDN"):]
                if self.path.split("?")[0] == "/assets/js/backend.js":
                    body = ((REPO / "site/assets/js/backend.js").read_text(encoding="utf-8") + LOCAL_FIXTURE).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/javascript; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    super().do_GET()

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f"http://127.0.0.1:{self.server.server_port}"
        self.base = self.origin + "/RUDN/"
        return self

    def __exit__(self, *_args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class Suite:
    def __init__(self, browser, server, output):
        self.browser, self.server, self.output = browser, server, output
        self.results = []
        self.contexts = []
        self.current = {}

    def context(self, width=1440, height=900, profile=STUDENT_A, role="student", access="open"):
        context = self.browser.new_context(
            viewport={"width": width, "height": height}, locale="ru-RU",
            reduced_motion="reduce", service_workers="allow", accept_downloads=True,
        )
        self.contexts.append(context)
        initializer = {"profile": profile, "fixture": {"role": role, "access": access}}
        context.add_init_script("""(() => {
          if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')return;
          const initial = %s;
          if(!localStorage.getItem('qa.native.initialized')) {
            if(initial.profile)localStorage.setItem('rudn.profile.v1',JSON.stringify(initial.profile));
            else localStorage.removeItem('rudn.profile.v1');
            localStorage.setItem('qa.native.local-only',JSON.stringify(initial.fixture));
            localStorage.setItem('qa.native.initialized','true');
          }
          localStorage.setItem('rudn.locale','ru');
        })();""" % json.dumps(initializer, ensure_ascii=False))
        # Defense in depth: no browser page may contact a non-loopback server.
        def route(request_route):
            url = request_route.request.url
            if url.startswith(self.server.origin + "/") or url.startswith(("data:", "blob:")):
                request_route.continue_()
            else:
                self.current.setdefault("blocked_external_requests", []).append(urlsplit(url).hostname)
                request_route.abort("blockedbyclient")
        context.route("**/*", route)
        context.on("page", self.observe)
        return context

    def observe(self, page):
        page.set_default_timeout(12000)
        page.on("pageerror", lambda error: self.current.setdefault("page_errors", []).append(str(error)))
        def console(message):
            if message.type == "error":
                self.current.setdefault("console_errors", []).append(message.text)
                self.current.setdefault("console_error_details", []).append({"message": message.text, "location": message.location})
            elif message.type == "warning":
                self.current.setdefault("console_warnings", []).append({"message": message.text, "location": message.location})
        page.on("console", console)
        page.on("requestfailed", lambda request: self.current.setdefault("failed_requests", []).append({
            "url": request.url, "resource_type": request.resource_type, "failure": request.failure}))
        page.on("dialog", lambda dialog: dialog.accept())

    def ready(self, page):
        page.locator('html[data-app-ready="true"]').wait_for()
        assert "Губернатор" in page.title(), page.title()
        assert not page.locator("#app").evaluate("el=>el.hidden||el.inert")
        assert page.locator("#start-title").inner_text().strip()
        assert page.locator("iframe").count() == 0
        assert page.locator("#boot-error").is_hidden()

    def screenshot(self, page, name):
        page.screenshot(path=str(self.output / (name + ".png")))
        self.current.setdefault("screenshots", []).append(name + ".png")

    def fit(self, page, label):
        metrics = page.evaluate("""() => ({width:innerWidth, page:document.documentElement.scrollWidth,
          dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({id:d.id,left:d.getBoundingClientRect().left,
            right:d.getBoundingClientRect().right,width:d.clientWidth,scroll:d.scrollWidth}))})""")
        self.current.setdefault("layout", {})[label] = metrics
        assert metrics["page"] <= metrics["width"] + 1, (label, metrics)
        for dialog in metrics["dialogs"]:
            assert dialog["left"] >= -1 and dialog["right"] <= metrics["width"] + 1, (label, dialog)
            assert dialog["scroll"] <= dialog["width"] + 1, (label, dialog)

    def native(self, page, from_course=False):
        if from_course:
            page.goto(self.server.base + "#activity/seminar-7", wait_until="networkidle")
            self.current["course_title"] = page.title()
            link = page.locator('a[href="apps/governor/index.html"]')
            link.wait_for()
            assert link.get_attribute("target") != "_blank"
            count = len(page.context.pages)
            link.click()
            self.ready(page)
            assert len(page.context.pages) == count
        else:
            page.goto(self.server.base + "apps/governor/index.html", wait_until="networkidle")
            self.ready(page)
        assert page.url == self.server.base + "apps/governor/index.html"

    def start(self, page, seed="NATIVE-BROWSER-QA"):
        if page.locator("#campaign-options").get_attribute("open") is None:
            page.locator("#campaign-options > summary").click()
        page.locator("#campaign-mode").select_option("guided")
        page.locator("#scenario-select").select_option("balanced")
        page.locator("#session-seed").fill(seed)
        page.locator('#start-form button[type="submit"]').click()
        page.locator("#game-shell:not(.hidden)").wait_for()
        self.chapter(page)

    def chapter(self, page):
        chapter = page.locator("[data-enter-chapter]:visible")
        if chapter.count():
            chapter.click()

    def snapshot(self, page):
        return page.evaluate("""() => {
          const G=window.GovernorGame, storage=G.Platform.storage;
          const save=JSON.parse(storage.getItem(G.Saves.Key)||'null');
          return {save,run:JSON.parse(storage.getItem('platform-run')||'null'),
            lock:G.Platform.lockName,key:G.Platform.storageKey,
            attempts:Object.entries(localStorage).filter(([k])=>k.startsWith('rudn.attempt.v2:')).map(([,v])=>JSON.parse(v)),
            pending:Object.entries(localStorage).filter(([k])=>k.startsWith('rudn.pending.v1:')).map(([,v])=>JSON.parse(v)),
            grades:JSON.parse(localStorage.getItem('rudn.grades.v2')||'{}')};
        }""")

    def decide(self, page, number):
        self.chapter(page)
        page.locator("#action-cards .defer-action").click()
        page.locator("#confirm-action").click()
        page.locator("#resolution-dialog[open]").wait_for()
        assert len(self.snapshot(page)["save"]["state"]["history"]) == number
        page.locator("#continue-turn").click()
        if number == 20:
            page.locator("#end-dialog[open]").wait_for()
        else:
            self.chapter(page)

    def parity(self, page, record):
        report = page.evaluate("""() => {const G=GovernorGame;
          const s=JSON.parse(G.Platform.storage.getItem(G.Saves.Key)).state;
          return G.Engine.buildReport(s,'ru');}""")
        compact = record["governor"]
        assert compact["decisions"] == len(report["decisions"]) == 20
        assert compact["campaignStatus"] == "completed"
        for field in ["support", "development", "fiscalSpace", "reserve", "debt"]:
            assert compact["final"][field] == report["final"][field], field
        assert compact["final"]["population"] == report["population"]["current"]["population"]
        assert len(compact["territories"]) == 5
        for territory in compact["territories"]:
            original = report["population"]["current"]["municipalities"][territory["id"]]
            for field in ["population", "healthAccess", "schoolAccess", "employment"]:
                assert territory[field] == original[field], (territory["id"], field)
        for i, decision in enumerate(compact["decisionRegister"]):
            original = report["decisions"][i]
            assert decision["year"] == report["population"]["baseYear"] + original["turn"] - 1
            assert decision["action"] == original["action"]
            assert decision["mission"] == original["mission"]
            assert decision["fundingMode"] == original["fundingMode"]
            assert decision["cost"] == original["funding"].get("actualTotalCost", original["funding"].get("totalCost"))
        self.current["parity"] = {"decisions": 20, "territories": 5, "final": compact["final"]}
        return report

    def completion(self, label, width, height):
        context = self.context(width, height)
        page = context.new_page()
        self.native(page, from_course=True)
        assert page.locator("#player-name").input_value() == STUDENT_A["fullName"]
        assert page.locator("#player-name").get_attribute("readonly") is not None
        assert page.locator("#player-group").get_attribute("readonly") is not None
        self.screenshot(page, label + "-start")
        self.fit(page, "start")
        page.locator("#platform-rubric > summary").click()
        assert page.locator("#platform-rubric p").count() == 6
        assert "5 баллов" in page.locator("#platform-rubric").inner_text()
        self.fit(page, "published-rubric")
        self.screenshot(page, label + "-published-rubric")
        page.locator("#platform-rubric > summary").click()
        self.start(page)
        self.screenshot(page, label + "-mission")
        self.fit(page, "mission")
        first_run = self.snapshot(page)["run"]
        for number in range(1, 21):
            self.decide(page, number)
            assert page.locator("#app").get_attribute("hidden") is None
        self.fit(page, "completion")
        self.screenshot(page, label + "-completed")
        page.wait_for_function("""() => Object.entries(localStorage).filter(([k])=>k.startsWith('rudn.attempt.v2:')).length===1""")
        final = self.snapshot(page)
        assert len(final["pending"]) == len(final["attempts"]) == 1
        record = final["attempts"][0]
        assert record["id"] == first_run["submissionId"]
        assert record["studentKey"] == STUDENT_A["studentKey"]
        assert record["recordGrade"] is True and record["maxPoints"] == 5
        assert 0 <= record["points"] <= 5
        assert record["points"] == record["governor"]["assessment"]["points"]
        assert abs(sum(c["points"] for c in record["governor"]["assessment"]["criteria"]) - record["points"]) < 1e-8
        grade = final["grades"][STUDENT_A["studentKey"]]["seminar-7"]
        assert grade["points"] == record["points"] and grade["sourceAttemptId"] == record["id"]
        self.current["automatic_grade"] = {"points": record["points"], "max": 5, "pending": 1}
        report = self.parity(page, record)
        with page.expect_download() as download_info:
            page.locator("#download-report-end").click()
        download = download_info.value
        downloaded = self.output / (label + "-report.json")
        download.save_as(str(downloaded))
        downloaded_report = json.loads(downloaded.read_text())
        assert downloaded_report["final"] == report["final"]
        assert downloaded_report["population"] == report["population"]
        assert downloaded_report["decisions"] == report["decisions"]
        page.locator("#review-region").click()
        page.locator("#platform-report").click()
        page.locator("#platform-submission[open]").wait_for()
        self.fit(page, "seminar-report")
        self.screenshot(page, label + "-seminar-report")
        heading = page.locator("#platform-assessment h3")
        assert str(record["points"]) + "/5" in heading.inner_text()
        assert page.locator("#platform-assessment .platform-criterion").count() == 5
        heading.scroll_into_view_if_needed()
        self.screenshot(page, label + "-automatic-grade-breakdown")
        page.locator("#platform-submission-close").click()
        for _ in range(2):
            page.reload(wait_until="networkidle")
            self.ready(page)
            page.locator("#continue-campaign").click()
            page.locator("#end-dialog[open]").wait_for()
            after = self.snapshot(page)
            assert after["attempts"] == final["attempts"]
            assert after["pending"] == final["pending"]
            assert after["run"]["submissionId"] == record["id"]
        self.current["reload_deduplication"] = "Two real reloads retained one immutable attempt and pending item"
        page.locator("#play-again").click()
        self.start(page)
        second = self.snapshot(page)
        assert second["save"]["state"]["sessionId"] == final["save"]["state"]["sessionId"]
        assert second["run"]["runId"] != first_run["runId"]
        assert second["run"]["submissionId"] != first_run["submissionId"]
        assert len(second["attempts"]) == 1
        self.current["same_seed_new_run"] = "Same model session ID; distinct secure run and submission IDs"
        page.locator("#platform-back").click()
        page.locator('a[href="apps/governor/index.html"]').wait_for()
        assert page.url == self.server.base + "#activity/seminar-7"
        assert len(context.pages) == 1 and page.locator("iframe").count() == 0
        self.screenshot(page, label + "-return-course")

    def responsive(self, width, height):
        page = self.context(width, height).new_page()
        self.native(page)
        self.fit(page, "start")
        self.start(page)
        self.fit(page, "mission")
        self.screenshot(page, f"responsive-{width}x{height}-mission")
        self.decide(page, 1)
        assert len(self.snapshot(page)["save"]["state"]["history"]) == 1
        page.locator("#platform-report").click()
        self.fit(page, "report")
        self.screenshot(page, f"responsive-{width}x{height}-report")
        assert page.locator("#platform-submit").is_disabled()

    def identity_isolation(self):
        context = self.context()
        a = context.new_page()
        self.native(a)
        self.start(a)
        self.decide(a, 1)
        a_saved = self.snapshot(a)
        assert a.evaluate("typeof navigator.locks.request") == "function"
        duplicate = context.new_page()
        duplicate.goto(self.server.base + "apps/governor/index.html", wait_until="networkidle")
        duplicate.locator("#tab-conflict[open]").wait_for()
        locks = a.evaluate("async()=> (await navigator.locks.query()).held")
        assert any(lock["name"] == a_saved["lock"] for lock in locks)
        self.screenshot(duplicate, "same-owner-writer-conflict")
        duplicate.close()
        switch = context.new_page()
        switch.goto(self.server.base, wait_until="networkidle")
        # Fixture profile change only; native storage events and backend migration are real.
        switch.evaluate("profile=>localStorage.setItem('rudn.profile.v1',JSON.stringify(profile))", STUDENT_B)
        a.locator("#app[hidden]").wait_for(state="attached")
        assert "Профиль" in a.locator("#platform-loading-text").inner_text()
        self.screenshot(a, "old-owner-frozen")
        self.native(switch)
        assert switch.locator("#continue-campaign").is_hidden()
        assert switch.locator("#player-name").input_value() == STUDENT_B["fullName"]
        self.start(switch)
        self.decide(switch, 1)
        self.decide(switch, 2)
        b_saved = self.snapshot(switch)
        assert b_saved["key"] != a_saved["key"] and b_saved["lock"] != a_saved["lock"]
        stored_a = switch.evaluate("key=>JSON.parse(localStorage.getItem(key))", a_saved["key"])
        assert stored_a == a_saved["save"]
        assert len(b_saved["save"]["state"]["history"]) == 2
        assert switch.evaluate("async()=> (await import('../../assets/js/backend.js?v=1.3.2')).backend.user.uid") == "qa-native-shared-uid"
        a.close()
        switch.goto(self.server.base, wait_until="networkidle")
        switch.evaluate("profile=>localStorage.setItem('rudn.profile.v1',JSON.stringify(profile))", STUDENT_A)
        self.native(switch)
        switch.locator("#continue-campaign").click()
        assert len(self.snapshot(switch)["save"]["state"]["history"]) == 1
        self.current["storage_and_locks"] = "Real same-owner lock exclusion, same-UID A/B isolation, old-owner freeze, A resume"

    def teacher_preview(self):
        page = self.context(profile=None, role="teacher").new_page()
        self.native(page)
        assert "Преподаватель" in page.locator("#platform-identity").inner_text()
        self.start(page)
        for number in range(1, 21):
            self.decide(page, number)
        result = self.snapshot(page)
        assert "teacher%3Aqa-native-teacher" in result["key"]
        assert result["attempts"] == result["pending"] == []
        assert result["grades"] == {}
        page.locator("#review-region").click()
        page.locator("#platform-report").click()
        assert page.locator("#platform-submit").is_hidden()
        self.screenshot(page, "teacher-preview-completed-report")
        self.current["teacher_preview"] = "20 visible UI decisions; no outbox, attempts, or grade records"

    def direct_link_gates(self):
        for name, profile, access in [("guest", None, "open"), ("closed", STUDENT_A, "closed")]:
            page = self.context(profile=profile, access=access).new_page()
            page.goto(self.server.base + "apps/governor/index.html", wait_until="networkidle")
            page.locator("#platform-loading-text").wait_for()
            message = page.locator("#platform-loading-text").inner_text()
            assert ("Войдите" if name == "guest" else "закрыт") in message
            assert page.locator("#app").get_attribute("hidden") is not None
            assert page.locator("#platform-report").is_disabled()
            assert page.locator('script[src="./src/app.js"]').count() == 0
            self.screenshot(page, name + "-direct-link-gate")
            self.current[name + "_message"] = message

    def offline_resume(self):
        context = self.context()
        page = context.new_page()
        self.native(page, from_course=True)
        self.start(page)
        self.decide(page, 1)
        saved = self.snapshot(page)
        page.evaluate("async()=>{await navigator.serviceWorker.ready}")
        page.wait_for_function("navigator.serviceWorker.controller!==null", timeout=30000)
        worker = page.evaluate("async()=>({scope:(await navigator.serviceWorker.ready).scope,script:navigator.serviceWorker.controller.scriptURL,caches:await caches.keys()})")
        assert worker["scope"] == self.server.base
        assert worker["script"] == self.server.base + "service-worker.js"
        assert len(worker["caches"]) == 1
        cached = page.evaluate("async()=>{const c=await caches.open((await caches.keys())[0]);return (await c.keys()).map(r=>r.url)}")
        assert self.server.base + "apps/governor/src/app.js" in cached
        assert self.server.base + "apps/governor/index.html" in cached
        context.set_offline(True)
        page.reload(wait_until="networkidle")
        self.ready(page)
        page.locator("#continue-campaign").click()
        assert self.snapshot(page)["save"]["state"]["history"] == saved["save"]["state"]["history"]
        self.decide(page, 2)
        after = self.snapshot(page)
        self.screenshot(page, "offline-resumed-second-year")
        assert len(after["save"]["state"]["history"]) == 2
        assert after["run"]["submissionId"] == saved["run"]["submissionId"]
        page.locator("#platform-back").click()
        page.locator('a[href="apps/governor/index.html"]').wait_for()
        assert page.url == self.server.base + "#activity/seminar-7"
        page.wait_for_function("""() => {
          const image=document.querySelector('img[src="assets/course/previews/seminar_07_simulator.jpg"]');
          return image?.complete&&image.naturalWidth>0;
        }""")
        self.screenshot(page, "offline-course-return")
        self.current["service_worker"] = {"scope": "/RUDN/", "cached_requests": len(cached), "offline_resume": True, "offline_course_return": True}

    def run(self, name, fn):
        self.current = {"name": name, "status": "running", "page_errors": [], "console_errors": []}
        started = time.monotonic()
        print("RUN", name, flush=True)
        try:
            fn()
            assert not self.current["page_errors"], self.current["page_errors"]
            assert not self.current["console_errors"], self.current["console_errors"]
            assert not self.current.get("blocked_external_requests"), self.current.get("blocked_external_requests")
            self.current["status"] = "pass"
        except Exception as error:
            self.current.update(status="fail", error=str(error), traceback=traceback.format_exc())
            for index, context in enumerate(self.contexts):
                for page_index, page in enumerate(context.pages):
                    try:
                        self.screenshot(page, f"failure-{name}-{index}-{page_index}")
                    except Exception:
                        pass
        finally:
            for context in self.contexts:
                context.close()
            self.contexts = []
            self.current["seconds"] = round(time.monotonic() - started, 2)
            self.results.append(self.current)
            (self.output / "results.json").write_text(json.dumps({
                "environment": {"url": self.server.base, "browser": "real Chromium via Python Playwright",
                    "fixture": "LOCAL ONLY mocked auth identity and unavailable cloud transport; native storage/DOM/WebLocks/SW",
                    "browser_fallback": "User authorized Playwright after managed Browser CDP refresh tabs timeout (20000ms), twice",
                    "flow": "Section 7 -> same-window native Governor -> visible campaign decisions -> automatic local grade/outbox -> section 7"},
                "results": self.results,
            }, ensure_ascii=False, indent=2))
            print(self.current["status"].upper(), name, self.current.get("error", ""), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default=os.environ.get("GOVERNOR_QA_CHROMIUM"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/governor-browser-qa"))
    parser.add_argument("--only", help="Run test names containing this text")
    args = parser.parse_args()
    args.output = args.output.resolve()
    if args.output == REPO or REPO in args.output.parents:
        parser.error("Keep screenshots/results outside the repository")
    args.output.mkdir(parents=True, exist_ok=True)
    with LocalFixtureServer() as server, sync_playwright() as playwright:
        launch = {"args": ["--no-sandbox"]}
        if args.chromium:
            launch["executable_path"] = args.chromium
        browser = playwright.chromium.launch(**launch)
        suite = Suite(browser, server, args.output)
        tests = [
            ("desktop_complete_native_storage_mocked_cloud", lambda: suite.completion("desktop", 1440, 900)),
            ("mobile_complete_native_storage_mocked_cloud", lambda: suite.completion("mobile", 390, 844)),
            ("identity_and_native_writer_isolation", suite.identity_isolation),
            ("teacher_preview_mocked_auth_no_outbox", suite.teacher_preview),
            ("direct_link_gates_mocked_identity", suite.direct_link_gates),
            ("offline_real_service_worker_and_resume", suite.offline_resume),
        ]
        for width, height in [(320, 740), (1366, 768), (768, 1024), (844, 390)]:
            tests.append((f"responsive_{width}x{height}", lambda w=width, h=height: suite.responsive(w, h)))
        for name, fn in tests:
            if not args.only or args.only in name:
                suite.run(name, fn)
        browser.close()
        passed = sum(result["status"] == "pass" for result in suite.results)
        print(f"{passed}/{len(suite.results)} passed; {args.output / 'results.json'}", flush=True)
        return 0 if suite.results and passed == len(suite.results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
