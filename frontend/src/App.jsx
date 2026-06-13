import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LogIn, LogOut, RefreshCw, Users, ListTree, ClipboardCheck, Download,
  Search, Plus, Pencil, Trash2, MessageSquare, Check, X, ChevronRight,
  ChevronDown, KeyRound, ShieldCheck, FileText, FileSpreadsheet,
  AlertCircle, Layers, BookOpen, Clock, UserPlus, Star, Upload
} from "lucide-react";
import { api, tokenStore, setUnauthorizedHandler } from "./api";

/* ================= 字段与常量（后端原生命名） ================= */
const META_FIELDS = [
  { key: "source_standard_id", label: "来源标准/部分", type: "source", span2: true },
  { key: "identifier",   label: "标识符" },
  { key: "name_cn",      label: "中文名称" },
  { key: "name_en",      label: "英文名称", span2: true },
  { key: "unit",         label: "计量单位" },
  { key: "frequency",    label: "发布频率" },
  { key: "definition",   label: "定义", long: true, span2: true },
  { key: "method",       label: "计算方法", long: true, span2: true },
  { key: "description",  label: "指标说明", long: true, span2: true },
  { key: "survey_method",label: "调查方法" },
  { key: "data_source",  label: "数据来源" },
];
const DETAIL_ORDER = ["source_standard_id","identifier","name_en","unit","definition","method","description","survey_method","data_source","frequency"];
const FIELD_LABEL = { ...Object.fromEntries(META_FIELDS.map((f) => [f.key, f.label])), classification_id: "所属分类" };
const TEXT_KEYS = ["identifier","name_cn","name_en","unit","definition","method","description","survey_method","data_source","frequency"];
const LEVEL_NAME = ["一级分类", "二级分类", "三级分类"];

