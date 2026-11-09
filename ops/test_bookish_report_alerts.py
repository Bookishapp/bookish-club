import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('alerts',Path(__file__).with_name('bookish_report_alerts.py'))
alerts=importlib.util.module_from_spec(spec)
spec.loader.exec_module(alerts)

def report(n=1):
    return dict(id=f'00000000-0000-4000-8000-{n:012}',kind='club',target_id='10000000-0000-4000-8000-000000000001',club_id=None,reason='Untrusted report text',due_at='2026-11-02T00:00:00Z')

class AlertsTests(unittest.TestCase):
    def test_pagination_deduplicates_and_remembers_only_successful_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state.json';seen=[];cards=[]
            def fetch(after):
                seen.append(after)
                return {'reports':[report(1)],'next':report(1)['id']} if after is None else {'reports':[report(2)],'next':None}
            self.assertEqual(alerts.run(state,fetch,lambda r:cards.append(r['id'])),2)
            self.assertEqual(seen,[None,report(1)['id']])
            self.assertEqual(alerts.run(state,fetch,lambda r:cards.append(r['id'])),0)
            self.assertEqual(cards,[report(1)['id'],report(2)['id']])
            self.assertEqual(state.stat().st_mode & 0o777,0o600)

    def test_card_failure_retries_without_acknowledging(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state.json';fetch=lambda _:dict(reports=[report()],next=None)
            with self.assertRaises(RuntimeError):
                alerts.run(state,fetch,lambda _:(_ for _ in ()).throw(RuntimeError('board unavailable')))
            self.assertFalse(state.exists())
            calls=[];self.assertEqual(alerts.run(state,fetch,lambda r:calls.append(r['id'])),1)
            self.assertEqual(calls,[report()['id']])

    def test_fetch_failure_and_corrupt_state_do_not_create_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            state=Path(tmp)/'state.json';cards=[]
            with self.assertRaises(RuntimeError):
                alerts.run(state,lambda _:(_ for _ in ()).throw(RuntimeError('queue unavailable')),cards.append)
            self.assertEqual(cards,[]);state.write_text('broken')
            with self.assertRaises(ValueError):alerts.run(state,lambda _:dict(reports=[report()],next=None),cards.append)
            self.assertEqual(cards,[])

    def test_board_helper_uses_deterministic_id_and_no_auto_execution(self):
        with patch.object(alerts.subprocess,'run') as call:
            alerts.create_card(report())
            args=call.call_args.args[0]
            self.assertIn(str(alerts.ROOT/'ted-board/card.py'),args)
            self.assertEqual(args[args.index('--project')+1],'Bookish')
            self.assertEqual(args[args.index('--card-id')+1],'bookish-report-'+report()['id'])
            self.assertNotIn('--engine',args)
            self.assertIn(report()['due_at'],args[args.index('--body')+1])

    def test_bad_cursor_does_not_loop_or_acknowledge_more_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):alerts.run(Path(tmp)/'state.json',lambda _:dict(reports=[],next='bad'),lambda _:None)

if __name__=='__main__':unittest.main()
