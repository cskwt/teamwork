import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Monitor, Edit2, Check, X, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { OpsRow } from '../../types';
import { opsServerLoad, opsServerSave, opsRowsScore } from '../../utils/storage';
import { uploadDataUrlToServer } from '../../utils/files';

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
  return rows.map((r) => {
    const current = r.jobImage || '';
    if (current.startsWith('http') || current.startsWith('data:')) return { ...r, jobImage: current };
    return { ...r, jobImage: imgs[r.id] || '' };
  });
};

/** Prefer http URLs from either side so images are never wiped by a device without them */
const mergeRowImages = (incoming: OpsRow[], local: OpsRow[]): OpsRow[] => {
  const locMap = new Map(local.map((r) => [r.id, r]));
  return incoming.map((r) => {
    const l = locMap.get(r.id);
    const a = r.jobImage || '';
    const b = l?.jobImage || '';
    const jobImage =
      (a.startsWith('http') ? a : '') ||
      (b.startsWith('http') ? b : '') ||
      (a.startsWith('data:') ? a : '') ||
      (b.startsWith('data:') ? b : '') ||
      a || b || '';
    return { ...r, jobImage };
  });
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
    // Keep shared http URLs in backup; strip only local data: blobs
    localStorage.setItem(OPS_BACKUP_KEY, JSON.stringify(rows.map((r) => ({
      ...r,
      jobImage: (r.jobImage || '').startsWith('http') ? r.jobImage : '',
    }))));
  } catch { /* ignore */ }
};

