"""Isolated public-game click-target coverage hypotheses.

Frozen baseline agent is copied, never edited. Both candidates use the same
ARC runtime, action cap and available actions; no game-ID-specific behavior.
This is a generator, not a Kaggle submission or a claimed score improvement.
"""
from __future__ import annotations

import argparse
from pathlib import Path

ORIGINAL = "    MAX_CLICKS = 80\n"
EXPANDED = "    MAX_CLICKS = 114\n"
SALIENT = "        ordered = [(x,y) for _,x,y in candidates[:50]]\n"
UNIQUE = "        unique=[]\n"


def generate(source: str, kind: str) -> str:
    """Apply exactly one preregistered click-target policy variant.

    H0: widening/ordering click candidates yields no same-budget public gain.
    H1: full 8x8 coverage improves clicks under a 500-action budget.
    H2: uniform-first ordering helps more than rare-color salience-first.
    H3: broader exploration dilutes useful focus and causes regressions.
    """
    if kind not in ("coverage", "grid_first"):
        raise ValueError("unregistered candidate")
    if source.count(ORIGINAL) != 1:
        raise ValueError("frozen MAX_CLICKS=80 source guard failed")
    result = source.replace(ORIGINAL, EXPANDED, 1)
    if kind == "grid_first":
        if result.count(SALIENT) != 1 or result.count(UNIQUE) != 1:
            raise ValueError("salience ordering source guard failed")
        result = result.replace(
            SALIENT, SALIENT + "        salient_count = len(ordered)\n", 1
        )
        result = result.replace(
            UNIQUE,
            "        ordered = ordered[salient_count:] + ordered[:salient_count]\n"
            + UNIQUE,
            1,
        )
    compile(result, "<isolated-" + kind + ">", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--kind", choices=("coverage", "grid_first"), required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text(), args.kind))


if __name__ == "__main__":
    main()
