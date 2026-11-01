"""Pre-registered 8-pixel edge / 8x8-tile audit of public ARC frames.

Read-only diagnostics, never imported by the submission agent. Edge != HUD;
interior != gameplay. Observed frame changes are not latent-world evidence.
"""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
import sys
from typing import Iterable

FRAME_SIZE = 64
EDGE_BAND = 8
TILE_SIZE = 8
SCHEMA = 'arc-agi3.spatial-delta.v1'
TRACE_SCHEMA = 'arc-agi3.shadow-transition.v1'


def _validate_frame(grid: object) -> None:
    if (not isinstance(grid, (list, tuple)) or len(grid) != FRAME_SIZE or
            any(not isinstance(row, (list, tuple)) or len(row) != FRAME_SIZE
                for row in grid)):
        raise ValueError('expected rectangular 64x64 public frame')
    for row in grid:
        if any(type(v) is not int or not 0 <= v <= 255 for v in row):
            raise ValueError('invalid pixel')


def pixel_delta_regions(before: object, after: object) -> dict:
    """Lossless count of changed pixels by fixed, non-overlapping 8x8 tiles."""
    _validate_frame(before)
    _validate_frame(after)
    tile_counts = Counter()
    border = 0
    interior = 0
    for y in range(FRAME_SIZE):
        for x in range(FRAME_SIZE):
            if before[y][x] == after[y][x]:
                continue
            tile_counts[(x // TILE_SIZE, y // TILE_SIZE)] += 1
            if (x < EDGE_BAND or y < EDGE_BAND or
                    x >= FRAME_SIZE - EDGE_BAND or y >= FRAME_SIZE - EDGE_BAND):
                border += 1
            else:
                interior += 1
    return {
        'schema': SCHEMA, 'height': FRAME_SIZE, 'width': FRAME_SIZE,
        'edge_band': EDGE_BAND, 'tile_size': TILE_SIZE,
        'total_changes': border + interior,
        'border_changes': border, 'interior_changes': interior,
        'changed_tiles': [[x, y, tile_counts[(x, y)]]
                          for x, y in sorted(tile_counts, key=lambda t: (t[1], t[0]))],
    }


def _scene(value: object) -> tuple:
    if not isinstance(value, list):
        raise ValueError('invalid scene')
    scene = []
    for item in value:
        if (not isinstance(item, list) or len(item) != 6 or
                any(type(v) is not int for v in item)):
            raise ValueError('invalid scene object')
        scene.append(tuple(item))
    return tuple(sorted(scene))


def _validate_spatial(value: object, expected_total: int) -> list:
    if not isinstance(value, dict):
        raise ValueError('missing spatial_delta')
    if (value.get('schema') != SCHEMA or value.get('height') != FRAME_SIZE or
            value.get('width') != FRAME_SIZE or value.get('edge_band') != EDGE_BAND or
            value.get('tile_size') != TILE_SIZE):
        raise ValueError('spatial delta geometry/schema mismatch')
    total = value.get('total_changes')
    border = value.get('border_changes')
    interior = value.get('interior_changes')
    if (any(type(v) is not int for v in (total, border, interior, expected_total)) or
            not 0 <= total <= FRAME_SIZE * FRAME_SIZE or
            not 0 <= border <= total or not 0 <= interior <= total or
            total != expected_total or total != border + interior):
        raise ValueError('inconsistent spatial pixel counts')
    tiles = value.get('changed_tiles')
    if not isinstance(tiles, list) or len(tiles) > 64:
        raise ValueError('invalid changed tiles')
    seen = set()
    tile_total = 0
    tile_border = 0
    for tile in tiles:
        if (not isinstance(tile, list) or len(tile) != 3 or
                any(type(v) is not int for v in tile)):
            raise ValueError('invalid tile entry')
        x, y, count = tile
        if not (0 <= x < 8 and 0 <= y < 8 and 1 <= count <= 64) or (x, y) in seen:
            raise ValueError('invalid tile position/count')
        seen.add((x, y))
        tile_total += count
        if x in (0, 7) or y in (0, 7):
            tile_border += count
    if tile_total != total or tile_border != border:
        raise ValueError('tile counts disagree with spatial totals')
    return tiles


def audit_spatial(records: Iterable[dict], max_records: int = 4096) -> dict:
    """Summarize *observational* alias pixels; never infer semantic HUD labels."""
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('invalid record bound')
    stats = dict(records=0, same_level_records=0, alias_transitions=0,
                 alias_border_only=0, alias_interior_only=0, alias_mixed=0,
                 alias_border_changed_pixels=0, alias_interior_changed_pixels=0)
    tiles = Counter()
    for row in records:
        if stats['records'] >= max_records:
            raise ValueError('record limit exceeded')
        if not isinstance(row, dict) or row.get('schema') != TRACE_SCHEMA:
            raise ValueError('invalid trace schema')
        lb, la, count = row.get('level_before'), row.get('level_after'), row.get('pixel_changes')
        if (any(type(v) is not int for v in (lb, la, count)) or
                min(lb, la, count) < 0):
            raise ValueError('invalid trace level/pixel count')
        before, after = _scene(row.get('before_scene')), _scene(row.get('after_scene'))
        region_tiles = _validate_spatial(row.get('spatial_delta'), count)
        stats['records'] += 1
        if lb != la:
            continue
        stats['same_level_records'] += 1
        if count == 0 or before != after:
            continue
        stats['alias_transitions'] += 1
        border = row['spatial_delta']['border_changes']
        interior = row['spatial_delta']['interior_changes']
        stats['alias_border_only'] += int(border > 0 and interior == 0)
        stats['alias_interior_only'] += int(interior > 0 and border == 0)
        stats['alias_mixed'] += int(interior > 0 and border > 0)
        stats['alias_border_changed_pixels'] += border
        stats['alias_interior_changed_pixels'] += interior
        for x, y, n in region_tiles:
            tiles[(x, y)] += n
    return {
        **stats, 'edge_band_px': EDGE_BAND, 'tile_size_px': TILE_SIZE,
        'top_alias_tiles': [[x, y, count] for (x, y), count in
                            sorted(tiles.items(), key=lambda item: (-item[1], item[0][1], item[0][0]))[:8]],
        'effect_on_agent': 'NONE_SHADOW_ONLY',
        'claim': 'spatial_observation_only_not_HUD_or_gameplay_causality',
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: spatial_delta_audit.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as handle:
        print(json.dumps(audit_spatial(json.loads(line) for line in handle if line.strip()),
                         sort_keys=True))


if __name__ == '__main__':
    main()
