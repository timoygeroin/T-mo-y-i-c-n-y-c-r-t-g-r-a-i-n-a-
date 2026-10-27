"""Outcome-blind leave-one-public-game-out causal-transfer contracts.

Research only: held-out game's outcomes must never train its donor rules.
"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from cross_game_transfer_audit import evaluate_cross_game, PROTOCOL


def scene(x, color=2):
    return [[color, 1, x, 2, x, 2], [5, 1, 30, 30, 30, 30]]


def row(game, turn, before, after, action="ACTION1", lb=0, la=None):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=turn, action_key=action,
                legal_actions=["ACTION1", "ACTION6"],
                level_before=lb, level_after=lb if la is None else la,
                before_scene=before, after_scene=after)


def fixture(donors=2, donor_action="ACTION1", target_action="ACTION1",
            donor_noop=False, target_after=13, target_before=None):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < donors:
            after = scene(3) if donor_noop and i == 1 else scene(4)
            rows.append(row(game, 0, scene(3), after, action=donor_action))
        elif i == 2:
            rows.append(row(game, 0, scene(12) if target_before is None else target_before,
                            scene(target_after), action=target_action))
        else:
            # Other games use a different shape signature: no false donor vote.
            rows.append(row(game, 0, scene(3, color=7), scene(3, color=7)))
    return rows


class CrossGameTransferTests(unittest.TestCase):
    def test_protocol_is_shadow_only_and_no_automatic_promotion(self):
        result = evaluate_cross_game(fixture())
        self.assertEqual(result["protocol"], PROTOCOL)
        self.assertEqual(result["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(result["acceptance"]["result"], "REJECT_POLICY_INTEGRATION")

    def test_two_independent_donors_predict_held_out_new_position(self):
        result = evaluate_cross_game(fixture())
        target = result["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["baseline_correct"], 0)
        self.assertEqual(target["strict_correct"], 1)
        self.assertEqual(target["strict_donor_forecasts"], 1)
        self.assertEqual(target["strict_donor_correct"], 1)
        self.assertEqual(target["strict_delta"], 1)

    def test_one_donor_is_exploratory_only_not_strict_evidence(self):
        result = evaluate_cross_game(fixture(donors=1))
        target = result["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_donor_forecasts"], 0)
        self.assertEqual(target["permissive_donor_forecasts"], 1)

    def test_static_counterevidence_vetoes_transfer(self):
        result = evaluate_cross_game(fixture(donor_noop=True))
        target = result["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(target["strict_donor_forecasts"], 0)
        self.assertEqual(target["permissive_donor_forecasts"], 0)

    def test_target_outcome_never_enters_donor_training(self):
        positive = evaluate_cross_game(fixture(target_after=13))
        negative = evaluate_cross_game(fixture(target_after=12))
        a = positive["per_game"][FROZEN_GAMES[2]]
        b = negative["per_game"][FROZEN_GAMES[2]]
        self.assertEqual(a["strict_donor_forecasts"], b["strict_donor_forecasts"])
        self.assertEqual(a["strict_donor_forecasts"], 1)
        self.assertEqual(a["strict_donor_correct"], 1)
        self.assertEqual(b["strict_donor_correct"], 0)
        self.assertEqual(b["strict_delta"], -1)

    def test_exact_click_coordinates_are_not_pooled(self):
        result = evaluate_cross_game(fixture(donor_action="ACTION6@1,2",
                                             target_action="ACTION6@7,8"))
        self.assertEqual(result["per_game"][FROZEN_GAMES[2]]["strict_donor_forecasts"], 0)

    def test_ambiguous_target_object_signature_abstains(self):
        duplicate = [[2, 1, 12, 2, 12, 2], [2, 1, 20, 2, 20, 2],
                     [5, 1, 30, 30, 30, 30]]
        result = evaluate_cross_game(fixture(target_before=duplicate))
        self.assertEqual(result["per_game"][FROZEN_GAMES[2]]["strict_donor_forecasts"], 0)

    def test_local_replay_priority_over_cross_game_donor(self):
        rows = fixture()
        target = FROZEN_GAMES[2]
        idx = next(i for i, r in enumerate(rows) if r["game_id"] == target)
        rows[idx:idx+1] = [row(target, 0, scene(12), scene(12)),
                           row(target, 1, scene(12), scene(12))]
        result = evaluate_cross_game(rows)
        self.assertEqual(result["per_game"][target]["strict_donor_forecasts"], 0)
        self.assertEqual(result["per_game"][target]["strict_correct"], 2)

    def test_level_boundaries_do_not_reuse_donor_level_zero(self):
        rows = fixture()
        target = FROZEN_GAMES[2]
        idx = next(i for i, r in enumerate(rows) if r["game_id"] == target)
        rows[idx] = row(target, 0, scene(12), scene(13), lb=1)
        result = evaluate_cross_game(rows)
        self.assertEqual(result["per_game"][target]["strict_donor_forecasts"], 0)

    def test_bad_roster_and_turn_sequence_fail_closed(self):
        rows = fixture()
        for bad in (rows[:-1], [dict(rows[0], turn=1)] + rows[1:],
                    [dict(rows[0], game_id="unknown")] + rows[1:]):
            with self.assertRaises(ValueError):
                evaluate_cross_game(bad)


if __name__ == "__main__":
    unittest.main()
