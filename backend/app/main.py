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
    import os, time
    from sqlalchemy.exc import OperationalError
    reset = os.getenv("RESET_DB", "").lower() in ("1", "true", "yes")
    # 等待数据库就绪再建表（Render 等平台首次部署时数据库可能晚于服务上线）
    last_err = None
    for attempt in range(1, 31):          # 最多约 90 秒
        try:
            if reset:
                print("[startup] RESET_DB 已开启：删除并按当前模型重建所有表…", flush=True)
                Base.metadata.drop_all(bind=engine)
            Base.metadata.create_all(bind=engine)
            last_err = None
            break
        except OperationalError as e:
            last_err = e
            print(f"[startup] 数据库尚未就绪，第 {attempt}/30 次重试…", flush=True)
            time.sleep(3)
    if last_err is not None:
        raise last_err
    _light_migrate()                       # 给已存在的表补充新增列（不丢数据）
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    yield


def _light_migrate():
    """增量迁移：为已存在的 indicators 表补充模型新增的列（不删表、不丢数据）。
    create_all 不会修改已存在的表，因此这里用 ALTER TABLE 补列并回填默认值。"""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    if not insp.has_table("indicators"):
        return
    existing = {c["name"] for c in insp.get_columns("indicators")}
    json_type = "JSON" if engine.dialect.name != "sqlite" else "TEXT"
    additions = [("stratification", "TEXT"), ("source_other", "VARCHAR(512)"), ("source_tags", json_type)]
    added = []
    for name, coltype in additions:
        if name not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE indicators ADD COLUMN {name} {coltype}"))
            added.append(name)
    if added:
        # 回填默认值，避免旧行为 NULL 导致序列化报错
        with engine.begin() as conn:
            conn.execute(text("UPDATE indicators SET stratification='' WHERE stratification IS NULL"))
            conn.execute(text("UPDATE indicators SET source_other='' WHERE source_other IS NULL"))
            conn.execute(text("UPDATE indicators SET source_tags='[]' WHERE source_tags IS NULL"))
        print(f"[migrate] indicators 已补充列：{', '.join(added)}", flush=True)


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


import logging as _logging
import traceback as _traceback
from fastapi import Request as _Request
from fastapi.responses import JSONResponse as _JSONResponse

_logger = _logging.getLogger("app")


@app.exception_handler(Exception)
async def _unhandled_error(request: _Request, exc: Exception):
    """把未捕获异常的堆栈打到日志，并以 JSON 形式返回具体错误信息（便于排查）。"""
    _logger.error("未处理异常 %s %s\n%s", request.method, request.url.path, _traceback.format_exc())
    return _JSONResponse(status_code=500, content={"detail": f"服务器内部错误：{type(exc).__name__}: {exc}"})


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
