import React, { useState, useEffect } from 'react';
import {
  X, MessageSquare, Clock, Send, ArrowRightLeft,
  Trash2, Calendar, FileText, Image, Download, User, Users,
  Building2, Tag, Hash, Save, Pencil, Archive, CheckCheck
} from 'lucide-react';
import { Order, Department, OrderPriority, OrderStatus } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { priorityConfig, getColumnStatus, formatDate, generateId } from '../../utils/helpers';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  department: Department;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order, onClose, department }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { users, departments, currentUser } = state;
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'chat' | 'history'>('details');
  const [comment, setComment] = useState('');
  const [transferDept, setTransferDept] = useState('');
  const [showTransferPopover, setShowTransferPopover] = useState(false);
  const [editing, setEditing] = useState(false);

  const rawOrder = state.orders.find((o) => o.id === order.id) || order;
  const currentOrder = {
    ...rawOrder,
    priority: rawOrder.priority || 'medium',
    status: rawOrder.status || 'new',
    comments: rawOrder.comments || [],
    history: rawOrder.history || [],
    orderForms: rawOrder.orderForms || [],
    assignedUsers: rawOrder.assignedUsers || [],
    tags: rawOrder.tags || [],
  };

  const [editData, setEditData] = useState({
    orderNumber: currentOrder.orderNumber,
    clientName: currentOrder.clientName,
    description: currentOrder.description,
    orderDate: currentOrder.orderDate ? currentOrder.orderDate.slice(0, 10) : '',
    dueDate: currentOrder.dueDate ? currentOrder.dueDate.slice(0, 10) : '',
    fileExtensions: currentOrder.fileExtensions || '',
    notes: currentOrder.notes || '',
    progress: currentOrder.progress ?? 0,
    departmentId: currentOrder.departmentId,
    priority: currentOrder.priority as OrderPriority,
    status: currentOrder.status as OrderStatus,
    assignedUsers: currentOrder.assignedUsers || [],
  });

  useEffect(() => {
    if (!editing) {
      setEditData({
        orderNumber: currentOrder.orderNumber,
        clientName: currentOrder.clientName,
        description: currentOrder.description,
        orderDate: currentOrder.orderDate ? currentOrder.orderDate.slice(0, 10) : '',
        dueDate: currentOrder.dueDate ? currentOrder.dueDate.slice(0, 10) : '',
        fileExtensions: currentOrder.fileExtensions || '',
        notes: currentOrder.notes || '',
        progress: currentOrder.progress ?? 0,
        departmentId: currentOrder.departmentId,
        priority: currentOrder.priority as OrderPriority,
        status: currentOrder.status as OrderStatus,
        assignedUsers: currentOrder.assignedUsers || [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder.updatedAt]);

  const handleSaveEdit = () => {
    const updated: Order = {
      ...currentOrder,
      orderNumber: editData.orderNumber,
      clientName: editData.clientName,
      title: `#${editData.orderNumber} - ${editData.clientName}`,
      description: editData.description,
      orderDate: editData.orderDate ? new Date(editData.orderDate).toISOString() : currentOrder.orderDate,
      dueDate: editData.dueDate ? new Date(editData.dueDate).toISOString() : undefined,
      fileExtensions: editData.fileExtensions,
      notes: editData.notes,
      progress: editData.progress,
      departmentId: editData.departmentId,
      priority: editData.priority,
      status: editData.status,
      assignedUsers: editData.assignedUsers,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'UPDATE_ORDER', payload: updated, triggerUserId: currentUser?.id, prevAssignedUsers: currentOrder.assignedUsers } as any);
    addHistoryEntry(order.id, 'تعديل بيانات الطلبية');
    setEditing(false);
  };

  const toggleAssignedUser = (uid: string) => {
    setEditData((prev) => ({
      ...prev,
      assignedUsers: prev.assignedUsers.includes(uid)
        ? prev.assignedUsers.filter((id) => id !== uid)
        : [...prev.assignedUsers, uid],
    }));
  };

  const priority = priorityConfig[editing ? editData.priority : currentOrder.priority] || priorityConfig['medium'];
  const status   = getColumnStatus(currentOrder, departments);

  const assignedUsers = users.filter((u) => currentOrder.assignedUsers?.includes(u.id));

  const handleAddComment = () => {
    if (!comment.trim() || !currentUser) return;
    const newComment = {
      id: generateId(),
      orderId: order.id,
      userId: currentUser.id,
      text: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_COMMENT', payload: { orderId: order.id, comment: newComment }, triggerUserId: currentUser?.id } as any);
    addHistoryEntry(order.id, 'أضاف ملاحظة');
    setComment('');
  };

  const handleDelete = () => {
    if (window.confirm('هل أنت متأكد من حذف هذه الطلبية؟')) {
      dispatch({ type: 'DELETE_ORDER', payload: order.id });
      onClose();
    }
  };

  const handleMarkDone = () => {
    if (!window.confirm('هل أنت متأكد من انتهاء الطلبية؟\nسيتم نقلها تلقائياً إلى قسم التسليم.')) return;
    const completedAt = new Date().toISOString();
    const deliveryDept = departments.find((d) => d.name === 'قسم التسليم');
    if (deliveryDept) {
      const fromDept = departments.find((d) => d.id === currentOrder.departmentId)?.name || '';
      dispatch({ type: 'UPDATE_ORDER', payload: { ...currentOrder, completedAt, updatedAt: completedAt } });
      dispatch({ type: 'MOVE_ORDER', payload: { orderId: order.id, status: 'new', departmentId: deliveryDept.id, triggerUserId: currentUser?.id } });
      addHistoryEntry(order.id, 'تم الانتهاء ونقل الطلبية إلى قسم التسليم', fromDept, deliveryDept.name);
    } else {
      const updated = { ...currentOrder, completedAt, updatedAt: completedAt };
      dispatch({ type: 'UPDATE_ORDER', payload: updated });
      addHistoryEntry(order.id, 'تم الانتهاء من الطلبية');
    }
    onClose();
  };

  const handleArchive = () => {
    if (!window.confirm('هل تريد نقل هذه الطلبية إلى الأرشيف؟')) return;
    const now = new Date().toISOString();
    const updated = {
      ...currentOrder,
      status: 'done' as OrderStatus,
      completedAt: currentOrder.completedAt || now,
      updatedAt: now,
    };
    dispatch({ type: 'UPDATE_ORDER', payload: updated });
    addHistoryEntry(order.id, 'تم أرشفة الطلبية');
    onClose();
  };

  const handleTransfer = () => {
    if (!transferDept || transferDept === order.departmentId) return;
    const from = departments.find((d) => d.id === order.departmentId)?.name || '';
    const to   = departments.find((d) => d.id === transferDept)?.name || '';
    dispatch({ type: 'MOVE_ORDER', payload: { orderId: order.id, status: 'new', departmentId: transferDept, triggerUserId: currentUser?.id } });
    addHistoryEntry(order.id, 'نقل إلى قسم آخر', from, to);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return '—';
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const handleOpenFile = (dataUrl: string | undefined, name: string) => {
    if (!dataUrl) { alert('الملف غير متاح — يرجى رفع الملف مجدداً'); return; }
    try {
      const blob = dataUrlToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      // Fallback: use data URL directly
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePreviewFile = (dataUrl: string | undefined, name: string) => {
    if (!dataUrl) { alert('الملف غير متاح — يرجى رفع الملف مجدداً'); return; }
    try {
      const blob = dataUrlToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      const newTab = window.open(url, '_blank');
      if (!newTab) {
        // Popup blocked — fallback to download
        handleOpenFile(dataUrl, name);
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      window.open(dataUrl, '_blank');
    }
  };

  const userDeptIds = currentUser?.departmentIds?.length ? currentUser.departmentIds : (currentUser?.departmentId ? [currentUser.departmentId] : []);
  const canTransfer = currentUser?.role === 'admin' ||
    (currentUser?.role === 'manager' && userDeptIds.includes(currentOrder.departmentId));

  const tabs = [
    { id: 'details',  label: 'التفاصيل' },
    { id: 'files',    label: `الملفات (${(currentOrder.orderForms?.length || 0) + (currentOrder.invoices?.length || 0) + (currentOrder.invoice ? 1 : 0)})` },
    { id: 'chat',     label: `الدردشة (${currentOrder.comments.length})` },
    { id: 'history',  label: 'السجل' },
  ] as const;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="order-num-badge">#{currentOrder.orderNumber}</span>
            <span className="badge" style={{ background: status.bg, color: status.color }}>{status.label}</span>
            <span className="badge" style={{ background: priority.bg, color: priority.color }}>{priority.label}</span>
          </div>
          <div className="modal-header-actions">
            {editing ? (
              <>
                <button className="modal-icon-btn modal-icon-btn--green" onClick={handleSaveEdit} title="حفظ"><Save size={15} /></button>
                <button className="modal-icon-btn" onClick={() => setEditing(false)} title="إلغاء"><X size={15} /></button>
              </>
            ) : (
              <button className="modal-icon-btn" title="تعديل" onClick={() => {
                setEditData({
                  orderNumber: currentOrder.orderNumber,
                  clientName: currentOrder.clientName,
                  description: currentOrder.description,
                  orderDate: currentOrder.orderDate ? currentOrder.orderDate.slice(0, 10) : '',
                  dueDate: currentOrder.dueDate ? currentOrder.dueDate.slice(0, 10) : '',
                  fileExtensions: currentOrder.fileExtensions || '',
                  notes: currentOrder.notes || '',
                  progress: currentOrder.progress ?? 0,
                  departmentId: currentOrder.departmentId,
                  priority: currentOrder.priority as OrderPriority,
                  status: currentOrder.status as OrderStatus,
                  assignedUsers: currentOrder.assignedUsers || [],
                });
                setEditing(true);
              }}><Pencil size={15} /></button>
            )}
            {currentUser?.role === 'admin' && (
              <button className="modal-icon-btn modal-icon-btn--danger" onClick={handleDelete} title="حذف"><Trash2 size={15} /></button>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && currentOrder.status !== 'done' && !editing && department.name === 'قسم التسليم' && (
              <button className="modal-icon-btn modal-icon-btn--purple" onClick={handleArchive} title="أرشفة">
                <Archive size={15} />
              </button>
            )}
            {canTransfer && !editing && (
              <div style={{ position: 'relative' }}>
                <button
                  className={`modal-icon-btn ${showTransferPopover ? 'modal-icon-btn--active' : ''}`}
                  title="نقل إلى قسم آخر"
                  onClick={() => setShowTransferPopover((v) => !v)}
                >
                  <ArrowRightLeft size={15} />
                </button>
                {showTransferPopover && (
                  <div className="transfer-popover">
                    <p className="transfer-popover-label">نقل إلى قسم:</p>
                    <select
                      className="transfer-popover-select"
                      value={transferDept}
                      onChange={(e) => setTransferDept(e.target.value)}
                    >
                      <option value="">اختر القسم</option>
                      {departments.filter((d) => d.id !== order.departmentId).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <button
                      className="transfer-popover-btn"
                      disabled={!transferDept}
                      onClick={() => { handleTransfer(); setShowTransferPopover(false); }}
                    >
                      نقل ↵
                    </button>
                  </div>
                )}
              </div>
            )}
            {!currentOrder.completedAt && !editing && (
              <button className="modal-icon-btn modal-icon-btn--green" onClick={handleMarkDone} title="تم الانتهاء">
                <CheckCheck size={15} />
              </button>
            )}
            <button className="modal-close-corner" onClick={onClose} title="إغلاق"><X size={15} /></button>
          </div>
        </div>

        {/* Title */}
        <div className="od-title-row">
          <h2 className="od-title">{currentOrder.clientName}</h2>
          <span className="od-dept-badge" style={{ background: department.color + '22', color: department.color }}>
            {department.name}
          </span>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`modal-tab ${activeTab === t.id ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body od-body">

          {/* ── DETAILS TAB ─────────────────────────── */}
          {activeTab === 'details' && (
            <div className="od-details-grid">
              <div className="od-detail-item">
                <span className="od-label"><User size={13} /> اسم العميل</span>
                {editing ? (
                  <input className="od-edit-input" value={editData.clientName} onChange={(e) => setEditData(p => ({ ...p, clientName: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.clientName}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Hash size={13} /> رقم الطلبية</span>
                {editing ? (
                  <input className="od-edit-input" value={editData.orderNumber} onChange={(e) => setEditData(p => ({ ...p, orderNumber: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.orderNumber}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><FileText size={13} /> وصف الطلب</span>
                {editing ? (
                  <textarea className="od-edit-input od-edit-textarea" rows={3} value={editData.description} onChange={(e) => setEditData(p => ({ ...p, description: e.target.value }))} />
                ) : <span className="od-value od-desc">{currentOrder.description || '—'}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Calendar size={13} /> موعد التسليم</span>
                {editing ? (
                  <input type="date" className="od-edit-input" value={editData.dueDate} onChange={(e) => setEditData(p => ({ ...p, dueDate: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.dueDate ? formatDate(currentOrder.dueDate) : 'غير محدد'}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Calendar size={13} /> تاريخ الطلب</span>
                {editing ? (
                  <input type="date" className="od-edit-input" value={editData.orderDate} onChange={(e) => setEditData(p => ({ ...p, orderDate: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.orderDate ? formatDate(currentOrder.orderDate) : '—'}</span>}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label"><Building2 size={13} /> القسم المختص</span>
                {editing ? (
                  <div className="users-picker" style={{ marginTop: 4 }}>
                    {departments.map((d) => {
                      const selected = editData.departmentId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className={`user-pick-btn ${selected ? 'user-selected' : ''}`}
                          onClick={() => setEditData(p => ({ ...p, departmentId: d.id }))}
                        >
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                          <div className="user-pick-info">
                            <span className="user-pick-name">{d.name}</span>
                          </div>
                          {selected && <div className="user-pick-check">✓</div>}
                        </button>
                      );
                    })}
                  </div>
                ) : <span className="od-value">{departments.find(d => d.id === currentOrder.departmentId)?.name || department.name}</span>}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label"><Tag size={13} /> امتداد الملفات</span>
                {editing ? (
                  <textarea className="od-edit-input od-edit-textarea" rows={4} value={editData.fileExtensions} onChange={(e) => setEditData(p => ({ ...p, fileExtensions: e.target.value }))} placeholder="PDF, AI, CDR, PNG..." />
                ) : <span className="od-value od-extensions">{currentOrder.fileExtensions || '—'}</span>}
              </div>
              <div className="od-detail-item od-spacer" />
              <div className="od-detail-item">
                <span className="od-label">الأولوية</span>
                {editing ? (
                  <select className="od-edit-input" value={editData.priority} onChange={(e) => setEditData(p => ({ ...p, priority: e.target.value as OrderPriority }))}>
                    {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                ) : (
                  <span className="od-value">
                    <span className="badge" style={{ background: priorityConfig[currentOrder.priority].bg, color: priorityConfig[currentOrder.priority].color }}>
                      {priorityConfig[currentOrder.priority].label}
                    </span>
                  </span>
                )}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label">نسبة الإنجاز</span>
                <div className="od-progress-row">
                  {editing ? (
                    <input
                      type="range" min={0} max={100} step={5}
                      className="od-progress-slider"
                      value={editData.progress}
                      onChange={(e) => setEditData(p => ({ ...p, progress: Number(e.target.value) }))}
                    />
                  ) : (
                    <div className="od-progress-bar-wrap">
                      <div className="od-progress-bar-fill" style={{ width: `${currentOrder.progress || 0}%` }} />
                    </div>
                  )}
                  <span className="od-progress-pct">{editing ? editData.progress : (currentOrder.progress || 0)}%</span>
                </div>
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label">الملاحظات</span>
                {editing ? (
                  <textarea className="od-edit-input od-edit-textarea" rows={4} value={editData.notes} onChange={(e) => setEditData(p => ({ ...p, notes: e.target.value }))} placeholder="أضف ملاحظات..." style={{ resize: 'vertical' }} />
                ) : <span className="od-value od-extensions">{currentOrder.notes || '—'}</span>}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label"><Users size={13} /> المستخدمون المسؤولون</span>
                {editing ? (
                  <div className="od-users-picker">
                    {users.map((u) => {
                      const dept = departments.find((d) => d.id === u.departmentId);
                      const sel = editData.assignedUsers.includes(u.id);
                      return (
                        <button key={u.id} type="button"
                          className={`od-user-pick-btn ${sel ? 'od-user-pick-sel' : ''}`}
                          onClick={() => toggleAssignedUser(u.id)}
                          style={sel ? { borderColor: dept?.color || '#6366f1', background: (dept?.color || '#6366f1') + '15' } : {}}
                        >
                          <div className="od-user-avatar" style={{ background: u.avatar ? 'transparent' : (dept?.color || '#6366f1'), padding: u.avatar ? 0 : undefined }}>
                            {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : u.fullName.charAt(0)}
                          </div>
                          <span>{u.fullName}</span>
                          {sel && <span style={{ color: dept?.color || '#6366f1', fontWeight: 700 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="od-users-list">
                    {assignedUsers.length > 0 ? assignedUsers.map((u) => {
                      const dept = departments.find((d) => d.id === u.departmentId);
                      return (
                        <div key={u.id} className="od-user-chip" style={{ borderColor: dept?.color || '#6366f1' }}>
                          <div className="od-user-avatar" style={{ background: u.avatar ? 'transparent' : (dept?.color || '#6366f1'), padding: u.avatar ? 0 : undefined }}>
                            {u.avatar ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : u.fullName.charAt(0)}
                          </div>
                          <span>{u.fullName}</span>
                        </div>
                      );
                    }) : <span className="muted">لم يُعيَّن أحد</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── FILES TAB ───────────────────────────── */}
          {activeTab === 'files' && (
            <div className="od-files-section">
              {/* Order Forms */}
              <div className="od-files-group">
                <h4 className="od-files-title"><Image size={15} /> نماذج الطلبية</h4>
                {currentOrder.orderForms?.length > 0 ? (
                  <div className="od-file-rows">
                    {currentOrder.orderForms.map((f) => (
                      <div key={f.id} className="od-file-row">
                        <div className="od-file-row-icon">
                          {f.dataUrl && f.type?.startsWith('image/') ? (
                            <img src={f.dataUrl} alt={f.name} className="od-file-thumb-sm" />
                          ) : (
                            <FileText size={22} color="#6366f1" />
                          )}
                        </div>
                        <div className="od-file-row-info">
                          <span className="od-file-name">{f.name}</span>
                          <span className="od-file-size">{formatFileSize(f.size)}</span>
                        </div>
                        <div className="od-file-row-actions">
                          <button className="od-action-btn" onClick={() => handlePreviewFile(f.dataUrl, f.name)} title="عرض">
                            <Image size={15} /> عرض
                          </button>
                          <button className="od-action-btn" onClick={() => handleOpenFile(f.dataUrl, f.name)} title="تحميل">
                            <Download size={15} /> تحميل
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="od-empty-files">لا توجد نماذج مرفقة</p>
                )}
              </div>

              {/* Invoices */}
              <div className="od-files-group">
                <h4 className="od-files-title"><FileText size={15} /> الفواتير</h4>
                <div className="od-file-rows">
                  {/* Legacy single invoice */}
                  {currentOrder.invoice && (
                    <div className="od-file-row">
                      <div className="od-file-row-icon"><FileText size={22} color="#10b981" /></div>
                      <div className="od-file-row-info">
                        <span className="od-file-name">{currentOrder.invoice.name}</span>
                        <span className="od-file-size">{formatFileSize(currentOrder.invoice.size)}</span>
                      </div>
                      <div className="od-file-row-actions">
                        <button className="od-action-btn" onClick={() => handlePreviewFile(currentOrder.invoice?.dataUrl, currentOrder.invoice?.name || 'فاتورة')} title="عرض"><Image size={15} /> عرض</button>
                        <button className="od-action-btn" onClick={() => handleOpenFile(currentOrder.invoice?.dataUrl, currentOrder.invoice?.name || 'فاتورة')} title="تحميل"><Download size={15} /> تحميل</button>
                      </div>
                    </div>
                  )}
                  {/* Multiple invoices */}
                  {currentOrder.invoices?.map((inv) => (
                    <div key={inv.id} className="od-file-row">
                      <div className="od-file-row-icon"><FileText size={22} color="#10b981" /></div>
                      <div className="od-file-row-info">
                        <span className="od-file-name">{inv.name}</span>
                        <span className="od-file-size">{formatFileSize(inv.size)}</span>
                      </div>
                      <div className="od-file-row-actions">
                        <button className="od-action-btn" onClick={() => handlePreviewFile(inv.dataUrl, inv.name)} title="عرض"><Image size={15} /> عرض</button>
                        <button className="od-action-btn" onClick={() => handleOpenFile(inv.dataUrl, inv.name)} title="تحميل"><Download size={15} /> تحميل</button>
                      </div>
                    </div>
                  ))}
                  {!currentOrder.invoice && (!currentOrder.invoices || currentOrder.invoices.length === 0) && (
                    <p className="od-empty-files">لم يتم رفع فاتورة</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── CHAT TAB ────────────────────────────── */}
          {activeTab === 'chat' && (
            <div className="chat-section">
              <div className="chat-messages">
                {currentOrder.comments.length === 0 ? (
                  <div className="empty-state">
                    <MessageSquare size={40} />
                    <p>لا توجد رسائل بعد، ابدأ المحادثة</p>
                  </div>
                ) : (
                  currentOrder.comments.map((c) => {
                    const author = users.find((u) => u.id === c.userId);
                    const isMe = c.userId === currentUser?.id;
                    return (
                      <div key={c.id} className={`chat-msg ${isMe ? 'chat-msg-me' : ''}`}>
                        {!isMe && (
                          <div className="chat-avatar" style={{ background: author?.avatar ? 'transparent' : (departments.find((d) => d.id === author?.departmentId)?.color || '#6366f1') }}>
                            {author?.avatar
                              ? <img src={author.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                              : (author?.fullName.charAt(0) || '?')}
                          </div>
                        )}
                        <div className="chat-bubble-wrap">
                          {!isMe && <span className="chat-author">{author?.fullName}</span>}
                          <div className={`chat-bubble ${isMe ? 'chat-bubble-me' : ''}`}>
                            <p>{c.text}</p>
                          </div>
                          <span className="chat-time">{formatDate(c.createdAt)}</span>
                        </div>
                        {isMe && (
                          <div className="chat-avatar chat-avatar-me" style={{ background: currentUser?.avatar ? 'transparent' : '#6366f1' }}>
                            {currentUser?.avatar
                              ? <img src={currentUser.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                              : currentUser?.fullName.charAt(0)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="chat-input-row">
                <textarea
                  className="chat-input"
                  placeholder="اكتب رسالتك... (Ctrl+Enter للإرسال)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
                  rows={2}
                />
                <button className="chat-send-btn" onClick={handleAddComment} disabled={!comment.trim()}>
                  <Send size={18} />
                </button>
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ─────────────────────────── */}
          {activeTab === 'history' && (
            <div className="history-list">
              {currentOrder.history.length === 0 ? (
                <div className="empty-state"><Clock size={40} /><p>لا يوجد سجل بعد</p></div>
              ) : (
                [...currentOrder.history].reverse().map((h) => {
                  const actor = users.find((u) => u.id === h.userId);
                  return (
                    <div key={h.id} className="history-item">
                      <div className="history-avatar" style={{ background: actor?.avatar ? 'transparent' : undefined, padding: actor?.avatar ? 0 : undefined }}>
                        {actor?.avatar
                          ? <img src={actor.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          : (actor?.fullName.charAt(0) || '?')}
                      </div>
                      <div className="history-content">
                        <div className="history-action">
                          <span className="history-actor">{actor?.fullName}</span>
                          <span> {h.action}</span>
                          {h.fromValue && h.toValue && (
                            <span className="history-change">
                              <span className="from-val">{h.fromValue}</span>
                              <span> ← </span>
                              <span className="to-val">{h.toValue}</span>
                            </span>
                          )}
                        </div>
                        <span className="history-time">{formatDate(h.timestamp)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
