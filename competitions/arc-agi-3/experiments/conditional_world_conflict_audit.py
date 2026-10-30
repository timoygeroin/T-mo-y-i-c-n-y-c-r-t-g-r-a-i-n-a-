"""PUBLIC shadow counterfactual: are static/moving donor conflicts geometry-conditioned?

Compare H0 (mixed effects remain contradictory), H1 (out-of-bounds explains
static witnesses), H2 (out-of-bounds OR destination bounding-box collision
explains static witnesses). The proposed displacement is inferred ONLY from
other donor observations; feasibility uses BEFORE scenes, never AFTER scenes.
A matching explanation is NOT a predictive transfer rule or gameplay gain.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from action_role_counterfactual_audit import VARIANTS, _key
from cross_game_transfer_audit import _bounded_rows
from effect_coverage_audit import _scene, classify
from projected_donor_consensus_diagnostic import diagnose_projected_donor_consensus
from relative_area_rank_transfer_audit import _roles_unranked
from remaining_public_sample import FROZEN_GAMES, HORIZON

PROTOCOL = "arc-agi3.geometry-conditioned-donor-conflicts-v1"


def feasibility(before, obj, delta):
    """Observable pre-action geometry only; conservative bounding-box collision."""
    dx, dy = delta
    shifted = (obj[2]+dx, obj[3]+dy, obj[4]+dx, obj[5]+dy)
    bounds = 0 <= shifted[0] <= shifted[2] < 64 and 0 <= shifted[1] <= shifted[3] < 64
    def intersects(other):
        return not (shifted[2] < other[2] or shifted[0] > other[4] or
                    shifted[3] < other[3] or shifted[1] > other[5])
    clear = bounds and not any(intersects(other) for other in before if other != obj)
    return dict(bounds=bounds, clear=clear)


def _witnesses(grouped):
    result = []
    for game, rows in grouped.items():
        for row in rows:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            before, after = _scene(row["before_scene"]), _scene(row["after_scene"])
            kind = classify([list(o) for o in before], [list(o) for o in after])
            if kind not in ("static", "single_object_translate"):
                continue
            moved = None
            if kind == "single_object_translate":
                removed = list((Counter(before)-Counter(after)).elements())
                added = list((Counter(after)-Counter(before)).elements())
                if len(removed) != 1 or len(added) != 1:
                    continue
                old, new = removed[0], added[0]
                delta = (new[2]-old[2], new[3]-old[3])
                if (delta[0] == 0) == (delta[1] == 0):
                    continue
                moved = (old, delta)
            for obj, role in zip(before, _roles_unranked(before)):
                if role is None:
                    continue
                if moved is not None and obj == moved[0]:
                    effect = moved[1]
                elif obj in after:
                    effect = (0, 0)
                else:
                    continue
                result.append(dict(game=game, level=row["level_before"],
                                   action=row["action_key"], role=role,
                                   obj=obj, before=before, effect=effect))
    return result


def partition_conditional_conflicts(witnesses, target, variant, target_keys):
    """Group independent OTHER-game witnesses; never use target outcome."""
    if variant not in VARIANTS:
        raise ValueError("unknown hypothesis")
    groups = defaultdict(list)
    for w in witnesses:
        if w["game"] == target:
            continue
        groups[_key(w["level"], w["action"], w["role"], variant)].append(w)
    counts = dict(mixed_keys=0, boundary_explained=0, collision_explained=0,
                  unresolved_mixed=0, two_moving_donor_keys=0,
                  target_overlap_mixed=0, target_overlap_boundary=0,
                  target_overlap_collision=0)
    for key, rows in groups.items():
        if len({w["game"] for w in rows}) < 2:
            continue
        effects = {tuple(w["effect"]) for w in rows}
        moving = effects - {(0, 0)}
        if (0, 0) not in effects or not moving:
            continue
        counts["mixed_keys"] += 1
        counts["target_overlap_mixed"] += int(key in target_keys)
        if len(moving) != 1:
            counts["unresolved_mixed"] += 1
            continue
        delta = next(iter(moving))
        statuses = [(w, feasibility(w["before"], w["obj"], delta)) for w in rows]
        moving_ok_bounds = all(f["bounds"] for w, f in statuses if w["effect"] != (0, 0))
        moving_ok_clear = all(f["clear"] for w, f in statuses if w["effect"] != (0, 0))
        static_blocked_bounds = all(not f["bounds"] for w, f in statuses if w["effect"] == (0, 0))
        static_blocked_clear = all(not f["clear"] for w, f in statuses if w["effect"] == (0, 0))
        boundary = moving_ok_bounds and static_blocked_bounds
        collision = moving_ok_clear and static_blocked_clear
        counts["boundary_explained"] += int(boundary)
        counts["collision_explained"] += int(collision)
        counts["target_overlap_boundary"] += int(boundary and key in target_keys)
        counts["target_overlap_collision"] += int(collision and key in target_keys)
        counts["unresolved_mixed"] += int(not boundary and not collision)
        counts["two_moving_donor_keys"] += int(
            collision and len({w["game"] for w in rows if w["effect"] != (0, 0)}) >= 2)
    return counts


def diagnose_conditional_world_conflicts(records):
    rows = list(records)
    grouped, frozen = _bounded_rows(rows)
    prior = diagnose_projected_donor_consensus(rows)
    witnesses = _witnesses(grouped)
    per_game = {}
    total = {v: defaultdict(int) for v in VARIANTS}
    for game in FROZEN_GAMES:
        target_keys = {v: set() for v in VARIANTS}
        for row in grouped[game]:
            if row["action_key"] == "RESET" or row["level_before"] != row["level_after"]:
                continue
            for role in _roles_unranked(_scene(row["before_scene"])):
                if role is None:
                    continue
                for variant in VARIANTS:
                    target_keys[variant].add(_key(
                        row["level_before"], row["action_key"], role, variant))
        per_game[game] = {}
        for variant in VARIANTS:
            r = partition_conditional_conflicts(witnesses, game, variant,
                                                target_keys[variant])
            if r["mixed_keys"] > prior["per_game"][game][variant]["categories"]["contradictory_or_mixed"]:
                raise AssertionError("conditional evidence exceeds prior mixed/conflict partition")
            if r["boundary_explained"] > r["mixed_keys"] or r["collision_explained"] > r["mixed_keys"]:
                raise AssertionError("invalid counterfactual partition")
            per_game[game][variant] = r
            for key, value in r.items():
                total[variant][key] += value
    return dict(protocol=PROTOCOL, games=list(FROZEN_GAMES), horizon=HORIZON,
                hypotheses=["H0_unconditional_conflict", "H1_bounds_conditioned",
                            "H2_bounds_and_bbox_occupancy_conditioned"],
                per_game=per_game, total={v: dict(total[v]) for v in VARIANTS},
                witness_count=len(witnesses),
                source_control_same_level=sum(frozen["per_game"][g]["same_level_records"]
                                              for g in FROZEN_GAMES),
                effect_on_agent="NONE_SHADOW_ONLY",
                acceptance="DIAGNOSTIC_ONLY_NO_POLICY_PROMOTION",
                caveat="Post-hoc PUBLIC trace; effects are observations, not randomized interventions. Bounding boxes are coarse and may misrepresent collision. Other donor games may be later globally. No hidden score, Kaggle submission or agent change.")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: conditional_world_conflict_audit.py PUBLIC_TRANSITIONS.jsonl")
    with Path(sys.argv[1]).open(encoding="utf-8") as f:
        print(json.dumps(diagnose_conditional_world_conflicts(
            json.loads(line) for line in f if line.strip()), sort_keys=True))


if __name__ == "__main__":
    main()
