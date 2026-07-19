import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Monitor, Edit2, Check, X } from 'lucide-react';
import { OpsRow } from '../../types';
import { opsServerLoad, opsServerSave, opsRowsScore } from '../../utils/storage';

const emptyRow = (): OpsRow => ({
  id: Math.random().toString(36).slice(2),
  date: '',
  customer: '',
  job: '',
  jobImage: '',
  qty: '',
  target: '',
  finishedQty: '',
  finish: '',
  workers: '',
  progress: '',
  updatedAt: new Date().toISOString(),
});

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const COL_COLORS = ['#64748b', '#3b82f6', '#22c55e', '#22c55e', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#f43f5e'];
const COL_HEADERS = ['Date', 'Customer', 'Job', 'Photo', 'Quantity', 'Target', 'Finished Qty', 'Finished Date', 'Progress'];
const COL_FIELDS: (keyof OpsRow)[] = ['date', 'customer', 'job', 'jobImage', 'qty', 'target', 'finishedQty', 'finish', 'progress'];

const OPS_BACKUP_KEY = 'ops_screen_backup';
const OPS_IMAGES_KEY = 'ops_screen_images';
const LEGACY_LS_KEY = 'ops_screen_rows';

const loadImages = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(OPS_IMAGES_KEY) || '{}'); } catch { return {}; }
};
const saveImages = (map: Record<string, string>) => {
  try { localStorage.setItem(OPS_IMAGES_KEY, JSON.stringify(map)); } catch { /* ignore quota */ }
};

const attachLocalImages = (rows: OpsRow[]): OpsRow[] => {
  const imgs = loadImages();
  return rows.map((r) => ({ ...r, jobImage: r.jobImage || imgs[r.id] || '' }));
};

const persistImagesFromRows = (rows: OpsRow[]) => {
  const imgs = loadImages();
  rows.forEach((r) => {
    if (r.jobImage && r.jobImage.startsWith('data:')) imgs[r.id] = r.jobImage;
    else if (!r.jobImage) delete imgs[r.id];
  });
  saveImages(imgs);
};

const backupRows = (rows: OpsRow[]) => {
  try {
    localStorage.setItem(OPS_BACKUP_KEY, JSON.stringify(rows.map((r) => ({ ...r, jobImage: '' }))));
  } catch { /* ignore */ }
};

const loadBackup = (): OpsRow[] => {
  try {
    const raw = localStorage.getItem(OPS_BACKUP_KEY) || localStorage.getItem(LEGACY_LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
};

const PieProgress: React.FC<{ pct: number; size?: number }> = ({ pct, size = 52 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (clamped / 100) * circ;
  const color = clamped >= 100 ? '#22c55e' : clamped > 50 ? '#f59e0b' : '#f43f5e';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color, marginTop: -2 }}>{clamped}%</span>
    </div>
  );
};

