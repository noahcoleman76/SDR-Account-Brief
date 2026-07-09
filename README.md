# Account Briefs for Outreach

A local unpacked Chrome extension that imports Salesforce Excel report exports, matches the current Outreach call task to an account or prospect, and displays a concise sales call briefing.

The MVP stores imported data locally in browser IndexedDB. It can call a local Node server at `http://localhost:8787` for OpenAI-generated briefs, and falls back to deterministic local rules when the server is unavailable.

## What It Does

- Imports a modern `.xlsx` Excel workbook with these tabs:
  - `Accounts`
  - `Opportunities`
  - `Contacts`
  - `Leads`
- Stores imported Salesforce data locally in IndexedDB.
- Runs only on Outreach pages.
- Detects visible account, prospect email, and prospect name context from the Outreach page.
- Matches by prospect email first, then normalized/fuzzy account name.
- When the local server is running, uses AI to choose the most likely related imported account and associated opportunities, contacts, and leads from candidate Salesforce records.
- If the imported dataset has no useful account detail, the local server can use OpenAI web search to enrich the brief from public information.
- Injects a right-side Account Brief panel with:
  - Why I'm Calling
  - Recommended Opening Line
  - Previous Conversations
  - Known Contacts / Leads
  - Recent Interesting Moments
  - Opportunity History
  - Suggested NICE Products / Angles
  - Next Best Action
- Shows possible account matches when matching is ambiguous.
- Provides copy buttons for the key sections and full brief.

## Install

```bash
npm install
```

## Configure Local AI Server

Create `.env.local` in the project root:

```bash
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
```

Do not commit `.env.local`. It is already ignored by Git.

The extension never stores an OpenAI API key in its source code. The key is read only by the local Node server.

## Run Locally

Start the extension dev build:

```bash
npm run dev
```

Start the local brief server:

```bash
npm run server
```

Or run both together:

```bash
npm run dev:all
```

The server exposes:

- `GET http://localhost:8787/health`
- `POST http://localhost:8787/brief`

## Keep The Local Server Running

On Windows, install a user-level scheduled task that starts the local server whenever you log in:

```bash
npm run server:startup:install
```

This starts `npm run server` from this project folder and keeps `http://localhost:8787` available after login.

To remove the startup task:

```bash
npm run server:startup:uninstall
```

If you change `.env.local` or update server code, restart the task from Windows Task Scheduler or run:

```bash
npm run server
```

## Build Extension

```bash
npm run build
```

The built unpacked extension is written to `dist/`.

## Load In Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project `dist/` folder.
6. Pin `Account Briefs for Outreach` if desired.

## Import Salesforce Workbook

1. Click the extension icon.
2. Click `Open Options`.
3. Upload the Salesforce Excel workbook.
4. Confirm the import summary:
   - accounts
   - opportunities
   - contacts
   - leads

Re-importing replaces the existing local dataset. `Clear Imported Data` removes the IndexedDB data.

## Use Inside Outreach

1. Start `npm run server` if you want AI-generated briefs.
2. Open an Outreach call task page.
3. The extension checks `http://localhost:8787/health`.
4. If the server is running, the panel requests an AI-generated brief from the local server.
5. The server first tries to resolve the best imported Salesforce account and related records. If the workbook has no useful account detail, it may use web search for public account context.
6. If the server is unavailable, the panel warns:

```text
Local brief server is not running.
Open a terminal and run npm run server.
```

The panel still generates a deterministic local brief from imported Salesforce data.

## Troubleshooting

If the panel says the local server is unavailable:

1. Open a terminal in this project.
2. Run `npm run server`.
3. Confirm `http://localhost:8787/health` returns `{ "ok": true }`.
4. Click `Retry` in the Outreach panel.

If no account matches:

- Confirm the workbook imported successfully.
- Confirm the Outreach page visibly contains the prospect email or account name.
- Use the manual possible-match selector if multiple similar accounts are shown.

## Development Notes

- Manifest V3 extension.
- React + Vite + TypeScript UI.
- IndexedDB via `idb`.
- Excel parsing via `read-excel-file`. SheetJS `xlsx` was intentionally avoided because npm reports unresolved high-severity advisories for that package.
- Local server uses Express, CORS, dotenv, and OpenAI.
- AI matching and web search run only in the local Node server, not in the Chrome extension source.
- No backend is required for deterministic fallback behavior.
- The current OpenAI integration is intentionally local-only. For a shared or production deployment, move the OpenAI request behind a secured backend and have the extension call that backend instead of handling AI generation directly.

## Verification

```bash
npm run build
```

This runs TypeScript checks and builds the unpacked extension into `dist/`.
