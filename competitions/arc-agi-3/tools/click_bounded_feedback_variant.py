"""UL-002 isolated bounded visible-response reinforcement candidate.

H0 frozen feedback policy >= candidate; H1 bounded reinforcement prevents
repeatedly pressing a visually responsive but non-progressing control;
H2 repeated presses are necessary and penalizing them regresses performance.
This generator never edits the competition agent and never auto-promotes.
"""
from __future__ import annotations

import argparse
from pathlib import Path

ANCHOR = "            penalty -= 3*min(self._click_successes[causal_key], 2)\n"
REPLACEMENT = ANCHOR + (
    "            # UL-002: after two visible responses, treat further same-point\n"
    "            # responses as a saturation signal rather than unbounded value.\n"
    "            # No game ID, latent-state inference, or score feedback.\n"
    "            if self._click_successes[causal_key] > 2:\n"
    "                penalty += 8 * (self._click_successes[causal_key] - 2)\n"
)


def generate(source: str) -> str:
    if source.count(ANCHOR) != 1 or source.count("    MAX_CLICKS = 80\n") != 1:
        raise ValueError("frozen click-policy source guard failed")
    result = source.replace(ANCHOR, REPLACEMENT, 1)
    compile(result, "<ul002-bounded-click-feedback>", "exec")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(generate(args.source.read_text()))


if __name__ == "__main__":
    main()