/** Upload any local data: images to Hostinger so other devices can see them */
const ensureSharedImages = async (rows: OpsRow[]): Promise<OpsRow[]> => {
  const out: OpsRow[] = [];
  for (const r of rows) {
    if (r.jobImage?.startsWith('data:')) {
      const url = await uploadDataUrlToServer(`ops_${r.id}`, r.jobImage, `ops-${r.id}.jpg`);
      out.push(url ? { ...r, jobImage: url } : r);
    } else {
      out.push(r);
    }
  }
  return out;
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
  const [inProgressId, setInProgressId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const localStampRef = useRef<string | null>(null);
  const inProgressRef = useRef<string | null>(null);

  const setProgress = (id: string | null) => {
    inProgressRef.current = id;
    setInProgressId(id);
  };

  const applyRows = (next: OpsRow[], stamp: string, push: boolean, progressId?: string | null) => {
    if (progressId !== undefined) setProgress(progressId);
    const merged = mergeRowImages(next, rows);
    const withImages = attachLocalImages(merged);
    // Drop in-progress if that row was deleted
    let progress = inProgressRef.current;
    if (progress && !withImages.some((r) => r.id === progress)) {
      progress = null;
      setProgress(null);
    }
    setRowsState(withImages);
    setUpdatedAt(stamp);
    localStampRef.current = stamp;
    backupRows(withImages);
    persistImagesFromRows(withImages);
    if (push) {
      savingRef.current = true;
      setSyncStatus('saving');
      (async () => {
        const shared = await ensureSharedImages(withImages);
        if (shared.some((r, i) => r.jobImage !== withImages[i].jobImage)) {
          setRowsState(attachLocalImages(shared));
          backupRows(shared);
          persistImagesFromRows(shared);
        }
        const ok = await opsServerSave(shared, stamp, progress);
        savingRef.current = false;
        setSyncStatus(ok ? 'ok' : 'error');
      })();
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
        applyRows(remote.rows, remoteAt || new Date().toISOString(), false, remote.inProgressId ?? null);
        setSyncStatus('ok');
      } else if (localScore > 0 && remoteScore === 0) {
        // Local has real data, server empty/shells — push local
        const stamp = new Date().toISOString();
        applyRows(backup, stamp, true);
      } else {
        if (remote.inProgressId !== undefined) setProgress(remote.inProgressId ?? null);
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
        applyRows(remote.rows, remoteAt, false, remote.inProgressId ?? null);
      } else if (localScore > 0 && remoteScore === 0) {
        // Push local filled table if server still empty
        applyRows(rows, new Date().toISOString(), true);
      } else if (remote.inProgressId !== undefined && remote.inProgressId !== inProgressRef.current) {
        setProgress(remote.inProgressId ?? null);
      }
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, updatedAt, rows]);

  // One-time: upload any local-only photos so other devices can see them
  const migrateAttempts = useRef(0);
  useEffect(() => {
    if (editingId || savingRef.current) return;
    if (!rows.some((r) => r.jobImage?.startsWith('data:'))) return;
    if (migrateAttempts.current >= 2) return;
    migrateAttempts.current += 1;
    const t = setTimeout(() => {
      applyRows(rows, new Date().toISOString(), true);
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, editingId]);

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

  const moveRow = (id: string, dir: -1 | 1) => {
    if (editingId) return;
    const idx = rows.findIndex((r) => r.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= rows.length) return;
    const copy = [...rows];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setRows(copy);
  };

  const startEdit = (row: OpsRow) => {
    setEditingId(row.id);
    setEditData({ ...row });
  };

  const saveEdit = async () => {
    if (!editData) return;
    let stamped = { ...editData, updatedAt: new Date().toISOString() };
    if (stamped.jobImage?.startsWith('data:')) {
      setSyncStatus('saving');
      const url = await uploadDataUrlToServer(`ops_${stamped.id}`, stamped.jobImage, `ops-${stamped.id}.jpg`);
      if (url) stamped = { ...stamped, jobImage: url };
      else alert('Failed to upload photo to server — other devices may not see it. Check connection and try again.');
    }
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

  /** Upload/replace photo on a row from any device (no need for original uploader) */
  const uploadPhotoForRow = (rowId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setSyncStatus('saving');
      const url = await uploadDataUrlToServer(`ops_${rowId}`, dataUrl, file.name || `ops-${rowId}.jpg`);
      if (!url) {
        setSyncStatus('error');
        alert('Failed to upload photo — check connection and try again.');
        return;
      }
      const stamp = new Date().toISOString();
      setRows(rows.map((r) => (r.id === rowId ? { ...r, jobImage: url, updatedAt: stamp } : r)));
    };
    reader.readAsDataURL(file);
  };

  const setInProgressOrder = (id: string | null) => {
    setProgress(id);
    const stamp = new Date().toISOString();
    localStampRef.current = stamp;
    setUpdatedAt(stamp);
    savingRef.current = true;
    setSyncStatus('saving');
    opsServerSave(rows, stamp, id).then((ok) => {
      savingRef.current = false;
      setSyncStatus(ok ? 'ok' : 'error');
    });
  };

  const inProgressRow = rows.find((r) => r.id === inProgressId) || null;
  const rowLabel = (r: OpsRow, i: number) => {
    const cust = r.customer?.trim() || 'Untitled';
    const job = r.job?.trim();
    return job ? `#${i + 1}  ${cust} — ${job}` : `#${i + 1}  ${cust}`;
  };

  const progressCard = (isFS: boolean) => (
    <div style={{
      display: 'flex',
      alignItems: isFS ? 'center' : 'stretch',
      gap: isFS ? 24 : 16,
      flexWrap: 'wrap',
      background: inProgressRow
        ? 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)'
        : '#f8fafc',
      border: inProgressRow ? '2px solid #10b981' : '1px solid #e2e8f0',
      borderRadius: isFS ? 20 : 14,
      padding: isFS ? '22px 32px' : '14px 18px',
      marginBottom: isFS ? 28 : 16,
      boxShadow: inProgressRow ? '0 8px 28px rgba(16,185,129,0.15)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: isFS ? 280 : 160 }}>
        <div style={{
          width: isFS ? 56 : 40, height: isFS ? 56 : 40, borderRadius: 12,
          background: inProgressRow ? '#10b981' : '#94a3b8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', flexShrink: 0,
        }}>
          <Play size={isFS ? 28 : 18} fill="#fff" />
        </div>
        <div>
          <div style={{
            fontSize: isFS ? 14 : 11, fontWeight: 800, letterSpacing: 1.2,
            color: inProgressRow ? '#059669' : '#94a3b8', textTransform: 'uppercase',
          }}>
            What&apos;s in Progress
          </div>
          {inProgressRow ? (
            <div style={{ fontSize: isFS ? 32 : 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: 2 }}>
              {inProgressRow.customer || 'Untitled'}
              {inProgressRow.job ? (
                <span style={{ fontWeight: 600, color: '#475569', fontSize: isFS ? 24 : 15 }}>
                  {' '}— {inProgressRow.job}
                </span>
              ) : null}
            </div>
          ) : (
            <div style={{ fontSize: isFS ? 22 : 14, fontWeight: 600, color: '#94a3b8', marginTop: 2 }}>
              No order selected
            </div>
          )}
        </div>
      </div>

      {inProgressRow?.jobImage ? (
        <img
          src={inProgressRow.jobImage}
          alt=""
          style={{
            width: isFS ? 88 : 52, height: isFS ? 88 : 52, objectFit: 'contain',
            borderRadius: 10, border: '2px solid #fff', background: '#fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}
        />
      ) : null}

      {!isFS && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <select
            value={inProgressId || ''}
            onChange={(e) => setInProgressOrder(e.target.value || null)}
            style={{
              minWidth: 220, maxWidth: 360, padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid #cbd5e1', background: '#fff', fontSize: 14, fontWeight: 600,
              color: '#1e293b', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Select order…</option>
            {rows.map((r, i) => (
              <option key={r.id} value={r.id}>{rowLabel(r, i)}</option>
            ))}
          </select>
          {inProgressId && (
            <button
              onClick={() => setInProgressOrder(null)}
              style={{
                padding: '10px 14px', borderRadius: 10, border: '1px solid #fecaca',
                background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dayStr = DAYS_EN[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTHS_EN[now.getMonth()]} ${now.getFullYear()}`;

  const syncLabel =
    syncStatus === 'saving' ? 'Saving…' :
    syncStatus === 'error' ? 'Sync offline — check connection' :
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
              <th style={{ background: '#f1f5f9', color: '#94a3b8', padding: '11px 10px', textAlign: 'center', fontSize: 12, fontWeight: 600, width: 140, borderBottom: '3px solid #e2e8f0' }}>
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isActive = row.id === inProgressId;
            return (
            <tr key={row.id} style={{
              background: isActive ? '#ecfdf5' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
              outline: isActive ? '2px solid #10b981' : undefined,
              outlineOffset: isActive ? -2 : undefined,
            }}>
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
                          {isFS ? (
                            row[field]
                              ? <img src={row[field]} alt="job" style={{ width: 100, height: 100, objectFit: 'contain', borderRadius: 10, border: '2px solid #e2e8f0', background: '#f8fafc', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
                              : <span style={{ color: '#cbd5e1', fontSize: 20 }}>—</span>
                          ) : (
                            <label style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }} title={row[field] ? 'Change photo' : 'Upload photo'}>
                              {row[field]
                                ? <img src={row[field]} alt="job" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 10, border: '2px solid #e2e8f0', background: '#f8fafc', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
                                : <span style={{ display: 'inline-block', width: 56, height: 56, lineHeight: '56px', borderRadius: 10, border: '1.5px dashed #94a3b8', color: '#64748b', fontSize: 11, fontWeight: 600, background: '#f8fafc' }}>+ Photo</span>
                              }
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (file) uploadPhotoForRow(row.id, file);
                                }}
                              />
                            </label>
                          )}
                        </td>
                      );
                    }
                    if (field === 'date' && row.date) {
                      const d = new Date(row.date);
                      if (!isNaN(d.getTime())) {
                        const dayName = DAYS_EN[d.getDay()];
                        const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        return (
                          <td key={field} style={{
                            padding: isFS ? '18px 28px' : '10px 14px',
                            textAlign: 'center',
                            borderBottom: '1px solid #e2e8f0',
                            borderLeft: `4px solid ${COL_COLORS[0]}`,
                          }}>
                            <div style={{
                              fontSize: isFS ? 18 : 11,
                              fontWeight: 700,
                              color: '#64748b',
                              letterSpacing: 0.3,
                              marginBottom: isFS ? 4 : 2,
                            }}>{dayName}</div>
                            <div style={{
                              fontSize: isFS ? 24 : 14,
                              fontWeight: 700,
                              color: '#1e293b',
                            }}>{dateStr}</div>
                          </td>
                        );
                      }
                    }
                    let display: React.ReactNode = row[field] || '—';
                    if (field === 'finish' && row[field]) {
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
                    <td style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => moveRow(row.id, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        style={{
                          background: idx === 0 ? '#f1f5f9' : '#ecfdf5', border: 'none',
                          color: idx === 0 ? '#cbd5e1' : '#059669', borderRadius: 6,
                          padding: '5px 7px', cursor: idx === 0 ? 'default' : 'pointer', marginRight: 3,
                        }}
                      ><ChevronUp size={14} /></button>
                      <button
                        onClick={() => moveRow(row.id, 1)}
                        disabled={idx === rows.length - 1}
                        title="Move down"
                        style={{
                          background: idx === rows.length - 1 ? '#f1f5f9' : '#fff7ed', border: 'none',
                          color: idx === rows.length - 1 ? '#cbd5e1' : '#ea580c', borderRadius: 6,
                          padding: '5px 7px', cursor: idx === rows.length - 1 ? 'default' : 'pointer', marginRight: 3,
                        }}
                      ><ChevronDown size={14} /></button>
                      <button
                        onClick={() => setInProgressOrder(isActive ? null : row.id)}
                        title={isActive ? 'Clear in progress' : 'Set as in progress'}
                        style={{
                          background: isActive ? '#10b981' : '#ecfdf5', border: 'none',
                          color: isActive ? '#fff' : '#059669', borderRadius: 6,
                          padding: '5px 7px', cursor: 'pointer', marginRight: 3,
                        }}
                      ><Play size={13} fill={isActive ? '#fff' : 'none'} /></button>
                      <button onClick={() => startEdit(row)} title="Edit" style={{ background: '#eff6ff', border: 'none', color: '#6366f1', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', marginRight: 3 }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteRow(row.id)} title="Delete" style={{ background: '#fef2f2', border: 'none', color: '#ef4444', borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </td>
                  )}
                </>
              )}
            </tr>
            );
          })}
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
          {progressCard(true)}
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
        {progressCard(false)}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          {tableContent(false)}
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Synced via dedicated ops API • Click ▶ to mark in progress • Press Enter to save
        </p>
      </div>
    </div>
  );
};

export default OperationsScreen;
