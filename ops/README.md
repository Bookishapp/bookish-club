# Bookish report alerts on the Mac mini

Prepared for Ted. Do not install on a MacBook. No job is installed by this change.

The job polls the worker-key-protected dedicated Bookish function every 15 minutes. Each unseen pending report creates a Bookish card through the existing `/Users/vahallo/ted-ops/ted-board/card.py new` helper, using a deterministic card ID. It does not start an agent or resolve a report. Atomic owner-only state records only successfully created cards. Failed polls and failed card creation exit nonzero, and retry on the next scheduled run. File locking prevents overlapping runs. Pagination covers queues larger than 100 reports.

First apply `.ted/apply-20.sql`, and deploy `bookish-report-alerts` with the manifest in `.ted/DEPLOY.md`. Generate a new random Bookish-only key, and store it in the dedicated project's environment or Vault as `BOOKISH_REPORT_WORKER_KEY`. Put the same value into `/Users/vahallo/ted-ops/keys/bookish-report-alerts.env`, as a single unquoted line `BOOKISH_REPORT_WORKER_KEY=VALUE`. Use 32 to 256 URL-safe characters. Set the file mode to 0600. Do not reuse the Ted board key or any Supabase key. No secret belongs in the plist.

From this checkout, Ted installs on the Mac mini with:

```sh
mkdir -p /Users/vahallo/ted-ops/bookish-report-alerts /Users/vahallo/ted-ops/logs "$HOME/Library/LaunchAgents"
install -m 700 ops/bookish_report_alerts.py /Users/vahallo/ted-ops/bookish-report-alerts/bookish_report_alerts.py
install -m 600 ops/com.meetbookish.report-alerts.plist "$HOME/Library/LaunchAgents/com.meetbookish.report-alerts.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.meetbookish.report-alerts.plist"
```

Before bootstrap, run `/Library/Developer/CommandLineTools/usr/bin/python3 /Users/vahallo/ted-ops/bookish-report-alerts/bookish_report_alerts.py` once to verify endpoint authentication, Ted board access, and the initial queue. The script stores state in `/Users/vahallo/ted-ops/state/bookish-report-alerts/seen.json`. Keep that file across updates. Inspect `/Users/vahallo/ted-ops/logs/bookish-report-alerts.log` and `.error.log`. A card contains the report ID, content target, due time, and reason, but no reporter identity. Reporter text is explicitly marked untrusted.

The 15-minute interval provides alerts, not a staffing guarantee. Ted must assign coverage and review reports within 24 hours. An unavailable endpoint, missing worker key, or board failure prevents alert delivery and requires operational attention.

Offline verification: `python3 -m unittest discover -s ops -p 'test_*.py'`. The tests replace only external queue and card transports, and do not create live cards or install the job.
