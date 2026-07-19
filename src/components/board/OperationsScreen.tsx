import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Monitor, Edit2, Check, X } from 'lucide-react';

interface OperationsRow {
  id: string;
  customer: string;
  job: string;
  qty: string;
  target: string;
  finish: string;
  workers: string;
}

const STORAGE_KEY = 'ops_screen_rows';

const emptyRow = (): OperationsRow => ({
  id: Math.random().toString(36).slice(2),
  customer: '',
  job: '',
  qty: '',
  target: '',
  finish: '',
  workers: '',
});

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const OperationsScreen: React.FC = () => {
  const [rows, setRows] = useState<OperationsRow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [emptyRow()];
    } catch { return [emptyRow()]; }
  });

  const [now, setNow] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<OperationsRow | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const addRow = () => {
    const r = emptyRow();
    setRows(prev => [...prev, r]);
    setEditingId(r.id);
    setEditData(r);
  };

  const deleteRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const startEdit = (row: OperationsRow) => {
    setEditingId(row.id);
    setEditData({ ...row });
  };

  const saveEdit = () => {
    if (!editData) return;
    setRows(prev => prev.map(r => r.id === editData.id ? editData : r));
    setEditingId(null);
    setEditData(null);
  };

  const cancelEdit = () => {
    if (editData && rows.find(r => r.id === editData.id)?.customer === '') {
      setRows(prev => prev.filter(r => r.id !== editData.id));
    }
    setEditingId(null);
    setEditData(null);
  };

  const timeStr = now.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dayStr = DAYS_AR[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTHS_AR[now.getMonth()]} ${now.getFullYear()}`;

  const colHeaders = ['العميل', 'الوظيفة', 'الكمية', 'الهدف', 'تاريخ الإنجاز', 'العمال'];

  const tableContent = (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: fullscreen ? 28 : 16,
        fontFamily: 'inherit',
      }}>
        <thead>
          <tr>
            {colHeaders.map((h, i) => (
              <th key={i} style={{
                background: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][i],
                color: '#fff', padding: fullscreen ? '18px 24px' : '10px 14px',
                textAlign: 'center', fontWeight: 800,
                fontSize: fullscreen ? 26 : 15,
                borderRadius: i === 0 ? '10px 0 0 10px' : i === 5 ? '0 10px 10px 0' : 0,
              }}>
                {h}
              </th>
            ))}
            {!fullscreen && <th style={{ width: 80, background: '#1e293b', color: '#64748b', padding: '10px 8px', textAlign: 'center' }}>إجراءات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)' }}>
              {editingId === row.id && editData ? (
                <>
                  {(['customer', 'job', 'qty', 'target', 'finish', 'workers'] as (keyof OperationsRow)[]).map((field) => (
                    <td key={field} style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <input
                        value={editData[field]}
                        onChange={e => setEditData(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus={field === 'customer'}
                        style={{
                          background: 'rgba(255,255,255,0.12)', border: '1.5px solid #6366f1',
                          color: '#fff', borderRadius: 6, padding: '6px 10px',
                          fontSize: 14, textAlign: 'center', width: '100%', outline: 'none',
                        }}
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                    <button onClick={saveEdit} style={{ background: '#22c55e', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', marginLeft: 4 }}><Check size={14} /></button>
                    <button onClick={cancelEdit} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}><X size={14} /></button>
                  </td>
                </>
              ) : (
                <>
                  {[row.customer, row.job, row.qty, row.target, row.finish, row.workers].map((val, i) => (
                    <td key={i} style={{
                      padding: fullscreen ? '20px 28px' : '12px 14px',
                      textAlign: 'center', color: val ? '#f1f5f9' : '#475569',
                      fontWeight: val ? 600 : 400, fontSize: fullscreen ? 24 : 15,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {val || '—'}
                    </td>
                  ))}
                  {!fullscreen && (
                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                      <button onClick={() => startEdit(row)} style={{ background: 'rgba(99,102,241,0.2)', border: 'none', color: '#818cf8', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', marginLeft: 4 }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteRow(row.id)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#0a0a1a',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'Cairo, Tajawal, sans-serif',
          direction: 'rtl',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '24px 48px', borderBottom: '2px solid rgba(99,102,241,0.3)',
          background: 'rgba(99,102,241,0.08)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#818cf8', fontSize: 22, fontWeight: 700 }}>{dayStr}</span>
            <span style={{ color: '#94a3b8', fontSize: 18 }}>{dateStr}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f1f5f9', fontSize: 52, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>{timeStr}</div>
            <div style={{ color: '#6366f1', fontSize: 22, fontWeight: 700, marginTop: 4 }}>شاشة العمليات</div>
          </div>
          <button
            onClick={() => setFullscreen(false)}
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 16, fontWeight: 600 }}
          >
            <X size={18} style={{ display: 'inline', marginLeft: 6 }} /> إغلاق
          </button>
        </div>
        {/* Table */}
        <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
          {tableContent}
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ direction: 'rtl' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={20} color="#6366f1" /> شاشة العمليات
          </h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>جدول العمليات اليومي — يُعرض على شاشة التلفزيون</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live clock */}
          <div style={{ background: '#0f172a', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ color: '#818cf8', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
            <div style={{ color: '#475569', fontSize: 11 }}>{dayStr} — {dateStr}</div>
          </div>
          <button
            onClick={() => setFullscreen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <Monitor size={16} /> عرض على التلفزيون
          </button>
          <button
            onClick={addRow}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <Plus size={16} /> إضافة صف
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ background: '#0f172a', borderRadius: 16, padding: 20, overflowX: 'auto' }}>
          {tableContent}
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          البيانات تُحفظ تلقائياً على هذا الجهاز • اضغط على ✏️ لتعديل أي صف • اضغط Enter للحفظ
        </p>
      </div>
    </div>
  );
};

export default OperationsScreen;
