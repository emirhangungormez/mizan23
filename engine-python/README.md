# mizan23 Engine

Python backend for the mizan23 workspace.

## Runs on

- Host: `127.0.0.1`
- Port: `3003`

## Main responsibilities

- market data fetching
- scoring and ranking
- valuation and reference-band calculations
- portfolio analysis
- snapshot and cache management

## Setup

```powershell
cd engine-python
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

## Run

```powershell
.\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 3003
```

## Health

```powershell
Invoke-WebRequest http://127.0.0.1:3003/api/health
```

## Important routes

- `GET /api/health`
- `GET /api/market/bist/stocks`
- `GET /api/market/analysis/us-stocks`
- `GET /api/market/analysis/crypto`
- `GET /api/market/analysis/commodities`
- `GET /api/market/analysis/funds`
- `POST /api/portfolio/{id}/analyze`

## Dependency source

Install from:

```powershell
.\.venv\Scripts\python -m pip install -r requirements.txt
```

The root `RUN_ALL.bat` script already handles this automatically on Windows.
