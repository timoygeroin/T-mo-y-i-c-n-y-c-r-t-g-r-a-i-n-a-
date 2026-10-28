"""Pure, read-only preregistration ledger for future PUBLIC three-world trials.

Sealing an outcome-blind plan BEFORE observing a treatment outcome and later
scoring a separate matched control are different operations. The SHA256 is
a content commitment, NOT proof of when the plan was sealed: a Git commit or
other independently timestamped record must precede gameplay to establish
chronology. Matching visible scenes does NOT establish matching latent state.
This module never executes actions, reads Kaggle, or modifies the agent.
"""
from __future__ import annotations

from hashlib import sha256
import json
import re

PROTOCOL = "arc-agi3.prospective-three-world-matched-pair-v3"
WORLDS = ("H0_static", "H1_absolute", "H2_anchor_relative")
PLAN_KEYS = frozenset(("game", "episode", "control_episode", "turn", "before",
                       "treatment_action", "control_action",
                       "donor_snapshot_sha256", "forecasts", "control_forecasts"))
OUTCOME_KEYS = frozenset(("game", "episode", "turn", "before", "action", "after"))
ACTION = re.compile(r"(?:ACTION[1-5]|ACTION6@[0-9]+,[0-9]+)\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")


def _scene(raw):
    if not isinstance(raw, (list, tuple)):
        raise ValueError("scene must be a sequence")
    objects = []
    for obj in raw:
        if (not isinstance(obj, (list, tuple)) or len(obj) != 6 or
                any(type(v) is not int for v in obj)):
            raise ValueError("invalid object descriptor")
        color, area, x0, y0, x1, y1 = obj
        if (color < 0 or area < 1 or
                not (0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64) or
                area > (x1 - x0 + 1) * (y1 - y0 + 1)):
            raise ValueError("object descriptor outside visible frame")
        objects.append(tuple(obj))
    if len(set(objects)) != len(objects):
        raise ValueError("duplicate object descriptor")
    return [list(obj) for obj in sorted(objects)]


