"""Test-first contracts for cardinal nonunit relative transfer, SHADOW ONLY."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from relative_geometry_transfer_audit import evaluate_relative_transfer
from relative_nonunit_transfer_audit import evaluate_nonunit_relative_transfer, PROTOCOL


def scene(x, color=2, y=2, anchor_x=30):
    return [[color, 1, x, y, x, y], [5, 4, anchor_x, 30, anchor_x+1, 31]]


def row(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=0, action_key=action, legal_actions=["ACTION1", "ACTION6"],
                level_before=0, level_after=0, before_scene=before, after_scene=after)


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


class NonunitRelativeTests(unittest.TestCase):
    def target(self, **kwargs):
        return evaluate_nonunit_relative_transfer(fixture(**kwargs))["per_game"][FROZEN_GAMES[2]]

    def test_two_nonunit_donors_predict_where_strict_unit_abstains(self):
        report = evaluate_nonunit_relative_transfer(fixture())
        target = report["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(report["protocol"], PROTOCOL)
        self.assertEqual(report["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(target["strict_unit_forecasts"], 0)
        self.assertEqual(target["strict_nonunit_forecasts"], 1)
        self.assertEqual(target["strict_nonunit_correct"], 1)
        self.assertEqual(target["strict_nonunit_delta"], 1)
        self.assertEqual(report["acceptance"]["result"], "REJECT_POLICY_INTEGRATION")

    def test_original_strict_baseline_unchanged(self):
        records = fixture()
        original = evaluate_relative_transfer(records)
        relaxed = evaluate_nonunit_relative_transfer(records)
        self.assertEqual(relaxed["total"]["baseline_correct"], original["total"]["baseline_correct"])
        self.assertEqual(relaxed["total"]["strict_unit_correct"], original["total"]["strict_correct"])
        self.assertEqual(relaxed["total"]["strict_unit_forecasts"], original["total"]["strict_relative_forecasts"])

    def test_one_donor_never_counts_as_two(self):
        self.assertEqual(self.target(donor_count=1)["strict_nonunit_forecasts"], 0)

    def test_static_witness_vetoes_nonunit(self):
        self.assertEqual(self.target(deltas=((2, 0), (0, 0)))["strict_nonunit_forecasts"], 0)

    def test_conflicting_magnitude_vetoes(self):
        self.assertEqual(self.target(deltas=((2, 0), (3, 0)))["strict_nonunit_forecasts"], 0)

    def test_diagonal_witness_not_cardinal(self):
        self.assertEqual(self.target(deltas=((2, 0), (2, 1)))["strict_nonunit_forecasts"], 0)

    def test_exact_action6_coordinates_not_pooled(self):
        self.assertEqual(self.target(donor_action="ACTION6@1,2",
                                     target_action="ACTION6@7,8")["strict_nonunit_forecasts"], 0)

    def test_target_outcome_is_not_donor_evidence(self):
        good = self.target(target_delta=(2, 0))
        bad = self.target(target_delta=(0, 0))
        self.assertEqual(good["strict_nonunit_forecasts"], bad["strict_nonunit_forecasts"])
        self.assertEqual(good["strict_nonunit_correct"], 1)
        self.assertEqual(bad["strict_nonunit_correct"], 0)
        self.assertEqual(bad["strict_nonunit_delta"], -1)

    def test_bounds_fail_closed(self):
        self.assertEqual(self.target(target_x=63, target_delta=(0, 0))["strict_nonunit_forecasts"], 0)

    def test_frozen_roster_must_be_complete(self):
        with self.assertRaises(ValueError):
            evaluate_nonunit_relative_transfer(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
