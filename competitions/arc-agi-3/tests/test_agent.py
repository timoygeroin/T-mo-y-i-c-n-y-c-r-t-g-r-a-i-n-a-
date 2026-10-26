"""Contract tests without importing heavyweight ARC game dependencies.

These tests verify action legality and offline control logic. They are NOT
ARC-AGI-3 benchmark scores or evidence of game completion.
"""
from __future__ import annotations

from enum import Enum
import importlib.util
from pathlib import Path
import sys
import types
import unittest


class GameState(Enum):
    NOT_PLAYED=0
    NOT_FINISHED=1
    GAME_OVER=2
    WIN=3


class GameAction(Enum):
    RESET=0
    ACTION1=1
    ACTION2=2
    ACTION3=3
    ACTION4=4
    ACTION5=5
    ACTION6=6
    ACTION7=7

    def is_complex(self):
        return self is GameAction.ACTION6

    def set_data(self, data):
        self.payload=data


class Agent:
    def __init__(self, *, game_id='ls20', **kwargs):
        self.game_id=game_id

    @property
    def name(self):
        return 'agent'


class FrameData:
    def __init__(self, state=GameState.NOT_FINISHED, frame=None,
                 available_actions=None, levels_completed=0, full_reset=False):
        self.state=state
        self.frame=frame or [[[0]*8 for _ in range(8)]]
        self.available_actions=available_actions
        self.levels_completed=levels_completed
        self.full_reset=full_reset


arcengine=types.ModuleType('arcengine')
arcengine.FrameData=FrameData
arcengine.GameAction=GameAction
arcengine.GameState=GameState
agents=types.ModuleType('agents')
agents.__path__=[]
agents_agent=types.ModuleType('agents.agent')
agents_agent.Agent=Agent
sys.modules.update({'arcengine':arcengine,'agents':agents,'agents.agent':agents_agent})

SCRIPT=Path(__file__).resolve().parents[1]/'agent'/'my_agent.py'
spec=importlib.util.spec_from_file_location('monday_arc_agent',SCRIPT)
assert spec and spec.loader
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MyAgent=module.MyAgent


