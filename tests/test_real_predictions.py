import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class PredictionLedgerTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'data/real/predictions.json').read_text())

    def test_frozen_ledgers_reconcile(self):
        for portfolio in self.data['portfolios']:
            picks = portfolio['picks']
            self.assertEqual(sum(p['stake'] for p in picks), portfolio['stake'])
            self.assertEqual(sum(p['payout'] for p in picks), portfolio['payout'])
            self.assertEqual(portfolio['payout'] - portfolio['stake'], portfolio['net'])
            self.assertTrue(all(p['stake'] == 25 and p['outcome'] == 'Pending' for p in picks))
            self.assertTrue(all(p['quoteAt'] < p['start'] for p in picks))
            self.assertTrue(all(p['url'].startswith('https://www.realapp.com/') for p in picks))

    def test_opposing_portfolios_are_seven_unique_games(self):
        diagnostic, value = self.data['portfolios']
        self.assertEqual(len(diagnostic['picks']), 7)
        self.assertEqual(len(value['picks']), 2)
        games = {p['matchup'] for group in self.data['portfolios'] for p in group['picks']}
        self.assertEqual(len(games), 7)
        for pick in value['picks']:
            opposite = next(p for p in diagnostic['picks'] if p['matchup'] == pick['matchup'])
            self.assertEqual(pick['team'], opposite['opponent'])
            self.assertAlmostEqual(pick['probability'] + opposite['probability'], 1)
            self.assertEqual(pick['start'], opposite['start'])
            self.assertGreaterEqual(pick['probability'] - pick['stake'] / pick['payout'], .03)

    def test_only_nba_teams(self):
        teams = {'OKC','LAC','NYK','ORL','IND','BKN','LAL','UTA','MEM','SAC','MIN','TOR','DET','PHI'}
        for group in self.data['portfolios']:
            for p in group['picks']:
                self.assertIn(p['team'], teams)
                self.assertIn(p['opponent'], teams)
                self.assertTrue(0 < p['probability'] < 1)
                self.assertEqual(p['minnesota'], p['matchup'] == 'min')

if __name__ == '__main__':
    unittest.main()
