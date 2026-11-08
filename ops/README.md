# Bookish report alerts on the Mac mini

Install this job only on the Mac mini. The commands below prepare an installation; this repository does not install a job automatically.

The job polls the worker-key-protected Bookish function every 15 minutes. Each unseen pending report creates a card through the operator-provided `$TED_OPS_DIR/ted-board/card.py new` helper, using a deterministic card ID. The helper must support `--project`, `--title`, `--body`, and `--card-id`. The poller does not start an agent or resolve a report. Atomic owner-only state records only successfully created cards. Failed polls and failed card creation exit nonzero, and retry on the next scheduled run. File locking prevents overlapping runs. Pagination covers queues larger than 100 reports.

Generate the deployment packet with `node scripts/stage-dedicated-sql.mjs`. Review `.cache/dedicated-sql/preflight.sql`, apply the numbered chunks in order through `apply-20.sql`, and deploy the `bookish-report-alerts` function using `supabase/config.toml`. Confirm the dedicated project before any deployment, and set the target confirmation required by the SQL. Generated files stay in the ignored cache. Run `node scripts/stage-dedicated-sql.mjs --check` to compare the complete packet with the committed `supabase/packets/SHA256SUMS`, without needing a local cache. After an intentional SQL or seed update, review the generated packet and update those SHA-256 hashes in the same change. Generated chunks must remain below 20, which is reserved for the hand-authored hardening migration. Canonical preflight, hardening, and rollback SQL live in `supabase/packets/`.

The committed `.plist.template` contains placeholders and must be rendered using the installation commands below before loading it.

Generate a new random Bookish-only key, and store it in the dedicated project's environment or Vault as `BOOKISH_REPORT_WORKER_KEY`. Put the same value into `$TED_OPS_DIR/keys/bookish-report-alerts.env`, as a single unquoted line `BOOKISH_REPORT_WORKER_KEY=VALUE`. Use 32 to 256 URL-safe characters. Set the file mode to 0600. Do not reuse the board key or any Supabase key. No secret belongs in the plist.

Set `TED_OPS_DIR` to the absolute directory containing the existing board helper, keys, state, and logs. Set `PYTHON3` to an absolute Python 3 executable. From this checkout on the Mac mini:

```sh
export TED_OPS_DIR="/absolute/path/to/operations"
export PYTHON3="$(command -v python3)"
mkdir -p "$TED_OPS_DIR/bookish-report-alerts" "$TED_OPS_DIR/logs" "$HOME/Library/LaunchAgents"
install -m 700 ops/bookish_report_alerts.py "$TED_OPS_DIR/bookish-report-alerts/bookish_report_alerts.py"
"$PYTHON3" - <<'PY'
import os
from pathlib import Path
import plistlib

root = Path(os.environ['TED_OPS_DIR']).resolve()
python = os.environ['PYTHON3']
with Path('ops/com.meetbookish.report-alerts.plist.template').open('rb') as source:
    job = plistlib.load(source)
job['ProgramArguments'] = [python, str(root / 'bookish-report-alerts/bookish_report_alerts.py')]
job['WorkingDirectory'] = str(root)
job['StandardOutPath'] = str(root / 'logs/bookish-report-alerts.log')
job['StandardErrorPath'] = str(root / 'logs/bookish-report-alerts.error.log')
job['EnvironmentVariables'] = {'TED_OPS_DIR': str(root)}
output = Path.home() / 'Library/LaunchAgents/com.meetbookish.report-alerts.plist'
with output.open('wb') as destination:
    plistlib.dump(job, destination)
output.chmod(0o600)
PY
```

Before bootstrap, run `"$PYTHON3" "$TED_OPS_DIR/bookish-report-alerts/bookish_report_alerts.py"` once to verify endpoint authentication, board access, and the initial queue. Then load the generated plist:

```sh
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.meetbookish.report-alerts.plist"
```

The script stores state in `$TED_OPS_DIR/state/bookish-report-alerts/seen.json`. Keep that file across updates. Inspect `$TED_OPS_DIR/logs/bookish-report-alerts.log` and `$TED_OPS_DIR/logs/bookish-report-alerts.error.log`. A card contains the report ID, content target, due time, and reason, but no reporter identity. Reporter text is explicitly marked untrusted.

The 15-minute interval provides alerts, not a staffing guarantee. The operator must assign coverage and review reports within 24 hours. An unavailable endpoint, missing worker key, or board failure prevents alert delivery and requires operational attention.

Offline verification: `python3 -m unittest discover -s ops -p 'test_*.py'`. The tests replace only external queue and card transports, and do not create live cards or install the job.
