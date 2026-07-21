#!/usr/bin/env python3
"""Static dev server with HTTP Range support (needed for <video> playback/seeking).

Python's stock `http.server` ignores Range headers and always returns the
full file with 200 OK, which breaks <video> autoplay/seeking in Safari and
some other browsers. This subclass adds proper 206 Partial Content handling.

Usage: python3 tools/dev_server.py [port]  (defaults to 8000, serves repo root)
"""
import http.server
import os
import re
import sys


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Dev server: never let the browser cache anything, so edits always show up on refresh.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        file_size = os.path.getsize(path)
        range_header = self.headers.get('Range')
        if not range_header:
            self.send_response(200)
            self.send_header('Accept-Ranges', 'bytes')
            ctype = self.guess_type(path)
            self.send_header('Content-type', ctype)
            self.send_header('Content-Length', str(file_size))
            self.end_headers()
            f = open(path, 'rb')
            return f

        m = re.match(r'bytes=(\d*)-(\d*)', range_header)
        if not m:
            self.send_error(416, "Invalid Range header")
            return None
        start_s, end_s = m.groups()
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
        end = min(end, file_size - 1)
        if start > end or start >= file_size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{file_size}')
            self.end_headers()
            return None

        length = end - start + 1
        self.send_response(206)
        self.send_header('Accept-Ranges', 'bytes')
        ctype = self.guess_type(path)
        self.send_header('Content-type', ctype)
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.send_header('Content-Length', str(length))
        self.end_headers()

        f = open(path, 'rb')
        f.seek(start)
        self._range_remaining = length
        orig_read = f.read

        def limited_read(n=-1, _f=f):
            if self._range_remaining <= 0:
                return b''
            n = self._range_remaining if n < 0 else min(n, self._range_remaining)
            chunk = orig_read(n)
            self._range_remaining -= len(chunk)
            return chunk

        f.read = limited_read
        return f


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = RangeHTTPRequestHandler
    with http.server.ThreadingHTTPServer(('0.0.0.0', port), handler) as httpd:
        print(f"Serving on http://localhost:{port} (Range-request support enabled)")
        httpd.serve_forever()
