# 单服务镜像：先构建前端，再让后端同时托管前端静态文件与 API。
# 这样前后端同源，无需反向代理 / CORS / 跨服务地址配置。
# 构建上下文 = 仓库根目录（同时包含 frontend/ 与 backend/）。

# ===== 阶段一：构建前端 =====
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE=/api/v1
RUN npm run build      # 产物 -> /fe/dist

# ===== 阶段二：后端 + 托管前端 =====
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /fe/dist ./static

EXPOSE 8000
# 监听 $PORT（Render 注入）；本地默认 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
