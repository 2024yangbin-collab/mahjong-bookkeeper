# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Single-file client-side web app (`index.html`) — **麻将馆记账本** (Mahjong Parlor Accounting Book). No build step, package manager, backend, or database. Data persists in browser `localStorage`.

### Running the app

Start a static HTTP server from the repo root:

```bash
python3 -m http.server 8080
```

Open http://localhost:8080/index.html in a browser. Python 3 is preinstalled on the VM; Node.js is optional (only needed if you prefer `npx serve`).

**Prefer HTTP over `file://`** — serving over HTTP avoids `file://` origin quirks and matches how E2E/browser testing works.

### Lint / test / build

There is no linter, test suite, or build pipeline in this repository. Verification is manual or browser-based: confirm the page loads (HTTP 200) and exercise core flows (add income/expense, view 流水/月报 tabs, export/import JSON).

### Key localStorage keys

- `mj_accounting_records` — transaction records
- `mj_last_backup_date` — last auto-backup date
- `mj_auto_backup_enabled` — auto-backup toggle (default: on)

### Gotchas

- **Auto-backup on load**: On first visit each day with existing records, the app may trigger a silent JSON download. Disable via the "关闭" toggle under 数据管理 if downloads interfere with automated testing.
- **No git hooks**: No pre-commit or lint-staged configuration.
- **Chinese UI**: Labels and categories are in Chinese (e.g. 台费, 记一笔收入).
