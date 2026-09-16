#!/usr/bin/env python3
"""Isolate driver-level offline navigation from the puzzle implementation."""
import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from playwright.async_api import async_playwright


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith('/sw.js'):
            body = b"self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate')e.respondWith(new Response('<h1>OFFLINE WORKER RESPONSE</h1>',{headers:{'Content-Type':'text/html'}}))});"
            mime = 'text/javascript'
        else:
            body = b"<h1>ONLINE DOCUMENT</h1><script>navigator.serviceWorker.register('/sw.js')</script>"
            mime = 'text/html'
        self.send_response(200);self.send_header('Content-Type', mime);self.send_header('Content-Length', str(len(body)))
        self.end_headers();self.wfile.write(body)


async def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
    results = []
    async with async_playwright() as playwright:
        for name in ['chromium', 'firefox', 'webkit']:
            browser = await getattr(playwright, name).launch(**({'headless': True, 'firefox_user_prefs': {'network.proxy.type': 0}} if name == 'firefox' else {'headless': True}))
            context = await browser.new_context(service_workers='allow')
            page = await context.new_page()
            record = {'browser': name}
            try:
                await page.goto(f'http://127.0.0.1:{server.server_port}/app')
                await page.wait_for_function('navigator.serviceWorker.controller')
                await context.set_offline(True)
                await page.reload(wait_until='domcontentloaded', timeout=15000)
                record['passed'] = 'OFFLINE WORKER RESPONSE' in await page.content()
            except Exception as error:
                record.update(passed=False, error=str(error))
            await browser.close();results.append(record)
            print(json.dumps(record), flush=True)
    server.shutdown();server.server_close();thread.join(timeout=2)
    return results


if __name__ == '__main__':
    asyncio.run(main())
