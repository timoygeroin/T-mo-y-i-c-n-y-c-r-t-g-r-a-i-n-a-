"""Read-only nonunit cardinal movement veto ladder on frozen PUBLIC traces.

No transfer relaxation, policy action, Kaggle call, or hidden evaluation.
Counts are post-hoc eligibility observations, NOT prospective predictions.
Donor outcomes may occur later globally than a held-out target episode.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from relative_geometry_transfer_audit import _roles, _consensus
from relative_nonunit_transfer_audit import _donors_cardinal
from relative_support_diagnostics import _role_rejection
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.nonunit-cardinal-veto-ladder-v1"


def diagnose_nonunit_veto(records):
    """Explain gates in the EXISTING nonunit model without changing them.

    The held-out game's outcomes never enter its donor rules. A target
    action-level overlap is measured BEFORE role matching; an exact-key
    overlap requires the unchanged relative role signature. Candidate
    veto counts partition other-game nonzero movement keys per held-out game,
    not independent predictions or causal effects.
    """
    grouped, frozen = _bounded_rows(records)
    donors = _donors_cardinal(grouped)
    total = Counter()
    role_rejections = Counter()
    target_keys, target_action_levels, per_game = {}, {}, {}

    for game in FROZEN_GAMES:
        keys, action_levels = set(), set()
        stats = Counter()
        for row in grouped[game]:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before = _scene(row["before_scene"])
            after = _scene(row["after_scene"])
            level, action = row["level_before"], row["action_key"]
            action_levels.add((level, action))
            roles = _roles(before)
            keys.update((level, action, role) for role in roles if role is not None)
            stats["same_level"] += 1
            kind = classify([list(x) for x in before], [list(x) for x in after])
            if kind != "single_object_translate":
                continue
            removed = list((Counter(before) - Counter(after)).elements())
            added = list((Counter(after) - Counter(before)).elements())
            if len(removed) != 1 or len(added) != 1:
                raise AssertionError("inconsistent single-object translation")
            old, new = removed[0], added[0]
            dx, dy = new[2] - old[2], new[3] - old[3]
            if dx and dy:
                stats["diagonal_moves"] += 1
                continue
            if abs(dx) + abs(dy) == 1:
                stats["unit_cardinal_moves"] += 1
                continue
            if abs(dx) + abs(dy) == 0:
                raise AssertionError("zero displacement classified as translation")
            stats["nonunit_cardinal_moves"] += 1
            reason = _role_rejection(before, old, roles)
            if reason is None:
                stats["role_eligible_moves"] += 1
            else:
                stats["role_rejected_moves"] += 1
                role_rejections[reason] += 1
        if stats["same_level"] != frozen["per_game"][game]["same_level_records"]:
            raise AssertionError("frozen public same-level control diverged")
        target_keys[game] = keys
        target_action_levels[game] = action_levels
        per_game[game] = dict(stats)
        total.update(stats)

    for target in FROZEN_GAMES:
        other_movement = defaultdict(set)
        for donor_game, rules in donors.items():
            if donor_game == target:
                continue
            for key, effects in rules.items():
                if any(delta != (0, 0) for delta in effects):
                    other_movement[key].add(donor_game)
        one = _consensus(donors, target, 1)
        two = _consensus(donors, target, 2)
        action_levels = target_action_levels[target]
        keys = target_keys[target]
        veto = Counter()
        for key, nonzero_games in other_movement.items():
            if key[:2] not in action_levels:
                veto["action_level_mismatch"] += 1
            elif key not in keys:
                veto["relative_role_mismatch"] += 1
            elif len(nonzero_games) < 2 and len([
                    g for g, rules in donors.items() if g != target and key in rules
            ]) < 2:
                veto["insufficient_donor_games"] += 1
            else:
                effects = set().union(*(
                    rules[key] for g, rules in donors.items()
                    if g != target and key in rules
                ))
                if len(effects) != 1 or (0, 0) in effects:
                    veto["static_or_conflicting_effect"] += 1
                else:
                    veto["eligible_two_donor_key"] += 1
        if sum(veto.values()) != len(other_movement):
            raise AssertionError("donor veto partition not exhaustive")
        per_game[target].update(
            donor_nonzero_keys=len(other_movement),
            target_action_level_overlap=len(
                {key[:2] for key in other_movement} & action_levels),
            target_exact_key_overlap=len(set(other_movement) & keys),
            one_donor_rules=len(one),
            two_donor_rules=len(two),
            target_one_donor_overlap=len(set(one) & keys),
            target_two_donor_overlap=len(set(two) & keys),
            candidate_key_veto=dict(veto),
        )
    return {
        "protocol": PROTOCOL,
        "games": list(FROZEN_GAMES),
        "horizon": HORIZON,
        "total": {**dict(total), "role_rejections": dict(role_rejections)},
        "per_game": per_game,
        "effect_on_agent": "NONE_SHADOW_ONLY",
        "interpretation": "Post-hoc PUBLIC cardinal nonunit role/action/consensus veto decomposition; no rule relaxation or policy promotion",
        "caveat": "Not hidden or independent holdout; donor games may be globally later; key-veto counts are not predictions or causal effects",
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: nonunit_veto_diagnostics.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as handle:
        result = diagnose_nonunit_veto(json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
