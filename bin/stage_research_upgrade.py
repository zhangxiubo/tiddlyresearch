"""Build a fresh local wiki from an exported snapshot, preserving a migration archive."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def retire_template(tiddler):
    active_tags = {"$:/tags/ViewTemplate", "$:/tags/Stylesheet", "$:/tags/Macro"}
    tags = [bracketed or plain for bracketed, plain in re.findall(
        r"\[\[(.*?)\]\]|(\S+)", tiddler.get("tags", "")
    )]
    retained = [tag for tag in tags if tag not in active_tags]
    return {**tiddler, "tags": " ".join(f"[[{tag}]]" for tag in retained)}


def migrate(source, entries):
    by_title = {tiddler["title"]: tiddler for tiddler in source}
    for entry in entries:
        tiddler = by_title.get(entry["title"])
        if tiddler is None:
            raise ValueError(f"Expected customization is missing: {entry['title']}")
        digest = hashlib.sha256(tiddler.get("text", "").encode()).hexdigest()
        if digest != entry["text_sha256"]:
            raise ValueError(f"Customization changed; review before migration: {entry['title']}")
    actions = {
        "delete": lambda title: by_title.pop(title),
        "retire": lambda title: by_title.update({title: retire_template(by_title[title])}),
    }
    for entry in entries:
        actions[entry["action"]](entry["title"])
    return list(by_title.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-export", type=Path, required=True)
    parser.add_argument("--wiki-info", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    source = json.loads(args.source_export.read_text())
    manifest = json.loads((project / "migrations/research_customizations.json").read_text())
    migrated = migrate(source, manifest["entries"])
    if args.target.exists():
        raise ValueError("The target must be a new directory; existing wiki data will not be overwritten")
    info = json.loads(args.wiki_info.read_text())
    info["plugins"] = list(dict.fromkeys([
        *info["plugins"], "tiddlywiki/codemirror-mode-css"
    ]))
    args.target.mkdir(parents=True, mode=0o700)
    archive = args.target / "migration"
    archive.mkdir()
    (archive / "source.json").write_text(json.dumps(source, indent=2))
    (archive / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (args.target / "tiddlywiki.info").write_text(json.dumps(info, indent=2))
    tiddlers = args.target / "tiddlers"
    tiddlers.mkdir()
    # One file per tiddler keeps filesystem saves independent.
    for number, tiddler in enumerate(migrated):
        (tiddlers / f"{number:05d}.json").write_text(json.dumps(tiddler))
    plugins = args.target / "plugins"
    plugins.mkdir()
    for name, source_path in {
        "streams": project / "plugins/sq/streams",
        "research": project / "plugins/xiubo/research",
    }.items():
        (plugins / name).symlink_to(source_path.resolve(), target_is_directory=True)
    print(json.dumps({"wiki": str(args.target.resolve()), "tiddlers": len(migrated),
                      "migrated_customizations": len(manifest["entries"])}))


if __name__ == "__main__":
    main()
