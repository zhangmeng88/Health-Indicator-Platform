"""应用入口：创建表、播种、注册路由、配置 CORS。

启动：uvicorn app.main:app --reload
文档：http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine, SessionLocal
from . import models  # noqa: F401  确保模型被注册
from .seed import seed
from .routers import auth, users, classifications, indicators, suggestions, comments, export, imports, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    import time
    from sqlalchemy.exc import OperationalError
    # 等待数据库就绪再建表（Render 等平台首次部署时数据库可能晚于服务上线）
    last_err = None
    for attempt in range(1, 31):          # 最多约 90 秒
        try:
            Base.metadata.create_all(bind=engine)
            last_err = None
            break
        except OperationalError as e:
            last_err = e
            print(f"[startup] 数据库尚未就绪，第 {attempt}/30 次重试…", flush=True)
            time.sleep(3)
    if last_err is not None:
        raise last_err
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    yield


app = FastAPI(title="健康指标标准修订协作平台 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"
for r in (auth, users, classifications, indicators, suggestions, comments, export, imports, history):
    app.include_router(r.router, prefix=API)


@app.get("/health", tags=["健康检查"])
def health():
    return {"status": "ok"}


# ----- 单服务部署：由后端托管已构建的前端（存在 static/ 时启用）-----
import os
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_STATIC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

if os.path.isdir(_STATIC):
    _assets = os.path.join(_STATIC, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _INDEX = os.path.join(_STATIC, "index.html")

    @app.get("/", include_in_schema=False)
    async def _spa_root():
        return FileResponse(_INDEX)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa_fallback(full_path: str):
        # API / 文档 等未匹配路径仍返回 JSON 404，避免把 HTML 当接口响应
        if full_path.startswith(("api", "health", "docs", "redoc", "openapi")):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = os.path.join(_STATIC, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_INDEX)  # 单页应用回退
