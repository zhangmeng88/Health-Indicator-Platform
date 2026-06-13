# 健康指标标准修订协作平台 · 后端

FastAPI + SQLAlchemy 实现的协作平台后端：账户与权限、分类层级、指标元数据、建议审核工作流、Word/Excel 导出。

## 快速开始

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # 按需修改密钥与数据库

uvicorn app.main:app --reload   # 启动，默认 http://localhost:8000
```

首次启动自动建表并播种：管理员 `admin / admin123`、示例专家 `expert / expert123`、示例分类与指标。

- 交互式 API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health

## 冒烟测试

```bash
python smoke_test.py
```

覆盖：登录 → 建账号 → 重置密码 → 提交建议（新增/修改）→ 管理员采纳 → 指标入库/字段更新 → 评论 → 权限隔离 → 导出。

## 目录结构

```
backend/
├── app/
│   ├── main.py            应用入口（CORS、路由注册、建表、播种）
│   ├── config.py          配置（环境变量）
│   ├── database.py        引擎/会话/Base
│   ├── models.py          ORM 模型（与标准字段对应）
│   ├── schemas.py         Pydantic 请求/响应模型
│   ├── security.py        密码哈希、JWT、权限依赖
│   ├── utils.py           序列化辅助、审计
│   ├── seed.py            初始数据
│   └── routers/           auth/users/classifications/indicators/suggestions/comments/export
├── requirements.txt
├── .env.example
├── ARCHITECTURE.md        架构说明
└── smoke_test.py
```

## 批量导入主表

把《卫生统计指标》主表（.xlsx）全量导入数据库：

```bash
python scripts/import_xlsx.py /path/to/2018卫生统计指标完整.xlsx
python scripts/import_xlsx.py data.xlsx --update   # 已存在标识符则更新
```

- 按表头名定位列（列序变动也兼容）；
- 来源标准、一级/二级/三级分类自动去重；指标按「标识符」去重；
- **幂等**：可在已播种或已导入的库上重复运行（重复项自动跳过）。

实测：完整版导入 270 条指标、8 个来源标准、37 个分类节点（一级 8 / 二级 24 / 三级 5），其中 27 条挂在三级分类下。

## 切换 PostgreSQL（生产）

```
DATABASE_URL=postgresql+psycopg2://hsr:password@localhost:5432/hsr
```

生产环境建议引入 Alembic 管理迁移，并替换 `SECRET_KEY`。
