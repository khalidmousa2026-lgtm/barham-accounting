import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { LayoutDashboard, FolderKanban, Plus, Search, Wallet, TrendingUp, TrendingDown, Percent, Trash2, Save, RefreshCw, CalendarDays, CircleDollarSign, Cloud, CloudOff } from 'lucide-react';
import './styles.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_SUPABASE') ? createClient(url, key) : null;
const money = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' د.ع';
const today = () => new Date().toISOString().slice(0, 10);

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ project_name: '', owner_name: '', received_amount: '0', spent_amount: '0', work_percentage: '10' });
  const [tx, setTx] = useState({ transaction_type: 'spent', amount: '', transaction_date: today(), description: '' });
  const [saving, setSaving] = useState(false);
  const selected = projects.find(p => p.id === selectedId) || null;
  const filtered = useMemo(() => projects.filter(p => `${p.project_name} ${p.owner_name}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const totals = useMemo(() => projects.reduce((a,p) => ({ received:a.received+Number(p.received_amount||0), spent:a.spent+Number(p.spent_amount||0) }), {received:0,spent:0}), [projects]);

  async function loadProjects() {
    if (!supabase) { setProjects([]); return; }
    setLoading(true); setError('');
    const { data, error } = await supabase.from('barham_projects').select('*').order('created_at', { ascending: false });
    if (error) setError('تعذر تحميل المشاريع: ' + error.message);
    else { setProjects(data || []); if (data?.length && !data.some(p => p.id === selectedId)) setSelectedId(data[0].id); }
    setLoading(false);
  }
  async function loadTransactions(id) {
    if (!supabase || !id) { setTransactions([]); return; }
    const { data, error } = await supabase.from('barham_transactions').select('*').eq('project_id', id).order('transaction_date', { ascending: false }).order('created_at', {ascending:false});
    if (error) setError('تعذر تحميل الحركات: ' + error.message); else setTransactions(data || []);
  }
  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { loadTransactions(selectedId); }, [selectedId, projects.length]);

  async function saveProject(e) {
    e.preventDefault(); setError(''); setNotice('');
    if (!draft.project_name.trim()) { setError('اكتب اسم المشروع أولاً.'); return; }
    if (!supabase) { setError('قاعدة البيانات غير مربوطة بعد؛ اتبع ملف README لإعداد Supabase.'); return; }
    setSaving(true);
    const payload = { project_name:draft.project_name.trim(), owner_name:draft.owner_name.trim(), received_amount:Number(draft.received_amount||0), spent_amount:Number(draft.spent_amount||0), work_percentage:Number(draft.work_percentage||0), updated_at:new Date().toISOString() };
    const { data, error } = await supabase.from('barham_projects').insert(payload).select().single();
    if (error) setError('لم يُحفظ المشروع: ' + error.message);
    else { setProjects(prev => [data,...prev]); setSelectedId(data.id); setDraft({project_name:'',owner_name:'',received_amount:'0',spent_amount:'0',work_percentage:'10'}); setShowForm(false); setNotice('تم حفظ المشروع على الإنترنت.'); }
    setSaving(false);
  }
  async function saveTransaction(e) {
    e.preventDefault(); if (!selected) return;
    if (!supabase) { setError('قاعدة البيانات غير مربوطة بعد؛ اتبع ملف README لإعداد Supabase.'); return; }
    const amount = Number(tx.amount);
    if (!(amount > 0)) { setError('أدخل مبلغاً أكبر من صفر.'); return; }
    setSaving(true); setError(''); setNotice('');
    const { error: txError } = await supabase.from('barham_transactions').insert({ project_id:selected.id, transaction_type:tx.transaction_type, amount, transaction_date:tx.transaction_date, description:tx.description.trim() });
    if (txError) { setError('لم تُحفظ الحركة: ' + txError.message); setSaving(false); return; }
    const field = tx.transaction_type === 'received' ? 'received_amount' : 'spent_amount';
    const updated = { ...selected, [field]: Number(selected[field]||0) + amount, updated_at:new Date().toISOString() };
    const { data, error: projectError } = await supabase.from('barham_projects').update({ [field]:updated[field], updated_at:updated.updated_at }).eq('id', selected.id).select().single();
    if (projectError) setError('حُفظت الحركة لكن تعذر تحديث إجمالي المشروع: ' + projectError.message);
    else { setProjects(prev => prev.map(p => p.id === data.id ? data : p)); setNotice('تم حفظ الحركة وتحديث إجمالي المشروع.'); setTx({...tx, amount:'', description:''}); await loadTransactions(selected.id); }
    setSaving(false);
  }
  async function deleteProject(p) {
    if (!confirm(`هل تريد حذف مشروع «${p.project_name}» وكل حركاته؟`)) return;
    if (!supabase) return;
    const { error } = await supabase.from('barham_projects').delete().eq('id', p.id);
    if (error) setError('تعذر الحذف: ' + error.message); else { setProjects(prev => prev.filter(x => x.id !== p.id)); setSelectedId(''); setTransactions([]); setNotice('تم حذف المشروع.'); }
  }
  async function updateProgress(value) {
    if (!selected || !supabase) return;
    const percentage = Number(value);
    setProjects(prev => prev.map(p => p.id === selected.id ? {...p, work_percentage:percentage} : p));
    const { error } = await supabase.from('barham_projects').update({work_percentage:percentage, updated_at:new Date().toISOString()}).eq('id', selected.id);
    if (error) { setError('تعذر حفظ نسبة العمل: ' + error.message); await loadProjects(); }
    else setNotice('تم حفظ نسبة العمل.');
  }

  return <div className="app" dir="rtl">
    <aside className="sidebar"><div className="brand"><div className="brand-icon">ب</div><div><strong>برهم</strong><small>حسابات المشاريع</small></div></div><div className="nav-label">القائمة</div><div className="nav active"><LayoutDashboard size={19}/> لوحة التحكم</div><div className="nav"><FolderKanban size={19}/> المشاريع</div><div className="sidebar-bottom"><span className={supabase?'dot':'dot offline'}></span>{supabase?'قاعدة البيانات متصلة':'بانتظار ربط قاعدة البيانات'}</div></aside>
    <main className="main"><header className="topbar"><div><div className="eyebrow">نظام إدارة المشاريع</div><h1>لوحة حسابات برهم</h1><p>إدارة الاستلامات والمصروفات ونسبة العمل لكل مشروع</p></div><button className="btn outline" onClick={loadProjects}><RefreshCw size={16}/> تحديث</button></header>
      {!supabase && <div className="setup-banner"><CloudOff size={19}/><div><b>الحفظ السحابي غير مفعّل بعد</b><span>أكمل إعداد Supabase حسب ملف README داخل الحزمة حتى تُحفظ البيانات على الإنترنت.</span></div></div>}
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      <section className="stats"><article className="stat"><span className="stat-icon green"><FolderKanban/></span><span>عدد المشاريع</span><strong>{projects.length}</strong></article><article className="stat"><span className="stat-icon blue"><TrendingUp/></span><span>إجمالي المستلم</span><strong>{money(totals.received)}</strong></article><article className="stat"><span className="stat-icon red"><TrendingDown/></span><span>إجمالي المصروف</span><strong>{money(totals.spent)}</strong></article><article className="stat"><span className="stat-icon gold"><Wallet/></span><span>المتبقي الإجمالي</span><strong>{money(totals.received-totals.spent)}</strong></article></section>
      <section className="content-grid"><article className="panel projects-panel"><div className="panel-head"><div><h2>المشاريع</h2><p>اختر مشروعاً لعرض حساباته</p></div><button className="btn primary" onClick={()=>setShowForm(!showForm)}><Plus size={17}/> مشروع جديد</button></div><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم المشروع أو صاحبه"/></div>
      {showForm && <form className="project-form" onSubmit={saveProject}><h3>معلومات المشروع</h3><label>اسم المشروع<input required value={draft.project_name} onChange={e=>setDraft({...draft,project_name:e.target.value})} placeholder="اسم المشروع"/></label><label>صاحب المشروع<input value={draft.owner_name} onChange={e=>setDraft({...draft,owner_name:e.target.value})} placeholder="اسم صاحب المشروع"/></label><div className="two"><label>المبلغ المستلم<input type="number" min="0" step="0.01" value={draft.received_amount} onChange={e=>setDraft({...draft,received_amount:e.target.value})}/></label><label>المبلغ المصروف<input type="number" min="0" step="0.01" value={draft.spent_amount} onChange={e=>setDraft({...draft,spent_amount:e.target.value})}/></label></div><label>نسبة العمل المنجزة (%)<input type="number" min="0" max="100" value={draft.work_percentage} onChange={e=>setDraft({...draft,work_percentage:e.target.value})}/></label><div className="form-actions"><button type="button" className="btn outline" onClick={()=>setShowForm(false)}>إلغاء</button><button disabled={saving} className="btn primary"><Save size={16}/>{saving?'جارٍ الحفظ':'حفظ المشروع'}</button></div></form>}
      {loading?<div className="empty">جارٍ تحميل المشاريع...</div>:filtered.length===0?<div className="empty"><FolderKanban size={34}/><b>لا توجد مشاريع بعد</b><span>اضغط «مشروع جديد» لإضافة أول مشروع.</span></div>:<div className="project-list">{filtered.map(p=><button key={p.id} className={'project-item '+(p.id===selectedId?'chosen':'')} onClick={()=>setSelectedId(p.id)}><span className="project-avatar"><FolderKanban size={20}/></span><span className="project-title"><b>{p.project_name}</b><small>{p.owner_name||'صاحب المشروع غير محدد'}</small></span><span className="project-percent">{p.work_percentage}%</span></button>)}</div>}</article>
      <article className="panel detail-panel"><div className="panel-head"><div><h2>تفاصيل المشروع</h2><p>{selected?'ملخص الحساب والحركات المالية':'اختر مشروعاً من القائمة'}</p></div>{selected&&<button className="icon-btn danger" title="حذف المشروع" onClick={()=>deleteProject(selected)}><Trash2 size={17}/></button>}</div>
      {selected?<><div className="selected-title"><div className="large-avatar"><FolderKanban size={26}/></div><div><h3>{selected.project_name}</h3><span>صاحب المشروع: {selected.owner_name||'غير محدد'}</span></div></div><div className="balance-grid"><div className="balance received"><span>المبلغ المستلم</span><b>{money(selected.received_amount)}</b></div><div className="balance spent"><span>المبلغ المصروف</span><b>{money(selected.spent_amount)}</b></div><div className="balance remaining"><span>المبلغ المتبقي</span><b>{money(Number(selected.received_amount)-Number(selected.spent_amount))}</b></div></div><div className="progress-card"><div className="progress-head"><span><Percent size={17}/> نسبة العمل المنجزة</span><b>{selected.work_percentage}%</b></div><div className="progress-track"><div className="progress-fill" style={{width:`${selected.work_percentage}%`}}/></div><label className="progress-label">تعديل النسبة يدوياً<input type="number" min="0" max="100" value={selected.work_percentage} onChange={e=>updateProgress(Math.min(100,Math.max(0,Number(e.target.value))))}/></label></div><form className="tx-form" onSubmit={saveTransaction}><h3>إضافة حركة مالية</h3><div className="two"><label>نوع الحركة<select value={tx.transaction_type} onChange={e=>setTx({...tx,transaction_type:e.target.value})}><option value="received">استلام مبلغ</option><option value="spent">صرف مبلغ</option></select></label><label>المبلغ (د.ع)<input required type="number" min="0.01" step="0.01" value={tx.amount} onChange={e=>setTx({...tx,amount:e.target.value})} placeholder="0"/></label></div><div className="two"><label>التاريخ<input required type="date" value={tx.transaction_date} onChange={e=>setTx({...tx,transaction_date:e.target.value})}/></label><label>البيان<input value={tx.description} onChange={e=>setTx({...tx,description:e.target.value})} placeholder="تفاصيل الحركة"/></label></div><button disabled={saving} className="btn primary full"><Plus size={16}/>{saving?'جارٍ الحفظ':'حفظ الحركة وتحديث الرصيد'}</button></form><div className="transactions"><h3><CalendarDays size={17}/> سجل الحركات</h3>{transactions.length===0?<div className="no-transactions">لا توجد حركات مسجلة لهذا المشروع.</div>:<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td>{t.transaction_date}</td><td><span className={'pill '+(t.transaction_type==='received'?'pill-in':'pill-out')}>{t.transaction_type==='received'?'استلام':'صرف'}</span></td><td>{t.description||'—'}</td><td className={t.transaction_type==='received'?'text-green':'text-red'}>{money(t.amount)}</td></tr>)}</tbody></table></div>}</div></>:<div className="empty detail-empty"><CircleDollarSign size={38}/><b>لا يوجد مشروع محدد</b><span>أضف مشروعاً جديداً أو اختر مشروعاً موجوداً لعرض التفاصيل.</span></div>}
      </article></section><footer>برهم · حسابات المشاريع · العملة المعتمدة الدينار العراقي</footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
