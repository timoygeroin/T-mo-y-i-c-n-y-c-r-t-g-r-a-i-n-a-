"""Isolated strict-prior cardinal no-op penalty candidate; frozen agent untouched.

H0: observed no-op counts add no generalizable same-budget progress.
H1: soft penalties avoid repeated ineffective cardinal actions and save actions.
H2: apparent no-ops are reversible/setup actions; penalties cause regressions.
Only observations from earlier completed actions enter the current score.
No game IDs, hidden-state access, or policy promotion.
"""
from __future__ import annotations

import argparse
from pathlib import Path

GUARDS = {
    "max_clicks": "    MAX_CLICKS = 80\n",
    "init": "        self._dead_actions: set[tuple[int, str, str]] = set()\n",
    "changed": "            self._dead_actions.discard(key)\n",
    "unchanged": "        elif delta == 0:\n            self._dead_actions.add(key)\n",
    "score": "            if attempt in self._dead_actions:\n                value-=3.0\n",
    "cap": "            self._dead_actions.clear()\n",
}


def generate(source: str) -> str:
    """Return candidate with guarded exact frozen-source seams."""
    for label, anchor in GUARDS.items():
        if source.count(anchor) != 1:
            raise ValueError(f"frozen {label} source guard failed")
    result = source
    result = result.replace(
        GUARDS["init"],
        GUARDS["init"] + "        self._noops: Counter[tuple[int, str, str]] = Counter()\n",
        1,
    )
    result = result.replace(
        GUARDS["changed"],
        GUARDS["changed"] + "            self._noops.pop(key, None)\n",
        1,
    )
    result = result.replace(
        GUARDS["unchanged"],
        GUARDS["unchanged"] + "            self._noops[key] += 1\n",
        1,
    )
    result = result.replace(
        GUARDS["score"],
        GUARDS["score"] +
        "            if identity in ('ACTION1', 'ACTION2', 'ACTION3', 'ACTION4'):\n"
        "                value -= 0.5 * min(self._noops[attempt], 6)\n",
        1,
    )
    result = result.replace(
        GUARDS["cap"],
        GUARDS["cap"] + "            self._noops.clear()\n",
        1,
    )
    compile(result, "<strict-prior-soft-noop-candidate>", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))


if __name__ == "__main__":
    main()
