"""Frozen PUBLIC counterfactual action/role projection contracts; no agent imports."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from action_role_counterfactual_audit import evaluate_action_role_counterfactual


def scene(x, color=2):
    return [[color, 1, x, 2, x, 2], [9, 1, 30, 30, 30, 30]]


def row(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game, turn=0,
                action_key=action, legal_actions=["ACTION1", "ACTION2", "ACTION6"],
                level_before=0, level_after=0, before_scene=before, after_scene=after)


def fixture(donor_actions=("ACTION1", "ACTION1"), target_action="ACTION1",
            donor_deltas=(2, 2), target_delta=2, target_x=12):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < 2:
            x, color, delta = 3, i + 2, donor_deltas[i]
            rows.append(row(game, scene(x, color), scene(x+delta, color),
                            donor_actions[i]))
        elif i == 2:
            rows.append(row(game, scene(target_x, 7),
                            scene(target_x+target_delta, 7), target_action))
        else:
            static = [[8, 4, 2, 2, 3, 3]]
            rows.append(row(game, static, static))
    return rows


class ActionRoleCounterfactualTests(unittest.TestCase):
    def target(self, **kw):
        return evaluate_action_role_counterfactual(fixture(**kw))["per_game"][FROZEN_GAMES[2]]

    def test_exact_two_donor_transfer_is_preserved(self):
        t = self.target()
        self.assertEqual(t["exact_forecasts"], 1)
        self.assertEqual(t["exact_forecasts_correct"], 1)
        self.assertEqual(t["exact_correct"], t["baseline_correct"] + 1)

    def test_action_only_ablation_rescues_mismatched_action(self):
        t = self.target(target_action="ACTION2")
        self.assertEqual(t["exact_forecasts"], 0)
        self.assertEqual(t["action_forecasts"], 1)
        self.assertEqual(t["action_forecasts_correct"], 1)
        self.assertEqual(t["role_forecasts"], 0)

    def test_role_ablation_abstains_when_multiple_objects_could_move(self):
        t = self.target(target_x=40, target_delta=0)
        self.assertEqual(t["exact_forecasts"], 0)
        self.assertEqual(t["role_forecasts"], 0)

    def test_conflicting_donors_veto_all_projections(self):
        t = self.target(donor_deltas=(2, 3))
        for h in ("exact", "action", "role", "both"):
            self.assertEqual(t[h+"_forecasts"], 0)

    def test_static_donor_vetoes_all_projections(self):
        t = self.target(donor_deltas=(2, 0))
        for h in ("exact", "action", "role", "both"):
            self.assertEqual(t[h+"_forecasts"], 0)

    def test_action6_coordinates_never_pooled_by_action_ablation(self):
        t = self.target(donor_actions=("ACTION6@1,2", "ACTION6@1,2"),
                        target_action="ACTION6@7,8")
        self.assertEqual(t["action_forecasts"], 0)
        self.assertEqual(t["both_forecasts"], 0)

    def test_target_outcome_not_used_for_forecast_eligibility(self):
        a = self.target(target_action="ACTION2", target_delta=2)
        b = self.target(target_action="ACTION2", target_delta=0)
        for h in ("exact", "action", "role", "both"):
            self.assertEqual(a[h+"_forecasts"], b[h+"_forecasts"])

    def test_frozen_roster_fail_closed(self):
        with self.assertRaises(ValueError):
            evaluate_action_role_counterfactual(fixture()[:-1])

    def test_shadow_only_and_matched_controls(self):
        r = evaluate_action_role_counterfactual(fixture())
        self.assertEqual(r["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(r["hypotheses"],
                         ["static", "within_game_replay_effect_static",
                          "exact_action_exact_role", "action_ablated_role_exact",
                          "action_exact_role_ablated", "action_and_role_ablated"])
        self.assertEqual(r["total"]["same_level"], 9)


if __name__ == "__main__":
    unittest.main()
