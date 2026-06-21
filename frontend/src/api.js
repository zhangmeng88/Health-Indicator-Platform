// 后端 API 客户端：统一封装鉴权、请求与各业务接口。
// 替换原型中的 window.storage —— 所有数据均来自真实后端。

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";
const TOKEN_KEY = "hsr_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// 当令牌失效时由 App 注册的回调（跳回登录页）
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = "GET", body, form, auth = true } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  if (res.status === 401) { tokenStore.clear(); onUnauthorized(); throw new Error("登录已失效，请重新登录"); }
  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // 响应不是 JSON：多为代理/网关返回的 404/502 纯文本，说明请求没打到后端。
      const snippet = text.trim().slice(0, 120);
      throw new Error(
        res.ok
          ? `服务器返回了非 JSON 内容：${snippet}`
          : `接口未正确路由 (${res.status})：${snippet}。请检查 API 地址 / 反向代理配置。`
      );
    }
  }
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : (detail ? JSON.stringify(detail) : `请求失败 (${res.status})`));
  }
  return data;
}

async function download(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new Error(res.status === 401 ? "登录已失效" : `导出失败 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  // 认证
  async login(username, password) {
    const data = await request("/auth/login", { method: "POST", form: { username, password }, auth: false });
    tokenStore.set(data.access_token);
    return data;
  },
  logout: () => tokenStore.clear(),
  me: () => request("/auth/me"),

  // 分类层级
  getClassifications: () => request("/classifications"),
  createClassification: (body) => request("/classifications", { method: "POST", body }),
  updateClassification: (id, body) => request(`/classifications/${id}`, { method: "PATCH", body }),
  deleteClassification: (id) => request(`/classifications/${id}`, { method: "DELETE" }),

  // 来源标准
  getSources: () => request("/source-standards"),

  // 指标
  getIndicators: ({ q, classification_id, status = "active" } = {}) => {
    const p = new URLSearchParams({ status });
    if (q) p.set("q", q);
    if (classification_id) p.set("classification_id", classification_id);
    return request(`/indicators?${p.toString()}`);
  },
  getIndicator: (id) => request(`/indicators/${id}`),
  // 管理员直接增改删（立即生效）
  createIndicator: (body) => request("/indicators", { method: "POST", body }),
  updateIndicator: (id, body) => request(`/indicators/${id}`, { method: "PATCH", body }),
  deleteIndicator: (id) => request(`/indicators/${id}`, { method: "DELETE" }),
  getHistory: ({ limit = 300, indicatorId } = {}) => request(`/history?limit=${limit}${indicatorId ? `&indicator_id=${indicatorId}` : ""}`),
  exportHistory: (indicatorId) => download(`/history/export${indicatorId ? `?indicator_id=${indicatorId}` : ""}`, "修改历史.xlsx"),

  // 建议
  getSuggestions: ({ status, type, mine } = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (type) p.set("type", type);
    if (mine) p.set("mine", "true");
    const qs = p.toString();
    return request(`/suggestions${qs ? "?" + qs : ""}`);
  },
  createSuggestion: (body) => request("/suggestions", { method: "POST", body }),
  acceptSuggestion: (id, review_note = "") => request(`/suggestions/${id}/accept`, { method: "POST", body: { review_note } }),
  rejectSuggestion: (id, review_note = "") => request(`/suggestions/${id}/reject`, { method: "POST", body: { review_note } }),

  // 评论
  getComments: (indicatorId) => request(`/indicators/${indicatorId}/comments`),
  addComment: (indicatorId, bodyText) => request(`/indicators/${indicatorId}/comments`, { method: "POST", body: { body: bodyText } }),

  // 账户
  getUsers: () => request("/users"),
  createUser: (body) => request("/users", { method: "POST", body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: "PATCH", body }),
  resetPassword: (id, new_password) => request(`/users/${id}/reset-password`, { method: "POST", body: { new_password } }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  // 导出
  exportExcel: () => download("/export/excel", "卫生统计指标.xlsx"),
  exportWord: () => download("/export/word", "卫生统计指标.docx"),

  // 上传导入（管理员）：上传主表 xlsx 批量导入
  importStandard: async (file, update = false) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/import/xlsx?update=${update ? "true" : "false"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
      body: form,
    });
    if (res.status === 401) { tokenStore.clear(); onUnauthorized(); throw new Error("登录已失效，请重新登录"); }
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch {
        throw new Error(res.ok ? "服务器返回了非 JSON 内容" : `导入失败 (${res.status})：${text.trim().slice(0, 120)}`);
      }
    }
    if (!res.ok) {
      const detail = data?.detail;
      throw new Error(typeof detail === "string" ? detail : (detail ? JSON.stringify(detail) : `导入失败 (${res.status})`));
    }
    return data;
  },
};
