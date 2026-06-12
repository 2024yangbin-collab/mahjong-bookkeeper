import json
import subprocess
import sys
import unittest

from mahjong_ai.main import choose_discard, decide_response, restore_state


INITIAL = (
    "1 0 0 0 0 "
    "W1 W2 W3 W7 W8 W9 B1 B2 B3 T1 T5 F1 J1"
)


class MahjongBaselineTest(unittest.TestCase):
    def test_first_two_turns_pass(self):
        self.assertEqual(decide_response({"requests": ["0 0 2"], "responses": []}), "PASS")
        self.assertEqual(
            decide_response({"requests": ["0 0 2", INITIAL], "responses": ["PASS"]}),
            "PASS",
        )

    def test_draw_turn_discards_tile_from_hand(self):
        payload = {
            "requests": ["0 0 2", INITIAL, "2 T6"],
            "responses": ["PASS", "PASS"],
        }
        response = decide_response(payload)
        action, tile = response.split()
        self.assertEqual(action, "PLAY")
        self.assertIn(tile, INITIAL.split()[5:] + ["T6"])

    def test_restore_state_removes_previous_discard(self):
        payload = {
            "requests": ["0 0 2", INITIAL, "2 T6", "3 1 PLAY W5", "2 B4"],
            "responses": ["PASS", "PASS", "PLAY J1", "PASS"],
        }
        state = restore_state(payload["requests"], payload["responses"])
        self.assertIn("T6", state.hand)
        self.assertNotIn("J1", state.hand)
        self.assertEqual(len(state.hand), 13)

    def test_choose_discard_prefers_isolated_honor(self):
        hand = ["W2", "W3", "W4", "B2", "B3", "B4", "T5", "T6", "T7", "F1", "J1", "J1", "W9"]
        self.assertEqual(choose_discard(hand), "F1")

    def test_cli_outputs_json(self):
        payload = json.dumps({"requests": ["0 0 2", INITIAL, "2 T6"], "responses": ["PASS", "PASS"]})
        proc = subprocess.run(
            [sys.executable, "-m", "mahjong_ai.main"],
            input=payload + "\n",
            text=True,
            capture_output=True,
            check=True,
        )
        output = json.loads(proc.stdout)
        self.assertRegex(output["response"], r"^(PLAY [WBT][1-9]|PLAY F[1-4]|PLAY J[1-3])$")


if __name__ == "__main__":
    unittest.main()
