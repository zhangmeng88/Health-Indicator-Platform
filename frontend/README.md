# 健康指标标准修订协作平台 · 前端

React + Vite 单页应用，**通过真实后端 API** 完成全部数据读写（已替换原型中的浏览器本地存储）。

## 快速开始

确保后端已启动（默认 http://localhost:8000）。

```bash
cd frontend
npm install
cp .env.example .env        # 如后端地址不同则修改 VITE_API_BASE
npm run dev                 # 开发服务器 http://localhost:5173
```

构建生产包：

```bash
npm run build               # 产物输出到 dist/
npm run preview             # 本地预览生产包
```

## 与后端的对接

- 所有接口封装在 `src/api.js`，基地址由 `VITE_API_BASE` 注入（默认 `http://localhost:8000/api/v1`）。
- 登录采用 OAuth2 表单方式，成功后将 JWT 存入 `localStorage`，后续请求自动携带 `Authorization: Bearer`。
- 令牌失效（401）时自动清除并跳回登录页。
- 字段命名与后端一致（`name_cn`/`identifier`/`classification_id`/`source_standard_id` 等），无需中间映射层。

> 后端需允许本前端来源的 CORS（见后端 `.env` 的 `CORS_ORIGINS`，默认已含 `http://localhost:5173`）。

## 功能对照

| 模块 | 调用的后端接口 |
|------|----------------|
| 登录 / 当前用户 | `POST /auth/login`，`GET /auth/me` |
| 指标浏览 / 详情 | `GET /indicators`，`GET /indicators/{id}` |
| 建议（增/改/删） | `POST /suggestions` |
| 建议审核（采纳/驳回） | `POST /suggestions/{id}/accept`、`/reject` |
| 评论 | `GET/POST /indicators/{id}/comments` |
| 分类层级维护 | `GET/POST/PATCH/DELETE /classifications` |
| 专家账户 / 重置密码 | `GET/POST/DELETE /users`，`POST /users/{id}/reset-password` |
| 导出 Word / Excel | `GET /export/word`、`/export/excel` |

## 目录

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── src/
    ├── main.jsx        入口
    ├── index.css       Tailwind
    ├── api.js          API 客户端（令牌、所有接口、文件下载）
    └── App.jsx         全部界面（登录/浏览/审核/层级/账户/导出）
```
