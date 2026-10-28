"""Test-first contract for a sealed, matched-control, three-world PUBLIC trial."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from prospective_counterfactual_ledger import seal_trial, evaluate_pair


def scene(x):
    return [[1, 1, x, 10, x, 10], [2, 2, 20, 10, 21, 10]]


def plan():
    return dict(
        game="public-game", episode="treatment-episode", turn=7,
        before=scene(10), treatment_action="ACTION3",
        control_action="ACTION4", donor_snapshot_sha256="a" * 64,
        forecasts=dict(H0_static=scene(10), H1_absolute=scene(11),
                       H2_anchor_relative=scene(9)))


def outcome(action, episode, after):
    return dict(game="public-game", episode=episode, turn=7,
                before=scene(10), action=action, after=after)


class ProspectiveLedgerTests(unittest.TestCase):
    def test_seal_is_deterministic_and_outcome_blind(self):
        a = seal_trial(plan())
        b = seal_trial(copy.deepcopy(plan()))
        self.assertEqual(a, b)
        self.assertEqual(len(a["sha256"]), 64)
        self.assertEqual(set(a["plan"]), set(plan()))
        self.assertNotIn("after", a["plan"])

    def test_three_distinct_worlds_are_required(self):
        for field in ("H1_absolute", "H2_anchor_relative"):
            p = plan()
            p["forecasts"][field] = scene(10)
            with self.subTest(field=field), self.assertRaises(ValueError):
                seal_trial(p)
        p = plan()
        p["forecasts"]["H2_anchor_relative"] = scene(11)
        with self.assertRaises(ValueError):
            seal_trial(p)

    def test_seal_rejects_missing_or_post_outcome_fields(self):
        for change in ({"after": scene(11)}, {"outcome": "win"},
                       {"donor_snapshot_sha256": "not-a-digest"},
                       {"turn": True}, {"treatment_action": "RESET"},
                       {"control_action": "ACTION3"}):
            p = plan()
            p.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                seal_trial(p)

    def test_scoring_is_separate_from_pre_action_seal(self):
        sealed = seal_trial(plan())
        result = evaluate_pair(
            sealed, outcome("ACTION3", "treatment-episode", scene(11)),
            outcome("ACTION4", "control-episode", scene(10)))
        self.assertEqual(result["world_exact_hits"],
                         {"H0_static": False, "H1_absolute": True,
                          "H2_anchor_relative": False})
        self.assertTrue(result["control_static"])
        self.assertEqual(result["interpretation"], "OBSERVATIONAL_MATCHED_PAIR_ONLY")
        self.assertFalse(result["causal_effect_proven"])

    def test_mutating_sealed_plan_invalidates_commitment(self):
        sealed = seal_trial(plan())
        sealed["plan"]["forecasts"]["H1_absolute"] = scene(12)
        with self.assertRaises(ValueError):
            evaluate_pair(sealed, outcome("ACTION3", "treatment-episode", scene(11)),
                          outcome("ACTION4", "control-episode", scene(10)))

    def test_pair_rejects_wrong_action_context_or_same_episode(self):
        sealed = seal_trial(plan())
        treatment = outcome("ACTION3", "treatment-episode", scene(11))
        control = outcome("ACTION4", "control-episode", scene(10))
        bads = [
            (dict(treatment, action="ACTION4"), control),
            (dict(treatment, turn=8), control),
            (dict(treatment, before=scene(9)), control),
            (treatment, dict(control, episode="treatment-episode")),
            (treatment, dict(control, action="ACTION3")),
            (treatment, dict(control, game="different")),
            (treatment, dict(control, before=scene(9))),
        ]
        for a, b in bads:
            with self.subTest(a=a, b=b), self.assertRaises(ValueError):
                evaluate_pair(sealed, a, b)

    def test_outcomes_must_not_be_present_at_sealing_time(self):
        p = plan()
        p["forecasts"]["observed_after"] = scene(11)
        with self.assertRaises(ValueError):
            seal_trial(p)


if __name__ == "__main__":
    unittest.main()
