# Trade Intelligence

Local-first market intelligence workspace for BIST, US stocks, crypto, commodities, funds, and portfolio tracking.

## Stack

- Frontend: Next.js 16 on `http://localhost:3000`
- Python engine: FastAPI on `http://127.0.0.1:3003`
- Data flow: frontend calls the engine through `/api/python/...`

## One-click startup on Windows

Use:

```powershell
.\RUN_ALL.bat
```

What it does:

- checks Node.js and Python
- creates `engine-python\.venv` if missing
- installs frontend and Python dependencies when lockfiles change
- frees ports `3000` and `3003`
- starts the frontend and Python engine
- waits for health checks
- runs a quick system verification
- opens the browser automatically

Logs are written to:

- `.run/frontend.out.log`
- `.run/frontend.err.log`
- `.run/engine.out.log`
- `.run/engine.err.log`

## Manual startup

Frontend:

```powershell
npm install
npm run dev
```

Python engine:

```powershell
cd engine-python
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 3003
```

## Verification

Quick system verification:

```powershell
npm run check:system
```

This checks:

- engine health
- frontend availability
- BIST list response
- US market response
- crypto market response

## Notes

- `RUN_ALL.bat` is the recommended entry point on a fresh Windows machine.
- The first cold start can be slower because dependency installation and data caches are created.
- Some valuation-style fields outside BIST are intentionally category-specific:
  - US: analyst-target-backed fair value
  - Crypto: reference band instead of true fair value
  - Funds and commodities: score-first decision model

## Disclaimer

This project is a decision-support system, not investment advice.
