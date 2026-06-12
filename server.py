#!/usr/bin/env python3
import json
import mimetypes
import os
import posixpath
import shutil
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_FILE = ROOT / "data" / "onboarding.json"
UPLOAD_DIR = ROOT / "uploads"
PORT = int(os.environ.get("PORT", "3000"))
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def read_data():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_data(data):
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
        file.write("\n")


def configured_email(data):
    return os.environ.get("ADMIN_EMAIL", data.get("adminEmail", "")).strip().lower()


def configured_password(data):
    return os.environ.get("ADMIN_PASSWORD", data.get("adminPassword", ""))


def public_data(data):
    clean = json.loads(json.dumps(data))
    clean.pop("adminEmail", None)
    clean.pop("adminPassword", None)
    return clean


def parse_multipart(body, content_type):
    if not content_type:
        raise ValueError("Missing Content-Type.")
    boundary = None
    for part in content_type.split(";"):
        part = part.strip()
        if part.startswith("boundary="):
            boundary = part.split("=", 1)[1].strip()
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]
            break
    if not boundary:
        raise ValueError("Missing multipart boundary.")
    boundary_bytes = boundary.encode("utf-8")
    delimiter = b"--" + boundary_bytes
    fields = {}
    for part in body.split(delimiter):
        if not part or part in (b"--", b"--\r\n"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        headers, sep, payload = part.partition(b"\r\n\r\n")
        if sep != b"\r\n\r\n":
            continue
        header_map = {}
        for line in headers.split(b"\r\n"):
            decoded = line.decode("utf-8", errors="replace")
            if ":" not in decoded:
                continue
            key, _, value = decoded.partition(":")
            header_map[key.lower().strip()] = value.strip()
        disposition = header_map.get("content-disposition", "")
        if "form-data" not in disposition:
            continue
        attrs = {}
        for item in disposition.split(";"):
            item = item.strip()
            if "=" in item:
                name, value = item.split("=", 1)
                attrs[name.strip()] = value.strip().strip('"')
        name = attrs.get("name")
        if not name:
            continue
        fields[name] = {
            "filename": attrs.get("filename"),
            "data": payload,
        }
    return fields


def safe_path(base, requested):
    cleaned = posixpath.normpath(unquote(requested).split("?", 1)[0]).lstrip("/")
    full = (base / cleaned).resolve()
    try:
        full.relative_to(base.resolve())
    except ValueError:
        return None
    return full


def safe_filename(name):
    keep = []
    for char in Path(name or "file").name:
        keep.append(char if char.isalnum() or char in "._- " else "_")
    cleaned = "".join(keep).strip() or "file"
    stem = Path(cleaned).stem or "file"
    suffix = Path(cleaned).suffix
    return f"{stem}-{int(time.time())}-{uuid.uuid4().hex[:6]}{suffix}"


def remove_file_references(data, href):
    data["bannerFiles"] = [item for item in data.get("bannerFiles", []) if item.get("href") != href]
    for phase in data.get("phases", []):
        for task in phase.get("tasks", []):
            task["files"] = [item for item in task.get("files", []) if item.get("href") != href]


class Handler(BaseHTTPRequestHandler):
    server_version = "OnboardingHTTP/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, status, body):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_text(self, status, body):
        raw = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def body_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Request is too large.")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8") or "{}") if raw else {}

    def admin_email(self):
        return self.headers.get("x-admin-email", "").strip().lower()

    def admin_password(self):
        return self.headers.get("x-admin-password", "")

    def is_admin(self, data, email, password):
        return email.strip().lower() == configured_email(data) and password == configured_password(data)

    def require_admin(self, data):
        if self.is_admin(data, self.admin_email(), self.admin_password()):
            return True
        self.send_json(401, {"error": "Admin credentials are not authorized."})
        return False

    def serve_file(self, path):
        if not path or not path.exists() or not path.is_file():
            self.send_text(404, "Not found")
            return
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        raw = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        pathname = parsed.path
        if pathname == "/api/onboarding":
            self.send_json(200, public_data(read_data()))
            return
        if pathname in ("/", "/admin"):
            self.serve_file(PUBLIC_DIR / "index.html")
            return
        if pathname.startswith("/uploads/"):
            self.serve_file(safe_path(UPLOAD_DIR, pathname.replace("/uploads/", "", 1)))
            return
        self.serve_file(safe_path(PUBLIC_DIR, pathname))

    def do_POST(self):
        parsed = urlparse(self.path)
        pathname = parsed.path
        data = read_data()
        try:
            if pathname == "/api/admin/verify":
                body = self.body_json()
                ok = self.is_admin(data, body.get("email", ""), body.get("password", ""))
                self.send_json(200 if ok else 401, {"ok": True} if ok else {"error": "That email or password is not authorized."})
                return
            if pathname == "/api/admin/upload":
                if not self.require_admin(data):
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if length > MAX_UPLOAD_BYTES:
                    self.send_json(400, {"error": "File is too large."})
                    return
                content_type = self.headers.get("Content-Type", "")
                if "multipart/form-data" not in content_type:
                    self.send_json(400, {"error": "Unsupported content type."})
                    return
                raw = self.rfile.read(length)
                fields = parse_multipart(raw, content_type)
                field = fields.get("file")
                if field is None or not field.get("filename"):
                    self.send_json(400, {"error": "No file was uploaded."})
                    return
                filename = safe_filename(field["filename"])
                target = UPLOAD_DIR / filename
                with target.open("wb") as output:
                    output.write(field["data"])
                self.send_json(200, {"label": Path(field["filename"]).name, "href": f"/uploads/{filename}"})
                return
        except Exception as error:
            self.send_json(400, {"error": str(error)})
            return
        self.send_json(404, {"error": "Not found."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/admin/onboarding":
            self.send_json(404, {"error": "Not found."})
            return
        data = read_data()
        if not self.require_admin(data):
            return
        try:
            next_data = self.body_json()
            next_data["adminEmail"] = data.get("adminEmail", configured_email(data))
            next_data["adminPassword"] = data.get("adminPassword", configured_password(data))
            write_data(next_data)
            self.send_json(200, {"ok": True})
        except Exception as error:
            self.send_json(400, {"error": str(error)})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/admin/file":
            self.send_json(404, {"error": "Not found."})
            return
        data = read_data()
        if not self.require_admin(data):
            return
        try:
            body = self.body_json()
            href = body.get("href", "")
            if href.startswith("/uploads/"):
                target = safe_path(UPLOAD_DIR, href.replace("/uploads/", "", 1))
                if target and target.exists():
                    target.unlink()
            remove_file_references(data, href)
            write_data(data)
            self.send_json(200, {"ok": True})
        except Exception as error:
            self.send_json(400, {"error": str(error)})


if __name__ == "__main__":
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Bind to all interfaces so Render (and other hosts) can detect the open port
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Onboarding app running on port {PORT}")
    print(f"Admin route: http://<host>:{PORT}/admin")
    server.serve_forever()
