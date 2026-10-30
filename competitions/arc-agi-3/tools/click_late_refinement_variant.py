"""UL005 isolated late click spatial refinement research candidate.

H0: frozen click policy is no worse.
H1: after 384 actions on a still-unsolved click-only first level, a
small coordinate offset probes nearby physical positions.
H2: late offset misses interactive controls or only changes animation.

This generator is not imported by the submission agent. Never promote from
synthetic tests or reused-public-cohort score alone.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from click_stagnation_variant import generate as stagnation_generate

SOURCE_GUARD = "    MAX_CLICKS = 80\n"
PICK = """        _,_,x,y = min(ranked)
        self._click_visits[(key[0],key[1],x,y)]+=1
"""
REPLACEMENT = """        _,_,x,y = min(ranked)
        # UL005 late spatial refinement: isolated, not a production policy.
        # Record the actual physical point, not the unshifted proposal.
        if getattr(self, '_click_only', False) and key[0] == 0 and self._steps >= 384:
            x, y = min(63, x + 2), min(60, y + 2)
        self._click_visits[(key[0],key[1],x,y)]+=1
"""

def generate(source: str) -> str:
    if source.count(SOURCE_GUARD) != 1:
        raise ValueError("frozen agent source guard failed")
    result = stagnation_generate(source)
    if result.count("self._steps >= 128") != 1 or result.count(PICK) != 1:
        raise ValueError("stagnation/click source guard failed")
    result = result.replace("self._steps >= 128", "self._steps >= 96", 1)
    result = result.replace(PICK, REPLACEMENT, 1)
    compile(result, "<ul005-late-spatial-refinement>", "exec")
    return result

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))

if __name__ == "__main__":
    main()
