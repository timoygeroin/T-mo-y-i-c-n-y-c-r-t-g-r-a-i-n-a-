"""Read-only leave-one-public-game-out action-effect hypothesis falsification.

Each held-out game is excluded from ALL donor learning. Competing hypotheses:
H0 static; H1 within-game prequential exact replay then one-object effect;
H2 H1 followed by cross-game unanimous displacement from >=1 donor game;
H3 H1 followed by unanimous displacement from >=2 distinct donor games.
Donor evidence is from other PUBLIC games only; donor episodes may occur at
different chronological times. This is NOT a temporal global prequential
claim, independent hidden holdout, intervention, policy or Kaggle score.
"""
from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sys

from effect_coverage_audit import _scene
from remaining_public_sample import FROZEN_GAMES, HORIZON, evaluate_remaining
from single_object_prequential import _effect_forecast, _learn_effect

PROTOCOL = "arc-agi3.cross-game-leave-one-out-v1"
GATES = dict(min_positive_games=3, max_negative_games=0,
             min_strict_donor_forecasts=30, min_forecast_games=3,
             min_progress_events=3, automatic_policy_promotion=False)


def _bounded_rows(records):
    rows = []
    for row in records:
        if len(rows) >= len(FROZEN_GAMES) * HORIZON:
            raise ValueError("exceeded frozen public trace budget")
        rows.append(row)
    # Reuse the unchanged, tested frozen roster/order/turn/action validator.
    baseline = evaluate_remaining(rows)
    grouped = {game: [] for game in FROZEN_GAMES}
    for row in rows:
        grouped[row["game_id"]].append(row)
    return grouped, baseline


def _donor_evidence(grouped):
    """Per donor GAME and level; never use a target game's own observations."""
    by_game = {}
    for game, rows in grouped.items():
        levels = defaultdict(lambda: defaultdict(set))
        for row in rows:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before = _scene(row["before_scene"])
            after = _scene(row["after_scene"])
            _learn_effect(before, after, row["action_key"], levels[row["level_before"]])
        by_game[game] = levels
    return by_game


def _consensus(donors, held_out, min_donors):
    """Unanimous nonzero displacement with distinct donor-game support.

    A static witness, contradictory effect, or missing independent support
    vetoes the corresponding rule; no outcome from held_out is considered.
    """
    votes = defaultdict(dict)
    for game, levels in donors.items():
        if game == held_out:
            continue
        for level, evidence in levels.items():
            for (action, signature), effects in evidence.items():
                votes[(level, action, signature)][game] = frozenset(effects)
    by_level = defaultdict(dict)
    supported = 0
    for (level, action, signature), per_game in votes.items():
        if len(per_game) < min_donors:
            continue
        unique = set().union(*per_game.values())
        if len(unique) != 1 or (0, 0) in unique:
            continue
        delta = next(iter(unique))
        by_level[level][(action, signature)] = {delta}
        supported += 1
    return by_level, supported


