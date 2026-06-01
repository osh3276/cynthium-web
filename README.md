# Cynthium Web

## 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API 地址：http://localhost:8000

## 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

页面地址：http://localhost:5173

前端开发服务器已配置 `/api` 代理到后端，开发时无需手动配置 CORS。
