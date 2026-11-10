#!/usr/bin/env python3
"""Local preview + editor server for the site.

    python3 serve.py            # serves ./site at http://localhost:8765
    python3 serve.py 3000       # different port

Open the page, click "Edit" in the bottom-right corner, change anything, click "Save".
Saves write site/index.html directly (a backup of the previous version goes to .backups/).
Only listens on localhost. The live/deployed site never includes this server, so the
editor controls do not appear there.
"""
import http.server, json, os, re, shutil, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "site")
BACKUPS = os.path.join(HERE, ".backups")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


def backup(path):
    if not os.path.exists(path):
        return
    os.makedirs(BACKUPS, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    name = os.path.splitext(os.path.basename(path))[0]
    shutil.copy2(path, os.path.join(BACKUPS, f"{name}-{stamp}.html"))
    old = sorted(f for f in os.listdir(BACKUPS) if f.startswith(name + "-"))
    for f in old[:-30]:
        os.remove(os.path.join(BACKUPS, f))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _page_file(self, path):
        page = urllib.parse.unquote(path or "/").split("?")[0].strip("/") or "index.html"
        if page.endswith("/"):
            page += "index.html"
        if not re.fullmatch(r"[A-Za-z0-9._/-]+\.html", page) or ".." in page:
            return None
        return os.path.join(ROOT, page)

    def do_GET(self):
        if self.path == "/__ping":
            return self._json({"ok": True})
        if self.path.startswith("/__stat"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            target = self._page_file(q.get("path", ["/"])[0])
            if not target or not os.path.exists(target):
                return self._json({"ok": False, "error": "no such page"}, 404)
            return self._json({"ok": True, "mtime": os.stat(target).st_mtime})
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            if self.path == "/__save":
                data = json.loads(raw.decode("utf-8"))
                html = data["html"]
                if "<main" not in html:
                    return self._json({"ok": False, "error": "refusing to save: page looks empty"}, 400)
                target = self._page_file(data.get("path"))
                if not target:
                    return self._json({"ok": False, "error": "bad page path"}, 400)
                # stale check: the editor sends the mtime it loaded; refuse if the file changed since
                loaded = data.get("mtime")
                if loaded is not None and os.path.exists(target) and not data.get("force"):
                    if abs(os.stat(target).st_mtime - float(loaded)) > 0.001:
                        return self._json({"ok": False, "stale": True,
                                           "error": "page changed on disk since you opened it"}, 409)
                backup(target)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(html)
                return self._json({"ok": True, "mtime": os.stat(target).st_mtime})
            if self.path == "/__upload":
                name = urllib.parse.unquote(self.headers.get("X-Filename", "image"))
                name = re.sub(r"[^A-Za-z0-9._-]", "_", name) or "image"
                if not re.search(r"\.(jpe?g|png|gif|webp|svg)$", name, re.I):
                    return self._json({"ok": False, "error": "not an image"}, 400)
                os.makedirs(os.path.join(ROOT, "images"), exist_ok=True)
                with open(os.path.join(ROOT, "images", name), "wb") as f:
                    f.write(raw)
                return self._json({"ok": True, "path": "images/" + name})
        except Exception as e:  # report instead of crashing
            return self._json({"ok": False, "error": str(e)}, 500)
        self.send_error(404)

    def log_message(self, fmt, *args):
        if any(s in (args[0] if args else "") for s in ("__save", "__upload")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Site + editor at http://localhost:{PORT}  (Ctrl+C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
