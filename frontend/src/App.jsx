import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LogIn, LogOut, RefreshCw, Users, ListTree, ClipboardCheck, Download,
  Search, Plus, Pencil, Trash2, MessageSquare, Check, X, ChevronRight,
  ChevronDown, KeyRound, ShieldCheck, FileText, FileSpreadsheet,
  AlertCircle, Layers, BookOpen, Clock, UserPlus, Star, Upload, History, Move, ArrowUp, ArrowDown, GripVertical, GitBranch, ClipboardList
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
  { key: "stratification", label: "分层统计", long: true, span2: true },
];
const SOURCE_TAGS = ["Global Reference List of Health Indicators", "Global Health Observatory", "World Bank", "OECD", "其他"];
const INDICATOR_TYPES = ["核心指标", "备选指标"];
const DETAIL_ORDER = ["source_standard_id","identifier","indicator_type","name_en","unit","definition","method","description","survey_method","data_source","frequency","stratification"];
const FIELD_LABEL = { ...Object.fromEntries(META_FIELDS.map((f) => [f.key, f.label])), classification_id: "所属分类", source_tags: "来源标签", source_other: "来源（其他）", indicator_type: "指标类型" };
const TEXT_KEYS = ["identifier","name_cn","name_en","unit","definition","method","description","survey_method","data_source","frequency","stratification","source_other","indicator_type"];
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

