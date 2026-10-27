"""Test-first contracts for unranked donor veto attribution; shadow-only."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from remaining_public_sample import FROZEN_GAMES
from unranked_donor_veto_diagnostic import diagnose_unranked_veto


def scene(x, color=2):
    return [[color, 1, x, 2, x, 2], [9, 1, 30, 30, 30, 30]]


def record(game, before, after, action="ACTION1"):
    return dict(schema="arc-agi3.shadow-transition.v1", game_id=game,
                turn=0, action_key=action, legal_actions=["ACTION1", "ACTION6"],
                level_before=0, level_after=0,
                before_scene=before, after_scene=after)


def fixture(deltas=((2, 0), (2, 0)), donor_actions=("ACTION1", "ACTION1"),
            target_action="ACTION1", target_x=12, target_delta=2):
    rows = []
    for i, game in enumerate(FROZEN_GAMES):
        if i < 2:
            x, color = 3, 2 + i
            dx, dy = deltas[i]
            before = scene(x, color)
            after = [[color, 1, x+dx, 2+dy, x+dx, 2+dy], before[1]]
            rows.append(record(game, before, after, donor_actions[i]))
        elif i == 2:
            before = scene(target_x, 7)
            after = scene(target_x + target_delta, 7)
            rows.append(record(game, before, after, target_action))
        else:
            s = [[8, 4, 2, 2, 3, 3]]
            rows.append(record(game, s, s))
    return rows


class UnrankedDonorVetoTests(unittest.TestCase):
    def target(self, **kwargs):
        return diagnose_unranked_veto(fixture(**kwargs))["per_game"][FROZEN_GAMES[2]]

    def test_matching_two_donors_reach_candidate_gate(self):
        result = self.target()
        self.assertEqual(result["nonzero_donor_keys"], 1)
        self.assertEqual(result["target_exact_key_overlap"], 1)
        self.assertEqual(result["candidate_key_veto"]["eligible_two_donor_key"], 1)
        self.assertEqual(result["accepted_two_donor_target_keys"], 1)

    def test_exact_action_veto_including_action6_coordinates(self):
        result = self.target(donor_actions=("ACTION6@1,2", "ACTION6@1,2"),
                             target_action="ACTION6@7,8")
        self.assertEqual(result["candidate_key_veto"]["action_level_mismatch"], 1)
        self.assertEqual(result["accepted_two_donor_target_keys"], 0)

    def test_relative_role_mismatch(self):
        result = self.target(target_x=40, target_delta=0)
        self.assertEqual(result["candidate_key_veto"]["relative_role_mismatch"], 1)

    def test_one_independent_donor_insufficient(self):
        result = self.target(donor_actions=("ACTION1", "ACTION2"))
        self.assertEqual(result["candidate_key_veto"]["insufficient_donor_games"], 1)

    def test_static_donor_vetoes_motion(self):
        result = self.target(deltas=((2, 0), (0, 0)))
        self.assertEqual(result["candidate_key_veto"]["static_or_conflicting_effect"], 1)
        self.assertEqual(result["accepted_two_donor_target_keys"], 0)

    def test_contradictory_donor_vetoes_motion(self):
        result = self.target(deltas=((2, 0), (3, 0)))
        self.assertEqual(result["candidate_key_veto"]["static_or_conflicting_effect"], 1)

    def test_target_outcome_not_used_in_donor_attribution(self):
        a = self.target(target_delta=2)
        b = self.target(target_delta=0)
        for key in ("nonzero_donor_keys", "target_exact_key_overlap",
                    "candidate_key_veto", "accepted_two_donor_target_keys"):
            self.assertEqual(a[key], b[key])

    def test_frozen_roster_fail_closed(self):
        with self.assertRaises(ValueError):
            diagnose_unranked_veto(fixture()[:-1])

    def test_no_policy_integration(self):
        result = diagnose_unranked_veto(fixture())
        self.assertEqual(result["effect_on_agent"], "NONE_SHADOW_ONLY")
        self.assertEqual(result["hypotheses"], [
            "H0_no_cross_game_support",
            "H1_action_level_mismatch",
            "H2_relative_role_mismatch",
            "H3_insufficient_independent_donors",
            "H4_static_or_conflicting_effect",
            "H5_eligible_two_donor_key",
        ])


if __name__ == "__main__":
    unittest.main()
