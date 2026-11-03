"""Shadow-only decomposition of projected donor consensus on frozen PUBLIC ARC-AGI-3.

Separates independent donor count, static evidence and conflicting effects for
four competing action/role world hypotheses. No policy change or Kaggle calls.
Donor observations can be globally later: this is post-hoc PUBLIC attribution,
not a prospective or hidden-score evaluation.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from action_role_counterfactual_audit import (
    VARIANTS, _consensus_projected, _key, evaluate_action_role_counterfactual,
)
from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene
from relative_area_rank_transfer_audit import _donors_unranked, _roles_unranked
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.projected-donor-consensus-decomposition-v1"
CATEGORIES = (
    "insufficient_donor_games", "static_only",
    "contradictory_or_mixed", "unanimous_nonstatic",
)


def partition_support(donors, target, variant, target_keys):
    """Classify each projected key exactly once; never count a target as donor."""
    if variant not in VARIANTS:
        raise ValueError("unknown hypothesis")
    by_key = defaultdict(lambda: defaultdict(set))
    for game, rules in donors.items():
        if game == target:
            continue
        for (level, action, role), effects in rules.items():
            if effects:
                by_key[_key(level, action, role, variant)][game].update(effects)
    counts = Counter({name: 0 for name in CATEGORIES})
    overlap = Counter({name: 0 for name in CATEGORIES})
    histogram = Counter()
    accepted = {}
    for key, votes in by_key.items():
        histogram[len(votes)] += 1
        effects = set().union(*votes.values())
        if len(votes) < 2:
            category = "insufficient_donor_games"
        elif effects == {(0, 0)}:
            category = "static_only"
        elif len(effects) != 1 or (0, 0) in effects:
            category = "contradictory_or_mixed"
        else:
            category = "unanimous_nonstatic"
            accepted[key] = next(iter(effects))
        counts[category] += 1
        overlap[category] += int(key in target_keys)
    if sum(counts.values()) != len(by_key):
        raise AssertionError("nonexhaustive projected donor partition")
    expected = _consensus_projected(donors, target, variant)
    if accepted != expected:
        raise AssertionError("partition disagrees with frozen donor consensus")
    return dict(categories=dict(counts), target_overlap=dict(overlap),
                independent_donor_game_histogram=dict(sorted(histogram.items())),
                projected_keys=len(by_key), accepted=accepted)


def diagnose_projected_donor_consensus(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    prior = evaluate_action_role_counterfactual(rows)
    donors = _donors_unranked(grouped)
    per_game = {}
    total = {v: {name: 0 for name in CATEGORIES} for v in VARIANTS}
    overlap_total = {v: {name: 0 for name in CATEGORIES} for v in VARIANTS}
    for game in FROZEN_GAMES:
        target_keys = {v: set() for v in VARIANTS}
        for row in grouped[game]:
            if (row["action_key"] == "RESET" or
                    row["level_before"] != row["level_after"]):
                continue
            for role in _roles_unranked(_scene(row["before_scene"])):
                if role is None:
                    continue
                for variant in VARIANTS:
                    target_keys[variant].add(_key(
                        row["level_before"], row["action_key"], role, variant))
        per_game[game] = {}
        for variant in VARIANTS:
            partition = partition_support(donors, game, variant, target_keys[variant])
            if len(partition["accepted"]) != prior["donor_support"][game][variant]:
                raise AssertionError("projected consensus count drift")
            if (prior["per_game"][game][variant + "_forecasts"] >
                    len(set(partition["accepted"]) & target_keys[variant])):
                raise AssertionError("forecasts exceed target-key support")
            per_game[game][variant] = {
                key: value for key, value in partition.items() if key != "accepted"
            }
            per_game[game][variant]["accepted_rules"] = len(partition["accepted"])
            per_game[game][variant]["target_keys"] = len(target_keys[variant])
            for category in CATEGORIES:
                total[variant][category] += partition["categories"][category]
                overlap_total[variant][category] += partition["target_overlap"][category]
        if prior["per_game"][game]["same_level"] != frozen["per_game"][game]["same_level_records"]:
            raise AssertionError("frozen public control drift")
    return dict(protocol=PROTOCOL,
                hypotheses=["insufficient_independent_donor_games",
                            "static_effect_veto", "contradictory_effect_veto",
                            "unanimous_nonstatic_consensus"],
                projected_variants=list(VARIANTS), games=list(FROZEN_GAMES),
                horizon=HORIZON, per_game=per_game, total_categories=total,
                total_target_overlap=overlap_total,
                prior_forecasts={v: prior["total"][v + "_forecasts"] for v in VARIANTS},
                effect_on_agent="NONE_SHADOW_ONLY",
                caveat="Frozen PUBLIC leave-one-game-out, post-hoc donor observations may be globally later. Key exposures are not independent predictions; sequential veto order puts insufficient donors first. No policy, hidden score or Kaggle action.")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: projected_donor_consensus_diagnostic.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = diagnose_projected_donor_consensus(
            json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
