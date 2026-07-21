#!/usr/bin/env python3
"""Generate "Stay Tuned" placeholder pages from tools/sitemap.json.

To add a future page: add an entry to sitemap.json (route, title, crumb,
section, theme, optional children), then rerun this script.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = (ROOT / "templates" / "placeholder.html").read_text()
SITEMAP = json.loads((ROOT / "tools" / "sitemap.json").read_text())


def render(entry):
    route = entry["route"].strip("/")
    depth = len(route.split("/"))
    site_root = "../" * depth

    children_html = ""
    if entry.get("children"):
        links = "\n".join(
            f'    <a href="{site_root}{c["href"]}" class="st-child-link">{c["label"]}</a>'
            for c in entry["children"]
        )
        children_html = f'  <div class="st-children">\n{links}\n  </div>\n'

    html = TEMPLATE
    html = html.replace("__SITE_ROOT__", site_root)
    html = html.replace("__TITLE__", entry["title"])
    html = html.replace("__CRUMB__", entry["crumb"])
    html = html.replace("__THEME__", entry["theme"])
    html = html.replace("__SECTION__", entry["section"])
    html = html.replace("__PAGE__", route)
    html = html.replace("__CHILDREN__\n", children_html)
    return html


def main():
    for entry in SITEMAP:
        out_dir = ROOT / entry["route"].strip("/")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / "index.html"
        out_file.write_text(render(entry))
        print(f"wrote {out_file.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