def _evaluate_target(rows, donor_permissive, donor_strict):
    """Score every same-level outcome BEFORE updating target-local evidence."""
    seen = {}
    local = defaultdict(set)
    last_level = None
    last_turn = -1
    stats = dict(same_level=0, level_advances=0, static_correct=0,
                 baseline_correct=0, permissive_correct=0, strict_correct=0,
                 permissive_donor_forecasts=0, permissive_donor_correct=0,
                 strict_donor_forecasts=0, strict_donor_correct=0)
    for row in rows:
        turn, level = row["turn"], row["level_before"]
        if level != last_level or turn != last_turn + 1:
            seen = {}
            local = defaultdict(set)
        last_level, last_turn = level, turn
        if row["action_key"] == "RESET":
            seen = {}
            local = defaultdict(set)
            continue
        if row["level_after"] != level:
            stats["level_advances"] += 1
            seen = {}
            local = defaultdict(set)
            last_level = row["level_after"]
            continue
        action = row["action_key"]
        before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
        stats["same_level"] += 1
        stats["static_correct"] += int(before == after)
        prior = seen.get((action, before))
        local_effect, _ = _effect_forecast(before, action, local)
        # Exact replay takes precedence; contradictory exact outcomes veto
        # both local and donor extrapolation.
        if prior is not None:
            baseline = next(iter(prior)) if len(prior) == 1 else before
            donor_allowed = False
        elif local_effect is not None:
            baseline = local_effect
            donor_allowed = False
        else:
            baseline = before
            donor_allowed = True
        stats["baseline_correct"] += int(baseline == after)
        for name, consensus in (("permissive", donor_permissive),
                                ("strict", donor_strict)):
            candidate = None
            if donor_allowed:
                candidate, _ = _effect_forecast(before, action, consensus.get(level, {}))
            prediction = candidate if candidate is not None else baseline
            stats[name + "_correct"] += int(prediction == after)
            stats[name + "_donor_forecasts"] += int(candidate is not None)
            stats[name + "_donor_correct"] += int(candidate is not None and candidate == after)
        seen.setdefault((action, before), set()).add(after)
        _learn_effect(before, after, action, local)
    stats["permissive_delta"] = stats["permissive_correct"] - stats["baseline_correct"]
    stats["strict_delta"] = stats["strict_correct"] - stats["baseline_correct"]
    return stats


def evaluate_cross_game(records):
    grouped, baseline = _bounded_rows(records)
    donors = _donor_evidence(grouped)
    per_game = {}
    totals = {}
    support = {}
    for held_out in FROZEN_GAMES:
        permissive, weak_support = _consensus(donors, held_out, 1)
        strict, strong_support = _consensus(donors, held_out, 2)
        result = _evaluate_target(grouped[held_out], permissive, strict)
        per_game[held_out] = result
        support[held_out] = {"one_donor_rules": weak_support,
                             "two_donor_rules": strong_support}
        for key, value in result.items():
            totals[key] = totals.get(key, 0) + value
    # Cross-check that both methods scored precisely the SAME turns as the
    # independently validated within-game prequential evaluator.
    if (totals["same_level"] != baseline["total"]["same_level_records"] or
            totals["baseline_correct"] != baseline["total"]["combined_correct"] or
            totals["static_correct"] != baseline["total"]["static_correct"] or
            totals["level_advances"] != baseline["total"]["level_advance_records"]):
        raise AssertionError("matched-turn control diverged from frozen baseline")
    positive = sum(s["strict_delta"] > 0 for s in per_game.values())
    negative = sum(s["strict_delta"] < 0 for s in per_game.values())
    forecast_games = sum(s["strict_donor_forecasts"] > 0 for s in per_game.values())
    gates_passed = (positive >= GATES["min_positive_games"] and
                    negative <= GATES["max_negative_games"] and
                    totals["strict_donor_forecasts"] >= GATES["min_strict_donor_forecasts"] and
                    forecast_games >= GATES["min_forecast_games"] and
                    totals["level_advances"] >= GATES["min_progress_events"])
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["static", "within_game_replay_then_effect_then_static",
                            "local_then_one_donor_unanimous",
                            "local_then_two_distinct_donors_unanimous"],
                per_game=per_game, total=totals, donor_support=support,
                acceptance=dict(positive_games=positive, negative_games=negative,
                                strict_forecast_games=forecast_games,
                                research_gates_passed=gates_passed,
                                result=("RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION"
                                        if gates_passed else "REJECT_POLICY_INTEGRATION")),
                effect_on_agent="NONE_SHADOW_ONLY",
                caveat=("PUBLIC already aggregate-benchmarked games; donor outcomes "
                        "from other games, never held-out target; no causal intervention, "
                        "hidden score, policy A/B or Kaggle submission"))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: cross_game_transfer_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = evaluate_cross_game(json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
