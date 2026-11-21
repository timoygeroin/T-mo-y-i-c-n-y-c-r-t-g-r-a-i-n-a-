"""Read-only veto-ladder diagnosis of strict relative donor support on PUBLIC ARC traces.

This audit diagnoses representation/eligibility failures; it does NOT relax
rules, generate policy actions, use Kaggle, or claim causal generalization.
Donor outcomes can occur later than held-out target turns.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from relative_geometry_transfer_audit import _roles, _donors, _consensus, _sign
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.relative-support-veto-diagnostic-v1"


def _role_rejection(before, obj, roles):
    """Explain a missing role without changing the frozen _roles definition."""
    if roles[before.index(obj)] is not None:
        return None
    others = [other for other in before if other != obj]
    if not others:
        return "no_anchor"
    area = obj[1]
    if not (all(area < other[1] for other in others) or
            all(area > other[1] for other in others)):
        return "area_rank_ambiguous"
    cx, cy = obj[2]+obj[4], obj[3]+obj[5]
    distances = [abs(o[2]+o[4]-cx)+abs(o[3]+o[5]-cy) for o in others]
    if distances.count(min(distances)) != 1:
        return "nearest_anchor_tie"
    return "duplicate_role"


def diagnose_relative_support(records):
    """Decompose observed movement, role vetoes and donor/target key overlap.

    The same frozen roster/ordering/budget validation is applied as in prior
    experiments. Held-out target outcomes are NEVER used in donor consensus.
    Counters describe post-hoc PUBLIC evidence, not future predictions.
    """
    grouped, frozen = _bounded_rows(records)
    donors = _donors(grouped)
    counts = Counter()
    rejections = Counter()
    target_keys = {}
    per_game = {}
    for game in FROZEN_GAMES:
        keys = set()
        stats = Counter()
        for row in grouped[game]:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
            action, level = row["action_key"], row["level_before"]
            roles = _roles(before)
            stats["same_level"] += 1
            for role in roles:
                if role is not None:
                    keys.add((level, action, role))
            kind = classify([list(x) for x in before], [list(x) for x in after])
            if kind == "static":
                stats["static"] += 1
            elif kind == "single_object_translate":
                stats["single_object_translate"] += 1
                removed = list((Counter(before)-Counter(after)).elements())
                added = list((Counter(after)-Counter(before)).elements())
                if len(removed) != 1 or len(added) != 1:
                    raise AssertionError("single-object classification inconsistent")
                old, new = removed[0], added[0]
                dx, dy = new[2]-old[2], new[3]-old[3]
                if abs(dx)+abs(dy) != 1:
                    stats["nonunit_moves"] += 1
                    if dx != 0 and dy != 0:
                        stats["diagonal_moves"] += 1
                else:
                    stats["unit_cardinal_moves"] += 1
                    reason = _role_rejection(before, old, roles)
                    if reason is None:
                        stats["eligible_unit_moves"] += 1
                    else:
                        stats["rejected_unit_moves"] += 1
                        rejections[reason] += 1
            else:
                stats["other_effects"] += 1
        expected = frozen["per_game"][game]
        if stats["same_level"] != expected["same_level_records"]:
            raise AssertionError("diagnostic trace diverged from frozen control")
        target_keys[game] = keys
        per_game[game] = dict(stats)

    # Compare frozen rule evidence across distinct donor games; never pool
    # different games into a fake independent sample.
    movement_by_key = defaultdict(set)
    all_effects_by_key = defaultdict(set)
    for game, rules in donors.items():
        for key, effects in rules.items():
            all_effects_by_key[key].update(effects)
            if any(delta != (0, 0) for delta in effects):
                movement_by_key[key].add(game)
    support = {
        "movement_keys": len(movement_by_key),
        "multi_donor_movement_keys": sum(len(games) >= 2
                                         for games in movement_by_key.values()),
        "conflicted_movement_keys": sum(
            (0, 0) in all_effects_by_key[key] or
            len({d for d in all_effects_by_key[key] if d != (0, 0)}) > 1
            for key in movement_by_key),
    }
    for game in FROZEN_GAMES:
        weak = _consensus(donors, game, 1)
        strict = _consensus(donors, game, 2)
        other_movement_keys = {
            key for key, games in movement_by_key.items() if any(g != game for g in games)
        }
        donor_action_levels = {(level, action) for level, action, _ in other_movement_keys}
        keys = target_keys[game]
        per_game[game].update(
            eligible_target_keys=len(keys),
            donor_action_level_overlap=len({(level, action) for level, action, _ in keys}
                                           & donor_action_levels),
            donor_exact_key_overlap=len(keys & other_movement_keys),
            weak_donor_rules=len(weak),
            strict_donor_rules=len(strict),
            weak_target_key_overlap=len(keys & set(weak)),
            strict_target_key_overlap=len(keys & set(strict)),
        )
    for stats in per_game.values():
        counts.update({k: v for k, v in stats.items()
                       if k in ("same_level", "static", "single_object_translate",
                                "unit_cardinal_moves", "nonunit_moves",
                                "diagonal_moves", "eligible_unit_moves",
                                "rejected_unit_moves", "other_effects")})
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                total={**dict(counts), "role_rejections": dict(rejections)},
                support=support, per_game=per_game,
                effect_on_agent="NONE_SHADOW_ONLY",
                interpretation="Post-hoc public-trace eligibility/veto counts; no rule relaxation or forecast gain",
                caveat="Frozen PUBLIC games, not hidden holdout; donors may be later than target globally")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: relative_support_diagnostics.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        print(json.dumps(diagnose_relative_support(
            json.loads(line) for line in handle if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
