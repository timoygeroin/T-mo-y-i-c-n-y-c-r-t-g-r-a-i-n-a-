"""Isolated delayed click-only spatial exploration, not an official policy.

Post-hoc hypothesis from same public cohort: keep salient-first for the first
128 actions, then switch to uniform-first only if a click-only level has not
advanced. A positive result would remain in-sample, not promotion evidence.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from click_affordance_variant import generate as affordance_generate

BEFORE = "        self._click_only = len(legal) == 1 and legal[0].name == 'ACTION6'\n"
AFTER = """        # Stagnation gate: early successes retain the exact frozen policy.
        # Action affordance and level are observed, not inferred from game ID.
        self._click_only = (
            len(legal) == 1 and legal[0].name == 'ACTION6'
            and level == 0 and self._steps >= 128
        )
"""


def generate(source: str) -> str:
    result = affordance_generate(source)
    if result.count(BEFORE) != 1:
        raise ValueError("affordance gate source guard failed")
    result = result.replace(BEFORE, AFTER, 1)
    compile(result, "<stagnation-gated-candidate>", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))


if __name__ == "__main__":
    main()
