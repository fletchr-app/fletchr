"""Serves the clips in this folder with CORS headers (port 8765) and receives slow uploads (port 8766, logs progress).

For the video prototype (docs/video-prototype.md). The phone reaches both through `adb reverse`.
  python3 serve.py <folder with clip*.mp4>
"""
import http.server, os, sys, threading, time

FOLDER = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
RATE = 3 * 1024 * 1024  # bytes per second accepted on the upload port: a slow connection, so an upload lasts a minute or more


class Files(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=FOLDER, **k)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


class Upload(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Methods", "POST"), ("Access-Control-Allow-Headers", "*")):
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        total, got, t0, last = int(self.headers["Content-Length"]), 0, time.time(), 0
        with open(os.path.join(FOLDER, "receive.log"), "w") as log:
            log.write(f"start, {total / 1048576:.0f} MB\n")
            while got < total:
                chunk = self.rfile.read(min(65536, total - got))
                if not chunk:
                    log.write(f"CONNECTION LOST at {got / 1048576:.1f} MB after {time.time() - t0:.0f} s\n")
                    return
                got += len(chunk)
                time.sleep(len(chunk) / RATE)
                if time.time() - last > 5:
                    log.write(f"{time.time() - t0:5.0f} s {got / 1048576:6.1f} MB\n")
                    log.flush()
                    last = time.time()
            log.write(f"DONE {got / 1048576:.1f} MB in {time.time() - t0:.0f} s\n")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"ok")


threading.Thread(target=http.server.ThreadingHTTPServer(("127.0.0.1", 8766), Upload).serve_forever, daemon=True).start()
http.server.ThreadingHTTPServer(("127.0.0.1", 8765), Files).serve_forever()
