#!/usr/bin/env python3
"""Rewrite VoiceOps workflow IDs after a UI import (which assigns new IDs).

usage: python3 scripts/relink.py workflows/ id-map.json
id-map.json: {"vopsDispatcher00": "aB3dE...", "vopsCrmAdapter00": "..."}
Rewrites Execute Workflow targets, errorWorkflow settings and the config's outcome handler id.
"""
import json, pathlib, sys

folder, mapping = pathlib.Path(sys.argv[1]), json.loads(pathlib.Path(sys.argv[2]).read_text())
for f in sorted(folder.glob("*.json")):
    text = f.read_text()
    new = text
    for old, repl in mapping.items():
        new = new.replace(old, repl)
    if new != text:
        f.write_text(new)
        wf = json.loads(new)
        calls = [n["name"] for n in wf["nodes"] if n["type"] == "n8n-nodes-base.executeWorkflow"]
        print(f"updated {f.name}: {', '.join(calls) or 'settings/config only'}")
