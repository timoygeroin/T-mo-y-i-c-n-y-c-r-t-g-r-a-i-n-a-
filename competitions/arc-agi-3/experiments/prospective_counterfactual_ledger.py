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

PROTOCOL = "arc-agi3.prospective-three-world-matched-pair-v1"
WORLDS = ("H0_static", "H1_absolute", "H2_anchor_relative")
PLAN_KEYS = frozenset(("game", "episode", "turn", "before",
                       "treatment_action", "control_action",
                       "donor_snapshot_sha256", "forecasts"))
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
                not (0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64)):
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
    sealed_plan = dict(game=_text(plan["game"]), episode=_text(plan["episode"]),
                       turn=plan["turn"], before=before,
                       treatment_action=treatment, control_action=control,
                       donor_snapshot_sha256=donor, forecasts=normalized)
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
            a["episode"] != plan["episode"] or b["episode"] == a["episode"] or
            a["turn"] != plan["turn"] or b["turn"] != plan["turn"] or
            a["before"] != plan["before"] or b["before"] != plan["before"] or
            a["action"] != plan["treatment_action"] or
            b["action"] != plan["control_action"]):
        raise ValueError("treatment/control are not the preregistered matched pair")
    return dict(protocol=PROTOCOL, sha256=original["sha256"],
                world_exact_hits={h: a["after"] == plan["forecasts"][h]
                                  for h in WORLDS},
                control_static=b["after"] == plan["before"],
                interpretation="OBSERVATIONAL_MATCHED_PAIR_ONLY",
                causal_effect_proven=False, effect_on_agent="NONE_SHADOW_ONLY")
