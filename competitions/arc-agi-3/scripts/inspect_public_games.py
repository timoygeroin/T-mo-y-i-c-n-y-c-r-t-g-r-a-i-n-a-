"""Bounded, public-game-only ARC-AGI-3 observation diagnostics.

Produces human-readable state snapshots and causal deltas, not a Kaggle score.
No tokens, external inference, private games or environment source exports.
Run from the repo root using the official starter's Python environment:
  arc-starter/.venv/bin/python competitions/arc-agi-3/scripts/inspect_public_games.py
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
from pathlib import Path
import json
import os
import sys

ROOT = Path(__file__).resolve().parents[3]
STARTER = ROOT / "arc-starter"
if not (STARTER / "vendor" / "ARC-AGI-3-Agents").exists():
    raise SystemExit("Official starter is not installed at arc-starter/")
sys.path.insert(0, str(ROOT / "competitions" / "arc-agi-3" / "experiments"))
sys.path.insert(0, str(STARTER))
sys.path.insert(0, str(STARTER / "vendor" / "ARC-AGI-3-Agents"))
os.chdir(STARTER)

from arc_agi import Arcade, OperationMode
from agent.my_agent import MyAgent
from object_model import extract_objects


def final_grid(observation):
    frames = getattr(observation, "frame", None) or []
    if not frames:
        return []
    return frames[-1]


def frame_sha256(grid):
    """Stable digest of the visible public observation, not hidden game state."""
    normalized = [[int(pixel) for pixel in row] for row in grid]
    return sha256(json.dumps(normalized, separators=(',', ':')).encode('utf-8')).hexdigest()


def frame_text(grid):
    """Compact color-index dump; no guessed semantic labels."""
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    return "\n".join(
        "".join(alphabet[int(pixel) % len(alphabet)] for pixel in row[:64])
        for row in grid[:64]
    )


def delta_info(before, after):
    if not before or not after:
        return (0, None)
    points = [
        (x, y) for y, (a, b) in enumerate(zip(before, after))
        for x, (u, v) in enumerate(zip(a, b)) if u != v
    ]
    if not points:
        return (0, None)
    xs, ys = zip(*points)
    return len(points), (min(xs), min(ys), max(xs), max(ys))


def scene_objects(grid):
    return [[o.color, o.area, o.min_x, o.min_y, o.max_x, o.max_y]
            for o in extract_objects(grid)]


def legal_names(advertised):
    result = []
    for item in advertised or []:
        if hasattr(item, "name"):
            result.append(item.name)
        elif isinstance(item, int):
            result.append(f"ACTION{item}")
        else:
            value = str(item)
            result.append(f"ACTION{value}" if value.isdigit() else value)
    return result


def action_key(action):
    if action.name != "ACTION6":
        return action.name
    data = getattr(getattr(action, "action_data", None), "model_dump", lambda: {})()
    if not isinstance(data, dict) or "x" not in data or "y" not in data:
        raise RuntimeError("ACTION6 missing coordinate identity")
    return f"ACTION6@{int(data['x'])},{int(data['y'])}"


def main():
    arcade = Arcade(operation_mode=OperationMode.NORMAL)
    trace_rows = []
    for game_id in ("ls20", "vc33"):
        print("\n===== PUBLIC GAME", game_id, "=====", flush=True)
        env = arcade.make(game_id)
        if env is None:
            raise RuntimeError("Unavailable public game " + game_id)
        agent = MyAgent(
            card_id="public-diagnostic", game_id=game_id,
            agent_name="MondayID.diagnostic." + game_id,
            ROOT_URL="http://localhost", record=False, arc_env=env,
            tags=["public-diagnostic"],
        )
        for turn in range(12):
            observation = agent._convert_raw_frame_data(env.observation_space)
            before = final_grid(observation)
            if turn in (0, 3, 11):
                palette = Counter(int(v) for row in before for v in row)
                print(
                    "FRAME", game_id, turn, "state", observation.state,
                    "levels", observation.levels_completed,
                    "shape", (len(before), len(before[0]) if before else 0),
                    "available", [getattr(a, "name", str(a))
                                 for a in (observation.available_actions or [])],
                    "palette", dict(sorted(palette.items())),
                    flush=True,
                )
                print(frame_text(before), flush=True)
            action = agent.choose_action(agent.frames, observation)
            after_obs = agent.take_action(action)
            if after_obs is None:
                raise RuntimeError("Invalid ARC frame")
            after = final_grid(after_obs)
            count, box = delta_info(before, after)
            trace_rows.append({
                "schema": "arc-agi3.shadow-transition.v1",
                "game_id": game_id, "turn": turn,
                "action_key": action_key(action),
                "level_before": int(observation.levels_completed or 0),
                "level_after": int(after_obs.levels_completed or 0),
                "before_scene": scene_objects(before),
                "after_scene": scene_objects(after),
                "legal_actions": legal_names(observation.available_actions),
                "before_frame_sha256": frame_sha256(before),
                "after_frame_sha256": frame_sha256(after),
                "pixel_changes": count,
            })
            print(
                "TRANSITION", game_id, turn, action.name,
                "xy", getattr(getattr(action, "action_data", None), "model_dump", lambda: {})(),
                "pixel_changes", count, "change_bbox", box,
                "levels", after_obs.levels_completed,
                "state", after_obs.state, flush=True,
            )
            agent.append_frame(after_obs)
            if agent.is_done(agent.frames, after_obs):
                break
    trace_path = ROOT / "arc-agi3-public-transition-traces.jsonl"
    trace_path.write_text("".join(json.dumps(row, sort_keys=True) + "\n"
                                  for row in trace_rows), encoding="utf-8")
    print("PUBLIC_TRACE_RECORDS", len(trace_rows), trace_path.name, flush=True)
    print("PUBLIC_DIAGNOSTIC_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