const PRIORITY = {
  high: { label: "强烈推荐", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  mid:  { label: "中度推荐", cls: "bg-amber-100 text-amber-700 border-amber-200" },
};
const STATUS = {
  pending:  { label: "待审核", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  accepted: { label: "已采纳", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rejected: { label: "已驳回", cls: "bg-rose-100 text-rose-700 border-rose-200" },
};
const SUG_TYPE = {
  edit:   { label: "修改指标", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  delete: { label: "删除指标", cls: "bg-rose-100 text-rose-700 border-rose-200" },
  add:    { label: "新增指标", cls: "bg-teal-100 text-teal-800 border-teal-200" },
};
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "");

/* ================= 分类树工具 ================= */
function flatten(nodes, path = [], out = []) {
  for (const n of nodes) {
    const p = [...path, { id: n.id, name: n.name }];
    out.push({ id: n.id, name: n.name, depth: p.length - 1, path: p, hasChildren: (n.children || []).length > 0 });
    if (n.children?.length) flatten(n.children, p, out);
  }
  return out;
}
function findPath(nodes, id, path = []) {
  for (const n of nodes) {
    const p = [...path, n.name];
    if (n.id === id) return p;
    if (n.children?.length) { const r = findPath(n.children, id, p); if (r) return r; }
  }
  return null;
}
const srcTitle = (sources, id) => sources.find((s) => s.id === id)?.title || "";

/* ================= 通用组件 ================= */
const Badge = ({ children, cls }) => <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
const Btn = ({ children, onClick, variant = "primary", size = "md", disabled, type = "button" }) => {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = { primary: "bg-teal-700 text-white hover:bg-teal-800", ghost: "text-slate-600 hover:bg-slate-100", outline: "border border-slate-300 text-slate-700 hover:bg-slate-50", danger: "bg-rose-600 text-white hover:bg-rose-700", success: "bg-emerald-600 text-white hover:bg-emerald-700" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]}`}>{children}</button>;
};
const Field = ({ label, children, hint, span2 }) => (
  <label className={`block ${span2 ? "col-span-2" : ""}`}>
    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">{label}</span>
    {children}{hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
);
const inputCls = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
    <div className={`my-4 w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-xl bg-white shadow-2xl`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  </div>
);
const Empty = ({ icon: Icon, text }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400"><Icon size={32} strokeWidth={1.5} /><p className="text-sm">{text}</p></div>
);

/* ================= 主应用 ================= */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("browse");
  const [toast, setToast] = useState(null);
  const [hierarchy, setHierarchy] = useState([]);
  const [sources, setSources] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [users, setUsers] = useState([]);

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 2600); }, []);
  const guard = useCallback(async (fn) => { try { return await fn(); } catch (e) { flash(e.message || "操作失败"); } }, [flash]);

  const reloadIndicators = useCallback(async () => setIndicators(await api.getIndicators({ status: "active" })), []);
  const reloadSuggestions = useCallback(async (u = user) => setSuggestions(await api.getSuggestions(u?.role === "admin" ? {} : { mine: true })), [user]);
  const reloadHierarchy = useCallback(async () => setHierarchy(await api.getClassifications()), []);
  const reloadUsers = useCallback(async () => setUsers(await api.getUsers()), []);

  const loadAll = useCallback(async (u) => {
    const tasks = [api.getClassifications(), api.getSources(), api.getIndicators({ status: "active" }),
      api.getSuggestions(u.role === "admin" ? {} : { mine: true })];
    if (u.role === "admin") tasks.push(api.getUsers());
    const [h, s, inds, sugs, us] = await Promise.all(tasks);
    setHierarchy(h); setSources(s); setIndicators(inds); setSuggestions(sugs); if (us) setUsers(us);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { setUser(null); });
    (async () => {
      if (tokenStore.get()) {
        try { const u = await api.me(); setUser(u); setTab(u.role === "admin" ? "review" : "browse"); await loadAll(u); }
        catch { tokenStore.clear(); }
      }
      setBooting(false);
    })();
  }, [loadAll]);

  const handleLogin = async (username, password) => {
    await api.login(username, password);
    const u = await api.me();
    setUser(u); setTab(u.role === "admin" ? "review" : "browse");
    await loadAll(u);
  };
  const handleLogout = () => { api.logout(); setUser(null); setIndicators([]); setSuggestions([]); setUsers([]); setHierarchy([]); };

  if (booting) return <div className="flex h-screen items-center justify-center text-slate-400"><RefreshCw className="animate-spin" size={20} /><span className="ml-2 text-sm">正在连接服务…</span></div>;
  if (!user) return <Login onLogin={handleLogin} toast={toast} />;

  const pending = suggestions.filter((s) => s.status === "pending").length;
  const adminTabs = [
    { id: "browse", label: "指标总览", icon: BookOpen },
    { id: "review", label: "建议审核", icon: ClipboardCheck, badge: pending },
    { id: "hierarchy", label: "分类层级", icon: ListTree },
    { id: "accounts", label: "专家账户", icon: Users },
    { id: "export", label: "导入 / 导出", icon: Download },
  ];
  const expertTabs = [
    { id: "browse", label: "指标浏览与编辑", icon: BookOpen },
    { id: "mine", label: "我的建议", icon: ClipboardCheck },
  ];
  const tabs = user.role === "admin" ? adminTabs : expertTabs;
  const ctx = { user, hierarchy, sources, indicators, suggestions, users, flash, guard,
    reloadIndicators, reloadSuggestions, reloadHierarchy, reloadUsers };

  return (
    <div className="flex min-h-screen w-full bg-slate-100 font-sans text-slate-800">
      <aside className="flex w-60 shrink-0 flex-col bg-teal-900 text-teal-50">
        <div className="border-b border-teal-800/60 px-5 py-5"><div className="flex items-center gap-2"><Layers size={22} className="text-teal-300" /><span className="text-sm font-semibold leading-tight">健康指标标准<br />修订协作平台</span></div></div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {tabs.map((t) => { const Icon = t.icon; const active = tab === t.id; return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-teal-700 text-white" : "text-teal-100 hover:bg-teal-800/60"}`}>
              <Icon size={17} /><span className="flex-1 text-left">{t.label}</span>
              {t.badge > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">{t.badge}</span>}
            </button>); })}
        </nav>
        <div className="border-t border-teal-800/60 px-4 py-3 text-xs text-teal-200">
          <div className="mb-2 flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-[11px] font-bold">{user.display_name.slice(0, 1)}</div>
            <div className="leading-tight"><div className="font-medium text-teal-50">{user.display_name}</div><div>{user.role === "admin" ? "管理员" : "评审专家"}</div></div></div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-teal-200 hover:text-white"><LogOut size={14} /> 退出登录</button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-lg font-semibold text-slate-800">{tabs.find((t) => t.id === tab)?.label}</h1>
          <Btn variant="ghost" size="sm" onClick={() => guard(async () => { await loadAll(user); flash("已刷新最新数据"); })}><RefreshCw size={14} /> 刷新数据</Btn>
        </header>
        <div className="min-w-0 flex-1 overflow-auto p-6">
          {tab === "browse" && <Browse {...ctx} />}
          {tab === "review" && <Review {...ctx} />}
          {tab === "hierarchy" && <Hierarchy {...ctx} />}
          {tab === "accounts" && <Accounts {...ctx} />}
          {tab === "export" && <Export {...ctx} />}
          {tab === "mine" && <MySuggestions {...ctx} />}
        </div>
      </main>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ----------------------------- 登录 ----------------------------- */
