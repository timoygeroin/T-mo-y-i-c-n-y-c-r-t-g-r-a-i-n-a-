"""MondayID v0 candidate: falsify proof methods before trusting their conclusions.

This is a small deterministic *calibration harness*, not an epistemic oracle.
All observation/independence flags must be supplied from external evidence;
they are not authenticated merely because Python received True.
"""
from dataclasses import dataclass
from typing import Optional, Literal

Kind = Literal['artifact', 'functional', 'transfer', 'external']

@dataclass(frozen=True)
class Evidence:
    claim: str
    kind: Kind
    expected_effect: str
    receipt_exists: bool
    effect_observed: Optional[bool]  # None means no effect-level observation
    same_target: bool
    independent_observation: bool
    negative_control_passed: Optional[bool] = None
    test_exposed_to_candidate: bool = False
    goal_changed_after_result: bool = False
    explicit_owner_rejection: bool = False


def assess(e: Evidence) -> str:
    """Reject proxy substitution and metric gaming. Never infer evidence from a receipt."""
    if e.explicit_owner_rejection or e.effect_observed is False:
        return 'FALSIFIED_EFFECT'
    if e.goal_changed_after_result or e.negative_control_passed is True:
        return 'INVALID_VERIFIER'
    if not e.same_target:
        return 'WRONG_OBJECT'
    if e.effect_observed is None:
        return 'UNOBSERVED_EFFECT'
    if not e.independent_observation:
        return 'NONINDEPENDENT_EVIDENCE'
    if e.kind == 'transfer' and e.test_exposed_to_candidate:
        return 'EXPOSED_TRANSFER_TEST'
    return 'SCOPED_EFFECT_OBSERVED'


def calibrate(verifier, cases):
    """Inspect a verifier against predefined independent effect labels.

    The quality of the ground-truth labels remains a separate, open question.
    Returned flags are about this fixture suite only, not global correctness.
    """
    report = []
    for label, evidence, effect_ground_truth in cases:
        output = verifier(evidence)
        accepted = output == 'SCOPED_EFFECT_OBSERVED'
        report.append({'case':label, 'verdict':output, 'truth':effect_ground_truth,
                       'false_accept':accepted and not effect_ground_truth,
                       'false_reject':(not accepted) and effect_ground_truth})
    return report


def naive_receipt(e: Evidence) -> str:
    """Known bad legacy proxy model, included strictly as an adversarial control."""
    return 'SCOPED_EFFECT_OBSERVED' if e.receipt_exists else 'UNOBSERVED_EFFECT'
