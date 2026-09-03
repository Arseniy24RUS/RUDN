from __future__ import annotations
import http.server
import socketserver
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'site'
PORT = 8765

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
    url = f'http://127.0.0.1:{PORT}/'
    print(f'RUDN Learning Platform: {url}')
    try:
        webbrowser.open(url)
    except Exception:
        pass
    httpd.serve_forever()
