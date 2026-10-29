import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Sparkles, LayoutDashboard, FolderKanban, Gauge, FolderOpen, Plus, Search, Wallet, TrendingUp, TrendingDown, Percent, Trash2, Save, RefreshCw, CalendarDays, CircleDollarSign, CloudOff, Pencil, X, FileDown, Printer, ArrowRight } from 'lucide-react';
import './styles.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_SUPABASE') ? createClient(url, key) : null;
const money = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n || 0)) + ' د.ع';
const today = () => new Date().toISOString().slice(0, 10);


function parseTransactionLocally(text) {
  const original = text.trim();
  const normalized = original
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

  const receivedWords = /استلم|استلام|قبض|وارد|تحويل\s*إلينا|دخل\sلنا|استلمنا|قبضنا|وصلنا/.test(normalized);
  const spentWords = /صرف|دفعت|دفعنا|اشترينا|شراء|مشتريات|أجرة|اجور|إيجار|وقود|نقل|سددنا|حولنا/.test(normalized);

  let transaction_type;
  if (receivedWords && !spentWords) transaction_type = "received";
  else if (spentWords && !receivedWords) transaction_type = "spent";
  else if (receivedWords) transaction_type = "received";
  else if (spentWords) transaction_type = "spent";
  else throw new Error("لم أحدد نوع الحركة. اكتب استلمنا أو صرفنا أو اشترينا.");

  const amountMatch = normalized.match(
    /(\d[\d,،]*(?:\.\d+)?)\s*(مليار|مليون|ملايين|ألف|الف|آلاف|الاف|ألفين)?/
  );

  if (!amountMatch) {
    throw new Error("لم أجد المبلغ. اكتب المبلغ بالأرقام مثل 250000 أو 250 ألف.");
  }

  let amount = Number(amountMatch[1].replace(/[,،]/g, ""));
  const scale = amountMatch[2] || "";
  if (/مليار/.test(scale)) amount *= 1000000000;
  else if (/مليون/.test(scale)) amount *= 1000000;
  else if (/ألفين/.test(scale)) amount *= 2000;
  else if (/ألف|الف|آلاف|الاف/.test(scale)) amount *= 1000;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("المبلغ غير صالح.");
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  let date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  if (/أمس|البارحة/.test(normalized)) {
    now.setDate(now.getDate() - 1);
    date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  } else {
    const dm = normalized.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
    if (dm) {
      const day = Number(dm[1]), month = Number(dm[2]);
      let year = dm[3] ? Number(dm[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      const check = new Date(year, month - 1, day);
      if (check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day) {
        date = `${year}-${pad(month)}-${pad(day)}`;
      }
    }
  }

  return {
    transaction_type,
    amount,
    transaction_date: date,
    description: original,
    needs_review: ["تحقق من نوع الحركة والمبلغ والتاريخ قبل الحفظ"]
  };
}


function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [editingTxId, setEditingTxId] = useState('');
  const [draft, setDraft] = useState({ project_name: '', owner_name: '', received_amount: '0', spent_amount: '0', work_percentage: '10', commission_percentage: '0' });
  const [tx, setTx] = useState({ transaction_type: 'spent', amount: '', transaction_date: today(), description: '' });
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const selected = projects.find(p => p.id === selectedId) || null;
  const filtered = useMemo(() => projects.filter(p => `${p.project_name} ${p.owner_name}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const totals = useMemo(() => projects.reduce((a,p) => ({ received:a.received+Number(p.received_amount||0), spent:a.spent+Number(p.spent_amount||0) }), {received:0,spent:0}), [projects]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({data, error}) => {
      if (error) setAuthError(error.message);
      setSession(data?.session || null);
      setAuthLoading(false);
    });
    const {data: listener} = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const {error} = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword
    });
    if (error) {
      setAuthError('تعذر تسجيل الدخول: ' + error.message);
      setAuthLoading(false);
    }
  }

  async function loadProjects() {
    if (!supabase || !session?.user?.id) { setProjects([]); return; }
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
  async function refreshProjectTotals(projectId) {
    const { data, error } = await supabase.from('barham_transactions').select('transaction_type,amount').eq('project_id', projectId);
    if (error) { setError('تعذر إعادة حساب الإجماليات: ' + error.message); return; }
    const received = (data || []).filter(t => t.transaction_type === 'received').reduce((s,t) => s + Number(t.amount || 0), 0);
    const spent = (data || []).filter(t => t.transaction_type === 'spent').reduce((s,t) => s + Number(t.amount || 0), 0);
    const { data: updated, error: updateError } = await supabase.from('barham_projects').update({received_amount:received, spent_amount:spent, updated_at:new Date().toISOString()}).eq('id', projectId).select().single();
    if (updateError) setError('تم تعديل الحركة لكن تعذر تحديث إجمالي المشروع: ' + updateError.message);
    else setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
  }
  useEffect(() => {
    if (session?.user?.id) loadProjects();
    else {
      setProjects([]);
      setSelectedId('');
      setTransactions([]);
    }
  }, [session?.user?.id]);
  useEffect(() => { loadTransactions(selectedId); }, [selectedId, projects.length]);

  async function saveProject(e) {
    e.preventDefault(); setError(''); setNotice('');
    if (!draft.project_name.trim()) { setError('اكتب اسم المشروع أولاً.'); return; }
    if (!supabase) { setError('قاعدة البيانات غير مربوطة بعد؛ اتبع ملف README لإعداد Supabase.'); return; }
    setSaving(true);
    const openingReceived = Number(draft.received_amount||0), openingSpent = Number(draft.spent_amount||0);
    const payload = { user_id:session.user.id, project_name:draft.project_name.trim(), owner_name:draft.owner_name.trim(), received_amount:0, spent_amount:0, work_percentage:Number(draft.work_percentage||0), commission_percentage:Number(draft.commission_percentage||0), updated_at:new Date().toISOString() };
    const { data, error } = await supabase.from('barham_projects').insert(payload).select().single();
    if (error) setError('لم يُحفظ المشروع: ' + error.message);
    else {
      const openingRows = [];
      if (openingReceived > 0) openingRows.push({user_id:session.user.id,project_id:data.id,transaction_type:'received',amount:openingReceived,transaction_date:today(),description:'رصيد افتتاحي'});
      if (openingSpent > 0) openingRows.push({user_id:session.user.id,project_id:data.id,transaction_type:'spent',amount:openingSpent,transaction_date:today(),description:'صرف افتتاحي'});
      if (openingRows.length) {
        const { error: openingError } = await supabase.from('barham_transactions').insert(openingRows);
        if (openingError) setError('تم إنشاء المشروع لكن تعذر حفظ الأرصدة الافتتاحية: ' + openingError.message);
      }
      setProjects(prev => [data,...prev]); setSelectedId(data.id); setDraft({project_name:'',owner_name:'',received_amount:'0',spent_amount:'0',work_percentage:'10',commission_percentage:'0'}); setShowForm(false); setActivePage('dashboard');
      await refreshProjectTotals(data.id); await loadTransactions(data.id); setNotice('تم حفظ المشروع على الإنترنت.');
    }
    setSaving(false);
  }
  async function analyzeTransaction() {
    if (!aiText.trim()) { setError('اكتب وصف الحركة أولاً.'); return; }
    setAiLoading(true); setError(''); setNotice('');
    try {
      const result = parseTransactionLocally(aiText.trim());
      if (!result || !['received', 'spent'].includes(result.transaction_type) || !(Number(result.amount) > 0)) {
        throw new Error('نتيجة التحليل غير مكتملة؛ راجع الوصف وحاول مرة أخرى.');
      }
      setTx({
        transaction_type: result.transaction_type,
        amount: String(result.amount),
        transaction_date: result.transaction_date || today(),
        description: result.description || aiText.trim()
      });
      setNotice('تم تحليل الحركة. راجع الحقول ثم اضغط حفظ الحركة.');
    } catch (e) {
      setError('تعذر تحليل الحركة: ' + e.message);
    } finally {
      setAiLoading(false);
    }
  }
  async function saveTransaction(e) {
    e.preventDefault(); if (!selected) return;
    if (!supabase) { setError('قاعدة البيانات غير مربوطة بعد؛ اتبع ملف README لإعداد Supabase.'); return; }
    const amount = Number(tx.amount);
    if (!(amount > 0)) { setError('أدخل مبلغاً أكبر من صفر.'); return; }
    setSaving(true); setError(''); setNotice('');
    const payload = { user_id:session.user.id, project_id:selected.id, transaction_type:tx.transaction_type, amount, transaction_date:tx.transaction_date, description:tx.description.trim() };
    const result = editingTxId
      ? await supabase.from('barham_transactions').update(payload).eq('id', editingTxId).eq('project_id', selected.id)
      : await supabase.from('barham_transactions').insert(payload);
    if (result.error) { setError((editingTxId?'تعذر تعديل الحركة: ':'لم تُحفظ الحركة: ') + result.error.message); setSaving(false); return; }
    await refreshProjectTotals(selected.id);
    await loadTransactions(selected.id);
    setNotice(editingTxId ? 'تم تعديل الحركة وإعادة حساب الإجماليات.' : 'تم حفظ الحركة وتحديث إجمالي المشروع.');
    setTx({transaction_type:'spent', amount:'', transaction_date:today(), description:''}); setEditingTxId(''); setSaving(false);
  }
  function startEditTransaction(t) {
    setEditingTxId(t.id);
    setTx({transaction_type:t.transaction_type, amount:String(t.amount), transaction_date:t.transaction_date, description:t.description || ''});
    document.querySelector('.tx-form')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function deleteTransaction(t) {
    if (!confirm(`هل تريد حذف حركة «${t.description || (t.transaction_type==='received'?'استلام':'صرف')}» بمبلغ ${money(t.amount)}؟`)) return;
    const { error } = await supabase.from('barham_transactions').delete().eq('id', t.id).eq('project_id', selected.id);
    if (error) { setError('تعذر حذف الحركة: ' + error.message); return; }
    await refreshProjectTotals(selected.id); await loadTransactions(selected.id);
    if (editingTxId === t.id) { setEditingTxId(''); setTx({transaction_type:'spent',amount:'',transaction_date:today(),description:''}); }
    setNotice('تم حذف الحركة وإعادة حساب الإجماليات.');
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
  function printReport() {
    if (!selected) { setError('اختر مشروعاً أولاً لعرض تقريره.'); return; }
    setError(''); window.print();
  }
  function exportCsv() {
    if (!selected) { setError('اختر مشروعاً أولاً لتحميل تقريره.'); return; }
    const rows = [['التاريخ','النوع','التفاصيل','المبلغ (د.ع)'], ...transactions.map(t => [t.transaction_date,t.transaction_type==='received'?'استلام':'صرف',t.description || '',String(t.amount)])];
    const csv = '\ufeff' + rows.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `barham-${(selected.project_name||'project').replace(/[^\w\u0600-\u06FF-]/g,'_')}-report.csv`; a.click(); URL.revokeObjectURL(href); setNotice('تم تجهيز التقرير بصيغة CSV.');
  }

  if (authLoading) return <div className="app" dir="rtl"><main className="main"><div className="empty">جارٍ التحقق من تسجيل الدخول...</div></main></div>;

  if (!session) return <div className="app" dir="rtl">
    <main className="main" style={{maxWidth:520,margin:'60px auto',width:'100%'}}>
      <section className="panel" style={{padding:28}}>
        <div className="brand" style={{marginBottom:24}}><div className="brand-icon"><img src="/images/barham-logo.png" alt="شعار برهم" /></div><div><strong>برهم</strong><small>حسابات المشاريع</small></div></div>
        <h1>تسجيل الدخول</h1>
        <p>سجّل الدخول لفتح مشاريعك.</p>
        {authError && <div className="alert error">{authError}</div>}
        {!supabase && <div className="alert error">تحقق من إعدادات الاتصال بقاعدة البيانات.</div>}
        <form className="project-form" onSubmit={signIn}>
          <label>البريد الإلكتروني<input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} autoComplete="username"/></label>
          <label>كلمة المرور<input type="password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} autoComplete="current-password"/></label>
          <button className="btn primary full" disabled={!supabase}>دخول</button>
        </form>
      </section>
    </main>
  </div>;

  return <div className="app" dir="rtl">
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><img src="/images/barham-logo.png" alt="شعار برهم" /></div><div><strong>برهم</strong><small>حسابات المشاريع</small></div></div><div className="nav-label">القائمة</div><button className={'nav '+(activePage==='dashboard'?'active':'')} onClick={()=>setActivePage('dashboard')}><Gauge size={22} strokeWidth={1.8}/> لوحة التحكم</button><button className={'nav '+(activePage==='projects'?'active':'')} onClick={()=>setActivePage('projects')}><FolderOpen size={22} strokeWidth={1.8}/> المشاريع</button><div className="sidebar-bottom"><span className={supabase?'dot':'dot offline'}></span>{supabase?'قاعدة البيانات متصلة':'بانتظار ربط قاعدة البيانات'}<button className="btn outline small-btn" onClick={async()=>{const {error}=await supabase.auth.signOut();if(error)setError(error.message);}}>تسجيل الخروج</button></div></aside>
    <main className="main"><header className="topbar"><div><div className="eyebrow">نظام إدارة المشاريع</div><h1>{activePage==='projects'?'المشاريع':'دفتر برهم'}</h1><p>{activePage==='projects'?'اختر مشروعاً لفتح حساباته وإجراءاته':'إدارة الاستلامات والمصروفات ونسبة العمل لكل مشروع'}</p></div><button className="btn outline" onClick={loadProjects}><RefreshCw size={16}/> تحديث</button></header>
      {!supabase && <div className="setup-banner"><CloudOff size={19}/><div><b>الحفظ السحابي غير مفعّل بعد</b><span>أكمل إعداد Supabase حسب ملف README داخل الحزمة حتى تُحفظ البيانات على الإنترنت.</span></div></div>}
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      {activePage==='dashboard' && <section className="stats"><article className="stat"><span className="stat-icon green"><FolderKanban/></span><span>عدد المشاريع</span><strong>{projects.length}</strong></article><article className="stat"><span className="stat-icon blue"><TrendingUp/></span><span>إجمالي المستلم</span><strong>{money(totals.received)}</strong></article><article className="stat"><span className="stat-icon red"><TrendingDown/></span><span>إجمالي المصروف</span><strong>{money(totals.spent)}</strong></article><article className="stat"><span className="stat-icon gold"><Wallet/></span><span>المتبقي الإجمالي</span><strong>{money(totals.received-totals.spent)}</strong></article></section>}
      <section className={'content-grid '+(activePage==='projects'?'projects-only':'')}><article className="panel projects-panel" id="projects-panel"><div className="panel-head"><div><h2>المشاريع</h2><p>اضغط على اسم المشروع لفتح حساباته</p></div><button className="btn primary" onClick={()=>setShowForm(!showForm)}><Plus size={17}/> مشروع جديد</button></div><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم المشروع أو صاحبه"/></div>
      {showForm && <form className="project-form" onSubmit={saveProject}><h3>معلومات المشروع</h3><label>اسم المشروع<input required value={draft.project_name} onChange={e=>setDraft({...draft,project_name:e.target.value})} placeholder="اسم المشروع"/></label><label>صاحب المشروع<input value={draft.owner_name} onChange={e=>setDraft({...draft,owner_name:e.target.value})} placeholder="اسم صاحب المشروع"/></label><div className="two"><label>المبلغ المستلم<input type="number" min="0" step="0.01" value={draft.received_amount} onChange={e=>setDraft({...draft,received_amount:e.target.value})}/></label><label>المبلغ المصروف<input type="number" min="0" step="0.01" value={draft.spent_amount} onChange={e=>setDraft({...draft,spent_amount:e.target.value})}/></label></div><div className="two"><label>نسبة إنجاز العمل (%)<input type="number" min="0" max="100" value={draft.work_percentage} onChange={e=>setDraft({...draft,work_percentage:e.target.value})}/></label><label>نسبة العمولة (%)<input type="number" min="0" max="100" step="0.01" value={draft.commission_percentage} onChange={e=>setDraft({...draft,commission_percentage:e.target.value})}/></label></div><p>تُحتسب العمولة تدريجياً مع كل مصروف فعلي مسجل.</p><div className="form-actions"><button type="button" className="btn outline" onClick={()=>setShowForm(false)}>إلغاء</button><button disabled={saving} className="btn primary"><Save size={16}/>{saving?'جارٍ الحفظ':'حفظ المشروع'}</button></div></form>}
      {loading?<div className="empty">جارٍ تحميل المشاريع...</div>:filtered.length===0?<div className="empty"><FolderKanban size={34}/><b>لا توجد مشاريع بعد</b><span>اضغط «مشروع جديد» لإضافة أول مشروع.</span></div>:<div className="project-list">{filtered.map(p=><button key={p.id} className={'project-item '+(p.id===selectedId?'chosen':'')} onClick={()=>{setSelectedId(p.id);setActivePage('dashboard');}}><span className="project-avatar"><FolderKanban size={20}/></span><span className="project-title"><b>{p.project_name}</b><small>{p.owner_name||'صاحب المشروع غير محدد'}</small></span><span className="project-percent">{p.work_percentage}%</span><ArrowRight className="project-open" size={16}/></button>)}</div>}
      {activePage==='dashboard' && <div className="tx-sidebar-panel">
        {selected ? <form className="tx-form" onSubmit={saveTransaction}><div className="tx-form-heading"><h3>{editingTxId?'تعديل حركة مالية':'إضافة حركة مالية'}</h3><div className="ai-transaction-box"><label>التحليل الذكي للحركة<textarea value={aiText} onChange={e=>setAiText(e.target.value)} placeholder="مثال: دفعت 250 ألف دينار لشراء مواد بناء اليوم" rows="2"/></label><button type="button" className="btn outline full" onClick={analyzeTransaction} disabled={aiLoading || saving}>{aiLoading?'جارٍ تحليل الحركة...':'تحليل الوصف بالذكاء الاصطناعي'}</button></div>{editingTxId&&<button type="button" className="btn outline small-btn" onClick={()=>{setEditingTxId('');setTx({transaction_type:'spent',amount:'',transaction_date:today(),description:''});}}><X size={14}/> إلغاء التعديل</button>}</div><div className="two"><label>نوع الحركة<select value={tx.transaction_type} onChange={e=>setTx({...tx,transaction_type:e.target.value})}><option value="received">استلام مبلغ</option><option value="spent">صرف مبلغ</option></select></label><label>المبلغ (د.ع)<input required type="number" min="0.01" step="0.01" value={tx.amount} onChange={e=>setTx({...tx,amount:e.target.value})} placeholder="0"/></label></div><div className="two"><label>التاريخ<input required type="date" value={tx.transaction_date} onChange={e=>setTx({...tx,transaction_date:e.target.value})}/></label><label>البيان والتفاصيل<input value={tx.description} onChange={e=>setTx({...tx,description:e.target.value})} placeholder="تفاصيل الحركة أو رقم الوصل"/></label></div><button disabled={saving} className="btn primary full"><Plus size={16}/>{saving?'جارٍ الحفظ':editingTxId?'حفظ التعديلات':'حفظ الحركة وتحديث الرصيد'}</button></form> : <div className="empty"><b>اختر مشروعاً أولاً</b><span>ثم أضف حركة مالية من هنا.</span></div>}
      </div>}
</article>
      {activePage==='dashboard' && <article className="panel detail-panel"><div className="panel-head"><div><h2>تفاصيل المشروع</h2><p>{selected?'ملخص الحساب والحركات المالية':'اختر مشروعاً من القائمة'}</p></div>{selected&&<div className="header-actions"><button className="btn outline small-btn" onClick={printReport} title="طباعة أو حفظ PDF"><Printer size={15}/> PDF</button><button className="btn outline small-btn" onClick={exportCsv} title="تحميل جدول الحركات"><FileDown size={15}/> Excel/CSV</button><button className="icon-btn danger" title="حذف المشروع" onClick={()=>deleteProject(selected)}><Trash2 size={17}/></button></div>}</div>
      {selected?<><div className="selected-title"><div className="large-avatar"><FolderKanban size={26}/></div><div><h3>{selected.project_name}</h3><span>صاحب المشروع: {selected.owner_name||'غير محدد'}</span></div></div><div className="balance-grid"><div className="balance received"><span>المبلغ المستلم</span><b>{money(selected.received_amount)}</b></div><div className="balance spent"><span>المبلغ المصروف</span><b>{money(selected.spent_amount)}</b></div><div className="balance remaining"><span>المبلغ المتبقي</span><b>{money(Number(selected.received_amount)-Number(selected.spent_amount)-(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100))}</b></div><div className="balance commission"><span>مستحقات العمولة</span><b>{money(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)}</b><small>{Number(selected.commission_percentage||0)}% من المصروفات الفعلية</small></div></div><div className="progress-card"><div className="progress-head"><span><Percent size={17}/> نسبة العمل المنجزة</span><b>{selected.work_percentage}%</b></div><div className="progress-track"><div className="progress-fill" style={{width:`${selected.work_percentage}%`}}/></div><label className="progress-label">تعديل النسبة يدوياً<input type="number" min="0" max="100" value={selected.work_percentage} onChange={e=>updateProgress(Math.min(100,Math.max(0,Number(e.target.value))))}/></label></div><div className="transactions"><h3><CalendarDays size={17}/> سجل الحركات ({transactions.length})</h3>{transactions.length===0?<div className="no-transactions">لا توجد حركات مسجلة لهذا المشروع.</div>:<div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان والتفاصيل</th><th>المبلغ</th><th>إجراءات</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td>{t.transaction_date}</td><td><span className={'pill '+(t.transaction_type==='received'?'pill-in':'pill-out')}>{t.transaction_type==='received'?'استلام':'صرف'}</span></td><td>{t.description||'—'}</td><td className={t.transaction_type==='received'?'text-green':'text-red'}>{money(t.amount)}</td><td><div className="row-actions"><button className="icon-btn edit-btn" title="تعديل الحركة" onClick={()=>startEditTransaction(t)}><Pencil size={15}/></button><button className="icon-btn danger" title="حذف الحركة" onClick={()=>deleteTransaction(t)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}</div></>:<div className="empty detail-empty"><CircleDollarSign size={38}/><b>لا يوجد مشروع محدد</b><span>أضف مشروعاً جديداً أو اختر مشروعاً موجوداً لعرض التفاصيل.</span></div>}</article>}</section>
      {selected&&<section className="print-report">
        <div className="print-page print-page-summary">
          <header className="report-header">
            <div className="report-brand">
              <span className="report-logo"><img src="/images/barham-logo.png" alt="شعار برهم" /></span>
              <div><strong>برهم</strong><small>دفتر حسابات المشاريع</small></div>
            </div>
            <div className="report-heading"><h1>تقرير المشروع المالي</h1><p>تفاصيل الاستلامات والمصروفات ونسبة العمل</p></div>
          </header>

          <div className="report-project-info">
            <div className="report-project-main">
              <span className="report-folder">▣</span>
              <div><small>اسم المشروع</small><h2>{selected.project_name}</h2><p>صاحب المشروع: {selected.owner_name||'غير محدد'}</p></div>
            </div>
            <div className="report-meta">
              <p><span>عدد الحركات</span><b>{transactions.length}</b></p>
              <p><span>تاريخ التقرير</span><b>{today()}</b></p>
              <p><span>نسبة إنجاز العمل</span><b>{Number(selected.work_percentage||0)}%</b></p>
              <p><span>حالة المشروع</span><b>قيد المتابعة</b></p>
            </div>
          </div>

          <div className="report-financial-cards">
            <div className="report-card report-received"><span>المبلغ المستلم</span><b>{money(selected.received_amount)}</b><small>إجمالي الاستلامات</small></div>
            <div className="report-card report-spent"><span>المبلغ المصروف</span><b>{money(selected.spent_amount)}</b><small>إجمالي المصروفات</small></div>
            <div className="report-card report-balance"><span>المبلغ المتبقي</span><b>{money(Number(selected.received_amount)-Number(selected.spent_amount)-(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100))}</b><small>بعد خصم العمولة</small></div>
            <div className="report-card report-commission"><span>مستحقات العمولة</span><b>{money(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)}</b><small>نسبة العمولة {Number(selected.commission_percentage||0)}%</small></div>
          </div>

          <section className="report-work-section">
            <h3>نسبة سير العمل في المشروع</h3>
            <div className="report-progress-line"><span style={{width:`${Math.min(100,Math.max(0,Number(selected.work_percentage||0)))}%`}}></span></div>
            <div className="report-progress-labels"><span>0%</span><strong>{Number(selected.work_percentage||0)}%</strong><span>100%</span></div>
          </section>

          <div className="report-detail-columns">
            <section className="report-detail-box">
              <h3>ملخص مالي للمشروع</h3>
              <p><span>إجمالي المستلم</span><b className="amount-in">{money(selected.received_amount)}</b></p>
              <p><span>إجمالي المصروفات</span><b className="amount-out">{money(selected.spent_amount)}</b></p>
              <p><span>مستحقات العمولة</span><b className="amount-fee">{money(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)}</b></p>
              <p className="report-final-row"><span>المبلغ المتبقي النهائي</span><b>{money(Number(selected.received_amount)-Number(selected.spent_amount)-(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100))}</b></p>
            </section>
            <section className="report-detail-box report-distribution">
              <h3>توزيع المبالغ</h3>
              <div><span>المستلم</span><i><b style={{width:`${Number(selected.received_amount)>0?100:0}%`}}></b></i><strong>{money(selected.received_amount)}</strong></div>
              <div><span>المصروف</span><i><b className="bar-spent" style={{width:`${Number(selected.received_amount)>0?Math.min(100,Number(selected.spent_amount)/Number(selected.received_amount)*100):0}%`}}></b></i><strong>{money(selected.spent_amount)}</strong></div>
              <div><span>العمولة</span><i><b className="bar-fee" style={{width:`${Number(selected.received_amount)>0?Math.min(100,(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)/Number(selected.received_amount)*100):0}%`}}></b></i><strong>{money(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)}</strong></div>
            </section>
          </div>

          <section className="report-notes"><h3>ملاحظات</h3><p>................................................................................................................</p><p>................................................................................................................</p></section>
          <footer className="report-page-footer"><span>تقرير صادر من نظام برهم لإدارة حسابات المشاريع</span><span>صفحة 1 من 2 · {today()}</span></footer>
        </div>

        <div className="print-page print-page-transactions">
          <header className="report-header">
            <div className="report-brand"><span className="report-logo"><img src="/images/barham-logo.png" alt="شعار برهم" /></span><div><strong>برهم</strong><small>دفتر حسابات المشاريع</small></div></div>
            <div className="report-heading"><h1>سجل الحركات المالية</h1><p>{selected.project_name} · جميع المبالغ بالدينار العراقي</p></div>
          </header>
          <table className="report-transactions-table">
            <thead><tr><th>ت</th><th>التاريخ</th><th>النوع</th><th>البيان / التفاصيل</th><th>المبلغ (د.ع)</th><th>الرصيد بعد الحركة (د.ع)</th></tr></thead>
            <tbody>{[...transactions].sort((a,b)=>String(a.transaction_date).localeCompare(String(b.transaction_date))||String(a.created_at||'').localeCompare(String(b.created_at||''))).reduce((acc,t,i)=>{
              const amount=Number(t.amount||0);
              const balance=(acc.length?acc[acc.length-1].balance:0)+(t.transaction_type==='received'?amount:-amount);
              acc.push({t,i,balance});
              return acc;
            },[]).map(({t,i,balance})=><tr key={t.id}><td>{i+1}</td><td>{t.transaction_date}</td><td><span className={t.transaction_type==='received'?'report-type-in':'report-type-out'}>{t.transaction_type==='received'?'استلام':'مصروف'}</span></td><td>{t.description||'—'}</td><td className={t.transaction_type==='received'?'amount-in':'amount-out'}>{money(t.amount)}</td><td>{money(balance)}</td></tr>)}</tbody>
            <tfoot>
              <tr><th colSpan="4">إجمالي الاستلامات</th><th>{money(selected.received_amount)}</th><th>—</th></tr>
              <tr><th colSpan="4">إجمالي المصروفات</th><th>{money(selected.spent_amount)}</th><th>—</th></tr>
              <tr><th colSpan="4">مستحقات العمولة</th><th>{money(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100)}</th><th>—</th></tr>
              <tr className="report-total-final"><th colSpan="4">الرصيد النهائي بعد خصم العمولة</th><th colSpan="2">{money(Number(selected.received_amount)-Number(selected.spent_amount)-(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100))}</th></tr>
            </tfoot>
          </table>
          <section className="report-closing-balance"><div><small>الرصيد النهائي للمشروع</small><strong>{money(Number(selected.received_amount)-Number(selected.spent_amount)-(Number(selected.spent_amount)*Number(selected.commission_percentage||0)/100))}</strong><p>بعد خصم المصروفات ومستحقات العمولة</p></div></section>
          <footer className="report-page-footer"><span>تقرير صادر من نظام برهم لإدارة حسابات المشاريع</span><span>صفحة 2 من 2 · {today()}</span></footer>
        </div>
      </section>}
      <footer>برهم · حسابات المشاريع · العملة المعتمدة الدينار العراقي</footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
