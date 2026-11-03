"""Relative-geometry leave-one-public-game-out shadow contracts."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from relative_geometry_transfer_audit import evaluate_relative_transfer, PROTOCOL


def scene(x, color=2, anchor_x=30, duplicate=False):
    objects = [[color, 1, x, 2, x, 2], [5, 4, anchor_x, 30, anchor_x+1, 31]]
    if duplicate:
        objects.append([color+1, 1, x+2, 2, x+2, 2])
    return objects


def row(game, turn, before, after, action="ACTION1", lb=0, la=None):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=turn, action_key=action,
                legal_actions=["ACTION1", "ACTION6"],
                level_before=lb, level_after=lb if la is None else la,
                before_scene=before, after_scene=after)


def fixture(donors=2, donor_noop=False, target_action="ACTION1",
            donor_action="ACTION1", target_after=13, anchor_x=30,
            duplicate=False, target_level=0):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < donors:
            color = 2+i
            before = scene(3, color)
            after = before if donor_noop and i == 1 else scene(4, color)
            rows.append(row(game, 0, before, after, action=donor_action))
        elif i == 2:
            rows.append(row(game, 0, scene(12, 7, anchor_x, duplicate),
                            scene(target_after, 7, anchor_x, duplicate),
                            action=target_action, lb=target_level))
        else:
            # Isolated static donors with a different geometry role.
            before = [[8, 4, 2, 2, 3, 3]]
            rows.append(row(game, 0, before, before))
    return rows


class RelativeGeometryTransferTests(unittest.TestCase):
    def test_protocol_and_no_policy_promotion(self):
        result = evaluate_relative_transfer(fixture())
        self.assertEqual(result["protocol"], PROTOCOL)
        self.assertEqual(result["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(result["acceptance"]["result"], "REJECT_POLICY_INTEGRATION")

    def test_two_independent_color_invariant_donors_forecast(self):
        result = evaluate_relative_transfer(fixture())
        target = result["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["baseline_correct"], 0)
        self.assertEqual(target["strict_relative_forecasts"], 1)
        self.assertEqual(target["strict_relative_correct"], 1)
        self.assertEqual(target["strict_correct"], 1)

    def test_one_donor_does_not_count_as_strict(self):
        target = evaluate_relative_transfer(fixture(donors=1))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)
        self.assertEqual(target["permissive_relative_forecasts"], 1)

    def test_static_donor_vetoes_shared_effect(self):
        target = evaluate_relative_transfer(fixture(donor_noop=True))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)
        self.assertEqual(target["permissive_relative_forecasts"], 0)

    def test_target_outcome_never_trains_donors(self):
        a = evaluate_relative_transfer(fixture(target_after=13))["per_game"][FROZEN_GAMES[2]]
        b = evaluate_relative_transfer(fixture(target_after=12))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(a["strict_relative_forecasts"], b["strict_relative_forecasts"])
        self.assertEqual(a["strict_relative_correct"], 1)
        self.assertEqual(b["strict_relative_correct"], 0)
        self.assertEqual(b["strict_delta"], -1)

    def test_action6_coordinates_not_pooled(self):
        target = evaluate_relative_transfer(fixture(donor_action="ACTION6@1,2",
                                                   target_action="ACTION6@7,8"))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)

    def test_relative_direction_mismatch_abstains(self):
        target = evaluate_relative_transfer(fixture(anchor_x=0))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)

    def test_duplicate_role_abstains(self):
        target = evaluate_relative_transfer(fixture(duplicate=True))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)

    def test_level_scope_prevents_cross_level_transfer(self):
        target = evaluate_relative_transfer(fixture(target_level=1))["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_relative_forecasts"], 0)

    def test_bad_frozen_roster_fails_closed(self):
        with self.assertRaises(ValueError):
            evaluate_relative_transfer(fixture()[:-1])


if __name__ == "__main__":
    unittest.main()