class AgentContractTests(unittest.TestCase):
    def setUp(self):
        self.agent=MyAgent(game_id='unit-test')

    def test_not_played_requires_reset(self):
        action=self.agent.choose_action([],FrameData(state=GameState.NOT_PLAYED))
        self.assertEqual(action, GameAction.RESET)

    def test_death_requires_reset(self):
        action=self.agent.choose_action([],FrameData(state=GameState.GAME_OVER))
        self.assertEqual(action, GameAction.RESET)

    def test_win_finishes(self):
        self.assertTrue(self.agent.is_done([], FrameData(state=GameState.WIN)))
        self.assertFalse(self.agent.is_done([], FrameData(state=GameState.NOT_FINISHED)))

    def test_only_advertised_simple_actions(self):
        obs=FrameData(available_actions=[GameAction.ACTION3,GameAction.ACTION4])
        chosen=[self.agent.choose_action([],obs) for _ in range(10)]
        self.assertTrue(all(a in (GameAction.ACTION3,GameAction.ACTION4) for a in chosen))

    def test_int_action_ids(self):
        obs=FrameData(available_actions=[1,2])
        self.assertIn(self.agent.choose_action([],obs),(GameAction.ACTION1,GameAction.ACTION2))

    def test_noop_action_is_not_immediately_repeated(self):
        obs=FrameData(available_actions=[GameAction.ACTION1,GameAction.ACTION2])
        first=self.agent.choose_action([],obs)
        second=self.agent.choose_action([],obs)
        self.assertNotEqual(first,second)

    def test_clicked_coordinates_are_in_bounds(self):
        grid=[[0]*64 for _ in range(64)]
        grid[12][49]=5
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        choice=self.agent.choose_action([],obs)
        self.assertEqual(choice,GameAction.ACTION6)
        self.assertTrue(0<=choice.payload['x']<=63)
        self.assertTrue(0<=choice.payload['y']<=63)
        self.assertEqual(choice.payload,{'x':49,'y':12})

    def test_change_records_transition(self):
        before=FrameData(frame=[[[0,0],[0,0]]],available_actions=[GameAction.ACTION1])
        after=FrameData(frame=[[[0,1],[0,0]]],available_actions=[GameAction.ACTION1])
        self.agent.choose_action([],before)
        self.agent.choose_action([],after)
        self.assertEqual(self.agent._successes['ACTION1'],1)
        self.assertTrue(self.agent._transitions)

    def test_agent_is_deterministic_per_game(self):
        sequence=[]
        for _ in range(2):
            agent=MyAgent(game_id='unit-test')
            obs=FrameData(available_actions=[GameAction.ACTION1,GameAction.ACTION2,GameAction.ACTION5])
            sequence.append([agent.choose_action([],obs).name for step in range(5)])
        self.assertEqual(sequence[0],sequence[1])

    def test_hud_tick_does_not_create_novel_state(self):
        clean=[[0]*64 for _ in range(64)]
        altered=[[0]*64 for _ in range(64)]
        clean[25][25]=4
        altered[25][25]=4
        altered[0][30]=7
        altered[1][20]=8
        altered[40][0]=6
        altered[63][8]=1
        self.assertEqual(MyAgent._key(0,[clean]),MyAgent._key(0,[altered]))
        self.assertEqual(MyAgent._delta([clean],[altered]),0)

    def test_terminal_frame_not_animation_length(self):
        a=[[0,0],[0,0]]
        b=[[1,0],[0,0]]
        self.assertEqual(MyAgent._key(0,[a,b]),MyAgent._key(0,[b]))

    def test_global_click_fallback_rotates_targets(self):
        grid=[[0]*64 for _ in range(64)]
        grid[12][49]=5
        grid[13][15]=6
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        p=[]
        for _ in range(3):
            self.agent.choose_action([],obs)
            p.append(tuple(GameAction.ACTION6.payload.values()))
        self.assertNotEqual(p[0],p[1])

    def test_without_frame_falls_back_valid_click(self):
        obs=FrameData(frame=[],available_actions=[GameAction.ACTION6])
        obs.frame=[]
        action=self.agent.choose_action([],obs)
        self.assertEqual(action,GameAction.ACTION6)
        self.assertEqual(action.payload,{'x':32,'y':32})


    def test_click_never_targets_hud_on_full_canvas(self):
        grid=[[3]*64 for _ in range(64)]
        grid[0]=[7]*64
        grid[29][38]=11
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        positions=[]
        for _ in range(8):
            self.agent.choose_action([],obs)
            positions.append(self.agent._last_position)
        self.assertTrue(all(1 <= x < 64 and 2 <= y < 61 for x,y in positions))

    def test_click_outcome_tracks_local_causality(self):
        grid=[[3]*64 for _ in range(64)]
        grid[29][38]=11
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],obs)
        x,y=self.agent._last_position
        changed=[row[:] for row in grid]
        changed[y][x]=4
        after=FrameData(frame=[changed],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],after)
        self.assertEqual(self.agent._click_successes[(0,x,y)],1)

    def test_unchanged_click_penalized(self):
        grid=[[3]*64 for _ in range(64)]
        grid[29][38]=11
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],obs)
        x,y=self.agent._last_position
        self.agent.choose_action([],obs)
        self.assertEqual(self.agent._click_failures[(0,x,y)],1)

    def test_successful_movement_prefers_continuation(self):
        before=FrameData(
            frame=[[[0,0],[0,0]]],
            available_actions=[GameAction.ACTION4])
        after=FrameData(
            frame=[[[0,1],[0,0]]],
            available_actions=[GameAction.ACTION3,GameAction.ACTION4])
        self.assertEqual(self.agent.choose_action([],before),GameAction.ACTION4)
        self.assertEqual(self.agent.choose_action([],after),GameAction.ACTION4)


    def test_remote_click_effect_is_causal(self):
        grid=[[3]*64 for _ in range(64)]
        grid[12][49]=5
        before=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],before)
        x,y=self.agent._last_position
        changed=[row[:] for row in grid]
        for ix in range(20,32):
            changed[40][ix]=7
        after=FrameData(frame=[changed],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],after)
        self.assertEqual(self.agent._click_successes[(0,x,y)],1)
        self.assertIn(
            (0,self.agent._key(0,[grid])[1],f'ACTION6@{x},{y}'),
            self.agent._transitions)

    def test_failed_click_does_not_blacklist_all_coordinates(self):
        grid=[[3]*64 for _ in range(64)]
        grid[12][49]=5
        obs=FrameData(frame=[grid],available_actions=[GameAction.ACTION6])
        self.agent.choose_action([],obs)
        x,y=self.agent._last_position
        self.agent.choose_action([],obs)
        key=self.agent._key(0,[grid])
        self.assertIn((0,key[1],f'ACTION6@{x},{y}'),self.agent._dead_actions)
        self.assertNotIn((0,key[1],'ACTION6'),self.agent._dead_actions)

    def test_object_abstraction_ignores_full_canvas_hud(self):
        a=[[0]*64 for _ in range(64)]
        b=[[0]*64 for _ in range(64)]
        a[20][20]=b[20][20]=5
        b[0][10]=7; b[1][11]=8; b[63][12]=9; b[30][0]=6
        self.assertEqual(MyAgent._objects(a),MyAgent._objects(b))

    def test_object_abstraction_tracks_motion(self):
        a=[[0]*8 for _ in range(8)]
        b=[[0]*8 for _ in range(8)]
        a[2][2]=4
        b[2][3]=4
        self.assertNotEqual(MyAgent._objects(a),MyAgent._objects(b))

    def test_object_abstraction_preserves_shape_bbox(self):
        g=[[0]*8 for _ in range(8)]
        g[2][2]=g[2][3]=g[3][2]=9
        self.assertEqual(MyAgent._objects(g),((9,3,2,2,3,3),))


if __name__=='__main__':
    unittest.main()
