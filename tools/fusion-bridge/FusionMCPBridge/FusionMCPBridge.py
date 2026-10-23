"""Fusion 360 add-in: local HTTP bridge so agents (Claude Code / Codex) can run
Fusion API Python code.

POST http://127.0.0.1:7432/exec  {"code": "..."}  ->  {"ok": bool, "output": str, "result": any, "error": str}
GET  http://127.0.0.1:7432/ping                   ->  {"ok": true, "document": "..."}

The code runs on Fusion's main thread (via a CustomEvent) with these names
predefined: adsk, app, ui, design, root. Assign to `result` to return a value;
print() output is captured into "output". Listens on localhost only.
"""
import adsk.core
import adsk.fusion
import contextlib
import io
import json
import queue
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", 7432
EVENT_ID = "FusionMCPBridge_exec"
TIMEOUT_SEC = 120

_app = None
_ui = None
_server = None
_event = None
_handlers = []
_jobs = {}
_jobs_lock = threading.Lock()
_job_counter = 0


def _run_code(code):
    design = adsk.fusion.Design.cast(_app.activeProduct)
    ns = {
        "adsk": adsk,
        "app": _app,
        "ui": _ui,
        "design": design,
        "root": design.rootComponent if design else None,
        "result": None,
    }
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(code, "<agent>", "exec"), ns)
        res = ns.get("result")
        try:
            json.dumps(res)
        except TypeError:
            res = repr(res)
        return {"ok": True, "output": buf.getvalue(), "result": res}
    except Exception:
        return {"ok": False, "output": buf.getvalue(), "error": traceback.format_exc()}


class _ExecEventHandler(adsk.core.CustomEventHandler):
    def notify(self, args):
        job_id = int(args.additionalInfo)
        with _jobs_lock:
            job = _jobs.get(job_id)
        if job is None:
            return
        job["response"] = _run_code(job["code"])
        job["done"].set()


def _submit(code):
    global _job_counter
    with _jobs_lock:
        _job_counter += 1
        job_id = _job_counter
        job = {"code": code, "done": threading.Event(), "response": None}
        _jobs[job_id] = job
    try:
        _app.fireCustomEvent(EVENT_ID, str(job_id))
        if not job["done"].wait(TIMEOUT_SEC):
            return {"ok": False, "error": "timeout waiting for Fusion main thread"}
        return job["response"]
    finally:
        with _jobs_lock:
            _jobs.pop(job_id, None)


class _Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/ping":
            self._send(200, _submit("result = app.activeDocument.name if app.activeDocument else None"))
        else:
            self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/exec":
            self._send(404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            code = json.loads(self.rfile.read(length).decode("utf-8"))["code"]
        except Exception as e:
            self._send(400, {"ok": False, "error": "bad request: %s" % e})
            return
        self._send(200, _submit(code))

    def log_message(self, *args):
        pass


def run(context):
    global _app, _ui, _server, _event
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface
        _event = _app.registerCustomEvent(EVENT_ID)
        handler = _ExecEventHandler()
        _event.add(handler)
        _handlers.append(handler)
        _server = ThreadingHTTPServer((HOST, PORT), _Handler)
        threading.Thread(target=_server.serve_forever, daemon=True).start()
    except Exception:
        if _ui:
            _ui.messageBox("FusionMCPBridge failed to start:\n" + traceback.format_exc())


def stop(context):
    global _server
    try:
        if _server:
            _server.shutdown()
            _server.server_close()
            _server = None
        if _event:
            for h in _handlers:
                _event.remove(h)
            _handlers.clear()
        _app.unregisterCustomEvent(EVENT_ID)
    except Exception:
        pass
