# 健康指标标准修订协作平台 —— 后台架构说明

## 1. 总体架构

采用**前后端分离 + RESTful API**架构：

```
┌─────────────────┐     HTTPS/JSON      ┌──────────────────────────┐
│  前端 (React)    │  ◀──────────────▶  │  后端 API (FastAPI)        │
│  协作平台界面     │   Bearer JWT       │  鉴权 / 业务 / 审核流 / 导出 │
└─────────────────┘                     └────────────┬─────────────┘
                                                      │ SQLAlchemy ORM
                                                      ▼
                                          ┌──────────────────────────┐
                                          │  数据库 (PostgreSQL)       │
                                          │  开发期可用 SQLite          │
                                          └──────────────────────────┘
```

- **前端**：当前交付的 React 原型即对应界面层。生产环境中将其数据层（现为浏览器共享存储）替换为对下述 API 的调用即可。
- **后端**：FastAPI 应用，分为「路由层 → 业务/服务 → ORM 模型 → 数据库」四层。
- **数据库**：开发期 SQLite 零配置启动；生产期仅改 `DATABASE_URL` 即切换 PostgreSQL。

## 2. 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| Web 框架 | FastAPI | 自带 OpenAPI 文档、依赖注入、Pydantic 校验 |
| ORM | SQLAlchemy 2.0 | 模型即 schema，支持迁移 |
| 校验/序列化 | Pydantic v2 | 请求体、响应体强类型 |
| 鉴权 | OAuth2 Password + JWT (python-jose) | 无状态令牌 |
| 密码 | passlib（pbkdf2_sha256） | 单向哈希，不可逆 |
| 导出 | openpyxl / python-docx | Excel 与 Word |
| 部署 | Uvicorn + (Nginx/Gunicorn) | ASGI 服务 |

## 3. 数据模型

与现行标准的列结构一一对应。

```
source_standards (来源标准/部分)
   id, title

classifications (分类层级·自引用树, level=1/2/3)
   id, parent_id→classifications.id, name, level, sort_order

indicators (指标 + 元数据)
   id, classification_id→classifications.id, source_standard_id→source_standards.id
   identifier(标识符), name_cn(中文名称), name_en(英文名称), unit(计量单位),
   definition(定义), method(计算方法), description(指标说明),
   survey_method(调查方法), data_source(数据来源), frequency(发布频率),
   status(active/deleted), version, created_by, created_at, updated_at

users
   id, username, password_hash, display_name, role(admin/expert), is_active

suggestions (建议工作流)
   id, type(add/edit/delete), indicator_id→indicators.id(可空),
   payload(JSON 拟变更字段), rationale(理由), priority(high/mid·仅新增),
   status(pending/accepted/rejected),
   submitted_by, submitted_at, reviewed_by, reviewed_at, review_note

comments
   id, indicator_id→indicators.id, author_id→users.id, body, created_at

audit_logs (审计)
   id, actor_id, action, entity_type, entity_id, detail(JSON), created_at
```

**字段对照**：来源标准/部分→`source_standard`；一级/二级/三级分类→`classifications` 树（level 区分）；标识符→`identifier`；中文/英文名称→`name_cn`/`name_en`；计量单位→`unit`；定义→`definition`；计算方法→`method`；指标说明→`description`；调查方法→`survey_method`；数据来源→`data_source`；发布频率→`frequency`。

## 4. 建议审核工作流（核心）

所有对指标的变更都**不直接落库**，而是先成为待审核建议，由管理员裁决：

```
专家提交建议 ──▶ suggestion(status=pending)
                       │
        管理员审核 ────┤
                       ├─ 采纳 accept ─▶ 应用变更 + status=accepted + 写审计
                       │     · add    → 新建 indicator
                       │     · edit   → 更新字段, version+1
                       │     · delete → indicator.status=deleted（软删除）
                       └─ 驳回 reject ─▶ status=rejected（记录审核意见）
```

- 新增建议带**推荐优先级**：`high` 强烈推荐 / `mid` 中度推荐。
- 修改建议的 `payload` 只含变更字段，前端据此渲染「原值 → 建议值」对照。
- 软删除（`status=deleted`）保留历史，可追溯、可恢复。

## 5. 权限模型（RBAC）

| 角色 | 权限 |
|------|------|
| 管理员 admin | 账户管理、重置密码、分类层级增改删、采纳/驳回建议、导出、查看全部建议与审计 |
| 评审专家 expert | 浏览指标、提交新增/修改/删除建议、评论、查看「我的建议」 |

实现：JWT 携带 `sub=username`；`get_current_user` 解析令牌→用户；`require_admin` 依赖在管理员接口前置校验，非管理员返回 403。

## 6. API 一览（前缀 `/api/v1`）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/auth/login` | 公开 | 登录获取 JWT |
| GET | `/auth/me` | 登录 | 当前用户 |
| GET/POST | `/users` | 管理员 | 列出/创建专家账户 |
| PATCH/DELETE | `/users/{id}` | 管理员 | 更新/删除账户 |
| POST | `/users/{id}/reset-password` | 管理员 | 重置密码 |
| GET | `/classifications` | 登录 | 分类树 |
| POST/PATCH/DELETE | `/classifications/{id}` | 管理员 | 维护层级 |
| GET | `/indicators` | 登录 | 列表（搜索/分类/状态） |
| GET | `/indicators/{id}` | 登录 | 详情 |
| GET | `/source-standards` | 登录 | 来源标准列表 |
| GET/POST | `/suggestions` | 登录 | 列出/提交建议 |
| POST | `/suggestions/{id}/accept` | 管理员 | 采纳 |
| POST | `/suggestions/{id}/reject` | 管理员 | 驳回 |
| GET/POST | `/indicators/{id}/comments` | 登录 | 评论 |
| GET | `/export/excel` · `/export/word` | 管理员 | 导出（列序与主表一致） |

交互式文档：启动后访问 `/docs`（Swagger UI）。

## 7. 部署建议

1. **数据库**：生产用 PostgreSQL，设 `DATABASE_URL=postgresql+psycopg2://...`。
2. **迁移**：引入 Alembic 管理表结构演进，替代开发期的 `create_all`。
3. **进程**：`gunicorn -k uvicorn.workers.UvicornWorker app.main:app`，前置 Nginx 处理 HTTPS 与静态前端。
4. **配置**：所有密钥经环境变量注入；`SECRET_KEY` 使用足够长的随机串。
5. **容器化**：前端、后端、数据库分别打包，docker-compose 编排。

## 8. 安全要点

- 密码仅存哈希（pbkdf2_sha256），后台不可见明文；重置密码即覆盖哈希。
- 全部写操作经 JWT 鉴权 + 角色校验；指标变更必经审核流，杜绝越权直改。
- 关键动作（采纳/驳回、账户操作）写入 `audit_logs`，可审计追溯。
- 软删除保留数据，支持版本号追踪修订历史。

## 9. 后续演进

- 指标级**版本快照与差异回溯**（保存每次采纳前后的完整版本）。
- 建议的**多专家会签/投票**与意见汇总。
- 导出**留痕与版本号**、生成标准送审稿封面与前言。
- 与现有 `2018卫生统计指标.xlsx` 的**批量导入**（一次性灌入全部历史指标）。