const OperationsScreen: React.FC = () => {
  const [rows, setRowsState] = useState<OpsRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'ok' | 'saving' | 'error' | 'loading'>('ok');
  const [now, setNow] = useState(new Date());
  const [fullscreen, setFullscreen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<OpsRow | null>(null);
  const savingRef = useRef(false);
  const localStampRef = useRef<string | null>(null);

  const applyRows = (next: OpsRow[], stamp: string, push: boolean) => {
    const withImages = attachLocalImages(next);
    setRowsState(withImages);
    setUpdatedAt(stamp);
    localStampRef.current = stamp;
    backupRows(withImages);
    persistImagesFromRows(withImages);
    if (push) {
      savingRef.current = true;
      setSyncStatus('saving');
      opsServerSave(withImages, stamp).then((ok) => {
        savingRef.current = false;
        setSyncStatus(ok ? 'ok' : 'error');
      });
    }
  };

  // Open instantly from local backup — never stay on Loading
  useEffect(() => {
    let cancelled = false;
    const backup = loadBackup();
    if (backup.length > 0) {
      // Keep original stamps — do NOT invent "now" or we block server updates
      const stamp = backup.reduce((m, r) => ((r.updatedAt || '') > m ? (r.updatedAt || '') : m), '') || '1970-01-01T00:00:00.000Z';
      applyRows(backup, stamp, false);
      setSyncStatus('ok');
    } else {
      setSyncStatus('ok');
      setRowsState([]);
    }

    (async () => {
      const remote = await opsServerLoad();
      if (cancelled) return;
      if (!remote) {
        setSyncStatus('error');
        // Keep retrying in background
        return;
      }
      const remoteScore = opsRowsScore(remote.rows);
      const localScore = opsRowsScore(backup);
      const remoteAt = remote.updatedAt || '';
      const localAt = localStampRef.current || '';

      if (remoteScore > localScore || (remoteScore > 0 && remoteAt >= localAt)) {
        applyRows(remote.rows, remoteAt || new Date().toISOString(), false);
        setSyncStatus('ok');
      } else if (localScore > 0 && remoteScore === 0) {
        // Local has real data, server empty/shells — push local
        const stamp = new Date().toISOString();
        applyRows(backup, stamp, true);
      } else {
        setSyncStatus('ok');
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll + auto-retry sync every 3s
  useEffect(() => {
    const poll = async () => {
      if (savingRef.current || editingId) return;
      const remote = await opsServerLoad();
      if (!remote) {
        setSyncStatus((s) => (s === 'saving' ? s : 'error'));
        return;
      }
      setSyncStatus((s) => (s === 'saving' ? s : 'ok'));
      const remoteAt = remote.updatedAt || '';
      const localAt = localStampRef.current || updatedAt || '';
      const remoteScore = opsRowsScore(remote.rows);
      const localScore = opsRowsScore(rows);
      if (remoteScore > localScore || (remoteAt && remoteAt > localAt && remoteScore > 0)) {
        applyRows(remote.rows, remoteAt, false);
      } else if (localScore > 0 && remoteScore === 0) {
        // Push local filled table if server still empty
        applyRows(rows, new Date().toISOString(), true);
      }
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, updatedAt, rows]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const setRows = (updater: OpsRow[] | ((prev: OpsRow[]) => OpsRow[])) => {
    const next = typeof updater === 'function' ? updater(rows) : updater;
    const stamp = new Date().toISOString();
    const stamped = next.map((r) => ({ ...r, updatedAt: r.updatedAt || stamp }));
    applyRows(stamped, stamp, true);
  };

  const addRow = () => {
    const r = emptyRow();
    setRows([...rows, r]);
    setEditingId(r.id);
    setEditData(r);
  };

  const deleteRow = (id: string) => setRows(rows.filter((r) => r.id !== id));

  const startEdit = (row: OpsRow) => {
    setEditingId(row.id);
    setEditData({ ...row });
  };

  const saveEdit = () => {
    if (!editData) return;
    const stamped = { ...editData, updatedAt: new Date().toISOString() };
    setRows(rows.map((r) => (r.id === editData.id ? stamped : r)));
    setEditingId(null);
    setEditData(null);
  };

  const cancelEdit = () => {
    if (editData && rows.find((r) => r.id === editData.id)?.customer === '') {
      setRows(rows.filter((r) => r.id !== editData.id));
    }
    setEditingId(null);
    setEditData(null);
  };

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dayStr = DAYS_EN[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTHS_EN[now.getMonth()]} ${now.getFullYear()}`;

  const syncLabel =
    syncStatus === 'saving' ? 'Saving…' :
    syncStatus === 'error' ? 'Sync error — retrying…' :
    syncStatus === 'loading' ? 'Loading…' : 'Synced';

  const tableContent = (isFS: boolean) => (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: isFS ? 28 : 15, fontFamily: 'inherit', direction: 'ltr' }}>
        <thead>
          <tr>
            {COL_HEADERS.map((h, i) => (
              <th key={i} style={{
                background: COL_COLORS[i], color: '#fff',
                padding: isFS ? '20px 28px' : '11px 16px',
                textAlign: 'center', fontWeight: 800, fontSize: isFS ? 26 : 14, letterSpacing: 0.5,
                borderBottom: '3px solid rgba(0,0,0,0.12)',
              }}>{h}</th>
            ))}
            {!isFS && (
              <th style={{ background: '#f1f5f9', color: '#94a3b8', padding: '11px 10px', textAlign: 'center', fontSize: 12, fontWeight: 600, width: 80, borderBottom: '3px solid #e2e8f0' }}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
              {editingId === row.id && editData ? (
                <>
                  {COL_FIELDS.map((field) => (
                    <td key={field} style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0' }}>
                      {field === 'progress' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          {(() => {
                            const t = parseFloat(editData.target);
                            const f = parseFloat(editData.finishedQty);
                            const pct = t > 0 && !isNaN(f) ? Math.min(100, Math.round((f / t) * 100)) : 0;
                            return <PieProgress pct={pct} size={48} />;
                          })()}
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>Auto from Target & Finished Qty</span>
                        </div>
                      ) : field === 'jobImage' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          {editData[field] && (
                            <div style={{ position: 'relative' }}>
                              <img src={editData[field]} alt="job" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, border: '2px solid #22c55e', background: '#f8fafc' }} />
                              <button
                                onClick={() => setEditData((prev) => prev ? { ...prev, jobImage: '' } : prev)}
                                style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', border: 'none', color: '#fff', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              ><X size={10} /></button>
                            </div>
                          )}
                          <label style={{ cursor: 'pointer', background: '#eff6ff', border: '1.5px dashed #6366f1', color: '#6366f1', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {editData[field] ? 'Change' : '+ Upload'}
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => setEditData((prev) => prev ? { ...prev, jobImage: ev.target?.result as string } : prev);
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <input
                          type={(field === 'finish' || field === 'date') ? 'date' : 'text'}
                          value={editData[field]}
                          onChange={(e) => setEditData((prev) => prev ? { ...prev, [field]: e.target.value } : prev)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          autoFocus={field === 'customer'}
                          style={{
                            background: '#fff', border: '1.5px solid #6366f1',
                            color: '#1e293b', borderRadius: 6, padding: '6px 10px',
                            fontSize: 14, textAlign: 'center', width: '100%', outline: 'none',
                            boxShadow: '0 0 0 3px rgba(99,102,241,0.12)',
                          }}
                        />
                      )}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>
                    <button onClick={saveEdit} title="Save" style={{ background: '#22c55e', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', marginRight: 4 }}><Check size={14} /></button>
                    <button onClick={cancelEdit} title="Cancel" style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}><X size={14} /></button>
                  </td>
                </>
              ) : (
                <>
                  {COL_FIELDS.map((field, i) => {
                    if (field === 'progress') {
                      const t = parseFloat(row.target);
                      const f = parseFloat(row.finishedQty);
                      const autoPct = t > 0 && !isNaN(f) ? Math.min(100, Math.round((f / t) * 100)) : 0;
                      return (
                        <td key={field} style={{ padding: isFS ? '16px 28px' : '8px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                          <PieProgress pct={autoPct} size={isFS ? 80 : 52} />
                        </td>
                      );
                    }
                    if (field === 'jobImage') {
                      return (
                        <td key={field} style={{ padding: isFS ? '12px 20px' : '8px 10px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                          {row[field]
                            ? <img src={row[field]} alt="job" style={{ width: isFS ? 100 : 56, height: isFS ? 100 : 56, objectFit: 'contain', borderRadius: 10, border: '2px solid #e2e8f0', background: '#f8fafc', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
                            : <span style={{ color: '#cbd5e1', fontSize: isFS ? 20 : 13 }}>—</span>
                          }
                        </td>
                      );
                    }
                    let display = row[field] || '—';
                    if ((field === 'finish' || field === 'date') && row[field]) {
                      const d = new Date(row[field]);
                      if (!isNaN(d.getTime())) {
                        display = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                      }
                    }
                    return (
                      <td key={field} style={{
                        padding: isFS ? '22px 32px' : '12px 16px',
                        textAlign: 'center',
                        color: row[field] ? '#1e293b' : '#cbd5e1',
                        fontWeight: row[field] ? 600 : 400,
                        fontSize: isFS ? 24 : 14,
                        borderBottom: '1px solid #e2e8f0',
                        borderLeft: i === 0 ? `4px solid ${COL_COLORS[0]}` : 'none',
                      }}>
                        {display}
                      </td>
                    );
                  })}
                  {!isFS && (
                    <td style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid #e2e8f0' }}>
                      <button onClick={() => startEdit(row)} title="Edit" style={{ background: '#eff6ff', border: 'none', color: '#6366f1', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', marginRight: 4 }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteRow(row.id)} title="Delete" style={{ background: '#fef2f2', border: 'none', color: '#ef4444', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}><Trash2 size={13} /></button>
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
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#f8fafc',
        display: 'flex', flexDirection: 'column', fontFamily: 'Segoe UI, Arial, sans-serif', direction: 'ltr',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px', background: '#1e293b', boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: 18, fontWeight: 600 }}>{dayStr}</div>
            <div style={{ color: '#64748b', fontSize: 15, marginTop: 2 }}>{dateStr}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f1f5f9', fontSize: 56, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: 3 }}>{timeStr}</div>
            <div style={{ color: '#6366f1', fontSize: 20, fontWeight: 700, marginTop: 2, letterSpacing: 1 }}>OPERATIONS SCREEN</div>
          </div>
          <button
            onClick={() => setFullscreen(false)}
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 10, padding: '10px 22px', cursor: 'pointer', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <X size={16} /> Close
          </button>
        </div>
        <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto', background: '#f8fafc' }}>
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.10)', border: '1px solid #e2e8f0' }}>
            {tableContent(true)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ direction: 'ltr', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={20} color="#6366f1" /> Operations Screen
          </h2>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
            Daily operations board — dedicated sync channel
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 700,
              color: syncStatus === 'ok' ? '#16a34a' : syncStatus === 'error' ? '#dc2626' : '#ca8a04',
            }}>
              ● {syncLabel}
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#1e293b', borderRadius: 10, padding: '8px 18px', textAlign: 'center' }}>
            <div style={{ color: '#818cf8', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>{dayStr} — {dateStr}</div>
          </div>
          <button
            onClick={() => setFullscreen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <Monitor size={16} /> Display on TV
          </button>
          <button
            onClick={addRow}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            <Plus size={16} /> Add Row
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          {tableContent(false)}
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Synced via dedicated ops API • Click ✏️ to edit • Press Enter to save
        </p>
      </div>
    </div>
  );
};

export default OperationsScreen;
