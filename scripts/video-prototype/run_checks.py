"""Runs the stepping checks in the app's WebView on a connected Android phone, through the debugger.

docs/video-prototype.md explains the set-up. Needs: uv (it pulls playwright), `adb reverse tcp:8765 tcp:8765`,
serve.py running, the app (built with VITE_PROTOTYPE=1) installed and started.
  uv run --with playwright python run_checks.py <folder> <name> [<name> ...]
A <name> is a clip<name>.mp4 in the folder, with truth<name>.json next to it (the sorted frame times from ffprobe).
"""
import asyncio, json, subprocess, sys

from playwright.async_api import async_playwright

FOLDER = sys.argv[1]
NAMES = sys.argv[2:]


def adb(*a):
    return subprocess.run(["adb", *a], capture_output=True, text=True).stdout.strip()


async def main():
    pid = adb("shell", "pidof", "de.fletchr.app")
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    async with async_playwright() as p:
        page = (await p.chromium.connect_over_cdp("http://localhost:9222")).contexts[0].pages[0]
        await page.evaluate("window.location.assign('/dev/video')")
        await page.wait_for_function("window.__videoTest !== undefined", timeout=20000)
        for name in NAMES:
            truth = json.load(open(f"{FOLDER}/truth{name}.json"))
            for fraction in (0.25, 0.5):  # where in the frame the seek aims
                r = await page.evaluate("([u, t, f]) => window.__videoTest.fromUrl(u, t, f)", [f"http://localhost:8765/clip{name}.mp4", truth, fraction])
                s, j = r["steps"], r["jumps"]
                print(f"{name}, aim {fraction}: forward {s['forward']['exact']}/{s['forward']['steps']} (median {s['forward']['medianMs']} ms), "
                      f"back {s['backward']['exact']}/{s['backward']['steps']} ({s['backward']['medianMs']} ms), jumps {j['exact']}/{j['steps']} ({j['medianMs']} ms)")


asyncio.run(main())
