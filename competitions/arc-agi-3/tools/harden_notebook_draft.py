"""Fail-closed, reproducible hardening of the unsubmitted ARC notebook draft.

The official starter emits IPython !shell escapes. A failed !command does not
necessarily fail the cell. This tool only replaces five known escapes with
subprocess.run(check=True); it never edits the agent or submits to Kaggle.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shlex
import tempfile


def _guard_cell(source: str) -> tuple[str, list[str]]:
    lines = source.splitlines()
    output = ["import subprocess"]
    seen: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.lstrip().startswith("!"):
            output.append(line)
            i += 1
            continue
        indent = line[:len(line) - len(line.lstrip())]
        parts = [line.strip()[1:]]
        while parts[-1].rstrip().endswith("\\"):
            parts[-1] = parts[-1].rstrip()[:-1]
            i += 1
            if i >= len(lines):
                raise ValueError("unterminated shell continuation")
            parts.append(lines[i].strip())
        cmd = shlex.split(" ".join(parts))
        if cmd[:2] == ["pip", "install"] and "--no-index" in cmd:
            seen.append("pip")
            expression = f"subprocess.run({['python', '-m', 'pip', *cmd[1:]]!r}, check=True)"
        elif cmd and cmd[0] == "curl" and cmd[-1] == "http://gateway:8001/api/games" and "--fail" in cmd:
            seen.append("curl")
            expression = f"subprocess.run({cmd!r}, check=True)"
        elif cmd and cmd[0] == "cp":
            seen.append("cp")
            expression = f"subprocess.run({cmd!r}, check=True)"
        elif (len(cmd) == 8 and cmd[0] == "cd" and cmd[2:5] == ["&&", "MPLBACKEND=agg", "python"]
              and cmd[5:] == ["main.py", "--agent", "myagent"]):
            seen.append("agent")
            expression = (f"subprocess.run({cmd[4:]!r}, cwd={cmd[1]!r}, "
                          "env=dict(os.environ, MPLBACKEND='agg'), check=True)")
        else:
            raise ValueError(f"unrecognized shell escape: {cmd!r}")
        output.append(indent + expression)
        i += 1
    return "\n".join(output) + ("\n" if source.endswith("\n") else ""), seen


def harden_notebook(notebook: dict) -> dict:
    cells = notebook.get("cells", [])
    if (len(cells) != 5 or [c.get("cell_type") for c in cells]
            != ["markdown", "code", "code", "code", "code"]):
        raise ValueError("unexpected notebook structure")
    if notebook.get("metadata", {}).get("kaggle", {}).get("isInternetEnabled") is not False:
        raise ValueError("notebook must have internet disabled")
    if not cells[2].get("source", "").startswith("%%writefile /tmp/my_agent.py\n"):
        raise ValueError("unexpected embedded agent cell")
    install, install_commands = _guard_cell(cells[1]["source"])
    rerun, rerun_commands = _guard_cell(cells[3]["source"])
    if install_commands != ["pip"] or rerun_commands != ["curl", "cp", "cp", "agent"]:
        raise ValueError(f"upstream shell shape changed: {install_commands}, {rerun_commands}")
    compile(install, "<notebook install>", "exec")
    compile(rerun, "<notebook rerun>", "exec")
    cells[1]["source"] = install
    cells[3]["source"] = rerun
    notebook["metadata"]["mondayid_fail_fast_shell_v1"] = True
    return notebook


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("notebook", type=Path)
    args = parser.parse_args()
    path = args.notebook
    notebook = harden_notebook(json.loads(path.read_text()))
    content = json.dumps(notebook, indent=1)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".notebook-guard-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print("[notebook-guard] five known shell escapes now fail on nonzero exit")


if __name__ == "__main__":
    main()
