"""Test-first: pre-action, independently supported world-disagreement probe gate."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))

from counterfactual_probe_readiness import propose_probe, audit_frozen_public


def witness(game, direction=(1, 0), effect=(1, 0), action="ACTION3"):
    obj = (1, 1, 10, 10, 10, 10)
    return dict(game=game, level=0, action=action,
                role=("square", "area_unranked", direction),
                obj=obj, before=(obj,), effect=effect)


def target_scene(left_anchor=True):
    if left_anchor:
        return ((1, 1, 13, 10, 13, 10), (2, 2, 9, 10, 10, 10))
    return ((1, 1, 10, 10, 10, 10), (2, 2, 13, 10, 14, 10))


def proof(before, action="ACTION3", game="target", level=0):
    middle = tuple(sorted(
        (1, 1, 12, 10, 12, 10) if o[0] == 1 else o for o in before))
    return dict(game=game, level=level, action=action,
                before=before, middle=middle, restored=before,
                inverse_action="ACTION4", start_turn=0, restored_turn=1)


class CounterfactualProbeReadinessTests(unittest.TestCase):
    def setUp(self):
        self.before = target_scene()
        self.donors = [witness("donorA"), witness("donorB")]
        self.reversals = [proof(self.before)]

    def choose(self, **changes):
        args = dict(before=self.before, level=0, target_game="target",
                    legal_actions=("ACTION3",), witnesses=self.donors,
                    observed_reversals=self.reversals, current_turn=3,\n                    episode_start_turn=0)
        args.update(changes)
        return propose_probe(**args)

    def test_three_distinct_pre_action_world_predictions(self):
        result = self.choose()
        self.assertEqual(result["status"], "SHADOW_CANDIDATE_ONLY")
        self.assertEqual(result["action"], "ACTION3")
        worlds = result["forecasts"]
        self.assertEqual(set(worlds), {"H0_static", "H1_absolute", "H2_anchor_relative"})
        self.assertEqual(len({tuple(v) for v in worlds.values()}), 3)
        self.assertEqual(worlds["H0_static"], self.before)

    def test_no_witnessed_reversal_abstains(self):
        self.assertEqual(self.choose(observed_reversals=[])["status"], "ABSTAIN")

    def test_wrong_game_level_or_action_proof_abstains(self):
        for field, value in (("game", "other"), ("level", 1),
                             ("action", "ACTION4"), ("restored", ())):
            bad = dict(self.reversals[0], **{field: value})
            with self.subTest(field=field):
                self.assertEqual(self.choose(observed_reversals=[bad])["status"], "ABSTAIN")

    def test_fake_no_change_reversal_abstains(self):
        bad = dict(self.reversals[0], middle=self.before)
        self.assertEqual(self.choose(observed_reversals=[bad])["status"], "ABSTAIN")

    def test_only_one_independent_donor_abstains(self):
        self.assertEqual(self.choose(witnesses=[self.donors[0]])["status"], "ABSTAIN")
        same_game = [witness("donorA"), witness("donorA")]
        self.assertEqual(self.choose(witnesses=same_game)["status"], "ABSTAIN")

    def test_static_or_conflicting_donor_vetoes(self):
        self.assertEqual(self.choose(witnesses=self.donors +
                         [witness("donorC", effect=(0, 0))])["status"], "ABSTAIN")
        self.assertEqual(self.choose(witnesses=self.donors +
                         [witness("donorC", effect=(-1, 0))])["status"], "ABSTAIN")

    def test_target_game_outcomes_are_excluded(self):
        self.assertEqual(self.choose(witnesses=[witness("target")] +
                         [witness("donorA")])["status"], "ABSTAIN")

    def test_click_coordinates_and_legal_action_not_conflated(self):
        donors = [witness("donorA", action="ACTION6@2,3"),
                  witness("donorB", action="ACTION6@2,3")]
        self.assertEqual(self.choose(witnesses=donors,
                         legal_actions=("ACTION6@7,8",),
                         observed_reversals=[proof(self.before, action="ACTION6@7,8")])["status"],
                         "ABSTAIN")
        self.assertEqual(self.choose(legal_actions=("ACTION4",))["status"], "ABSTAIN")

    def test_same_absolute_and_relative_prediction_abstains(self):
        before = target_scene(left_anchor=False)
        self.assertEqual(self.choose(before=before,
                         observed_reversals=[proof(before)])["status"], "ABSTAIN")

    def test_ambiguous_target_object_abstains(self):
        before = ((1, 1, 10, 10, 10, 10), (1, 1, 13, 10, 13, 10))
        self.assertEqual(self.choose(before=before,
                         observed_reversals=[proof(before)])["status"], "ABSTAIN")

    def test_reversal_proof_cannot_come_from_the_future(self):
        # An otherwise valid proof cannot be used at or before its restoration.
        self.assertEqual(self.choose(current_turn=1)["status"], "ABSTAIN")
        self.assertEqual(self.choose(current_turn=2)["status"], "SHADOW_CANDIDATE_ONLY")
        future = proof(self.before)
        future["start_turn"], future["restored_turn"] = 3, 4
        self.assertEqual(self.choose(observed_reversals=[future])["status"], "ABSTAIN")

    def test_reversal_proof_requires_adjacent_valid_integer_turns(self):
        for start, restored in ((0, 2), (-1, 0), (1, 1),
                                (True, 1), (0, "1")):
            with self.subTest(start=start, restored=restored):
                bad = proof(self.before)
                bad["start_turn"], bad["restored_turn"] = start, restored
                self.assertEqual(
                    self.choose(observed_reversals=[bad])["status"], "ABSTAIN")
        self.assertEqual(self.choose(current_turn=None)["status"], "ABSTAIN")

    def test_reversal_proof_must_be_inside_current_episode(self):
        # A previous episode can share game, level, action and object scene.
        # A RESET / level restart must invalidate that old reversal proof.
        self.assertEqual(self.choose(episode_start_turn=2)["status"], "ABSTAIN")
        self.assertEqual(self.choose(episode_start_turn=0)["status"], "SHADOW_CANDIDATE_ONLY")
        for invalid in (None, True, -1, 4, "0"):
            with self.subTest(invalid=invalid):
                self.assertEqual(self.choose(episode_start_turn=invalid)["status"], "ABSTAIN")
        fresh = proof(self.before)
        fresh["start_turn"], fresh["restored_turn"] = 3, 4
        self.assertEqual(self.choose(observed_reversals=[fresh],
                                     current_turn=6, episode_start_turn=3)["status"],
                         "SHADOW_CANDIDATE_ONLY")

    def test_public_audit_fails_closed_on_invalid_frozen_roster(self):
        with self.assertRaises(ValueError):
            audit_frozen_public([])


if __name__ == "__main__":
    unittest.main()
