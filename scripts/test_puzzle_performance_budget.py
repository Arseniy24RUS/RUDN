"""Budget contract: moving deferred work into a center phase must still fail."""
import unittest

from test_puzzle_performance import performance_budget


class PerformanceBudgetTest(unittest.TestCase):
    def row(self, center=250, rate=1, zoom=100, pan=50):
        return {'cpuThrottle': rate, 'zoomAndPan': {
            'zoom': {'frameMs': {'p95': zoom, 'max': zoom}},
            'pan': {'frameMs': {'p95': pan, 'max': pan}},
            'centerAfterZoom': {'frameMs': {'p95': center, 'max': center}},
            'centerAfterPan': {'frameMs': {'p95': center, 'max': center}},
        }}

    def test_center_work_cannot_escape_the_original_maximum_guardrail(self):
        self.assertTrue(performance_budget(self.row())['passed'])
        result = performance_budget(self.row(center=251))
        self.assertFalse(result['passed'])
        for phase in ('centerAfterZoom', 'centerAfterPan'):
            self.assertFalse(result['checks'][phase+'MaxMs']['passed'])
            self.assertEqual(result['checks'][phase+'MaxMs']['limit'], 250)

    def test_center_limit_uses_the_same_cpu_square_root_scaling(self):
        self.assertTrue(performance_budget(self.row(center=500, rate=4))['passed'])
        self.assertFalse(performance_budget(self.row(center=501, rate=4))['passed'])

    def test_zoom_and_pan_thresholds_remain_in_force(self):
        self.assertFalse(performance_budget(self.row(zoom=101))['passed'])
        self.assertFalse(performance_budget(self.row(pan=51))['passed'])


if __name__ == '__main__':
    unittest.main()
