"""MondayID ARC-AGI-3 offline exploration agent.

Copy this *single* file to agent/my_agent.py in the official Kaggle Starter.
It imports only stdlib plus the ARC runtime; no web calls, credentials or
host-specific extensions. This is an experimental baseline, not a claimed
winning solver or a verified competition score.
"""
from __future__ import annotations

from collections import Counter, defaultdict, deque
import hashlib
import math
import random
from typing import Any

from arcengine import FrameData, GameAction, GameState
from agents.agent import Agent


class MyAgent(Agent):
    """Novelty-driven action exploration with online transition memory.

    Principles:
      * never send actions missing from the environment's available set;
      * learn whether actions change the screen or advance a level;
      * avoid immediate unchanged-screen repeats and A-B-A loops;
      * probe ACTION6 on salient non-background regions instead of only
        selecting random x,y pixels;
      * retain a per-game transition model, without server/model calls.
    """

    MAX_ACTIONS = 500
    MAX_STATES = 2048
    MAX_CLICKS = 80

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        seed = int.from_bytes(hashlib.blake2b(str(self.game_id).encode(), digest_size=8).digest(), 'big')
        self._random = random.Random(seed)
        self._visits: Counter[tuple[int, str]] = Counter()
        self._attempts: Counter[tuple[int, str, str]] = Counter()
        self._successes: Counter[str] = Counter()
        self._trials: Counter[str] = Counter()
        self._dead_actions: set[tuple[int, str, str]] = set()
        self._transitions: dict[tuple[int, str, str], tuple[int, str]] = {}
        self._history: deque[tuple[int, str]] = deque(maxlen=12)
        self._last_observation: tuple[int, str] | None = None
        self._last_grids: list[list[list[int]]] | None = None
        self._last_move: str | None = None
        self._last_position: tuple[int, int] | None = None
        self._click_visits: Counter[tuple[int, str, int, int]] = Counter()
        self._global_click_visits: Counter[tuple[int, int, int]] = Counter()
        self._click_successes: Counter[tuple[int, int, int]] = Counter()
        self._click_failures: Counter[tuple[int, int, int]] = Counter()
        self._steps = 0
        self._seen_full_reset = False

    @property
    def name(self) -> str:
        return f"{super().name}.monday-novelty-v1"

    def is_done(self, frames: list[FrameData], latest_frame: FrameData) -> bool:
        return latest_frame.state is GameState.WIN

    @staticmethod
    def _grids(obs: FrameData) -> list[list[list[int]]]:
        raw = getattr(obs, 'frame', None) or []
        # The canonical frame is a list of 2D matrices. Handle empty frames.
        return raw if isinstance(raw, list) else []

    @staticmethod
    def _playfield(grid: list[list[int]]):
        """Rows/columns likely to carry game semantics, not engine odometers.

        ARC engine renders HUD timer/counters on boundaries of 64x64
        canvases. Restrict masking to full-size canvases so small test grids
        and genuinely small environments are not masked. This heuristic is
        still not semantic object detection.
        """
        is_full = len(grid) == 64 and all(len(row) == 64 for row in grid)
        for y, row in enumerate(grid):
            if is_full and (y < 2 or y >= 61):
                continue
            yield y, (row[1:] if is_full else row)

    @staticmethod
    def _key(level: int, grids: list[list[list[int]]]) -> tuple[int, str]:
        h = hashlib.blake2b(digest_size=12)
        # One action may return multiple animation frames; only compare its
        # terminal image to avoid treating frame-count as game progress.
        for grid in grids[-1:]:
            h.update(len(grid).to_bytes(2, 'big'))
            for _, row in MyAgent._playfield(grid):
                h.update(len(row).to_bytes(2, 'big'))
                h.update(bytes(int(v) & 255 for v in row))
        return level, h.hexdigest()

    @staticmethod
    def _delta(a: list[list[list[int]]] | None, b: list[list[list[int]]]) -> int:
        if not a or not b:
            return 0
        x = [row for _, row in MyAgent._playfield(a[-1])]
        y = [row for _, row in MyAgent._playfield(b[-1])]
        if len(x) != len(y) or any(len(ra) != len(rb) for ra,rb in zip(x,y)):
            return 0
        return sum(u != v for ra, rb in zip(x,y) for u,v in zip(ra,rb))

    @staticmethod
    def _allowed(obs: FrameData) -> list[GameAction]:
        advertised = getattr(obs, 'available_actions', None)
        if advertised is None:
            return [a for a in GameAction if a is not GameAction.RESET]
        # arcengine can expose enum actions or integer identifiers.  Compare
        # ids through names/values rather than relying on list identity.
        if not advertised:
            return []
        wanted: set[str] = set()
        for item in advertised:
            if hasattr(item, 'name'):
                wanted.add(item.name)
            elif isinstance(item, int):
                for a in GameAction:
                    if a.value == item:
                        wanted.add(a.name)
            elif isinstance(item, str):
                wanted.add(item.upper())
        return [a for a in GameAction if a is not GameAction.RESET and a.name in wanted]

    @staticmethod
    def _information_gain(successes: int, trials: int) -> float:
        """Normalized uncertainty of a Bernoulli causal-effect estimate.

        Beta(1,1) is the prior. Posterior variance shrinks as evidence
        accumulates; multiplying by 12 normalizes the prior maximum to 1.
        This measures uncertainty about the model, not reward.
        """
        failures=max(0,trials-successes)
        a=max(0,successes)+1
        b=failures+1
        total=a+b
        variance=(a*b)/((total*total)*(total+1))
        return max(0.0,min(1.0,12.0*variance))

    @staticmethod
    def _objects(grid: list[list[int]]) -> tuple[tuple[int,int,int,int,int,int], ...]:
        """Compact object descriptors for causal world-model experiments.

        Returns (color, area, min_x, min_y, max_x, max_y) for same-color
        4-connected non-background components. Full-canvas HUD boundaries
        are excluded exactly as in state hashing. This is not yet used for
        action selection; integration is gated on public-game A/B evidence.
        """
        if not grid:
            return ()
        height=len(grid)
        width=max((len(row) for row in grid), default=0)
        full=height==64 and width==64 and all(len(row)==64 for row in grid)
        x0,y0,x1,y1=(1,2,64,61) if full else (0,0,width,height)
        cells=[int(grid[y][x]) for y in range(y0,min(y1,height))
               for x in range(x0,min(x1,len(grid[y])))]
        if not cells:
            return ()
        background=Counter(cells).most_common(1)[0][0]
        seen:set[tuple[int,int]]=set()
        out:list[tuple[int,int,int,int,int,int]]=[]
        for y in range(y0,min(y1,height)):
            for x in range(x0,min(x1,len(grid[y]))):
                if (x,y) in seen or int(grid[y][x])==background:
                    continue
                color=int(grid[y][x])
                q=deque([(x,y)])
                seen.add((x,y))
                points=[]
                while q:
                    px,py=q.popleft()
                    points.append((px,py))
                    for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                        if (nx,ny) in seen or not (y0<=ny<min(y1,height)):
                            continue
                        if not (x0<=nx<min(x1,len(grid[ny]))):
                            continue
                        if int(grid[ny][nx])!=color:
                            continue
                        seen.add((nx,ny)); q.append((nx,ny))
                if len(points)<=1024:
                    xs=[p[0] for p in points]; ys=[p[1] for p in points]
                    out.append((color,len(points),min(xs),min(ys),max(xs),max(ys)))
        return tuple(sorted(out))

    @staticmethod
    def _salient_points(grids: list[list[list[int]]]) -> list[tuple[int, int]]:
        """Prioritize centers of rare colored connected components.

        A cheap and general click candidate generator; not a vision model.
        Coordinates are always in 0..63. Never infer semantics from color.
        """
        if not grids:
            return [(32, 32)]
        grid = grids[-1]
        if not grid:
            return [(32, 32)]
        height = min(64, len(grid))
        width = min(64, max((len(row) for row in grid[:height]), default=0))
        if height == 0 or width == 0:
            return [(32, 32)]
        # A 64x64 game may draw its HUD on row 0, while buttons and
        # playable objects live inside the canvas. The old policy spent
        # many clicks on changing HUD pixels rather than the game.
        full_canvas = height == 64 and width == 64
        min_x, min_y = (1, 2) if full_canvas else (0, 0)
        max_x, max_y = width, (61 if full_canvas else height)
        freq = Counter(
            int(grid[y][x])
            for y in range(min_y, max_y)
            for x in range(min_x, min(max_x, len(grid[y])))
        )
        if not freq:
            return [(32, 32)]
        background = freq.most_common(1)[0][0]
        seen: set[tuple[int, int]] = set()
        candidates: list[tuple[float, int, int]] = []
        for y in range(min_y, max_y):
            for x in range(min_x, min(max_x, len(grid[y]))):
                if (x, y) in seen or int(grid[y][x]) == background:
                    continue
                col = int(grid[y][x])
                q = deque([(x, y)])
                seen.add((x, y))
                component: list[tuple[int, int]] = []
                while q:
                    px, py = q.popleft()
                    component.append((px, py))
                    for nx, ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                        if (nx,ny) not in seen and min_y <= ny < max_y and min_x <= nx < min(max_x, len(grid[ny])) and int(grid[ny][nx]) == col:
                            seen.add((nx,ny))
                            q.append((nx,ny))
                if len(component) > 700:
                    continue
                mean_x=sum(t[0] for t in component)/len(component)
                mean_y=sum(t[1] for t in component)/len(component)
                cx, cy = min(component, key=lambda p: (p[0]-mean_x)**2+(p[1]-mean_y)**2)
                rarity = 1.0 / math.sqrt(max(freq[col], 1))
                compactness = 1.0 / math.sqrt(len(component))
                candidates.append((rarity + compactness, cx, cy))
        candidates.sort(reverse=True)
        ordered = [(x,y) for _,x,y in candidates[:50]]
        # Stratified exploration reaches large, uniform interactive
        # surfaces even when color segmentation has no obvious targets.
        for yi in range(8):
            for xi in range(8):
                x = min_x + ((2*xi+1) * (max_x-min_x)) // 16
                y = min_y + ((2*yi+1) * (max_y-min_y)) // 16
                ordered.append((x, y))
        unique=[]
        for x,y in ordered:
            p=(max(0,min(63,x)),max(0,min(63,y)))
            if p not in unique:
                unique.append(p)
        return unique or [(32,32)]

    @staticmethod
    def _local_delta(
        previous: list[list[list[int]]] | None,
        current: list[list[list[int]]],
        x: int, y: int, radius: int = 3,
    ) -> bool:
        """Check whether the clicked neighborhood visibly changed."""
        if not previous or not current:
            return False
        a, b = previous[-1], current[-1]
        for row in range(max(0, y-radius), min(len(a), len(b), y+radius+1)):
            for col in range(max(0, x-radius), min(len(a[row]), len(b[row]), x+radius+1)):
                if a[row][col] != b[row][col]:
                    return True
        return False

    def _record_outcome(self, current: tuple[int,str], grids: list[list[list[int]]]) -> None:
        if self._last_observation is None or self._last_move is None:
            return
        previous=self._last_observation
        changed = current != previous
        progressed = current[0] > previous[0]
        delta = self._delta(self._last_grids, grids)
        outcome_identity = self._last_move
        if self._last_move == 'ACTION6' and self._last_position is not None:
            x, y = self._last_position
            click_key = (previous[0], x, y)
            outcome_identity = f'ACTION6@{x},{y}'
            # An interactive control can change a distant region. The
            # public vc33 game proved that useful clicks may affect >250
            # pixels away from the click while the HUD timer changes 1-2.
            if (progressed or delta >= 8
                    or self._local_delta(self._last_grids, grids, x, y)):
                self._click_successes[click_key] += 1
            else:
                self._click_failures[click_key] += 1
        # ACTION6 outcomes must be keyed by *coordinate*, not by the
        # shared enum action, otherwise one dead pixel blacklists all clicks.
        key=(previous[0],previous[1],outcome_identity)
        self._trials[self._last_move]+=1
        if progressed or changed:
            self._successes[self._last_move]+=1
            self._transitions[key]=current
            self._dead_actions.discard(key)
        elif delta == 0:
            self._dead_actions.add(key)
        # If a move returns us to an already recurring position, mark it as
        # less desirable on the next decision without banning forever.

    def _pick_click(self, key: tuple[int,str], grids: list[list[list[int]]]) -> tuple[int,int]:
        points=self._salient_points(grids)[:self.MAX_CLICKS]
        ranked=[]
        for i,(x,y) in enumerate(points):
            visits=self._click_visits[(key[0],key[1],x,y)]
            global_visits=self._global_click_visits[(key[0],x,y)]
            causal_key = (key[0], x, y)
            penalty = 2*global_visits + visits + 2*self._click_failures[causal_key]
            # A visibly responsive control may require multiple presses.
            # Cap the reward so one animated object cannot trap the agent.
            penalty -= 3*min(self._click_successes[causal_key], 2)
            predicted = self._transitions.get(
                (key[0], key[1], f'ACTION6@{x},{y}'))
            if predicted in self._history:
                penalty += 3  # avoid reversible toggles into known states
            ranked.append((penalty, i, x, y))
        _,_,x,y = min(ranked)
        self._click_visits[(key[0],key[1],x,y)]+=1
        self._global_click_visits[(key[0],x,y)]+=1
        return x,y

    def choose_action(self, frames: list[FrameData], latest_frame: FrameData) -> GameAction:
        if latest_frame.state in (GameState.NOT_PLAYED, GameState.GAME_OVER):
            self._last_move=None
            self._last_observation=None
            self._last_grids=None
            return GameAction.RESET
        if getattr(latest_frame, 'full_reset', False) and not self._seen_full_reset:
            self._seen_full_reset = True
            self._last_move=None
        if not getattr(latest_frame, 'full_reset', False):
            self._seen_full_reset=False

        grids=self._grids(latest_frame)
        level=int(getattr(latest_frame,'levels_completed',0) or 0)
        key=self._key(level,grids)
        self._record_outcome(key,grids)
        self._visits[key]+=1
        self._history.append(key)
        legal=self._allowed(latest_frame)
        if not legal:
            return GameAction.RESET  # defensive fallback for invalid/no-action states

        scoring=[]
        for action in legal:
            identity=action.name
            attempt=(level,key[1],identity)
            times=self._attempts[attempt]
            historical_success=(self._successes[identity]+1)/(self._trials[identity]+4)
            global_exploration=1.0/math.sqrt(1+self._trials[identity])
            value=1.0/(1.0+times) + 0.42*global_exploration + 0.12*historical_success
            if attempt in self._dead_actions:
                value-=3.0
            if self._last_move==identity:
                # Continue a successful cardinal movement through unseen
                # states instead of zig-zagging after every single step.
                if (identity in ('ACTION1', 'ACTION2', 'ACTION3', 'ACTION4')
                        and self._last_observation != key
                        and self._visits[key] == 1):
                    # H1 predeclared: observed novel same-direction motion merits
                    # a stronger continuation bonus; a no-op is still vetoed.
                    value += 1.35
                else:
                    value -= 0.10
            predicted=self._transitions.get(attempt)
            if predicted:
                value += 0.9/(1+self._visits[predicted])
                # Once this exact state/action has demonstrably advanced the
                # level, replay the learned skill instead of paying again for
                # exploration. ARC-AGI-3 rewards action efficiency.
                if predicted[0] > level:
                    value += 4.0
                if predicted in list(self._history)[-5:]:
                    value-=0.65
            # Don't regularly undo progress; use ACTION7 only when others
            # are exhausted or blocked.
            if identity=='ACTION7':
                value-=0.7
            if identity=='ACTION6':
                value-=0.12
            value+=self._random.random()*0.001  # seeded tie-breaking
            scoring.append((value,action))
        _,action=max(scoring,key=lambda pair:pair[0])
        self._attempts[(level,key[1],action.name)]+=1
        self._last_move=action.name
        self._last_observation=key
        self._last_grids=grids
        self._steps+=1
        if action.is_complex():
            x,y=self._pick_click(key,grids)
            action.set_data({'x':x,'y':y})
            self._last_position=(x,y)
        action.reasoning={'policy':'monday-novelty-v1','level':level,'state_visits':self._visits[key], 'action':action.name}
        if len(self._visits)>self.MAX_STATES:
            # Fixed cap on stored states; keep long-term action statistics.
            self._visits.clear()
            self._transitions.clear()
            self._dead_actions.clear()
        return action
