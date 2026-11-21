"""Test-first contracts for a single area-rank ablation (shadow only)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from relative_geometry_transfer_audit import _roles
from relative_nonunit_transfer_audit import evaluate_nonunit_relative_transfer
from relative_area_rank_transfer_audit import _roles_unranked, evaluate_area_rank_ablation


def scene(x, color=2, y=2, anchor_x=30):
    # Equal-area mover and anchor: strict rank has no eligible mover.
    return [[color, 1, x, y, x, y], [9, 1, anchor_x, 30, anchor_x, 30]]


def row(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=0, action_key=action, legal_actions=["ACTION1", "ACTION6"],
                level_before=0, level_after=0,
                before_scene=before, after_scene=after)


def fixture(deltas=((2, 0), (2, 0)), target_delta=(2, 0),
            donor_action="ACTION1", target_action="ACTION1",
            target_x=12, donor_count=2):
    records = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < donor_count:
            x, y, color = 3, 2, 2+i
            dx, dy = deltas[i]
            records.append(row(game, scene(x, color, y),
                               scene(x+dx, color, y+dy), donor_action))
        elif i == 2:
            dx, dy = target_delta
            records.append(row(game, scene(target_x, 7),
                               scene(target_x+dx, 7, 2+dy), target_action))
        else:
            s = [[8, 4, 2, 2, 3, 3]]
            records.append(row(game, s, s))
    return records


class AreaRankAblationTests(unittest.TestCase):
    def target(self, **kwargs):
        return evaluate_area_rank_ablation(fixture(**kwargs))["per_game"][FROZEN_GAMES[2]]

    def test_tied_area_rescued_without_changing_nearest_anchor(self):
        s = tuple(tuple(x) for x in scene(3))
        self.assertIsNone(_roles(s)[0])
        self.assertIsNotNone(_roles_unranked(s)[0])

    def test_two_independent_donors_predict_tied_area(self):
        report = evaluate_area_rank_ablation(fixture())
        t = report["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(t["strict_nonunit_forecasts"], 0)
        self.assertEqual(t["area_unranked_forecasts"], 1)
        self.assertEqual(t["area_unranked_correct"], 1)
        self.assertEqual(t["area_unranked_delta"], 1)
        self.assertEqual(report["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(report["acceptance"]["result"], "REJECT_POLICY_INTEGRATION")

    def test_one_donor_cannot_pass_two_donor_gate(self):
        self.assertEqual(self.target(donor_count=1)["area_unranked_forecasts"], 0)

    def test_static_witness_veto(self):
        self.assertEqual(self.target(deltas=((2, 0), (0, 0)))["area_unranked_forecasts"], 0)

    def test_conflicting_effect_veto(self):
        self.assertEqual(self.target(deltas=((2, 0), (3, 0)))["area_unranked_forecasts"], 0)

    def test_diagonal_effect_veto(self):
        self.assertEqual(self.target(deltas=((2, 0), (2, 1)))["area_unranked_forecasts"], 0)

    def test_action6_exact_coordinates(self):
        self.assertEqual(self.target(donor_action="ACTION6@1,2",
                                     target_action="ACTION6@7,8")["area_unranked_forecasts"], 0)

    def test_target_outcome_is_not_training_data(self):
        correct = self.target(target_delta=(2, 0))
        wrong = self.target(target_delta=(0, 0))
        self.assertEqual(correct["area_unranked_forecasts"], wrong["area_unranked_forecasts"])
        self.assertEqual(correct["area_unranked_correct"], 1)
        self.assertEqual(wrong["area_unranked_correct"], 0)
        self.assertEqual(wrong["area_unranked_delta"], -1)

    def test_bounds_fail_closed(self):
        self.assertEqual(self.target(target_x=63, target_delta=(0, 0))["area_unranked_forecasts"], 0)

    def test_duplicate_roles_abstain(self):
        s = tuple(tuple(x) for x in [
            [2, 1, 2, 2, 2, 2], [3, 1, 3, 2, 3, 2],
            [4, 1, 4, 2, 4, 2], [9, 1, 30, 30, 30, 30]])
        roles = _roles_unranked(s)
        self.assertEqual(len(roles), 4)
        self.assertTrue(any(role is None for role in roles))

    def test_unchanged_baseline_controls(self):
        records = fixture()
        old = evaluate_nonunit_relative_transfer(records)
        new = evaluate_area_rank_ablation(records)
        for key in ("same_level", "level_advances", "static_correct",
                    "baseline_correct", "strict_nonunit_correct",
                    "strict_nonunit_forecasts"):
            self.assertEqual(new["total"][key], old["total"][key])

    def test_frozen_roster_required(self):
        with self.assertRaises(ValueError):
            evaluate_area_rank_ablation(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
