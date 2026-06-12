#!/usr/bin/env python3
"""Conservative baseline bot for Botzone Chinese Standard Mahjong.

The bot intentionally avoids declaring HU/GANG/CHI/PENG until a proper fan
calculator and action validator are added. That keeps the first version legal:
it acknowledges setup and opponent actions with PASS, then discards one tile
whenever Botzone tells it that it drew a tile.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Iterable, List, Sequence


SUITS = {"W", "B", "T"}
HONORS = {"F", "J"}
FLOWERS = {"H"}
SUIT_ORDER = {"W": 0, "B": 1, "T": 2, "F": 3, "J": 4, "H": 5}
TILE_TYPES = (
    [f"W{i}" for i in range(1, 10)]
    + [f"B{i}" for i in range(1, 10)]
    + [f"T{i}" for i in range(1, 10)]
    + [f"F{i}" for i in range(1, 5)]
    + [f"J{i}" for i in range(1, 4)]
)
TILE_INDEX = {tile: index for index, tile in enumerate(TILE_TYPES)}


@dataclass
class BotState:
    player_id: int = -1
    round_wind: int = -1
    hand: List[str] = field(default_factory=list)


def parse_request_line(line: str) -> List[str]:
    return str(line or "").strip().split()


def tile_sort_key(tile: str) -> tuple[int, int, str]:
    if len(tile) < 2:
        return (99, 99, tile)
    suit = tile[0]
    try:
        rank = int(tile[1:])
    except ValueError:
        rank = 99
    return (SUIT_ORDER.get(suit, 99), rank, tile)


def remove_one(tiles: List[str], tile: str) -> None:
    try:
        tiles.remove(tile)
    except ValueError:
        pass


def response_discard(response: str) -> str:
    tokens = parse_request_line(response)
    if len(tokens) >= 2 and tokens[0] == "PLAY":
        return tokens[1]
    if len(tokens) >= 3 and tokens[0] in {"PENG", "CHI"}:
        return tokens[-1]
    return ""


def restore_initial_hand(request: str) -> List[str]:
    tokens = parse_request_line(request)
    if not tokens or tokens[0] != "1" or len(tokens) < 18:
        return []
    return [tile for tile in tokens[5:18] if tile and tile[0] not in FLOWERS]


def restore_state(requests: Sequence[str], responses: Sequence[str]) -> BotState:
    state = BotState()
    if requests:
        tokens = parse_request_line(requests[0])
        if len(tokens) >= 3 and tokens[0] == "0":
            state.player_id = int(tokens[1])
            state.round_wind = int(tokens[2])

    if len(requests) >= 2:
        state.hand = restore_initial_hand(requests[1])

    completed_turns = min(len(responses), len(requests) - 1)
    for index in range(2, completed_turns):
        req = parse_request_line(requests[index])
        if len(req) >= 2 and req[0] == "2":
            state.hand.append(req[1])
        discarded = response_discard(responses[index])
        if discarded:
            remove_one(state.hand, discarded)

    return state


def is_suit_tile(tile: str) -> bool:
    return len(tile) >= 2 and tile[0] in SUITS and tile[1:].isdigit()


def is_honor_tile(tile: str) -> bool:
    return len(tile) >= 2 and tile[0] in HONORS and tile[1:].isdigit()


def tile_rank(tile: str) -> int:
    try:
        return int(tile[1:])
    except (ValueError, IndexError):
        return 99


def tile_counts(tiles: Iterable[str]) -> List[int]:
    counts = [0] * len(TILE_TYPES)
    for tile in tiles:
        index = TILE_INDEX.get(tile)
        if index is not None:
            counts[index] += 1
    return counts


def is_sequence_start(index: int) -> bool:
    return index < 27 and index % 9 <= 6


@lru_cache(maxsize=200000)
def shanten_from_count_tuple(count_tuple: tuple[int, ...]) -> int:
    counts = list(count_tuple)
    best = 8

    def finish(melds: int, taatsu: int, pair: int) -> None:
        nonlocal best
        taatsu = min(taatsu, 4 - melds)
        best = min(best, 8 - melds * 2 - taatsu - pair)

    def search(index: int, melds: int, taatsu: int, pair: int) -> None:
        while index < len(counts) and counts[index] == 0:
            index += 1
        if index >= len(counts):
            finish(melds, taatsu, pair)
            return

        if counts[index] >= 3:
            counts[index] -= 3
            search(index, melds + 1, taatsu, pair)
            counts[index] += 3

        if is_sequence_start(index) and counts[index + 1] and counts[index + 2]:
            counts[index] -= 1
            counts[index + 1] -= 1
            counts[index + 2] -= 1
            search(index, melds + 1, taatsu, pair)
            counts[index] += 1
            counts[index + 1] += 1
            counts[index + 2] += 1

        if counts[index] >= 2:
            counts[index] -= 2
            if pair == 0:
                search(index, melds, taatsu, 1)
            search(index, melds, taatsu + 1, pair)
            counts[index] += 2

        if is_sequence_start(index) and counts[index + 1]:
            counts[index] -= 1
            counts[index + 1] -= 1
            search(index, melds, taatsu + 1, pair)
            counts[index] += 1
            counts[index + 1] += 1

        if is_sequence_start(index) and counts[index + 2]:
            counts[index] -= 1
            counts[index + 2] -= 1
            search(index, melds, taatsu + 1, pair)
            counts[index] += 1
            counts[index + 2] += 1

        counts[index] -= 1
        search(index, melds, taatsu, pair)
        counts[index] += 1

    search(0, 0, 0, 0)
    return best


def shanten_from_counts(counts: List[int]) -> int:
    return shanten_from_count_tuple(tuple(counts))


def hand_shanten(tiles: Iterable[str]) -> int:
    """Return standard 4-melds-and-a-pair shanten; -1 means complete."""
    return shanten_from_counts(tile_counts(tiles))


def ukeire_count(tiles: Iterable[str]) -> int:
    """Count tile types that improve standard-hand shanten on the next draw."""
    hand = [tile for tile in tiles if tile in TILE_INDEX]
    current = hand_shanten(hand)
    counts = tile_counts(hand)
    improvements = 0
    for tile, index in TILE_INDEX.items():
        if counts[index] >= 4:
            continue
        if hand_shanten(hand + [tile]) < current:
            improvements += 1
    return improvements


def discard_score(tile: str, counts: Counter[str]) -> int:
    """Lower score means the tile is a better discard candidate."""
    score = 0
    same_count = counts[tile]

    if same_count >= 2:
        score += 30
    if same_count >= 3:
        score += 25

    if is_suit_tile(tile):
        rank = tile_rank(tile)
        suit = tile[0]
        if rank in {1, 9}:
            score -= 3
        if counts[f"{suit}{rank - 1}"]:
            score += 8
        if counts[f"{suit}{rank + 1}"]:
            score += 8
        if counts[f"{suit}{rank - 2}"]:
            score += 3
        if counts[f"{suit}{rank + 2}"]:
            score += 3
    elif is_honor_tile(tile):
        score -= 8
    else:
        score -= 20

    return score


def choose_discard(hand: Iterable[str]) -> str:
    tiles = sorted([tile for tile in hand if tile], key=tile_sort_key)
    if not tiles:
        return "W1"
    counts = Counter(tiles)
    candidates = []
    for tile in sorted(set(tiles), key=tile_sort_key):
        rest = tiles.copy()
        rest.remove(tile)
        candidates.append((
            hand_shanten(rest),
            -ukeire_count(rest),
            discard_score(tile, counts),
            tile_sort_key(tile),
            tile,
        ))
    return min(candidates)[-1]


def decide_response(payload: dict) -> str:
    requests = payload.get("requests") or []
    responses = payload.get("responses") or []
    turn_id = len(responses)

    if turn_id < 2:
        return "PASS"

    state = restore_state(requests, responses)
    current = parse_request_line(requests[turn_id] if turn_id < len(requests) else "")

    if len(current) >= 2 and current[0] == "2":
        state.hand.append(current[1])
        return "PLAY " + choose_discard(state.hand)

    return "PASS"


def main() -> None:
    try:
        payload = json.loads(sys.stdin.readline())
        response = decide_response(payload)
    except Exception:
        # Botzone expects a response even if our parser fails. PASS is legal for
        # non-draw requests and avoids accidental illegal claims.
        response = "PASS"
    print(json.dumps({"response": response}, ensure_ascii=False))


if __name__ == "__main__":
    main()
