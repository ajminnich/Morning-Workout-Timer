#!/usr/bin/env python3
"""Start a local web server for the Core + Push-up Timer."""
from __future__ import annotations

import http.server
import socket
import socketserver
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
        except OSError:
            return "127.0.0.1"


if __name__ == "__main__":
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        ip = local_ip()
        print(f"Serving {ROOT}")
        print(f"Open on this computer: http://localhost:{PORT}")
        print(f"Open on an iPad on the same Wi-Fi: http://{ip}:{PORT}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