// 在树中查找节点
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) { const r = findNode(n.children, id); if (r) return r; }
  }
  return null;
}
// 收集某节点及其所有后代的 id（用于按上级分类筛选）
function subtreeIds(node) {
  const ids = [node.id];
  for (const c of node.children || []) ids.push(...subtreeIds(c));
  return ids;
}

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
    { id: "history", label: "修改历史", icon: History },
    { id: "changes", label: "变更清单", icon: ClipboardList },
    { id: "versions", label: "版本管理", icon: GitBranch },
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
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 font-sans text-slate-800">
      <aside className="flex w-60 shrink-0 flex-col bg-teal-900 text-teal-50">
        <div className="border-b border-teal-800/60 px-5 py-5"><div className="flex items-center gap-2"><Layers size={22} className="text-teal-300" /><span className="text-sm font-semibold leading-tight">健康指标标准<br />修订协作平台</span></div></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <h1 className="text-lg font-semibold text-slate-800">{tabs.find((t) => t.id === tab)?.label}</h1>
          <div className="flex items-center gap-1">
            <Btn variant="ghost" size="sm" onClick={() => guard(async () => { await loadAll(user); flash("已刷新最新数据"); })}><RefreshCw size={14} /> 刷新数据</Btn>
            <Btn variant="ghost" size="sm" onClick={handleLogout}><LogOut size={14} /> 退出登录</Btn>
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto p-6">
          {tab === "browse" && <Browse {...ctx} />}
          {tab === "review" && <Review {...ctx} />}
          {tab === "hierarchy" && <Hierarchy {...ctx} />}
          {tab === "accounts" && <Accounts {...ctx} />}
          {tab === "history" && <History_ {...ctx} />}
          {tab === "changes" && <Changes {...ctx} />}
          {tab === "versions" && <Versions {...ctx} />}
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
  const { hierarchy, sources, indicators, user, guard, flash, reloadIndicators } = ctx;
  const [q, setQ] = useState(""); const [classFilter, setClassFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selId, setSelId] = useState(null); const [modal, setModal] = useState(null);
  const flat = useMemo(() => flatten(hierarchy), [hierarchy]);
  const byClassFull = useMemo(() => {
    const m = {};   // indicators 已由后端按 (sort_order, identifier) 排好序，保持其顺序
    indicators.forEach((i) => { const k = i.classification_id ?? 0; (m[k] = m[k] || []).push(i); });
    return m;
  }, [indicators]);
  const moveIndicator = (i, dir) => guard(async () => {
    const sibs = byClassFull[i.classification_id ?? 0] || [];
    const idx = sibs.findIndex((s) => s.id === i.id); const to = idx + dir;
    if (idx < 0 || to < 0 || to >= sibs.length) return;
    const ids = sibs.map((s) => s.id); const [m] = ids.splice(idx, 1); ids.splice(to, 0, m);
    await api.reorderIndicators(ids); await reloadIndicators(); flash("已调整指标顺序（导出将按此顺序）");
  });
  const filterIds = useMemo(() => {
    if (classFilter === "all") return null;
    const node = findNode(hierarchy, Number(classFilter));
    return new Set(node ? subtreeIds(node) : [Number(classFilter)]);
  }, [classFilter, hierarchy]);
  const filtered = indicators.filter((i) => {
    const okQ = !q || (i.name_cn || "").includes(q) || (i.identifier || "").toLowerCase().includes(q.toLowerCase());
    const okC = !filterIds || filterIds.has(i.classification_id);
    const okT = typeFilter === "all" || (i.indicator_type || "") === typeFilter;
    return okQ && okC && okT;
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
            <select className={`${inputCls} max-w-[8rem]`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">全部类型</option>
              {INDICATOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Btn size="sm" onClick={() => setModal({ type: "add" })}><Plus size={15} /> {user.role === "admin" ? "新增指标" : "建议新增"}</Btn>
          </div>
        </div>
        <div className="space-y-1">
          {filtered.length === 0 && <Empty icon={BookOpen} text="未找到匹配的指标" />}
          {filtered.length > 0 && (() => {
            const byClass = {};
            filtered.forEach((i) => { const k = i.classification_id ?? 0; (byClass[k] = byClass[k] || []).push(i); });
            const renderRow = (i, sibs) => {
              const idx = sibs.findIndex((s) => s.id === i.id);
              const showSort = user.role === "admin" && !q;
              return (
                <div key={i.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${selId === i.id ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}>
                  <button onClick={() => setSelId(i.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      {i.indicator_type === "核心指标" && <span className="shrink-0 rounded bg-teal-100 px-1 text-[10px] font-medium text-teal-700">核心</span>}
                      {i.indicator_type === "备选指标" && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700">备选</span>}
                      <span className="truncate text-sm font-medium text-slate-800">{i.name_cn}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-slate-500">{i.identifier || "—"}</div>
                  </button>
                  {showSort && (
                    <div className="flex flex-col">
                      <button disabled={idx <= 0} onClick={() => moveIndicator(i, -1)} title="上移" className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowUp size={12} /></button>
                      <button disabled={idx < 0 || idx >= sibs.length - 1} onClick={() => moveIndicator(i, 1)} title="下移" className="rounded p-0.5 text-slate-400 hover:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowDown size={12} /></button>
                    </div>
                  )}
                </div>
              );
            };
            const renderNode = (node, depth) => {
              const own = byClass[node.id] || [];
              const kids = (node.children || []).map((c) => renderNode(c, depth + 1)).filter(Boolean);
              if (own.length === 0 && kids.length === 0) return null;
              const total = subtreeIds(node).reduce((s, id) => s + (byClass[id]?.length || 0), 0);
              return (
                <div key={node.id} className="mt-2">
                  <div className="flex items-center gap-1.5 py-1 text-xs font-semibold text-slate-600" style={{ paddingLeft: depth * 12 }}>
                    <Layers size={12} className="text-teal-500" />{node.name}
                    <span className="font-normal text-slate-400">（{total}）</span>
                  </div>
                  {own.length > 0 && <div className="space-y-1.5" style={{ paddingLeft: depth * 12 + 14 }}>{own.map((i) => renderRow(i, byClassFull[node.id] || []))}</div>}
                  {kids}
                </div>
              );
            };
            const top = hierarchy.map((n) => renderNode(n, 0)).filter(Boolean);
            const unc = byClass[0] || [];
            return (<>
              {top}
              {unc.length > 0 && (
                <div className="mt-2">
                  <div className="py-1 text-xs font-semibold text-slate-600">未分类（{unc.length}）</div>
                  <div className="space-y-1.5 pl-3.5">{unc.map((i) => renderRow(i, byClassFull[0] || []))}</div>
                </div>
              )}
            </>);
          })()}
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
  const [trail, setTrail] = useState(null);
  const loadTrail = () => guard(async () => setTrail(await api.getHistory({ indicatorId: indicator.id })));
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
          <div className="flex gap-2"><Btn size="sm" variant="outline" onClick={onEdit}><Pencil size={14} /> {user.role === "admin" ? "修改" : "建议修改"}</Btn><Btn size="sm" variant="ghost" onClick={onDelete}><Trash2 size={14} className="text-rose-500" /></Btn></div>
        </div>
        <dl className="divide-y divide-slate-100">
          {DETAIL_ORDER.map((k) => (<div key={k} className="grid grid-cols-4 gap-3 py-2">
            <dt className="text-xs font-medium text-slate-500">{FIELD_LABEL[k]}</dt>
            <dd className="col-span-3 text-sm text-slate-700">{disp(k) || <span className="text-slate-300">—</span>}</dd></div>))}
          {indicator.source_tags?.length > 0 && (
            <div className="grid grid-cols-4 gap-3 py-2">
              <dt className="text-xs font-medium text-slate-500">来源标签</dt>
              <dd className="col-span-3 flex flex-wrap gap-1.5">
                {indicator.source_tags.map((t) => (
                  <span key={t} className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-700">{t === "其他" && indicator.source_other ? `其他（${indicator.source_other}）` : t}</span>
                ))}
              </dd>
            </div>
          )}
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
      {user.role === "admin" && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><History size={15} /> 修改轨迹</h3>
            {trail !== null && trail.length > 0 && <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportHistory(indicator.id); flash("Excel 已开始下载"); })}><FileSpreadsheet size={14} /> 导出</Btn>}
          </div>
          {trail === null
            ? <Btn size="sm" variant="outline" onClick={loadTrail}>查看该指标的全部修改记录</Btn>
            : <HistoryList rows={trail} showName={false} />}
        </div>
      )}
    </div>
  );
}

function IndicatorForm({ mode, indicator, ctx, onClose }) {
  const { hierarchy, sources, flash, guard, reloadSuggestions, reloadIndicators, user } = ctx;
  const isAdmin = user.role === "admin";
  const flat = useMemo(() => flatten(hierarchy), [hierarchy]);
  const blank = Object.fromEntries(META_FIELDS.map((f) => [f.key, ""]));
  const [form, setForm] = useState(() => mode === "edit"
    ? { ...blank, ...Object.fromEntries(META_FIELDS.map((f) => [f.key, indicator[f.key] ?? ""])), classification_id: indicator.classification_id ?? "", source_tags: indicator.source_tags || [], source_other: indicator.source_other || "", indicator_type: indicator.indicator_type || "" }
    : { ...blank, classification_id: flat.find((f) => !f.hasChildren)?.id || flat[0]?.id || "", priority: "high", source_tags: [], source_other: "", indicator_type: "核心指标" });
  const [rationale, setRationale] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTag = (t) => setForm((f) => ({ ...f, source_tags: f.source_tags.includes(t) ? f.source_tags.filter((x) => x !== t) : [...f.source_tags, t] }));
  const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const submit = () => guard(async () => {
    if (!String(form.name_cn).trim()) return flash("请填写中文名称");
    if (form.source_tags.includes("其他") && !String(form.source_other).trim()) return flash("选择“其他”来源标签时，请填写具体来源");
    setBusy(true);
    try {
      if (mode === "add") {
        const payload = {};
        META_FIELDS.forEach((f) => { payload[f.key] = f.key === "source_standard_id" ? numOrNull(form[f.key]) : (form[f.key] || ""); });
        payload.classification_id = numOrNull(form.classification_id);
        payload.source_tags = form.source_tags;
        payload.source_other = form.source_other || "";
        payload.indicator_type = form.indicator_type || "";
        if (isAdmin) {
          await api.createIndicator(payload);
          await reloadIndicators();
          flash("指标已新增");
        } else {
          await api.createSuggestion({ type: "add", payload, rationale, priority: form.priority });
          await reloadSuggestions();
          flash("新增指标建议已提交");
        }
      } else {
        const changes = {};
        TEXT_KEYS.forEach((k) => { if ((form[k] || "") !== (indicator[k] || "")) changes[k] = form[k]; });
        if (numOrNull(form.source_standard_id) !== (indicator.source_standard_id ?? null)) changes.source_standard_id = numOrNull(form.source_standard_id);
        if (numOrNull(form.classification_id) !== (indicator.classification_id ?? null)) changes.classification_id = numOrNull(form.classification_id);
        if (JSON.stringify(form.source_tags) !== JSON.stringify(indicator.source_tags || [])) changes.source_tags = form.source_tags;
        if ((form.source_other || "") !== (indicator.source_other || "")) changes.source_other = form.source_other || "";
        if (Object.keys(changes).length === 0) { setBusy(false); return flash("未检测到任何修改"); }
        if (isAdmin) {
          await api.updateIndicator(indicator.id, changes);
          await reloadIndicators();
          flash("修改已保存，立即生效");
        } else {
          await api.createSuggestion({ type: "edit", indicator_id: indicator.id, payload: changes, rationale });
          await reloadSuggestions();
          flash("修改建议已提交");
        }
      }
      onClose();
    } finally { setBusy(false); }
  });

  const title = mode === "add"
    ? (isAdmin ? "新增指标" : "建议新增指标")
    : (isAdmin ? `修改指标：${indicator.name_cn}` : `建议修改：${indicator.name_cn}`);

  return (
    <Modal wide title={title} onClose={onClose}>
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
        <Field label="指标类型" span2>
          <div className="flex gap-2">
            {INDICATOR_TYPES.map((t) => {
              const on = form.indicator_type === t;
              return <button key={t} type="button" onClick={() => set("indicator_type", t)} className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${on ? "border-teal-500 bg-teal-50 font-medium text-teal-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{on ? "● " : "○ "}{t}</button>;
            })}
            {form.indicator_type && <button type="button" onClick={() => set("indicator_type", "")} className="text-xs text-slate-400 hover:text-slate-600">清除</button>}
          </div>
        </Field>
        <Field label="来源标签（可多选）" span2>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TAGS.map((t) => {
              const on = form.source_tags.includes(t);
              return <button key={t} type="button" onClick={() => toggleTag(t)} className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${on ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{on ? "✓ " : ""}{t}</button>;
            })}
          </div>
          {form.source_tags.includes("其他") && (
            <input className={inputCls + " mt-2"} value={form.source_other} onChange={(e) => set("source_other", e.target.value)} placeholder="请填写具体来源 *" />
          )}
        </Field>
        {!isAdmin && mode === "add" && (
          <Field label="推荐优先级 *" span2>
            <div className="flex gap-2">{Object.entries(PRIORITY).map(([k, v]) => (
              <button key={k} type="button" onClick={() => set("priority", k)} className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${form.priority === k ? v.cls + " ring-1 ring-current" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <Star size={14} fill={form.priority === k ? "currentColor" : "none"} /> {v.label}</button>))}</div>
          </Field>
        )}
        {!isAdmin && (
          <Field label={mode === "add" ? "推荐理由" : "修改理由"} span2><textarea rows={2} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="请说明依据与理由" /></Field>
        )}
      </div>
      {isAdmin && <p className="mt-3 flex items-center gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-700"><AlertCircle size={13} /> 管理员修改将立即生效，无需审核。</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4"><Btn variant="outline" onClick={onClose}>取消</Btn><Btn onClick={submit} disabled={busy}><Check size={15} /> {isAdmin ? (mode === "add" ? "新增" : "保存") : "提交建议"}</Btn></div>
    </Modal>
  );
}

function DeleteForm({ indicator, ctx, onClose }) {
  const { flash, guard, reloadSuggestions, reloadIndicators, user } = ctx;
  const isAdmin = user.role === "admin";
  const [rationale, setRationale] = useState("");
  const submit = () => guard(async () => {
    if (isAdmin) {
      await api.deleteIndicator(indicator.id);
      await reloadIndicators();
      flash("指标已删除"); onClose();
    } else {
      if (!rationale.trim()) return flash("请填写删除理由");
      await api.createSuggestion({ type: "delete", indicator_id: indicator.id, payload: {}, rationale });
      await reloadSuggestions(); flash("删除建议已提交"); onClose();
    }
  });
  return (
    <Modal title={isAdmin ? `删除指标：${indicator.name_cn}` : `建议删除：${indicator.name_cn}`} onClose={onClose}>
      {isAdmin ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle size={13} /> 确认删除该指标？删除后立即从标准中移除（软删除）。</p>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertCircle size={13} /> 该操作将作为删除建议提交，经管理员审核通过后该指标才会被移除。</p>
          <Field label="删除理由 *"><textarea rows={3} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="请说明建议删除该指标的理由" /></Field>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>取消</Btn><Btn variant="danger" onClick={submit}><Trash2 size={15} /> {isAdmin ? "确认删除" : "提交删除建议"}</Btn></div>
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
  const [moving, setMoving] = useState(null);
  const countIn = (id) => indicators.filter((i) => i.classification_id === id).length;
  const doAdd = (pid) => guard(async () => { if (!name.trim()) return flash("请输入分类名称"); await api.createClassification({ name: name.trim(), parent_id: pid }); setName(""); setAdding(null); await reloadHierarchy(); flash("已添加分类"); });
  const doRename = (id) => guard(async () => { if (!name.trim()) return; await api.updateClassification(id, { name: name.trim() }); setEditing(null); setName(""); await reloadHierarchy(); flash("已重命名"); });
  const doRemove = (id) => guard(async () => { await api.deleteClassification(id); await reloadHierarchy(); flash("已删除分类"); });
  const doMove = (id, val) => guard(async () => { await api.updateClassification(id, { parent_id: val === "" ? null : Number(val) }); setMoving(null); await reloadHierarchy(); flash("已移动分类，级别已自动调整"); });
  const [dragId, setDragId] = useState(null); const [dragOverId, setDragOverId] = useState(null);
  const reorderSiblings = (siblings, from, to) => guard(async () => {
    if (to < 0 || to >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    const [m] = ids.splice(from, 1); ids.splice(to, 0, m);
    await api.reorderClassifications(ids); await reloadHierarchy();
  });
  const dropOnto = (targetId) => {
    setDragOverId(null);
    if (dragId == null || dragId === targetId) { setDragId(null); return; }
    const dragNode = findNode(hierarchy, dragId);
    if (dragNode && new Set(subtreeIds(dragNode)).has(targetId)) { flash("不能移动到自己的子分类之下"); setDragId(null); return; }
    const id = dragId; setDragId(null);
    doMove(id, targetId === null ? "" : String(targetId));
  };

  const nodeHeight = (n) => (n.children?.length ? 1 + Math.max(...n.children.map(nodeHeight)) : 0);
  const moveTargets = (node) => {
    const exclude = new Set(subtreeIds(node));   // 自身 + 全部子孙
    const h = nodeHeight(node);
    const opts = [{ id: "", label: "顶级（设为一级分类）" }];
    flatten(hierarchy).forEach((f) => {
      if (exclude.has(f.id)) return;
      const level = f.depth + 1;                  // 目标节点的级别
      if (level + 1 + h <= 3) opts.push({ id: f.id, label: "　".repeat(f.depth) + `${f.name}（${LEVEL_NAME[f.depth] || "第" + (f.depth + 1) + "级"}）` });
    });
    return opts;
  };

  const Node = ({ node, depth, siblings, index }) => {
    const open = expanded[node.id] ?? depth < 1; const hasKids = node.children?.length > 0;
    return (
      <div>
        <div
          draggable={editing !== node.id}
          onDragStart={(e) => { setDragId(node.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
          onDragOver={(e) => { e.preventDefault(); if (dragOverId !== node.id) setDragOverId(node.id); }}
          onDragLeave={() => setDragOverId((d) => (d === node.id ? null : d))}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnto(node.id); }}
          className={`group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-slate-50 ${dragOverId === node.id ? "ring-2 ring-teal-400 bg-teal-50" : ""} ${dragId === node.id ? "opacity-40" : ""}`}
          style={{ marginLeft: depth * 20 }}>
          <GripVertical size={13} className="cursor-grab text-slate-300" title="拖动以移动到其它分类下" />
          <button onClick={() => setExpanded((e) => ({ ...e, [node.id]: !open }))} className="text-slate-400">{hasKids ? (open ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className="inline-block w-[15px]" />}</button>
          <Layers size={14} className="text-teal-600" />
          {editing === node.id ? <input autoFocus className={`${inputCls} max-w-xs py-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRename(node.id)} onBlur={() => doRename(node.id)} />
            : <span className="text-sm font-medium text-slate-700">{node.name}</span>}
          <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-400">{LEVEL_NAME[depth] || `第${depth + 1}级`}</span>
          <span className="text-xs text-slate-400">{countIn(node.id)} 个指标</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button disabled={index === 0} onClick={() => reorderSiblings(siblings, index, index - 1)} title="上移" className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowUp size={13} /></button>
            <button disabled={index === siblings.length - 1} onClick={() => reorderSiblings(siblings, index, index + 1)} title="下移" className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-25 disabled:hover:bg-transparent"><ArrowDown size={13} /></button>
            {depth < 2 && <button onClick={() => { setAdding(node.id); setName(""); }} title="添加子分类" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-teal-700"><Plus size={14} /></button>}
            <button onClick={() => { setEditing(node.id); setName(node.name); }} title="重命名" className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil size={13} /></button>
            <button onClick={() => setMoving(moving === node.id ? null : node.id)} title="移动（改变上下级）" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-teal-700"><Move size={13} /></button>
            <button onClick={() => doRemove(node.id)} title="删除" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-600"><Trash2 size={13} /></button>
          </div>
        </div>
        {moving === node.id && (
          <div className="flex items-center gap-2 py-1.5" style={{ marginLeft: depth * 20 + 36 }}>
            <span className="text-xs text-slate-500">移动到：</span>
            <select autoFocus className={`${inputCls} max-w-sm py-1`} defaultValue="" onChange={(e) => doMove(node.id, e.target.value)}>
              <option value="" disabled>选择新的上级…</option>
              {moveTargets(node).map((o) => <option key={String(o.id)} value={o.id}>{o.label}</option>)}
            </select>
            <Btn size="sm" variant="ghost" onClick={() => setMoving(null)}>取消</Btn>
          </div>
        )}
        {adding === node.id && (
          <div className="flex items-center gap-2 py-1" style={{ marginLeft: (depth + 1) * 20 + 24 }}>
            <input autoFocus className={`${inputCls} max-w-xs py-1`} placeholder={`新${LEVEL_NAME[depth + 1] || "子分类"}名称`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAdd(node.id)} />
            <Btn size="sm" onClick={() => doAdd(node.id)}>添加</Btn><Btn size="sm" variant="ghost" onClick={() => setAdding(null)}>取消</Btn>
          </div>
        )}
        {open && hasKids && node.children.map((c, ci) => <Node key={c.id} node={c} depth={depth + 1} siblings={node.children} index={ci} />)}
      </div>
    );
  };
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center justify-between"><p className="text-sm text-slate-500">分类层级（一级/二级/三级）：可改名、增删；<GripVertical size={11} className="inline" /> 拖动节点到另一节点上即成为其子级，<ArrowUp size={11} className="inline" /><ArrowDown size={11} className="inline" /> 调整同级先后顺序（顺序影响导出）。</p><Btn size="sm" onClick={() => { setAdding("root"); setName(""); }}><Plus size={15} /> 新增一级分类</Btn></div>
      {adding === "root" && (
        <div className="mb-2 flex items-center gap-2"><input autoFocus className={`${inputCls} max-w-xs py-1`} placeholder="一级分类名称" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAdd(null)} />
          <Btn size="sm" onClick={() => doAdd(null)}>添加</Btn><Btn size="sm" variant="ghost" onClick={() => setAdding(null)}>取消</Btn></div>
      )}
      {dragId != null && (
        <div onDragOver={(e) => { e.preventDefault(); setDragOverId("__root__"); }} onDragLeave={() => setDragOverId((d) => (d === "__root__" ? null : d))} onDrop={(e) => { e.preventDefault(); dropOnto(null); }}
          className={`mb-2 rounded-md border border-dashed px-3 py-2 text-center text-xs ${dragOverId === "__root__" ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-400"}`}>
          拖到此处 → 提升为一级分类
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {hierarchy.length === 0 ? <Empty icon={ListTree} text="尚未定义分类层级" /> : hierarchy.map((n, i) => <Node key={n.id} node={n} depth={0} siblings={hierarchy} index={i} />)}
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

/* ------------------------- 修改历史（管理员） ------------------------- */
const HISTORY_ACTIONS = {
  admin_create: { label: "管理员新增", cls: "bg-emerald-100 text-emerald-700" },
  admin_update: { label: "管理员修改", cls: "bg-sky-100 text-sky-700" },
  admin_delete: { label: "管理员删除", cls: "bg-rose-100 text-rose-700" },
  accept_add: { label: "采纳·新增", cls: "bg-emerald-100 text-emerald-700" },
  accept_edit: { label: "采纳·修改", cls: "bg-sky-100 text-sky-700" },
  accept_delete: { label: "采纳·删除", cls: "bg-rose-100 text-rose-700" },
  reject: { label: "驳回建议", cls: "bg-slate-200 text-slate-600" },
};

const fmtTime = (s) => (s ? new Date(s.endsWith && s.endsWith("Z") ? s : s + "Z").toLocaleString("zh-CN", { hour12: false }) : "");

function ChangeLines({ detail }) {
  if (detail?.changes && typeof detail.changes === "object" && !Array.isArray(detail.changes)) {
    return (
      <div className="mt-1.5 space-y-1">
        {Object.entries(detail.changes).map(([k, ov]) => (
          <div key={k} className="text-xs leading-relaxed">
            <span className="text-slate-500">{FIELD_LABEL[k] || k}：</span>
            <span className="rounded bg-rose-50 px-1 text-rose-500 line-through">{(ov && ov.old) || "（空）"}</span>
            <span className="mx-1 text-slate-400">→</span>
            <span className="rounded bg-emerald-50 px-1 text-emerald-700">{(ov && ov.new) || "（空）"}</span>
          </div>
        ))}
      </div>
    );
  }
  if (Array.isArray(detail?.changed) && detail.changed.length) {
    return <div className="mt-1 text-xs text-slate-500">变更字段：{detail.changed.map((k) => FIELD_LABEL[k] || k).join("、")}</div>;
  }
  return null;
}

function HistoryList({ rows, showName = true }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">暂无修改记录</p>;
  return (
    <ol className="relative ml-1 border-l border-slate-200 pl-5">
      {rows.map((e) => {
        const a = HISTORY_ACTIONS[e.action] || { label: e.action, cls: "bg-slate-100 text-slate-600" };
        return (
          <li key={e.id} className="mb-5">
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-teal-400" />
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${a.cls}`}>{a.label}</span>
              {showName && <span className="font-medium text-slate-800">{e.indicator_name || (e.entity_type === "indicator" ? `指标 #${e.entity_id}` : `#${e.entity_id}`)}</span>}
              <span className="text-xs text-slate-400">{fmtTime(e.created_at)}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">操作人：{e.actor_name || "—"}</div>
            <ChangeLines detail={e.detail} />
          </li>
        );
      })}
    </ol>
  );
}

function History_({ guard, flash }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => guard(async () => { setBusy(true); try { setRows(await api.getHistory({ limit: 300 })); } finally { setBusy(false); } });
  useEffect(() => { load(); }, []);
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">记录全部指标变更：管理员直接增改删，以及采纳 / 驳回的专家建议。</p>
        <div className="flex shrink-0 gap-2">
          <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportHistory(); flash("Excel 已开始下载"); })}><FileSpreadsheet size={14} /> 导出 Excel</Btn>
          <Btn size="sm" variant="outline" onClick={load} disabled={busy}>{busy ? "加载中…" : "刷新"}</Btn>
        </div>
      </div>
      {rows === null ? <p className="text-sm text-slate-400">加载中…</p> : <HistoryList rows={rows} />}
    </div>
  );
}

/* ------------------------- 变更清单（管理员） ------------------------- */
const CHANGE_META = {
  added: { label: "新增", cls: "bg-emerald-100 text-emerald-700" },
  modified: { label: "修改", cls: "bg-sky-100 text-sky-700" },
  deleted: { label: "删除", cls: "bg-rose-100 text-rose-700" },
};
function Changes({ guard, flash }) {
  const [type, setType] = useState("all");
  const [rows, setRows] = useState(null);
  const load = (t) => guard(async () => { setRows(null); setRows(await api.getChanges(t)); });
  useEffect(() => { load(type); }, [type]);
  const TYPES = [["all", "全部"], ["added", "新增"], ["modified", "修改"], ["deleted", "删除"]];
  const counts = rows ? rows.reduce((a, r) => { a[r.change_type] = (a[r.change_type] || 0) + 1; return a; }, {}) : {};

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">本次修订中被<span className="text-emerald-600">新增</span>、<span className="text-sky-600">修改</span>、<span className="text-rose-600">删除</span>的指标。可按类型筛选并导出。</p>
        <div className="flex gap-2">
          <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportChangesExcel(type); flash("Excel 下载中"); })}><FileSpreadsheet size={14} /> 导出 Excel</Btn>
          <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportChangesWord(type); flash("Word 下载中"); })}><FileText size={14} /> 导出 Word</Btn>
        </div>
      </div>
      <div className="mb-3 flex gap-1.5">
        {TYPES.map(([k, lbl]) => (
          <button key={k} onClick={() => setType(k)} className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${type === k ? "border-teal-500 bg-teal-50 font-medium text-teal-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{lbl}</button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-400">{rows ? `共 ${rows.length} 项` : ""}</span>
      </div>
      {rows === null ? <p className="text-sm text-slate-400">加载中…</p> : rows.length === 0 ? (
        <Empty icon={ClipboardList} text="没有符合条件的变更" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>
              <th className="px-3 py-2">类型</th><th className="px-3 py-2">分类</th><th className="px-3 py-2">标识符</th>
              <th className="px-3 py-2">中文名称</th><th className="px-3 py-2">指标类型</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => { const m = CHANGE_META[r.change_type] || {}; return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{(r.classification_path || []).join(" / ") || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.identifier || "—"}</td>
                  <td className={`px-3 py-2 ${r.change_type === "deleted" ? "text-slate-400 line-through" : "text-slate-800"}`}>{r.name_cn}</td>
                  <td className="px-3 py-2 text-xs">{r.indicator_type === "核心指标" ? <span className="text-teal-700">核心</span> : r.indicator_type === "备选指标" ? <span className="text-amber-700">备选</span> : "—"}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------- 版本管理（管理员） ------------------------- */
function Versions({ guard, flash, indicators }) {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState(""); const [note, setNote] = useState("");
  const [viewing, setViewing] = useState(null); const [busy, setBusy] = useState(false);
  const load = () => guard(async () => setRows(await api.getVersions()));
  useEffect(() => { load(); }, []);
  const create = () => guard(async () => {
    if (!label.trim()) return flash("请填写版本名称");
    setBusy(true);
    try { await api.createVersion({ label: label.trim(), note: note.trim() }); setCreating(false); setLabel(""); setNote(""); await load(); flash("已创建版本快照"); }
    finally { setBusy(false); }
  });
  const remove = (v) => guard(async () => { if (!window.confirm(`确认删除版本「${v.label}」？该操作不可恢复。`)) return; await api.deleteVersion(v.id); await load(); flash("已删除版本"); });
  const view = (v) => guard(async () => setViewing(await api.getVersion(v.id)));
  const coreCount = indicators.filter((i) => i.indicator_type === "核心指标").length;
  const altCount = indicators.filter((i) => i.indicator_type === "备选指标").length;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">把当前指标池保存为一个<span className="font-medium text-slate-700">定稿版本</span>（快照），便于留存历次报送/发布稿，并可随时按版本导出 Word / Excel。当前共 {indicators.length} 项指标（核心 {coreCount}、备选 {altCount}）。</p>
        <Btn size="sm" onClick={() => setCreating(true)}><GitBranch size={15} /> 创建新版本</Btn>
      </div>
      {rows === null ? <p className="text-sm text-slate-400">加载中…</p> : rows.length === 0 ? (
        <Empty icon={GitBranch} text="尚未创建任何版本" />
      ) : (
        <div className="space-y-2">
          {rows.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{v.label}</span><span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">{v.indicator_count} 项</span></div>
                {v.note && <div className="mt-0.5 text-xs text-slate-500">{v.note}</div>}
                <div className="mt-0.5 text-xs text-slate-400">{v.creator_name || "—"} · {fmtTime(v.created_at)}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Btn size="sm" variant="outline" onClick={() => view(v)}>查看</Btn>
                <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportVersionExcel(v.id, v.label); flash("Excel 下载中"); })}><FileSpreadsheet size={14} /> Excel</Btn>
                <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportVersionWord(v.id, v.label); flash("Word 下载中"); })}><FileText size={14} /> Word</Btn>
                <Btn size="sm" variant="ghost" onClick={() => remove(v)}><Trash2 size={14} /></Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="创建新版本" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-500">版本名称 *</label>
              <input autoFocus className={inputCls} placeholder="如：v1.0 报送稿 / 2026 征求意见稿" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-500">版本说明</label>
              <textarea className={`${inputCls} h-24`} placeholder="本次定稿的范围、变化说明等" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <p className="text-xs text-slate-400">将对当前全部 {indicators.length} 项指标及其分类、顺序打快照保存。</p>
            <div className="flex justify-end gap-2 pt-1"><Btn variant="ghost" onClick={() => setCreating(false)}>取消</Btn><Btn onClick={create} disabled={busy}>{busy ? "保存中…" : "创建版本"}</Btn></div>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal title={`版本：${viewing.label}（${viewing.indicator_count} 项）`} onClose={() => setViewing(null)} wide>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
                <th className="px-2 py-1.5">分类</th><th className="px-2 py-1.5">标识符</th><th className="px-2 py-1.5">中文名称</th><th className="px-2 py-1.5">类型</th>
              </tr></thead>
              <tbody>
                {viewing.indicators.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-500">{[r.l1, r.l2, r.l3].filter(Boolean).join(" / ")}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-500">{r.identifier || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-800">{r.name_cn}</td>
                    <td className="px-2 py-1.5">{r.indicator_type === "核心指标" ? <span className="rounded bg-teal-100 px-1 text-teal-700">核心</span> : r.indicator_type === "备选指标" ? <span className="rounded bg-amber-100 px-1 text-amber-700">备选</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportVersionExcel(viewing.id, viewing.label); flash("Excel 下载中"); })}><FileSpreadsheet size={14} /> 导出 Excel</Btn>
            <Btn size="sm" variant="outline" onClick={() => guard(async () => { await api.exportVersionWord(viewing.id, viewing.label); flash("Word 下载中"); })}><FileText size={14} /> 导出 Word</Btn>
          </div>
        </Modal>
      )}
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
