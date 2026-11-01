"""Isolated transient-aware no-op veto experiment, not a contest policy.

A terminal-identical animation may carry a temporary masked-playfield effect.
For the first two same-state/action-type attempts only, avoid declaring it
dead. All other scoring, legality, click ranking, and frozen source unchanged.
This may regress; no promotion without real matched public evidence.
"""
from __future__ import annotations
import argparse
from pathlib import Path

ANCHOR = "        elif delta == 0:\n            self._dead_actions.add(key)\n"
REPLACEMENT = """        elif delta == 0:
            # H1: intermediate masked-playfield effects may indicate an
            # action with latent consequences; never call this progress.
            transient = (
                bool(self._last_grids) and len(grids) > 1
                and any(
                    self._key(previous[0], [frame])[1] != previous[1]
                    for frame in grids[:-1]
                )
            )
            prior_attempts = self._attempts[
                (previous[0], previous[1], self._last_move)
            ]
            if transient and prior_attempts <= 2:
                self._dead_actions.discard(key)
            else:
                self._dead_actions.add(key)
"""

def generate(source: str) -> str:
    if source.count(ANCHOR) != 1:
        raise ValueError("frozen source drift: no-op veto anchor absent")
    result = source.replace(ANCHOR, REPLACEMENT, 1)
    compile(result, "<animation-veto>", "exec")
    return result

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    args.output.write_text(generate(args.source.read_text()))

if __name__ == "__main__":
    main()
