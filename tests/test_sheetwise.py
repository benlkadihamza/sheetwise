import unittest
from sheetwise.models import Part, Stock, EdgeBanding
from sheetwise.optimizer import optimize, place_group
from sheetwise.banding import banding_length, banding_total
from sheetwise.units import project_in_centimeters
from sheetwise.svg import render_sheet_svg


class TestSheetwise(unittest.TestCase):
    def test_basic_placement(self):
        r = optimize([{"label": "A", "w": 50, "h": 100, "qty": 2}], [{"w": 100, "h": 100, "qty": 1}], 0, False)
        self.assertEqual(len(r["unplaced"]), 0)
        self.assertEqual(len(r["sheets"]), 1)
        self.assertEqual(len(r["sheets"][0]["pieces"]), 2)

    def test_kerf_oversize(self):
        r = optimize([{"label": "A", "w": 50, "h": 100, "qty": 2}], [{"w": 100, "h": 100, "qty": 1}], 3, False)
        self.assertEqual(len(r["unplaced"]), 2)
        self.assertEqual(len(r["sheets"]), 0)

    def test_rotation(self):
        # Without rotation allowed: does not fit
        r1 = optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": True}], [{"w": 40, "h": 90, "qty": 1}], 0, False)
        self.assertEqual(len(r1["unplaced"]), 1)

        # With rotation allowed: fits rotated 90°
        r2 = optimize([{"w": 90, "h": 40, "qty": 1, "allowRotate": True}], [{"w": 40, "h": 90, "qty": 1}], 0, True)
        self.assertEqual(len(r2["unplaced"]), 0)
        self.assertTrue(r2["sheets"][0]["pieces"][0]["turn"])

    def test_banding(self):
        part = {"w": 100, "h": 50, "qty": 2, "edges": {"top": True, "bottom": True}}
        self.assertEqual(banding_length(part), 200.0)
        self.assertEqual(banding_total([part]), 400.0)

    def test_unit_conversion(self):
        proj = {"unit": "mm", "kerf": 40, "stock": [{"w": 2440, "h": 1220}], "parts": [{"w": 600, "h": 400, "qty": 1}]}
        cm_proj = project_in_centimeters(proj)
        self.assertEqual(cm_proj["unit"], "cm")
        self.assertEqual(cm_proj["kerf"], 4.0)
        self.assertEqual(cm_proj["stock"][0]["w"], 244.0)
        self.assertEqual(cm_proj["parts"][0]["h"], 40.0)

    def test_svg_rendering(self):
        r = optimize([{"label": "P", "w": 40, "h": 30, "qty": 1}], [{"w": 100, "h": 100, "qty": 1}], 0.4, False)
        svg = render_sheet_svg(r["sheets"][0])
        self.assertIn("<svg", svg)
        self.assertIn("</svg>", svg)
        self.assertIn("100 cm", svg)


if __name__ == "__main__":
    unittest.main()
