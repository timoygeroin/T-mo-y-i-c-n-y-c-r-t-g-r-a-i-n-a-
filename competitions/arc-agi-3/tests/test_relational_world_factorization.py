"""Test-first: competing absolute versus anchor-relative causal worlds."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))

from relational_world_factorization import (
    donor_rules, predict_scene, effect_code, evaluate_relational_worlds,
)

def witness(game, direction, delta, action="ACTION3", level=0):
    obj = (1, 1, 10, 10, 10, 10)
    return dict(game=game, level=level, action=action,
                role=("square", "area_unranked", direction),
                obj=obj, before=(obj,), effect=delta)

def scene(left=True):
    if left:
        return ((1, 1, 10, 10, 10, 10), (2, 2, 13, 10, 14, 10))
    return ((1, 1, 13, 10, 13, 10), (2, 2, 9, 10, 10, 10))

class RelationalWorldTests(unittest.TestCase):
    def test_opposing_absolute_moves_agree_on_toward_anchor(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (-1, 0), (-1, 0))]
        rel = donor_rules(w, "target", "relative")
        absolute = donor_rules(w, "target", "absolute")
        self.assertEqual(len(rel), 1)
        self.assertEqual(len(absolute), 0)
        forecast = predict_scene(scene(True), 0, "ACTION3", rel, "relative")
        self.assertEqual(forecast,
                         ((1, 1, 11, 10, 11, 10), (2, 2, 13, 10, 14, 10)))

    def test_static_observation_vetoes_relative_rule(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (-1, 0), (-1, 0)),
             witness("g3", (1, 0), (0, 0))]
        self.assertEqual(donor_rules(w, "target", "relative"), {})

    def test_two_distinct_games_required(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g1", (-1, 0), (-1, 0))]
        self.assertEqual(donor_rules(w, "target", "relative"), {})

    def test_target_outcomes_never_enter_donors(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (-1, 0), (-1, 0)),
             witness("target", (1, 0), (0, 0))]
        self.assertEqual(len(donor_rules(w, "target", "relative")), 1)

    def test_orthogonal_and_diagonal_anchor_abstain(self):
        self.assertIsNone(effect_code(witness("g", (1, 0), (0, 1)), "relative"))
        self.assertIsNone(effect_code(witness("g", (1, 1), (1, 0)), "relative"))

    def test_click_coordinates_not_merged(self):
        w = [witness("g1", (1, 0), (1, 0), "ACTION6@2,3"),
             witness("g2", (-1, 0), (-1, 0), "ACTION6@2,3")]
        rules = donor_rules(w, "target", "relative")
        self.assertIsNone(predict_scene(scene(), 0, "ACTION6@7,8", rules, "relative"))
        self.assertIsNotNone(predict_scene(scene(), 0, "ACTION6@2,3", rules, "relative"))

    def test_two_candidate_objects_fail_closed(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (-1, 0), (-1, 0))]
        # Both same-shaped objects can have opposite nearest-anchor directions.
        # They must never be silently assigned the same moving-object identity.
        rules = donor_rules(w, "target", "relative")
        self.assertIsNone(predict_scene(((1,1,10,10,10,10),(1,1,13,10,13,10)),
                                        0, "ACTION3", rules, "relative"))

    def test_out_of_bounds_abstains(self):
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (1, 0), (1, 0))]
        rules = donor_rules(w, "target", "absolute")
        before = ((1,1,63,10,63,10),(2,2,61,10,62,10))
        self.assertIsNone(predict_scene(before, 0, "ACTION3", rules, "absolute"))

    def test_strict_prior_donor_pool_rejects_future_games(self):
        # Only completed donor games strictly earlier than the target
        # are admissible; a later game must never authorize a forecast.
        w = [witness("earlier", (1, 0), (1, 0)),
             witness("future", (-1, 0), (-1, 0))]
        self.assertEqual(len(donor_rules(w, "target", "relative")), 1)
        self.assertEqual(donor_rules(w, "target", "relative",
                                     eligible_games={"earlier"}), {})
        self.assertEqual(len(donor_rules(
            w, "target", "relative", eligible_games={"earlier", "future"})), 1)
        self.assertEqual(donor_rules(
            w, "target", "relative", eligible_games=set()), {})

    def test_future_conflict_cannot_veto_earlier_consensus(self):
        # A globally later static donor cannot change an earlier forecast.
        w = [witness("g1", (1, 0), (1, 0)),
             witness("g2", (-1, 0), (-1, 0)),
             witness("future", (1, 0), (0, 0))]
        self.assertEqual(donor_rules(w, "target", "relative"), {})
        self.assertEqual(len(donor_rules(
            w, "target", "relative", eligible_games={"g1", "g2"})), 1)

    def test_chronological_report_discloses_strict_donor_order(self):
        from remaining_public_sample import FROZEN_GAMES
        before = [[1, 1, 10, 10, 10, 10], [2, 2, 13, 10, 14, 10]]
        rows = [dict(schema="arc-agi3.shadow-transition.v1",
                     game_id=g, turn=0, action_key="ACTION3",
                     legal_actions=["ACTION3"], level_before=0,
                     level_after=0, before_scene=before,
                     after_scene=before) for g in FROZEN_GAMES]
        report = evaluate_relational_worlds(rows)
        strict = report["chronological_prior_game_only"]
        self.assertEqual(strict["donor_order"], list(FROZEN_GAMES))
        self.assertEqual(strict["eligible_prior_games_per_target"][FROZEN_GAMES[0]], [])
        self.assertEqual(strict["eligible_prior_games_per_target"][FROZEN_GAMES[2]],
                         list(FROZEN_GAMES[:2]))
        self.assertEqual(strict["total_forecasts"],
                         {"absolute": 0, "relative": 0})
        self.assertEqual(strict["effect_on_agent"], "NONE_SHADOW_ONLY")

    def test_research_acceptance_requires_strict_prior_forecasts(self):
        # Post-hoc donor support can be strong even when no prequential
        # strict-prior forecast exists; it must never pass a research gate.
        import relational_world_factorization as world
        from remaining_public_sample import FROZEN_GAMES
        rows = [dict(schema="arc-agi3.shadow-transition.v1",
                     game_id=g, turn=0, action_key="ACTION3",
                     legal_actions=["ACTION3"], level_before=0,
                     level_after=0,
                     before_scene=[[1, 1, 10, 10, 10, 10]],
                     after_scene=[[1, 1, 10, 10, 10, 10]])
                for g in FROZEN_GAMES]
        report = evaluate_relational_worlds(rows)
        strict = report["chronological_prior_game_only"]
        self.assertEqual(report["acceptance_basis"], "STRICT_PRIOR_GAME_ONLY")
        self.assertEqual(report["acceptance"],
                         world._research_acceptance(strict["per_game"]))
        self.assertFalse(report["acceptance"]["absolute"]["research_gates_passed"])

        posthoc_favorable = {
            g: dict(absolute_delta=1 if i < 3 else 0,
                    relative_delta=0, absolute_forecasts=10 if i < 3 else 0,
                    relative_forecasts=0, level_advances=1)
            for i, g in enumerate(FROZEN_GAMES)
        }
        strict_empty = {
            g: dict(absolute_delta=0, relative_delta=0,
                    absolute_forecasts=0, relative_forecasts=0,
                    level_advances=1)
            for g in FROZEN_GAMES
        }
        self.assertTrue(world._research_acceptance(
            posthoc_favorable)["absolute"]["research_gates_passed"])
        self.assertFalse(world._research_acceptance(
            strict_empty)["absolute"]["research_gates_passed"])

    def test_research_gate_needs_matched_world_discrimination(self):
        # Aggregate H1 accuracy alone cannot establish superiority over H2/H0.
        # Forecast coverage and level advances are insufficient without
        # strictly-prior paired counterfactual disagreement evidence.
        import relational_world_factorization as world
        from remaining_public_sample import FROZEN_GAMES
        scores = {
            g: dict(absolute_delta=1 if i < 3 else 0,
                    relative_delta=0,
                    absolute_forecasts=10 if i < 3 else 0,
                    relative_forecasts=10 if i < 3 else 0,
                    level_advances=1,
                    paired_disagreements=0,
                    absolute_wins_on_disagreement=0,
                    relative_wins_on_disagreement=0,
                    h0_wins_on_disagreement=0)
            for i, g in enumerate(FROZEN_GAMES)
        }
        no_discrimination = world._research_acceptance(scores)["absolute"]
        self.assertFalse(no_discrimination["research_gates_passed"])
        self.assertEqual(no_discrimination["paired_disagreements"], 0)
        for g in FROZEN_GAMES[:3]:
            scores[g]["paired_disagreements"] = 1
            scores[g]["absolute_wins_on_disagreement"] = 1
        discriminated = world._research_acceptance(scores)["absolute"]
        self.assertTrue(discriminated["research_gates_passed"])
        self.assertEqual(discriminated["head_to_head_wins"], 3)
        for g in FROZEN_GAMES[:3]:
            scores[g]["h0_wins_on_disagreement"] = 1
        self.assertFalse(world._research_acceptance(
            scores)["absolute"]["research_gates_passed"])

    def test_invalid_hypothesis_fails_closed(self):
        with self.assertRaises(ValueError):
            donor_rules([], "target", "oracle")

if __name__ == "__main__":
    unittest.main()
