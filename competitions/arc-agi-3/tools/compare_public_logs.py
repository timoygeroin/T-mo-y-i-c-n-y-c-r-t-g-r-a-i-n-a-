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
# Runner prints the pre-action observation; count N does not prove action N caused progress.
# Supports raw official local output and timestamp-prefixed GitHub job logs.
ACTION_ROW = re.compile(
    r"^\ufeff?(?:\d{4}-\d\d-\d\dT\S+Z\s+)?"
    r"([A-Za-z0-9]{4}) - (ACTION[1-7]|RESET): count (\d+), "
    r"levels completed (\d+), avg fps", re.M)


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
    traces = {}
    for game, action, count, level in ACTION_ROW.findall(text):
        if game not in games:
            raise ValueError(f"action trace for game absent from scorecard: {game}")
        traces.setdefault(game, []).append((int(count), int(level)))
    if traces:
        if set(traces) != set(games):
            raise ValueError("incomplete action traces: not every scorecard game present")
        for game, observations in traces.items():
            counts = [count for count, _ in observations]
            expected = games[game]["actions"]
            if counts != list(range(expected)):
                raise ValueError(f"incomplete or reordered action trace: {game}")
            if any(level > games[game]["levels"] for _, level in observations):
                raise ValueError(f"trace exceeds final scorecard levels: {game}")
            first = next((count for count, level in observations if level >= 1), None)
            games[game]["first_level_observed_pre_action_count"] = first
    return {"games": games, "local_score": score, "has_complete_action_traces": bool(traces)}


def compare(control: dict, candidate: dict) -> dict:
    if set(control["games"]) != set(candidate["games"]):
        raise ValueError("unpaired game IDs")
    trace_available = control.get("has_complete_action_traces", False)
    if trace_available != candidate.get("has_complete_action_traces", False):
        raise ValueError("unpaired action-trace availability")
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
    common = {
        g: (candidate["games"][g]["first_level_observed_pre_action_count"]
            - control["games"][g]["first_level_observed_pre_action_count"])
        for g in sorted(diffs)
        if trace_available
        and control["games"][g]["first_level_observed_pre_action_count"] is not None
        and candidate["games"][g]["first_level_observed_pre_action_count"] is not None
    }
    new_first = ([g for g in sorted(diffs)
                  if control["games"][g]["first_level_observed_pre_action_count"] is None
                  and candidate["games"][g]["first_level_observed_pre_action_count"] is not None]
                 if trace_available else [])
    lost_first = ([g for g in sorted(diffs)
                   if control["games"][g]["first_level_observed_pre_action_count"] is not None
                   and candidate["games"][g]["first_level_observed_pre_action_count"] is None]
                  if trace_available else [])
    return {
        "evidence": "OFFICIAL_PUBLIC_LOCAL_UNPAIRED_SEEDS_NOT_HIDDEN_KAGGLE",
        "games": len(diffs),
        "baseline_local_score": control["local_score"],
        "candidate_local_score": candidate["local_score"],
        "local_score_delta": candidate["local_score"] - control["local_score"],
        "local_score_regression": candidate["local_score"] < control["local_score"],
        "first_level_action_cost_available": trace_available,
        "first_level_action_cost_regressions": {g: v for g, v in common.items() if v > 0},
        "first_level_action_cost_improvements": {g: v for g, v in common.items() if v < 0},
        "common_first_level_action_cost_delta": sum(common.values()) if common else None,
        "new_first_level_games": new_first,
        "lost_first_level_games": lost_first,
        "first_level_count_semantics": "first OBSERVED pre-action level>=1 count; not causal attribution",
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
