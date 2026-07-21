#!/usr/bin/env python3
"""
Screenshot tool — captures pages using Playwright/Chromium.

Usage:
    python3 tools/screenshot.py [url_or_file] [output_path] [--width W] [--height H] [--full-page]

Examples:
    python3 tools/screenshot.py index.html
    python3 tools/screenshot.py landing.html .tmp/landing.png --full-page
    python3 tools/screenshot.py https://example.com .tmp/example.png --width 1440
"""

import sys
import os
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Take a screenshot of a local HTML file or URL")
    parser.add_argument("target", nargs="?", default="index.html",
                        help="Local file path or URL (default: index.html)")
    parser.add_argument("output", nargs="?",
                        help="Output PNG path (default: screenshots/<filename>.png)")
    parser.add_argument("--width",     type=int, default=1440, help="Viewport width (default: 1440)")
    parser.add_argument("--height",    type=int, default=900,  help="Viewport height (default: 900)")
    parser.add_argument("--full-page", action="store_true",    help="Capture the full scrollable page")
    parser.add_argument("--delay",     type=int, default=1500, help="Wait (ms) after page load (default: 1500)")
    args = parser.parse_args()

    # Resolve target to a file:// URL or keep as http(s)
    target = args.target
    if not target.startswith(("http://", "https://", "file://")):
        abs_path = Path(target).resolve()
        if not abs_path.exists():
            # Try relative to this script's parent directory
            abs_path = (Path(__file__).parent.parent / target).resolve()
        if not abs_path.exists():
            print(f"ERROR: file not found: {target}", file=sys.stderr)
            sys.exit(1)
        target = abs_path.as_uri()

    # Resolve output path
    if args.output:
        out = Path(args.output)
    else:
        stem = Path(args.target).stem if not args.target.startswith("http") else "screenshot"
        out = Path(__file__).parent.parent / "screenshots" / f"{stem}.png"

    out.parent.mkdir(parents=True, exist_ok=True)

    # Take screenshot with Playwright
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        page.goto(target, wait_until="networkidle")
        page.wait_for_timeout(args.delay)

        # Force all scroll-reveal elements visible so full-page captures show content
        page.evaluate("""
            document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
        """)
        page.wait_for_timeout(300)

        page.screenshot(path=str(out), full_page=args.full_page)
        browser.close()

    print(f"Screenshot saved: {out}")

if __name__ == "__main__":
    main()
