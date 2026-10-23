"""Starts a long upload in the app, sends the app to the background and watches what arrives (see docs/video-prototype.md).
  uv run --with playwright python background_upload.py <folder with clip.mp4 and receive.log>
"""
import asyncio, subprocess, sys, time

from playwright.async_api import async_playwright

FOLDER = sys.argv[1]


def adb(*a):
    return subprocess.run(["adb", *a], capture_output=True, text=True).stdout.strip()


def tail():
    try:
        return open(f"{FOLDER}/receive.log").read().strip().splitlines()[-1]
    except Exception:
        return "(no log yet)"


async def main():
    pid = adb("shell", "pidof", "de.fletchr.app")
    adb("forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}")
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp("http://localhost:9222")
        page = b.contexts[0].pages[0]
        await page.evaluate("window.location.assign('/dev/video')")
        await page.wait_for_function("window.__videoTest !== undefined", timeout=20000)
        mb = await page.evaluate("window.__videoTest.upload('http://localhost:8765/clip.mp4', 'http://localhost:8766/up', 3)")
        print(f"upload of {mb} MB started")
        await asyncio.sleep(12)
        print("before:", tail())
        adb("shell", "input", "keyevent", "KEYCODE_HOME")
        await b.close()
    t0 = time.time()
    for _ in range(10):
        await asyncio.sleep(10)
        print(f"{int(time.time() - t0):4d} s in the background:", tail())


asyncio.run(main())
