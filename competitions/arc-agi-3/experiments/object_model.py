"""Experimental object-level scene abstraction for ARC-AGI-3.

Pure-stdlib and offline. This module is intentionally not wired into the
submission agent yet: it must first prove that object abstraction improves
public-game action efficiency without collapsing semantically distinct states.
"""
from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
import hashlib


@dataclass(frozen=True, order=True)
class ObjectDescriptor:
    color: int
    area: int
    min_x: int
    min_y: int
    max_x: int
    max_y: int

    @property
    def width(self) -> int:
        return self.max_x - self.min_x + 1

    @property
    def height(self) -> int:
        return self.max_y - self.min_y + 1


def _bounds(grid: list[list[int]]) -> tuple[int, int, int, int]:
    """Return playable x0,y0,x1,y1 (exclusive), masking known 64x64 HUD."""
    height = len(grid)
    width = max((len(row) for row in grid), default=0)
    if height == 64 and width == 64 and all(len(row) == 64 for row in grid):
        return 1, 2, 64, 61
    return 0, 0, width, height


def extract_objects(grid: list[list[int]], max_component_area: int = 1024) -> tuple[ObjectDescriptor, ...]:
    """Extract same-color 4-connected non-background components.

    The most frequent playable color is treated as background. Object identity
    is descriptive rather than semantic: no color meaning or game-specific
    prior is assumed.
    """
    x0, y0, x1, y1 = _bounds(grid)
    cells = [
        int(grid[y][x])
        for y in range(y0, min(y1, len(grid)))
        for x in range(x0, min(x1, len(grid[y])))
    ]
    if not cells:
        return ()
    background = Counter(cells).most_common(1)[0][0]
    seen: set[tuple[int, int]] = set()
    objects: list[ObjectDescriptor] = []

    for y in range(y0, min(y1, len(grid))):
        for x in range(x0, min(x1, len(grid[y]))):
            if (x, y) in seen or int(grid[y][x]) == background:
                continue
            color = int(grid[y][x])
            q = deque([(x, y)])
            seen.add((x, y))
            points: list[tuple[int, int]] = []
            while q:
                px, py = q.popleft()
                points.append((px, py))
                for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                    if (nx, ny) in seen or not (y0 <= ny < min(y1, len(grid))):
                        continue
                    if not (x0 <= nx < min(x1, len(grid[ny]))):
                        continue
                    if int(grid[ny][nx]) != color:
                        continue
                    seen.add((nx, ny))
                    q.append((nx, ny))
            if len(points) <= max_component_area:
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                objects.append(ObjectDescriptor(color, len(points), min(xs), min(ys), max(xs), max(ys)))

    return tuple(sorted(objects))


def scene_signature(grid: list[list[int]]) -> str:
    """Stable compact signature over extracted objects, ignoring masked HUD."""
    h = hashlib.blake2b(digest_size=12)
    for obj in extract_objects(grid):
        h.update(bytes([obj.color & 255]))
        for value in (obj.area, obj.min_x, obj.min_y, obj.max_x, obj.max_y):
            h.update(int(value).to_bytes(2, "big", signed=False))
    return h.hexdigest()