def _text(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("missing trial identity")
    return value


def _action(value):
    if not isinstance(value, str) or not ACTION.fullmatch(value):
        raise ValueError("not a bounded exact public action")
    if value.startswith("ACTION6@"):
        x, y = (int(v) for v in value.split("@")[1].split(","))
        if not (0 <= x < 64 and 0 <= y < 64):
            raise ValueError("click outside frame")
    return value


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _hash(value):
    return sha256(_canonical(value).encode("utf-8")).hexdigest()



def _single_cardinal_translation(before, after):
    """H1/H2 must each move exactly one rigid descriptor along one axis.

    Different hypotheses MAY select different movers. This validates
    observable forecast semantics, not the donor support or causal truth.
    """
    if len(before) != len(after):
        return False
    removed = set(map(tuple, before)) - set(map(tuple, after))
    added = set(map(tuple, after)) - set(map(tuple, before))
    if len(removed) != 1 or len(added) != 1:
        return False
    old, new = next(iter(removed)), next(iter(added))
    dx, dy = new[2] - old[2], new[3] - old[3]
    return (old[:2] == new[:2] and
            new[4] - old[4] == dx and new[5] - old[5] == dy and
            (dx == 0) != (dy == 0))


def _anchor_relative_axis(before, after):
    """H2 movement must lie on the unique nearest pre-action anchor axis.

    The anchor is selected from BEFORE descriptors using Manhattan distance
    between doubled bounding-box centers, matching the shadow relative-world
    role convention. Both toward and away motion are allowed. A diagonal
    anchor or an equal-distance tie makes the relation unidentifiable.
    """
    removed = set(map(tuple, before)) - set(map(tuple, after))
    added = set(map(tuple, after)) - set(map(tuple, before))
    if len(removed) != 1 or len(added) != 1:
        return False
    old, new = next(iter(removed)), next(iter(added))
    others = [obj for obj in map(tuple, before) if obj != old]
    if not others:
        return False
    cx, cy = old[2] + old[4], old[3] + old[5]
    distances = [(abs(obj[2] + obj[4] - cx) +
                  abs(obj[3] + obj[5] - cy), obj) for obj in others]
    nearest_distance = min(d for d, _ in distances)
    nearest = [obj for d, obj in distances if d == nearest_distance]
    if len(nearest) != 1:
        return False
    anchor = nearest[0]
    ax, ay = anchor[2] + anchor[4] - cx, anchor[3] + anchor[5] - cy
    dx, dy = new[2] - old[2], new[3] - old[3]
    return ((ax != 0 and ay == 0 and dx != 0 and dy == 0) or
            (ax == 0 and ay != 0 and dx == 0 and dy != 0))


def seal_trial(plan):
    """Validate a BEFORE-action three-world forecast, then seal its bytes.

    No after/outcome keys are allowed. The caller must persist the returned
    commitment in an independent pre-action Git/CI record before any gameplay.
    """
    if not isinstance(plan, dict) or set(plan) != PLAN_KEYS:
        raise ValueError("plan fields must be exactly the preregistered contract")
    if type(plan["turn"]) is not int or plan["turn"] < 0:
        raise ValueError("invalid pre-action turn")
    donor = plan["donor_snapshot_sha256"]
    if not isinstance(donor, str) or not DIGEST.fullmatch(donor):
        raise ValueError("missing immutable donor-snapshot digest")
    treatment = _action(plan["treatment_action"])
    control = _action(plan["control_action"])
    if treatment == control:
        raise ValueError("treatment and control actions must differ")
    before = _scene(plan["before"])
    forecasts = plan["forecasts"]
    if not isinstance(forecasts, dict) or set(forecasts) != set(WORLDS):
        raise ValueError("exactly three named world forecasts required")
    normalized = {h: _scene(forecasts[h]) for h in WORLDS}
    if normalized["H0_static"] != before or len({_canonical(x) for x in normalized.values()}) != 3:
        raise ValueError("counterfactual worlds must disagree with static baseline")
    if not all(_single_cardinal_translation(before, normalized[h])
               for h in WORLDS[1:]):
        raise ValueError("moving-world forecast must be one cardinal rigid translation")
    if not _anchor_relative_axis(before, normalized["H2_anchor_relative"]):
        raise ValueError("H2 requires a unique axis-aligned nearest pre-action anchor")
    # Precommit the counterfactual prediction for BOTH arms. Without the
    # control-arm forecast, choosing an observed control after treatment could
    # be mistaken for discrimination among competing world hypotheses.
    control_forecasts = plan["control_forecasts"]
    if not isinstance(control_forecasts, dict) or set(control_forecasts) != set(WORLDS):
        raise ValueError("exactly three control-action world forecasts required")
    normalized_control = {h: _scene(control_forecasts[h]) for h in WORLDS}
    if normalized_control["H0_static"] != before:
        raise ValueError("control H0 must predict the unchanged scene")
    for h in WORLDS[1:]:
        candidate = normalized_control[h]
        if candidate != before and not _single_cardinal_translation(before, candidate):
            raise ValueError("control moving-world prediction must be static or a cardinal rigid translation")
        if (h == "H2_anchor_relative" and candidate != before and
                not _anchor_relative_axis(before, candidate)):
            raise ValueError("control H2 movement must follow the nearest-anchor axis")
    episode = _text(plan["episode"])
    control_episode = _text(plan["control_episode"])
    if control_episode == episode:
        raise ValueError("control episode must be distinct and precommitted")
    sealed_plan = dict(game=_text(plan["game"]), episode=episode,
                       control_episode=control_episode,
                       turn=plan["turn"], before=before,
                       treatment_action=treatment, control_action=control,
                       donor_snapshot_sha256=donor, forecasts=normalized,
                       control_forecasts=normalized_control)
    return dict(plan=sealed_plan, sha256=_hash(sealed_plan))


def _outcome(row):
    if not isinstance(row, dict) or set(row) != OUTCOME_KEYS:
        raise ValueError("unexpected outcome fields")
    if type(row["turn"]) is not int or row["turn"] < 0:
        raise ValueError("invalid outcome turn")
    return dict(game=_text(row["game"]), episode=_text(row["episode"]),
                turn=row["turn"], before=_scene(row["before"]),
                action=_action(row["action"]), after=_scene(row["after"]))


def evaluate_pair(sealed, treatment, control):
    """Score two already observed episodes against the sealed predictions.

    This is a *visible-scene matched observational pair*. No causal effect
    is inferred without independently verified reset/latent-state equivalence
    and a prospective pre-action timestamp for the sealed commitment.
    """
    if (not isinstance(sealed, dict) or set(sealed) != {"plan", "sha256"} or
            not isinstance(sealed["sha256"], str)):
        raise ValueError("invalid sealed commitment")
    original = seal_trial(sealed["plan"])
    if original["sha256"] != sealed["sha256"]:
        raise ValueError("sealed pre-action plan was modified")
    plan = original["plan"]
    a, b = _outcome(treatment), _outcome(control)
    if (a["game"] != plan["game"] or b["game"] != plan["game"] or
            a["episode"] != plan["episode"] or
            b["episode"] != plan["control_episode"] or
            a["turn"] != plan["turn"] or b["turn"] != plan["turn"] or
            a["before"] != plan["before"] or b["before"] != plan["before"] or
            a["action"] != plan["treatment_action"] or
            b["action"] != plan["control_action"]):
        raise ValueError("treatment/control are not the preregistered matched pair")
    treatment_hits = {h: a["after"] == plan["forecasts"][h] for h in WORLDS}
    control_hits = {h: b["after"] == plan["control_forecasts"][h] for h in WORLDS}
    # Each world earns 0..2 exact hits, one per precommitted arm. A unique
    # complete fit is diagnostic only: it cannot authenticate pre-action timing
    # or equivalence of the two latent game states.
    fit_counts = {h: int(treatment_hits[h]) + int(control_hits[h]) for h in WORLDS}
    complete_fits = [h for h in WORLDS if fit_counts[h] == 2]
    unique_complete_fit = complete_fits[0] if len(complete_fits) == 1 else None
    # A complete two-arm fit need not mean both arms distinguished worlds:
    # identical control forecasts make all discrimination treatment-only.
    # Record the pairwise forecast contrasts, without claiming causality.
    pairwise_arms = {}
    for i, left in enumerate(WORLDS):
        for right in WORLDS[i + 1:]:
            arms = []
            if plan["forecasts"][left] != plan["forecasts"][right]:
                arms.append("treatment")
            if plan["control_forecasts"][left] != plan["control_forecasts"][right]:
                arms.append("control")
            pairwise_arms[f"{left}|{right}"] = arms
    control_discriminating_pairs = sum(
        "control" in arms for arms in pairwise_arms.values())
    # Distinguish a *potential* contrast from its observed result. When two
    # forecasts coincide, neither can win that arm, even if both are correct.
    # When forecasts differ, at most one can match the observed visible scene.
    observed_winners = {}
    for i, left in enumerate(WORLDS):
        for right in WORLDS[i + 1:]:
            key = f"{left}|{right}"
            observed_winners[key] = {}
            for arm, forecasts, actual in (
                    ("treatment", plan["forecasts"], a["after"]),
                    ("control", plan["control_forecasts"], b["after"])):
                if forecasts[left] == forecasts[right]:
                    winner = "NON_DISCRIMINATING"
                elif forecasts[left] == actual:
                    winner = left
                elif forecasts[right] == actual:
                    winner = right
                else:
                    winner = "NEITHER"
                observed_winners[key][arm] = winner
    return dict(protocol=PROTOCOL, sha256=original["sha256"],
                world_exact_hits=treatment_hits,
                control_world_exact_hits=control_hits,
                paired_world_exact_hits={h: treatment_hits[h] and control_hits[h]
                                         for h in WORLDS},
                paired_world_fit_counts=fit_counts,
                unique_paired_world_fit=unique_complete_fit,
                pairwise_discriminating_arms=pairwise_arms,
                pairwise_observed_winner_by_arm=observed_winners,
                control_discriminating_pairs=control_discriminating_pairs,
                control_static=b["after"] == plan["before"],
                interpretation="OBSERVATIONAL_MATCHED_PAIR_ONLY",
                causal_effect_proven=False, effect_on_agent="NONE_SHADOW_ONLY")
