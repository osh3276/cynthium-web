# Cynthium Web

## Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API at http://localhost:8000

## Start the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

App at http://localhost:5173

The frontend dev server proxies `/api` requests to the backend, so no manual CORS config is needed during development.
