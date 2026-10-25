import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class AuctionSnapshotTests(unittest.TestCase):
    def test_verified_replacement_snapshot(self):
        data = json.loads((ROOT / 'data/real/candidates.json').read_text())
        self.assertEqual(data['checked'], '2026-10-25T16:18:29Z')
        candidates = data['candidates']
        self.assertEqual([c['id'] for c in candidates], ['sengun', 'butker-2025-26-mystic5'])
        self.assertEqual([c['price'] for c in candidates], [9000, 10000])
        self.assertEqual([c['bids'] for c in candidates], [5, 0])
        self.assertEqual(sum(s['price'] for s in candidates[0]['sold']) / len(candidates[0]['sold']), 8500)
        self.assertEqual(candidates[1]['sold'], [])
        self.assertTrue(all(c['status'] == 'Watchlist' and c['endAt'] is None for c in candidates))
        self.assertTrue(all(c['checked'] <= data['checked'] for c in candidates))
        self.assertEqual(candidates[0]['historical'], 327 * 75)
        self.assertEqual(candidates[1]['historical'], 223 * 91)
        self.assertEqual({c['url'] for c in candidates}, {'https://www.realapp.com/27tNFpFJ0E6Ny','https://www.realapp.com/G8tkFOFYy4rAA'})

if __name__ == '__main__':
    unittest.main()
