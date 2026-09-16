#!/usr/bin/env python3
"""Isolate driver-level offline navigation from the puzzle implementation."""
import argparse
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import sys
import threading
from playwright.async_api import async_playwright


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if 'qa-connection-loss=1' in self.headers.get('Cookie', ''):
            self.close_connection = True
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.connection.close()
            return
        if self.path.startswith('/sw.js'):
            body = b"self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(new Response('<h1>OFFLINE WORKER RESPONSE</h1>',{headers:{'Content-Type':'text/html'}}))});"
            mime = 'text/javascript'
        else:
            body = b"<h1>ONLINE DOCUMENT</h1><script>navigator.serviceWorker.register('/sw.js')</script>"
            mime = 'text/html'
        self.send_response(200);self.send_header('Content-Type', mime);self.send_header('Content-Length', str(len(body)))
        self.end_headers();self.wfile.write(body)


async def main(output=None, browsers='chromium,firefox,webkit'):
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
    results = []
    async with async_playwright() as playwright:
        for name in browsers.split(','):
            browser = await getattr(playwright, name).launch(**({'headless': True, 'firefox_user_prefs': {'network.proxy.type': 0}} if name == 'firefox' else {'headless': True}))
            for mode in ('browser', 'connection-loss'):
                context = await browser.new_context(service_workers='allow')
                page = await context.new_page()
                origin = f'http://127.0.0.1:{server.server_port}'
                record = {'browser': name, 'browserVersion': browser.version,
                          'platform': sys.platform, 'simulation': mode, 'status': 'failed'}
                try:
                    await page.goto(origin+'/app')
                    await page.wait_for_function('navigator.serviceWorker.controller')
                    # Establish a working controlled navigation before changing
                    # the network, so failures cannot be confused with SW setup.
                    await page.reload(wait_until='domcontentloaded', timeout=45000)
                    assert 'OFFLINE WORKER RESPONSE' in await page.content(), 'Online SW control failed'
                    record['onlineWorkerResponse'] = True
                    if mode == 'browser':
                        await context.set_offline(True)
                    else:
                        await context.add_cookies([{'name': 'qa-connection-loss', 'value': '1', 'url': origin}])
                        record['connectionLossVerified'] = await page.evaluate("""async()=>{
                          try{await fetch('/uncached?nonce='+crypto.randomUUID(),{cache:'no-store'});return false}catch{return true}
                        }""")
                        assert record['connectionLossVerified'], 'Uncached request did not fail'
                    await page.reload(wait_until='domcontentloaded', timeout=45000)
                    assert 'OFFLINE WORKER RESPONSE' in await page.content(), 'Missing worker-generated HTML'
                    record.update(passed=True, status='passed')
                except Exception as error:
                    record.update(passed=False, error=str(error))
                    if name == 'webkit' and mode == 'browser' and 'WebKit encountered an internal error' in str(error):
                        record['status'] = 'driver-limitation'
                await context.close();results.append(record)
                print(json.dumps(record), flush=True)
            await browser.close()
    server.shutdown();server.server_close();thread.join(timeout=2)
    report = {'test': 'minimal-service-worker-offline-navigation', 'results': results,
              'passed': all(row['status'] == 'passed' for row in results),
              'limitations': [row for row in results if row['status'] == 'driver-limitation']}
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    # A known failure is preserved as a limitation, never called a passing case.
    # Unexpected errors or failures in the replacement transport check fail CI.
    return int(any(row['status'] == 'failed' for row in results))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--browsers', default='chromium,firefox,webkit')
    args = parser.parse_args()
    if not set(args.browsers.split(',')) <= {'chromium', 'firefox', 'webkit'}:
        parser.error('Unknown browser')
    raise SystemExit(asyncio.run(main(args.output, args.browsers)))
