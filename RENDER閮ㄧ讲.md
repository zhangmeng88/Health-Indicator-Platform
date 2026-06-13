# 部署到 Render（单服务，零手动配置）

本工程已内置 `render.yaml`，采用**单服务**方案：一个 Web 服务同时托管「前端 + API」，外加一个托管 PostgreSQL。前后端**同源**——不需要反向代理、不需要 CORS、不需要在控制台填任何地址。Apply 完，打开那一个网址就能直接用。

## 步骤

1. 注册 [Render](https://render.com)，把本工程推到 GitHub/GitLab 仓库（确保 `render.yaml` 与 `Dockerfile` 在仓库**根目录**）。
2. Render 控制台 → **New → Blueprint** → 选择你的仓库。
3. 系统列出将创建的资源：数据库 `hsr-db` 与服务 `hsr`。会提示输入 **ADMIN_PASSWORD**，填一个强密码。
4. 点 **Apply**，等待构建完成（首次需构建前端 + 后端镜像，约几分钟）。
5. 打开 `hsr` 服务的网址 → 直接是登录页 → 用 `admin` + 你设的密码登录。

就这些。没有反代、没有跨域、没有第二个服务要配。

## 导入现有标准

登录后 → 左侧 **「导入 / 导出」** → **「上传现有标准」** → 选择 `2018卫生统计指标完整.xlsx` → 开始导入。按标识符去重，可重复上传。

## 注意事项（免费档）

- **免费实例**闲置会休眠，下次访问有几十秒冷启动；正式使用把服务 `plan` 改为付费档（如 `starter`）。
- **免费 PostgreSQL** 有存续期限制，正式使用请选付费实例并配置备份。
- 改 `plan` 只需编辑 `render.yaml` 后重新 Apply。

## 自定义域名（可选）

服务 **Settings → Custom Domains** 添加域名，按提示配 DNS，Render 自动签发 HTTPS 证书。

---

## 它是怎么做到“零配置”的

`Dockerfile`（仓库根目录）分两阶段：先用 Node 构建前端，再把构建产物 `dist/` 拷进后端镜像的 `static/`；FastAPI 启动时检测到 `static/` 便同时托管前端页面与 `/api/v1` 接口。于是浏览器访问的页面和它调用的接口在**同一个域名**下，天然同源——这就免掉了之前多服务方案里反向代理和 CORS 的全部手动配置。

## 其它部署方式（可选）

- **本机一键**：`docker compose up -d --build`（见根 `README.md`），三容器（db + 后端 + 前端 nginx），适合本地/内网。
- 单服务镜像也可本机直接跑：`docker build -t hsr . && docker run -p 8000:8000 -e DATABASE_URL=... hsr`。

## 排查：启动报 “could not translate host name dpg-...”

这是后端连不上数据库（内网主机名解析失败），两种原因与处理：

1. **首次部署数据库晚于服务上线**：后端已内置启动重试（最多等约 90 秒），通常会自愈；若仍失败，在服务页点 **Manual Deploy → Restart** 再试一次。
2. **服务与数据库不在同一区域**：内网主机名只能同区域解析。`render.yaml` 已把两者都钉在 `oregon`。若你之前用旧 Blueprint 建过别的区域的 `hsr-db`：请先在控制台**删除旧的 `hsr-db` 数据库和 `hsr` 服务**，再重新 **Apply** Blueprint，让两者在同区域一起新建。

> 如需更低的中国访问延迟，可把 `render.yaml` 里数据库与服务的 `region` **同时**改为 `singapore` 后重新 Apply（务必两处一致）。
