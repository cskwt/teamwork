#!/usr/bin/env python3
"""Standalone, restricted server for Production Tools Suite."""

from __future__ import annotations

import mimetypes
import os
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from tools_core import SUITE_DIR, TOOL_GET_PATHS, TOOL_POST_PATHS, load_tools_app

PORT = int(os.environ.get("PORT") or os.environ.get("TOOLS_PORT", "8765"))
USE_PARENT_DB = os.environ.get("TOOLS_USE_PARENT_DB", "").strip().lower() in {
    "1",
    "true",
    "yes",
}


def hub_html() -> bytes:
    """The focused landing page, styled like the original login shortcuts."""
    html = """<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
@font-face{font-family:kufi;src:url('/@Fonts/Droid%20Arabic%20Kufi.ttf') format('truetype')}
*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:20px;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#eef3f9,#f8fbff 45%,#e8eef5);font-family:kufi,Tahoma,Arial;color:#1e3a5f}
.box{width:min(460px,100%);padding:36px 40px 40px;background:#fff;border:1px solid #e3eaf2;border-radius:16px;box-shadow:0 10px 40px rgba(30,58,95,.12);text-align:center}.logo{max-width:230px;max-height:100px;object-fit:contain;margin:0 auto 14px}.title{margin:0;font-size:1.55rem}.sub{color:#64748b;margin:10px 0 26px;font-size:.92rem}.tool{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:14px 20px;border-radius:10px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;margin-top:12px}.attendance{background:#0d9488}.cost{background:#6f42c1}.templates{background:#1e3a5f}.tool:hover{filter:brightness(.94)}
.note{margin:23px 0 0;padding-top:17px;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px}
</style></head><body><main class="box">
<img class="logo" src="/assets/smart-accountant-light.png" alt="TEAMWORK Tools">
<h1 class="title">أدوات الإنتاج</h1><p class="sub">الحضور والتكاليف والقوالب — TEAMWORK</p>
<a class="tool attendance" href="/attendance"><i class="fa-solid fa-user-clock"></i> الحضور والانصراف</a>
<a class="tool cost" href="/cost-calculator"><i class="fa-solid fa-calculator"></i> حاسبة التكاليف</a>
<a class="tool templates" href="/template-maker"><i class="fa-solid fa-scissors"></i> صانع القوالب</a>
<p class="note">Production Tools Suite — localhost:8765</p>
</main></body></html>"""
    return html.encode("utf-8")


def is_suite_static(path: str) -> bool:
    return (
        path.startswith("/assets/")
        or path.startswith("/Fonts/")
        or path.startswith("/@Fonts/")
        or path in ("/logo.png", "/favicon.png")
    )


def serve_suite_static(handler, path: str) -> bool:
    """Serve only files packaged under assets/ and Fonts/ (no traversal)."""
    relative = unquote(path).lstrip("/")
    if relative.startswith("@Fonts/"):
        relative = "Fonts/" + relative[len("@Fonts/") :]
    if relative in ("logo.png", "favicon.png"):
        relative = f"assets/{relative}"
    candidate = (SUITE_DIR / relative).resolve()
    allowed_roots = ((SUITE_DIR / "assets").resolve(), (SUITE_DIR / "Fonts").resolve())
    if not any(candidate.is_relative_to(root) for root in allowed_roots) or not candidate.is_file():
        handler.send_error(404, "الملف غير موجود")
        return True
    content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(candidate.stat().st_size))
    handler.send_header("Cache-Control", "public, max-age=300")
    handler.end_headers()
    with candidate.open("rb") as file:
        handler.wfile.write(file.read())
    return True


APP, SOURCE = load_tools_app(use_parent_db=USE_PARENT_DB)


class ProductionToolsHandler(APP.Handler):
    """Original handler with all unrelated AccountingApp routes blocked."""

    def do_GET(self):
        path = (urlparse(self.path).path or "/").rstrip("/") or "/"
        if path == "/":
            body = hub_html()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if is_suite_static(path):
            serve_suite_static(self, path)
            return
        allowed = path in TOOL_GET_PATHS or path.startswith(
            ("/attendance", "/cost-calculator", "/template-maker", "/assets/", "/Fonts/", "/@Fonts/")
        )
        if not allowed:
            self.send_error(404, "هذه الخدمة تتضمن أدوات الإنتاج فقط")
            return
        super().do_GET()

    def do_POST(self):
        path = (urlparse(self.path).path or "/").rstrip("/") or "/"
        allowed = path in TOOL_POST_PATHS or path.startswith(
            ("/attendance", "/cost-calculator", "/template-maker", "/api/template")
        )
        if not allowed:
            self.send_error(404, "هذه الخدمة تتضمن أدوات الإنتاج فقط")
            return
        super().do_POST()

    def log_message(self, format, *args):
        print("[ProductionToolsSuite] " + (format % args))


if __name__ == "__main__":
    mode = "parent database" if USE_PARENT_DB else "suite database"
    print(f"Production Tools Suite running at http://127.0.0.1:{PORT}")
    print(f"Runtime source: {SOURCE} ({mode})")
    ThreadingHTTPServer(("0.0.0.0", PORT), ProductionToolsHandler).serve_forever()
