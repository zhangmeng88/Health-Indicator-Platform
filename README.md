# 健康指标标准修订协作平台 · 一键启动

前端（React/Vite + nginx）+ 后端（FastAPI）+ 数据库（PostgreSQL），用 Docker Compose 一条命令拉起。

## 先决条件

安装 Docker Desktop（或 Docker Engine + Compose 插件）。其余依赖（Node、Python、PostgreSQL）都在容器内，无需在本机安装。

## 启动

```bash
cp .env.example .env        # 可选：修改密钥与初始管理员密码
docker compose up -d --build
```

启动后：

- 平台界面： http://localhost:8080 　（管理员 `admin` / `admin123`）
- 后端 API 文档： http://localhost:8000/docs
- 数据库： localhost:5432（账号见 `.env`）

首次启动后端会自动建表并播种（管理员 + 示例专家 + 示例数据）。

## 导入完整指标数据（可选）

1. 把 `2018卫生统计指标完整.xlsx` 放入项目根目录的 `./data/` 文件夹。
2. 运行一次性导入：

```bash
docker compose --profile import run --rm importer
```

如文件名不同，自定义命令：

```bash
docker compose --profile import run --rm importer \
  python scripts/import_xlsx.py /data/你的文件名.xlsx
```

导入脚本幂等，可重复运行（已存在标识符自动跳过；加 `--update` 则更新）。

## 常用命令

```bash
docker compose logs -f backend      # 查看后端日志
docker compose ps                   # 查看服务状态
docker compose down                 # 停止并移除容器（数据库数据保留在卷中）
docker compose down -v              # 连同数据库数据一起清空
docker compose up -d --build        # 改代码后重新构建并启动
```

## 架构说明

```
浏览器 ──▶ frontend (nginx:80 → 宿主 8080)
                │  /            静态前端（SPA）
                │  /api/v1/...  反向代理 ──▶ backend (uvicorn:8000)
                                                  │ SQLAlchemy
                                                  ▼
                                              db (postgres:5432, 数据持久化于 pgdata 卷)
```

- 前端以**相对地址** `/api/v1` 调后端，经 nginx 同源反代，**无跨域问题**。
- 后端通过服务名 `db` 连接数据库；`DATABASE_URL` 已在 compose 中配好。
- 数据库数据保存在命名卷 `pgdata`，容器重启不丢失。

各子项目的独立说明见 `backend/README.md`、`backend/ARCHITECTURE.md`、`frontend/README.md`。

## 部署到云端（Render）

无需自备服务器，可用内置的 `render.yaml` 一键部署到 [Render](https://render.com)（托管 PostgreSQL + 后端 + 前端）。详见 **`RENDER部署.md`**。
