"""Read-only paired comparison of official public-game runner logs.

This parses the runner's printed local scorecard, not Kaggle hidden scores.
No game-specific knowledge, external requests, credentials or policy changes.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re

SUMMARY = re.compile(r"^\s*(\S+)\s+levels=\s*(\d+)\s+actions=\s*(\d+)\s+state=(\S+)\s*$", re.M)
SCORE = re.compile(r"Aggregate scorecard score:\s*([0-9eE+.-]+)")


def parse(text: str, expected_games: int = 25) -> dict:
    games = {}
    for game, levels, actions, state in SUMMARY.findall(text):
        if game in games:
            raise ValueError(f"duplicate game in scorecard: {game}")
        games[game] = {"levels": int(levels), "actions": int(actions), "state": state}
    scores = SCORE.findall(text)
    if len(games) != expected_games or len(scores) != 1:
        raise ValueError(f"incomplete scorecard: {len(games)} games, {len(scores)} aggregates")
    score = float(scores[0])
    if not math.isfinite(score):
        raise ValueError("nonfinite scorecard")
    return {"games": games, "local_score": score}


def compare(control: dict, candidate: dict) -> dict:
    if set(control["games"]) != set(candidate["games"]):
        raise ValueError("unpaired game IDs")
    diffs = {
        g: {
            "baseline_levels": control["games"][g]["levels"],
            "candidate_levels": candidate["games"][g]["levels"],
            "baseline_actions": control["games"][g]["actions"],
            "candidate_actions": candidate["games"][g]["actions"],
            "level_delta": candidate["games"][g]["levels"] - control["games"][g]["levels"],
        }
        for g in sorted(control["games"])
    }
    return {
        "evidence": "OFFICIAL_PUBLIC_LOCAL_UNPAIRED_SEEDS_NOT_HIDDEN_KAGGLE",
        "games": len(diffs),
        "baseline_local_score": control["local_score"],
        "candidate_local_score": candidate["local_score"],
        "local_score_delta": candidate["local_score"] - control["local_score"],
        "baseline_completed_levels": sum(v["baseline_levels"] for v in diffs.values()),
        "candidate_completed_levels": sum(v["candidate_levels"] for v in diffs.values()),
        "improved_games": [g for g,v in diffs.items() if v["level_delta"] > 0],
        "regressed_games": [g for g,v in diffs.items() if v["level_delta"] < 0],
        "per_game": diffs,
        "auto_promoted": False,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("baseline_log")
    ap.add_argument("candidate_log")
    ap.add_argument("--expected-games", type=int, default=25)
    ap.add_argument("--output", default="arc-frontier-ab-result.json")
    args = ap.parse_args()
    baseline = parse(Path(args.baseline_log).read_text(), args.expected_games)
    candidate = parse(Path(args.candidate_log).read_text(), args.expected_games)
    result = compare(baseline, candidate)
    Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
