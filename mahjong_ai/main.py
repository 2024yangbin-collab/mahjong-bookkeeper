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
from typing import Iterable, List, Sequence


SUITS = {"W", "B", "T"}
HONORS = {"F", "J"}
FLOWERS = {"H"}
SUIT_ORDER = {"W": 0, "B": 1, "T": 2, "F": 3, "J": 4, "H": 5}


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
    return min(tiles, key=lambda tile: (discard_score(tile, counts), tile_sort_key(tile)))


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
