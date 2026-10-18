import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_connectome import determine_group  # noqa: E402


class DetermineGroupTests(unittest.TestCase):
    def test_named_descending_neurons_are_classified_even_with_central_superclass(self):
        self.assertEqual(
            determine_group("intrinsic", "central", "", "dn3", "central"),
            "DN_WALK",
        )
        self.assertEqual(
            determine_group("intrinsic", "central", "", "dn1p", "central"),
            "DN_STARTLE",
        )

    def test_lnv_clock_neurons_take_precedence_over_visual_projection(self):
        self.assertEqual(
            determine_group("intrinsic", "visual_projection", "", "lnv", "central"),
            "CLOCK_DN",
        )

    def test_t4_t5_motion_pathways_are_grouped_with_visual_motion(self):
        self.assertEqual(
            determine_group("intrinsic", "optic", "optic_lobe_intrinsic", "t4_neuron", "central"),
            "VIS_LPTC",
        )
        self.assertEqual(
            determine_group("intrinsic", "optic", "optic_lobe_intrinsic", "t5_neuron", "central"),
            "VIS_LPTC",
        )

    def test_unlabeled_central_cells_remain_honestly_generic(self):
        self.assertEqual(
            determine_group("intrinsic", "central", "", "", "central"),
            "GENERIC_CENTRAL",
        )


if __name__ == "__main__":
    unittest.main()
