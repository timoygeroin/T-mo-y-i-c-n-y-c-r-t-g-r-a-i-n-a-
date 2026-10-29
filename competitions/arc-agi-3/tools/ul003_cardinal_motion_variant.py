"""Generate isolated UL003 cardinal-motion candidates; never touch frozen agent.

H0 frozen; H1 extra persistence after observed >=4-pixel effect; H2
negative-control extra persistence after <4 pixels. Effect is masked
visible change, not proven causal game progress. No game-ID tricks.
"""
from __future__ import annotations
import argparse
from pathlib import Path

NEEDLE = "                    value += 0.55"
def generate(source: str, arm: str) -> str:
    if arm not in ("effect", "inverted"):
        raise ValueError("unknown UL003 arm")
    if source.count(NEEDLE) != 1:
        raise ValueError("frozen source guard mismatch")
    condition = ">= 4" if arm == "effect" else "< 4"
    replacement = (NEEDLE +
        " + (3.00 if self._delta(self._last_grids, grids) " +
        condition + " else 0.0)  # UL003 cardinal motion")
    candidate = source.replace(NEEDLE, replacement, 1)
    compile(candidate, "<ul003-candidate>", "exec")
    return candidate

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--arm", choices=("effect", "inverted"), required=True)
    args = p.parse_args()
    args.output.write_text(generate(args.source.read_text(), args.arm))

if __name__ == "__main__":
    main()
