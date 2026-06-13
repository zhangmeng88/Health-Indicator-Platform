FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 仅依赖文件先拷贝，利用层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# 监听 $PORT（Render 等平台注入）；本地/compose 未设置时默认 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
