"""Read-only counterfactual: relax ONLY unit displacement to cardinal magnitude >=1.

H0 static; H1 within-game prequential replay/effect; H2 original unit-only
relative donor transfer; H3 same relative roles/actions/levels/consensus but
allow any nonzero CARDINAL magnitude. Public leave-one-game-out shadow only.
Donor evidence may occur later globally; not causal or hidden evaluation.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from remaining_public_sample import FROZEN_GAMES, HORIZON
from relative_geometry_transfer_audit import (
    GATES, _roles, _consensus, _evaluate_target, evaluate_relative_transfer
)

PROTOCOL = "arc-agi3.relative-cardinal-nonunit-leave-one-public-game-out-v1"


def _learn_cardinal(before, after, action, level, evidence):
    """Identical to strict learner except magnitude restriction; no diagonal."""
    kind = classify([list(x) for x in before], [list(x) for x in after])
    if kind not in ("static", "single_object_translate"):
        return
    removed = list((Counter(before)-Counter(after)).elements())
    added = list((Counter(after)-Counter(before)).elements())
    moved = None
    if kind == "single_object_translate" and len(removed) == len(added) == 1:
        old, new = removed[0], added[0]
        delta = (new[2]-old[2], new[3]-old[3])
        if (delta[0] == 0) == (delta[1] == 0):
            return  # Zero or diagonal displacement is not cardinal.
        moved = (old, delta)
    for obj, role in zip(before, _roles(before)):
        if role is None:
            continue
        if moved is not None and obj == moved[0]:
            evidence[(level, action, role)].add(moved[1])
        elif obj in after:
            evidence[(level, action, role)].add((0, 0))


def _donors_cardinal(grouped):
    by_game = {}
    for game, rows in grouped.items():
        rules = defaultdict(set)
        for row in rows:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before = _scene(row["before_scene"])
            after = _scene(row["after_scene"])
            _learn_cardinal(before, after, row["action_key"], row["level_before"], rules)
        by_game[game] = rules
    return by_game


def evaluate_nonunit_relative_transfer(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    strict_unit = evaluate_relative_transfer(rows)
    donors = _donors_cardinal(grouped)
    per_game, total, support = {}, {}, {}
    for game in FROZEN_GAMES:
        one = _consensus(donors, game, 1)
        two = _consensus(donors, game, 2)
        relaxed = _evaluate_target(grouped[game], one, two)
        original = strict_unit["per_game"][game]
        for key in ("same_level", "level_advances", "static_correct", "baseline_correct"):
            if relaxed[key] != original[key]:
                raise AssertionError("nonunit counterfactual changed matched control: " + key)
        if (relaxed["same_level"] != frozen["per_game"][game]["same_level_records"] or
                relaxed["baseline_correct"] != frozen["per_game"][game]["combined_correct"]):
            raise AssertionError("nonunit counterfactual diverged from frozen public control")
        stats = {
            "same_level": relaxed["same_level"],
            "level_advances": relaxed["level_advances"],
            "static_correct": relaxed["static_correct"],
            "baseline_correct": relaxed["baseline_correct"],
            "strict_unit_correct": original["strict_correct"],
            "strict_unit_forecasts": original["strict_relative_forecasts"],
            "strict_nonunit_correct": relaxed["strict_correct"],
            "strict_nonunit_forecasts": relaxed["strict_relative_forecasts"],
            "strict_nonunit_forecasts_correct": relaxed["strict_relative_correct"],
            "strict_nonunit_delta": relaxed["strict_correct"] - original["strict_correct"],
            "nonunit_vs_local_delta": relaxed["strict_correct"] - relaxed["baseline_correct"],
        }
        per_game[game] = stats
        support[game] = {"one_donor_rules": len(one), "two_donor_rules": len(two)}
        for key, value in stats.items():
            total[key] = total.get(key, 0) + value
    positive = sum(x["strict_nonunit_delta"] > 0 for x in per_game.values())
    negative = sum(x["strict_nonunit_delta"] < 0 for x in per_game.values())
    forecast_games = sum(x["strict_nonunit_forecasts"] > 0 for x in per_game.values())
    passed = (positive >= GATES["min_positive_games"] and
              negative <= GATES["max_negative_games"] and
              total["strict_nonunit_forecasts"] >= GATES["min_strict_forecasts"] and
              forecast_games >= GATES["min_forecast_games"] and
              total["level_advances"] >= GATES["min_progress_events"])
    return {
        "protocol": PROTOCOL, "games": list(FROZEN_GAMES), "horizon": HORIZON,
        "hypotheses": ["static", "within_game_replay_effect_static",
                       "unit_cardinal_two_donor_relative",
                       "any_magnitude_cardinal_two_donor_relative"],
        "only_relaxation": "nonzero cardinal displacement magnitude; roles, action identity, level, donor unanimity and abstentions unchanged",
        "per_game": per_game, "total": total, "donor_support": support,
        "acceptance": {"positive_games": positive, "negative_games": negative,
                       "strict_forecast_games": forecast_games,
                       "research_gates_passed": passed,
                       "result": "RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION"
                       if passed else "REJECT_POLICY_INTEGRATION"},
        "effect_on_agent": "NONE_SHADOW_ONLY",
        "caveat": "Exploratory PUBLIC previously aggregate-benchmarked games; donors may be later than target; no intervention, hidden holdout, gameplay A/B, or Kaggle submission",
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: relative_nonunit_transfer_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = evaluate_nonunit_relative_transfer(
            json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
