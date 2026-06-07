# AGENTS.md

## Project overview

**麻将馆记账本 (Mahjong Parlor Accounting Book)** is a single-file static web app (`index.html`). There is no backend, build step, package manager, or test suite.

Data is stored in the browser via `localStorage` keys:
- `mj_accounting_records`
- `mj_last_backup_date`
- `mj_auto_backup_enabled`

## Development

Serve the app over HTTP (required for browser automation; `file://` is unreliable in headless environments):

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/index.html in a browser.

Alternatively, open `index.html` directly in a browser for quick manual testing.

## Lint / test / build

This repo has no linter, automated tests, or build commands. Verification is manual in the browser or via HTTP checks (e.g. `curl http://localhost:8080/index.html`).

## Cursor Cloud specific instructions

- **No dependency install step** — the update script is a no-op (`true`). Do not add `npm install` or similar unless the project gains a package manifest.
- **Required runtime service**: a static HTTP server on port 8080 (or any free port). Use `python3 -m http.server 8080` from the repo root.
- **Auto-backup on load**: when auto-backup is enabled, the app may trigger a JSON file download ~1.5s after page load if no backup was done today. Account for this in automated browser tests.
- **Delete confirmations**: record deletion uses `confirm()` dialogs.
- **Core smoke test**: open the dashboard, click **记一笔收入**, enter an amount, save, and confirm today/month income updates on the dashboard.