function Login({ onLogin, toast }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const submit = async () => { setErr(""); setBusy(true); try { await onLogin(u, p); } catch (e) { setErr(e.message || "登录失败"); } finally { setBusy(false); } };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-900 to-slate-800 p-4 font-sans">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white"><Layers size={24} /></div>
          <h1 className="text-lg font-semibold text-slate-800">健康指标标准修订协作平台</h1>
          <p className="mt-1 text-xs text-slate-500">专家协作 · 元数据评审 · 标准导出</p>
        </div>
        <div className="space-y-3">
          <Field label="用户名"><input className={inputCls} value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="请输入用户名" /></Field>
          <Field label="密码"><input type="password" className={inputCls} value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="请输入密码" /></Field>
          <Btn onClick={submit} disabled={busy}><LogIn size={16} /> {busy ? "登录中…" : "登录"}</Btn>
        </div>
        <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500"><p className="font-medium text-slate-600">演示账户</p><p>管理员：admin / admin123</p><p>专家：expert / expert123</p></div>
        {(err || toast) && <p className="mt-3 text-center text-xs text-rose-600">{err || toast}</p>}
      </div>
    </div>
  );
}

/* -------------------- 指标浏览与编辑 -------------------- */
function Browse(ctx) {
  const { hierarchy, sources, indicators, user } = ctx;
  const [q, setQ] = useState(""); const [classFilter, setClassFilter] = useState("all");
  const [selId, setSelId] = useState(null); const [modal, setModal] = useState(null);
  const flat = useMemo(() => flatten(hierarchy), [hierarchy]);
  const filtered = indicators.filter((i) => {
    const okQ = !q || (i.name_cn || "").includes(q) || (i.identifier || "").toLowerCase().includes(q.toLowerCase());
    const okC = classFilter === "all" || i.classification_id === Number(classFilter);
    return okQ && okC;
  });
  const sel = indicators.find((i) => i.id === selId) || null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <div className="mb-3 flex flex-col gap-2">
          <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input className={`${inputCls} pl-9`} placeholder="搜索中文名称 / 标识符" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex gap-2">
            <select className={inputCls} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">全部分类</option>
              {flat.map((f) => <option key={f.id} value={f.id}>{"　".repeat(f.depth) + f.name}</option>)}
            </select>
            <Btn size="sm" onClick={() => setModal({ type: "add" })}><Plus size={15} /> 建议新增</Btn>
          </div>
        </div>
        <div className="space-y-2">
          {filtered.length === 0 && <Empty icon={BookOpen} text="未找到匹配的指标" />}
          {filtered.map((i) => { const path = findPath(hierarchy, i.classification_id); return (
            <button key={i.id} onClick={() => setSelId(i.id)} className={`w-full rounded-lg border px-3.5 py-3 text-left transition-colors ${selId === i.id ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}>
              <div className="text-sm font-medium text-slate-800">{i.name_cn}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span className="font-mono">{i.identifier}</span>{path && <span>· {path.join(" › ")}</span>}</div>
            </button>); })}
        </div>
        <p className="mt-3 text-xs text-slate-400">共 {filtered.length} / {indicators.length} 项</p>
      </div>
      <div className="lg:col-span-3">
        {!sel ? <div className="rounded-lg border border-slate-200 bg-white"><Empty icon={BookOpen} text="从左侧选择一个指标查看详情" /></div>
          : <IndicatorDetail key={sel.id} indicator={sel} ctx={ctx} onEdit={() => setModal({ type: "edit", indicator: sel })} onDelete={() => setModal({ type: "delete", indicator: sel })} />}
      </div>
      {modal?.type === "add" && <IndicatorForm mode="add" ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === "edit" && <IndicatorForm mode="edit" indicator={modal.indicator} ctx={ctx} onClose={() => setModal(null)} />}
      {modal?.type === "delete" && <DeleteForm indicator={modal.indicator} ctx={ctx} onClose={() => setModal(null)} />}
    </div>
  );
}

function IndicatorDetail({ indicator, ctx, onEdit, onDelete }) {
  const { hierarchy, sources, user, flash, guard, reloadSuggestions } = ctx;
  const [comments, setComments] = useState([]); const [comment, setComment] = useState("");
  const path = findPath(hierarchy, indicator.classification_id);
  const loadComments = useCallback(() => guard(async () => setComments(await api.getComments(indicator.id))), [indicator.id, guard]);
  useEffect(() => { loadComments(); }, [loadComments]);
  const post = () => guard(async () => { if (!comment.trim()) return; await api.addComment(indicator.id, comment.trim()); setComment(""); await loadComments(); flash("评论已发布"); });
  const disp = (k) => k === "source_standard_id" ? (indicator.source_standard_title || srcTitle(sources, indicator.source_standard_id)) : indicator[k];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-start justify-between">
          <div><h2 className="text-lg font-semibold text-slate-800">{indicator.name_cn}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-mono">{indicator.identifier}</span>
              {path && <Badge cls="bg-slate-100 text-slate-600 border-slate-200"><Layers size={11} />{path.join(" › ")}</Badge>}</div></div>
          <div className="flex gap-2"><Btn size="sm" variant="outline" onClick={onEdit}><Pencil size={14} /> 建议修改</Btn><Btn size="sm" variant="ghost" onClick={onDelete}><Trash2 size={14} className="text-rose-500" /></Btn></div>
        </div>
        <dl className="divide-y divide-slate-100">
          {DETAIL_ORDER.map((k) => (<div key={k} className="grid grid-cols-4 gap-3 py-2">
            <dt className="text-xs font-medium text-slate-500">{FIELD_LABEL[k]}</dt>
            <dd className="col-span-3 text-sm text-slate-700">{disp(k) || <span className="text-slate-300">—</span>}</dd></div>))}
        </dl>
        {user.role === "expert" && <p className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertCircle size={13} /> 您的修改与删除将作为建议提交，经管理员审核后方可生效。</p>}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><MessageSquare size={15} /> 讨论与评论（{comments.length}）</h3>
        <div className="flex gap-2"><input className={inputCls} placeholder="对该指标发表意见…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && post()} /><Btn size="sm" onClick={post}>发布</Btn></div>
        <div className="mt-3 space-y-2">
          {comments.length === 0 && <p className="py-4 text-center text-xs text-slate-400">暂无评论</p>}
          {comments.map((c) => (<div key={c.id} className="rounded-md bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-slate-500"><span className="font-medium text-slate-600">{c.author_name}</span><span>{fmt(c.created_at)}</span></div>
            <p className="mt-0.5 text-sm text-slate-700">{c.body}</p></div>))}
        </div>
      </div>
    </div>
  );
}

function IndicatorForm({ mode, indicator, ctx, onClose }) {
  const { hierarchy, sources, flash, guard, reloadSuggestions } = ctx;
  const flat = useMemo(() => flatten(hierarchy), [hierarchy]);
  const blank = Object.fromEntries(META_FIELDS.map((f) => [f.key, ""]));
  const [form, setForm] = useState(() => mode === "edit"
    ? { ...blank, ...Object.fromEntries(META_FIELDS.map((f) => [f.key, indicator[f.key] ?? ""])), classification_id: indicator.classification_id ?? "" }
    : { ...blank, classification_id: flat.find((f) => !f.hasChildren)?.id || flat[0]?.id || "", priority: "high" });
  const [rationale, setRationale] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const submit = () => guard(async () => {
    if (!String(form.name_cn).trim()) return flash("请填写中文名称");
    setBusy(true);
    try {
      if (mode === "add") {
        const payload = {};
        META_FIELDS.forEach((f) => { payload[f.key] = f.key === "source_standard_id" ? numOrNull(form[f.key]) : (form[f.key] || ""); });
        payload.classification_id = numOrNull(form.classification_id);
        await api.createSuggestion({ type: "add", payload, rationale, priority: form.priority });
        flash("新增指标建议已提交");
      } else {
        const changes = {};
        TEXT_KEYS.forEach((k) => { if ((form[k] || "") !== (indicator[k] || "")) changes[k] = form[k]; });
        if (numOrNull(form.source_standard_id) !== (indicator.source_standard_id ?? null)) changes.source_standard_id = numOrNull(form.source_standard_id);
        if (numOrNull(form.classification_id) !== (indicator.classification_id ?? null)) changes.classification_id = numOrNull(form.classification_id);
        if (Object.keys(changes).length === 0) { setBusy(false); return flash("未检测到任何修改"); }
        await api.createSuggestion({ type: "edit", indicator_id: indicator.id, payload: changes, rationale });
        flash("修改建议已提交");
      }
      await reloadSuggestions();
      onClose();
    } finally { setBusy(false); }
  });

  return (
    <Modal wide title={mode === "add" ? "建议新增指标" : `建议修改：${indicator.name_cn}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {META_FIELDS.map((f) => (
          <Field key={f.key} label={f.label + (f.key === "name_cn" ? " *" : "")} span2={f.span2}>
            {f.type === "source" ? (
              <select className={inputCls} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">（未指定）</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            ) : f.long ? (
              <textarea rows={2} className={inputCls} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className={inputCls} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Field>
        ))}
        <Field label="所属分类" span2>
          <select className={inputCls} value={form.classification_id ?? ""} onChange={(e) => set("classification_id", e.target.value)}>
            <option value="">（未指定）</option>
            {flat.map((f) => <option key={f.id} value={f.id}>{"　".repeat(f.depth) + f.name}</option>)}
          </select>
        </Field>
        {mode === "add" && (
          <Field label="推荐优先级 *" span2>
            <div className="flex gap-2">{Object.entries(PRIORITY).map(([k, v]) => (
              <button key={k} type="button" onClick={() => set("priority", k)} className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${form.priority === k ? v.cls + " ring-1 ring-current" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <Star size={14} fill={form.priority === k ? "currentColor" : "none"} /> {v.label}</button>))}</div>
          </Field>
        )}
        <Field label={mode === "add" ? "推荐理由" : "修改理由"} span2><textarea rows={2} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="请说明依据与理由" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4"><Btn variant="outline" onClick={onClose}>取消</Btn><Btn onClick={submit} disabled={busy}><Check size={15} /> 提交建议</Btn></div>
    </Modal>
  );
}

function DeleteForm({ indicator, ctx, onClose }) {
  const { flash, guard, reloadSuggestions } = ctx; const [rationale, setRationale] = useState("");
  const submit = () => guard(async () => { if (!rationale.trim()) return flash("请填写删除理由");
    await api.createSuggestion({ type: "delete", indicator_id: indicator.id, payload: {}, rationale });
    await reloadSuggestions(); flash("删除建议已提交"); onClose(); });
  return (
    <Modal title={`建议删除：${indicator.name_cn}`} onClose={onClose}>
      <p className="mb-3 flex items-center gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle size={13} /> 该操作将作为删除建议提交，经管理员审核通过后该指标才会被移除。</p>
      <Field label="删除理由 *"><textarea rows={3} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="请说明建议删除该指标的理由" /></Field>
      <div className="mt-4 flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>取消</Btn><Btn variant="danger" onClick={submit}><Trash2 size={15} /> 提交删除建议</Btn></div>
    </Modal>
  );
}

/* ------------------------- 建议审核（管理员） ------------------------- */
function Review(ctx) {
  const { suggestions, hierarchy, sources, flash, guard, reloadSuggestions, reloadIndicators } = ctx;
  const [filter, setFilter] = useState("pending"); const [note, setNote] = useState({});
  const list = suggestions.filter((s) => filter === "all" || s.status === filter);
  const decide = (s, decision) => guard(async () => {
    if (decision === "accepted") await api.acceptSuggestion(s.id, note[s.id] || "");
    else await api.rejectSuggestion(s.id, note[s.id] || "");
    await Promise.all([reloadSuggestions(), reloadIndicators()]);
    flash(decision === "accepted" ? "已采纳该建议" : "已驳回该建议");
  });
  const counts = { pending: suggestions.filter((s) => s.status === "pending").length, accepted: suggestions.filter((s) => s.status === "accepted").length, rejected: suggestions.filter((s) => s.status === "rejected").length };
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[["pending", `待审核 (${counts.pending})`], ["accepted", `已采纳 (${counts.accepted})`], ["rejected", `已驳回 (${counts.rejected})`], ["all", "全部"]].map(([k, lab]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${filter === k ? "bg-teal-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"}`}>{lab}</button>))}
      </div>
      {list.length === 0 && <Empty icon={ClipboardCheck} text="当前没有相关建议" />}
      <div className="space-y-3">
        {list.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge cls={SUG_TYPE[s.type].cls}>{SUG_TYPE[s.type].label}</Badge>
              <Badge cls={STATUS[s.status].cls}>{STATUS[s.status].label}</Badge>
              {s.type === "add" && s.priority && <Badge cls={PRIORITY[s.priority].cls}><Star size={11} />{PRIORITY[s.priority].label}</Badge>}
              <span className="text-sm font-medium text-slate-700">{s.indicator_name || s.payload?.name_cn}</span>
              <span className="ml-auto text-xs text-slate-400">{s.submitter_name} · {fmt(s.submitted_at)}</span>
            </div>
            {s.type === "edit" && <DiffView indicator={ctx.indicators.find((i) => i.id === s.indicator_id)} changes={s.payload} hierarchy={hierarchy} sources={sources} />}
            {s.type === "add" && <AddPreview payload={s.payload} hierarchy={hierarchy} sources={sources} />}
            {s.type === "delete" && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">建议删除该指标。</p>}
            {s.rationale && <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600"><span className="font-medium text-slate-500">理由：</span>{s.rationale}</div>}
            {s.status === "pending" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <input className={`${inputCls} max-w-xs`} placeholder="审核意见（可选）" value={note[s.id] || ""} onChange={(e) => setNote((n) => ({ ...n, [s.id]: e.target.value }))} />
                <Btn size="sm" variant="success" onClick={() => decide(s, "accepted")}><Check size={14} /> 采纳</Btn>
                <Btn size="sm" variant="danger" onClick={() => decide(s, "rejected")}><X size={14} /> 驳回</Btn>
              </div>
            ) : (s.review_note && <p className="mt-2 text-xs text-slate-500">审核意见（{s.reviewer_name}）：{s.review_note}</p>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffView({ indicator, changes, hierarchy, sources }) {
  if (!indicator) return <p className="text-sm text-slate-400">原指标已不存在。</p>;
  const disp = (k, v) => k === "classification_id" ? (findPath(hierarchy, v) || []).join(" › ") : k === "source_standard_id" ? srcTitle(sources, v) : (v || "—");
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-1.5 text-left font-medium">字段</th><th className="px-3 py-1.5 text-left font-medium">原值</th><th className="px-3 py-1.5 text-left font-medium">建议值</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {Object.keys(changes).map((k) => (<tr key={k}>
            <td className="px-3 py-1.5 text-xs font-medium text-slate-500">{FIELD_LABEL[k] || k}</td>
            <td className="px-3 py-1.5 text-slate-400 line-through">{disp(k, indicator[k])}</td>
            <td className="px-3 py-1.5 font-medium text-teal-700">{disp(k, changes[k])}</td></tr>))}
        </tbody>
      </table>
    </div>
  );
}

function AddPreview({ payload, hierarchy, sources }) {
  const path = findPath(hierarchy, payload.classification_id);
  const rows = [
    ["来源标准/部分", srcTitle(sources, payload.source_standard_id)],
    ...["identifier","name_en","unit","definition","method","description","survey_method","data_source","frequency"].map((k) => [FIELD_LABEL[k], payload[k]]),
    ["所属分类", path ? path.join(" › ") : ""],
  ].filter(([, v]) => v);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3"><dl className="grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (<div key={k} className="flex gap-2 text-sm"><dt className="shrink-0 text-xs font-medium text-slate-500">{k}：</dt><dd className="text-slate-700">{v}</dd></div>))}
    </dl></div>
  );
}

/* ------------------------- 我的建议（专家） ------------------------- */
function MySuggestions(ctx) {
  const { suggestions } = ctx;
  const list = suggestions;
  if (list.length === 0) return <Empty icon={ClipboardCheck} text="您还没有提交任何建议" />;
  return (
    <div className="space-y-3">
      {list.map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge cls={SUG_TYPE[s.type].cls}>{SUG_TYPE[s.type].label}</Badge>
            <Badge cls={STATUS[s.status].cls}>{STATUS[s.status].label}</Badge>
            {s.type === "add" && s.priority && <Badge cls={PRIORITY[s.priority].cls}><Star size={11} />{PRIORITY[s.priority].label}</Badge>}
            <span className="text-sm font-medium text-slate-700">{s.indicator_name || s.payload?.name_cn}</span>
            <span className="ml-auto text-xs text-slate-400">{fmt(s.submitted_at)}</span>
          </div>
          {s.rationale && <p className="mt-2 text-sm text-slate-600">理由：{s.rationale}</p>}
          {s.status !== "pending" && s.review_note && <p className="mt-2 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-500">审核意见：{s.review_note}</p>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------- 分类层级管理（管理员） ------------------------- */
function Hierarchy(ctx) {
  const { hierarchy, indicators, flash, guard, reloadHierarchy } = ctx;
  const [expanded, setExpanded] = useState({}); const [adding, setAdding] = useState(null);
  const [name, setName] = useState(""); const [editing, setEditing] = useState(null);
  const countIn = (id) => indicators.filter((i) => i.classification_id === id).length;
  const doAdd = (pid) => guard(async () => { if (!name.trim()) return flash("请输入分类名称"); await api.createClassification({ name: name.trim(), parent_id: pid }); setName(""); setAdding(null); await reloadHierarchy(); flash("已添加分类"); });
  const doRename = (id) => guard(async () => { if (!name.trim()) return; await api.updateClassification(id, { name: name.trim() }); setEditing(null); setName(""); await reloadHierarchy(); flash("已重命名"); });
  const doRemove = (id) => guard(async () => { await api.deleteClassification(id); await reloadHierarchy(); flash("已删除分类"); });

  const Node = ({ node, depth }) => {
    const open = expanded[node.id] ?? depth < 1; const hasKids = node.children?.length > 0;
    return (
      <div>
        <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-slate-50" style={{ marginLeft: depth * 20 }}>
          <button onClick={() => setExpanded((e) => ({ ...e, [node.id]: !open }))} className="text-slate-400">{hasKids ? (open ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className="inline-block w-[15px]" />}</button>
          <Layers size={14} className="text-teal-600" />
          {editing === node.id ? <input autoFocus className={`${inputCls} max-w-xs py-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRename(node.id)} onBlur={() => doRename(node.id)} />
            : <span className="text-sm font-medium text-slate-700">{node.name}</span>}
          <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-400">{LEVEL_NAME[depth] || `第${depth + 1}级`}</span>
          <span className="text-xs text-slate-400">{countIn(node.id)} 个指标</span>
          <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {depth < 2 && <button onClick={() => { setAdding(node.id); setName(""); }} title="添加子分类" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-teal-700"><Plus size={14} /></button>}
            <button onClick={() => { setEditing(node.id); setName(node.name); }} title="重命名" className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil size={13} /></button>
            <button onClick={() => doRemove(node.id)} title="删除" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-600"><Trash2 size={13} /></button>
          </div>
        </div>
        {adding === node.id && (
          <div className="flex items-center gap-2 py-1" style={{ marginLeft: (depth + 1) * 20 + 24 }}>
            <input autoFocus className={`${inputCls} max-w-xs py-1`} placeholder={`新${LEVEL_NAME[depth + 1] || "子分类"}名称`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAdd(node.id)} />
            <Btn size="sm" onClick={() => doAdd(node.id)}>添加</Btn><Btn size="sm" variant="ghost" onClick={() => setAdding(null)}>取消</Btn>
          </div>
        )}
        {open && hasKids && node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} />)}
      </div>
    );
  };
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-500">自定义指标分类层级（一级 / 二级 / 三级），导出时按此结构组织。</p><Btn size="sm" onClick={() => { setAdding("root"); setName(""); }}><Plus size={15} /> 新增一级分类</Btn></div>
      {adding === "root" && (
        <div className="mb-2 flex items-center gap-2"><input autoFocus className={`${inputCls} max-w-xs py-1`} placeholder="一级分类名称" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAdd(null)} />
          <Btn size="sm" onClick={() => doAdd(null)}>添加</Btn><Btn size="sm" variant="ghost" onClick={() => setAdding(null)}>取消</Btn></div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {hierarchy.length === 0 ? <Empty icon={ListTree} text="尚未定义分类层级" /> : hierarchy.map((n) => <Node key={n.id} node={n} depth={0} />)}
      </div>
    </div>
  );
}

/* ------------------------- 专家账户管理（管理员） ------------------------- */
function Accounts(ctx) {
  const { users, flash, guard, reloadUsers } = ctx;
  const [modal, setModal] = useState(false); const [form, setForm] = useState({ username: "", display_name: "", password: "" });
  const [resetFor, setResetFor] = useState(null); const [newPass, setNewPass] = useState("");
  const createUser = () => guard(async () => { if (!form.username.trim() || !form.display_name.trim()) return flash("请填写用户名与姓名");
    await api.createUser({ username: form.username.trim(), display_name: form.display_name.trim(), password: form.password || undefined, role: "expert" });
    setModal(false); setForm({ username: "", display_name: "", password: "" }); await reloadUsers(); flash("专家账户已创建"); });
  const removeUser = (id) => guard(async () => { await api.deleteUser(id); await reloadUsers(); flash("已删除账户"); });
  const resetPass = (id) => guard(async () => { if (!newPass.trim()) return flash("请输入新密码"); await api.resetPassword(id, newPass); setResetFor(null); setNewPass(""); flash("密码已重置"); });
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-500">创建专家账户、重置密码。仅管理员可见。</p><Btn size="sm" onClick={() => setModal(true)}><UserPlus size={15} /> 新建专家账户</Btn></div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-2.5 text-left font-medium">姓名</th><th className="px-4 py-2.5 text-left font-medium">用户名</th><th className="px-4 py-2.5 text-left font-medium">角色</th><th className="px-4 py-2.5 text-right font-medium">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (<tr key={u.id}>
              <td className="px-4 py-2.5 font-medium text-slate-700">{u.display_name}</td>
              <td className="px-4 py-2.5 font-mono text-slate-600">{u.username}</td>
              <td className="px-4 py-2.5">{u.role === "admin" ? <Badge cls="bg-teal-100 text-teal-800 border-teal-200"><ShieldCheck size={11} />管理员</Badge> : <Badge cls="bg-slate-100 text-slate-600 border-slate-200">评审专家</Badge>}</td>
              <td className="px-4 py-2.5 text-right">{u.role === "expert" && (<div className="flex justify-end gap-1">
                <Btn size="sm" variant="outline" onClick={() => { setResetFor(u.id); setNewPass(""); }}><KeyRound size={13} /> 重置密码</Btn>
                <Btn size="sm" variant="ghost" onClick={() => removeUser(u.id)}><Trash2 size={13} className="text-rose-500" /></Btn></div>)}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      {modal && (<Modal title="新建专家账户" onClose={() => setModal(false)}>
        <div className="space-y-3">
          <Field label="姓名 *"><input className={inputCls} value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} /></Field>
          <Field label="用户名 *"><input className={inputCls} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></Field>
          <Field label="初始密码" hint="留空则默认为 123456"><input className={inputCls} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Btn variant="outline" onClick={() => setModal(false)}>取消</Btn><Btn onClick={createUser}>创建</Btn></div>
      </Modal>)}
      {resetFor && (<Modal title="重置密码" onClose={() => setResetFor(null)}>
        <Field label="新密码"><input className={inputCls} value={newPass} onChange={(e) => setNewPass(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2"><Btn variant="outline" onClick={() => setResetFor(null)}>取消</Btn><Btn onClick={() => resetPass(resetFor)}>确认重置</Btn></div>
      </Modal>)}
    </div>
  );
}

/* ------------------------- 导入 / 导出（管理员） ------------------------- */
function Export(ctx) {
  const { indicators, hierarchy, flash, guard, reloadIndicators, reloadHierarchy } = ctx;
  const flat = useMemo(() => flatten(hierarchy), [hierarchy]);
  const maxDepth = flat.reduce((m, f) => Math.max(m, f.depth), 0);
  const [file, setFile] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const doImport = () => guard(async () => {
    if (!file) return flash("请先选择 .xlsx 文件");
    setBusy(true); setResult(null);
    try {
      const r = await api.importStandard(file, overwrite);
      setResult(r);
      await Promise.all([reloadIndicators(), reloadHierarchy()]);
      flash(`导入完成：新增 ${r.inserted}，更新 ${r.updated}，跳过 ${r.skipped}`);
    } finally { setBusy(false); }
  });

  return (
    <div className="max-w-2xl space-y-4">
      {/* 上传导入 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Upload size={15} /> 上传现有标准（批量导入）</h3>
        <p className="mb-3 text-sm text-slate-500">选择主表 <span className="font-mono">.xlsx</span>（需含 来源标准/部分、一级/二级/三级分类、标识符、中文名称…发布频率 等列）。按「标识符」去重，可重复上传；勾选下方选项可覆盖更新已存在指标。</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
            className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100" />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="rounded border-slate-300" />
            覆盖更新已存在指标
          </label>
          <Btn onClick={doImport} disabled={busy || !file}>{busy ? "导入中…" : "开始导入"}</Btn>
        </div>
        {file && <p className="mt-2 text-xs text-slate-400">已选择：{file.name}</p>}
        {result && (
          <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            导入完成 —— 新增 <b>{result.inserted}</b>、更新 <b>{result.updated}</b>、跳过 <b>{result.skipped}</b>；
            来源标准 {result.sources} 项，分类节点 {result.classifications} 个。
          </div>
        )}
      </div>

      {/* 导出 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">导出概览</h3>
        <p className="text-sm text-slate-500">当前标准共 <span className="font-semibold text-teal-700">{indicators.length}</span> 项有效指标，分布于 <span className="font-semibold text-teal-700">{flat.length}</span> 个分类节点，层级深度 <span className="font-semibold text-teal-700">{maxDepth + 1}</span> 级。导出由后端生成，列序与主表一致：来源标准/部分、一级/二级/三级分类、标识符、中文名称、英文名称、计量单位、定义、计算方法、指标说明、调查方法、数据来源、发布频率。</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => guard(async () => { await api.exportWord(); flash("Word 已开始下载"); })} className="flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-5 text-left transition-colors hover:border-teal-400 hover:bg-teal-50/40">
          <FileText size={26} className="text-sky-600" /><span className="font-semibold text-slate-800">导出 Word 文档</span><span className="text-xs text-slate-500">按分类层级生成带标题与表格的 .docx</span></button>
        <button onClick={() => guard(async () => { await api.exportExcel(); flash("Excel 已开始下载"); })} className="flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-5 text-left transition-colors hover:border-teal-400 hover:bg-teal-50/40">
          <FileSpreadsheet size={26} className="text-emerald-600" /><span className="font-semibold text-slate-800">导出 Excel 表格</span><span className="text-xs text-slate-500">分级分类列 + 全部元数据字段的 .xlsx</span></button>
      </div>
    </div>
  );
}
