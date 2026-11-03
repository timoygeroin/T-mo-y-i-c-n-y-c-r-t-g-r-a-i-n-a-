"""Isolated observational ARC-AGI-3 animation probe; never alters policy.

Output is an instrumented copy of the exact frozen source, used only by a
temporary official-public runner. Logs pre-action visible animation evidence
without treating a transient as a success, reward, or causal proof.
"""
from __future__ import annotations
import argparse
from pathlib import Path

ANCHOR = "        previous=self._last_observation\n"
INJECTION = """        previous=self._last_observation
        # SHADOW ONLY: observe all frames returned by the previous action.
        # The competition policy below remains byte-for-byte unchanged.
        if len(grids) > 1 and self._last_grids:
            prev_digest = self._key(previous[0], self._last_grids)[1]
            terminal_digest = self._key(current[0], grids)[1]
            intermediates = [
                self._key(current[0], [frame])[1] for frame in grids[:-1]
            ]
            transient_distinct = sum(k != terminal_digest for k in intermediates)
            reverted = int(
                current[0] == previous[0]
                and terminal_digest == prev_digest
                and any(k != prev_digest for k in intermediates)
            )
            print(
                "ARC_ANIMATION_PROBE game=%s step=%d frames=%d "
                "transient_distinct=%d reverted=%d level_delta=%d"
                % (self.game_id, self._steps, len(grids), transient_distinct,
                   reverted, current[0] - previous[0]),
                flush=True,
            )
"""

def generate(source: str) -> str:
    if source.count(ANCHOR) != 1:
        raise ValueError("frozen source drift: observation anchor absent")
    result = source.replace(ANCHOR, INJECTION, 1)
    compile(result, "<animation-observability>", "exec")
    return result

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    args.output.write_text(generate(args.source.read_text()))

if __name__ == "__main__":
    main()
