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
        game="public-game", episode="treatment-episode", control_episode="control-episode", turn=7,
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

    def test_control_episode_is_committed_before_observing_outcomes(self):
        # Post-hoc selection of a favorable control episode must be impossible.
        sealed = seal_trial(plan())
        treatment = outcome("ACTION3", "treatment-episode", scene(11))
        control = outcome("ACTION4", "control-episode", scene(10))
        self.assertEqual(sealed["plan"]["control_episode"], "control-episode")
        self.assertTrue(evaluate_pair(sealed, treatment, control)["control_static"])
        with self.assertRaises(ValueError):
            evaluate_pair(sealed, treatment,
                          outcome("ACTION4", "posthoc-picked-control", scene(10)))
        p = plan()
        p.pop("control_episode")
        with self.assertRaises(ValueError):
            seal_trial(p)
        p = plan()
        p["control_episode"] = p["episode"]
        with self.assertRaises(ValueError):
            seal_trial(p)

    def test_world_forecasts_reject_non_translation_effects(self):
        # H1/H2 are displacement hypotheses, not arbitrary scene mutations.
        bads = []
        recolor = scene(11)
        recolor[0][0] = 3
        bads.append(("recolor", "H1_absolute", recolor))
        resize = scene(11)
        resize[0][1] = 2
        bads.append(("area-change", "H1_absolute", resize))
        diagonal = scene(11)
        diagonal[0][3] = diagonal[0][5] = 11
        bads.append(("diagonal", "H1_absolute", diagonal))
        both_moved = scene(9)
        both_moved[1][2] += 1
        both_moved[1][4] += 1
        bads.append(("two-movers", "H2_anchor_relative", both_moved))
        bads.append(("creation", "H2_anchor_relative",
                     scene(9) + [[3, 1, 30, 30, 30, 30]]))
        bads.append(("deletion", "H2_anchor_relative", scene(9)[:1]))
        for label, hypothesis, forecast in bads:
            p = plan()
            p["forecasts"][hypothesis] = forecast
            with self.subTest(label=label), self.assertRaises(ValueError):
                seal_trial(p)

    def test_forecast_descriptor_area_cannot_exceed_bounding_box(self):
        p = plan()
        p["forecasts"]["H1_absolute"][0][1] = 3
        with self.assertRaises(ValueError):
            seal_trial(p)

    def test_competing_worlds_may_move_different_single_objects(self):
        # Different causal hypotheses can select different movers; each
        # must still forecast a single cardinal rigid translation.
        p = plan()
        p["forecasts"]["H2_anchor_relative"] = scene(10)
        p["forecasts"]["H2_anchor_relative"][1][2] += 1
        p["forecasts"]["H2_anchor_relative"][1][4] += 1
        self.assertEqual(set(seal_trial(p)["plan"]["forecasts"]),
                         {"H0_static", "H1_absolute", "H2_anchor_relative"})


    def test_h2_rejects_motion_orthogonal_to_unique_nearest_anchor(self):
        # The sole nearest anchor is to the right of object 1.
        p = plan()
        p["forecasts"]["H2_anchor_relative"] = scene(10)
        p["forecasts"]["H2_anchor_relative"][0][3] += 1
        p["forecasts"]["H2_anchor_relative"][0][5] += 1
        with self.assertRaises(ValueError):
            seal_trial(p)

    def test_h2_rejects_diagonal_nearest_anchor_even_for_cardinal_motion(self):
        p = plan()
        p["before"] = [[1, 1, 10, 10, 10, 10],
                       [2, 1, 20, 20, 20, 20]]
        p["forecasts"] = dict(
            H0_static=copy.deepcopy(p["before"]),
            H1_absolute=[[1, 1, 11, 10, 11, 10], [2, 1, 20, 20, 20, 20]],
            H2_anchor_relative=[[1, 1, 9, 10, 9, 10], [2, 1, 20, 20, 20, 20]])
        with self.assertRaises(ValueError):
            seal_trial(p)

    def test_h2_rejects_equally_near_anchors(self):
        p = plan()
        p["before"] = [[1, 1, 10, 10, 10, 10],
                       [2, 1, 5, 10, 5, 10],
                       [3, 1, 15, 10, 15, 10]]
        p["forecasts"] = dict(
            H0_static=copy.deepcopy(p["before"]),
            H1_absolute=[[1, 1, 11, 10, 11, 10],
                         [2, 1, 5, 10, 5, 10], [3, 1, 15, 10, 15, 10]],
            H2_anchor_relative=[[1, 1, 9, 10, 9, 10],
                                [2, 1, 5, 10, 5, 10], [3, 1, 15, 10, 15, 10]])
        with self.assertRaises(ValueError):
            seal_trial(p)


if __name__ == "__main__":
    unittest.main()
