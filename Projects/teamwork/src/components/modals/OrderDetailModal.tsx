import React, { useState, useEffect } from 'react';
import {
  X, MessageSquare, Clock, Send, ArrowRightLeft,
  Trash2, Calendar, FileText, Image, Download, User, Users,
  Building2, Tag, Hash, Save, Pencil, Archive, CheckCheck, Upload, Gauge
} from 'lucide-react';
import { Order, Department, OrderPriority, OrderStatus } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { getPriorityConfig, getColumnStatus, formatDate, generateId } from '../../utils/helpers';

const COL_NAME_MAP: Record<string, string> = {
  'الطلبيات الجديدة': 'New Orders',
  'الطلبيات الجاهزة': 'Ready Orders',
  'قيد التنفيذ': 'In Progress',
  'مراجعة': 'Review',
  'منجز': 'Done',
  'ملغي': 'Cancelled',
  'جديد': 'New',
  'قيد الطباعة': 'Printing',
  'قيد التجميع': 'Assembly',
  'للتوصيل': 'For Delivery',
  'قيد التسليم': 'In Delivery',
  'للاستلام': 'For Pickup',
  'متعثرة': 'On Hold',
  'مطبوعات خارجية': 'Outsourced Print',
  'اللامنيشن': 'Lamination',
  'عينات مطلوبة': 'Samples Needed',
  'قص Graphtec': 'Graphtec Cut',
  'UV طباعة': 'UV Print',
  'قص ليزر': 'Laser Cut',
};

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  department: Department;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ order, onClose, department }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { lang, tr } = useLang();
  const translateCol = (name: string) => lang === 'en' ? (COL_NAME_MAP[name] || name) : name;
  const { users, departments, currentUser } = state;
  const priorityConfig = getPriorityConfig(lang);
  const [activeTab, setActiveTab] = useState<'details' | 'files' | 'chat' | 'history'>('details');
  const [comment, setComment] = useState('');
  const [transferDepts, setTransferDepts] = useState<string[]>([]);
  const [showTransferPopover, setShowTransferPopover] = useState(false);
  const [showProgressPopover, setShowProgressPopover] = useState(false);
  const [progressMode, setProgressMode] = useState<'slider' | 'quantity'>('slider');
  const [qtyInput, setQtyInput] = useState({ quantity: '', completed: '' });
  const [editDupWarning, setEditDupWarning] = useState<{ deptName: string; clientName: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [inlineExtensions, setInlineExtensions] = useState<string | null>(null);
  const [inlineNotes, setInlineNotes] = useState<string | null>(null);
  const [archiveClicked, setArchiveClicked] = useState(false);

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
    departmentIds: currentOrder.departmentIds?.length ? currentOrder.departmentIds : [currentOrder.departmentId],
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
        departmentIds: currentOrder.departmentIds?.length ? currentOrder.departmentIds : [currentOrder.departmentId],
        priority: currentOrder.priority as OrderPriority,
        status: currentOrder.status as OrderStatus,
        assignedUsers: currentOrder.assignedUsers || [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder.updatedAt]);

  const handleSaveInlineExtensions = () => {
    if (inlineExtensions === null) return;
    const updated = { ...currentOrder, fileExtensions: inlineExtensions, updatedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
    setInlineExtensions(null);
  };

  const handleSaveInlineNotes = () => {
    if (inlineNotes === null) return;
    const updated = { ...currentOrder, notes: inlineNotes, updatedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
    setInlineNotes(null);
  };

  const doSaveEdit = () => {
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
      departmentIds: [editData.departmentId],
      priority: editData.priority,
      status: editData.status,
      assignedUsers: editData.assignedUsers,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'UPDATE_ORDER', payload: updated, triggerUserId: currentUser?.id, prevAssignedUsers: currentOrder.assignedUsers } as any);
    addHistoryEntry(order.id, 'تعديل بيانات الطلبية');
    setEditing(false);
    setEditDupWarning(null);
  };

  const handleSaveEdit = () => {
    // Check for duplicate order number in the same department (excluding current order)
    if (editData.orderNumber.trim() !== currentOrder.orderNumber.trim()) {
      const dup = state.orders.find(
        (o) => !o.deletedAt &&
               o.id !== currentOrder.id &&
               o.departmentId === editData.departmentId &&
               o.orderNumber.trim().toLowerCase() === editData.orderNumber.trim().toLowerCase()
      );
      if (dup) {
        const deptName = departments.find((d) => d.id === editData.departmentId)?.name || '';
        setEditDupWarning({ deptName, clientName: dup.clientName });
        return;
      }
    }
    doSaveEdit();
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
      dispatch({ type: 'UPDATE_ORDER', payload: { ...currentOrder, completedAt, updatedAt: completedAt }, silent: true } as any);
      dispatch({ type: 'MOVE_ORDER', payload: { orderId: order.id, status: 'new', departmentId: deliveryDept.id, triggerUserId: currentUser?.id } });
      addHistoryEntry(order.id, 'تم الانتهاء ونقل الطلبية إلى قسم التسليم', fromDept, deliveryDept.name);
    } else {
      const updated = { ...currentOrder, completedAt, updatedAt: completedAt };
      dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
      addHistoryEntry(order.id, 'تم الانتهاء من الطلبية');
    }
    onClose();
  };

  const handleDeleteOrderForm = (fileId: string) => {
    if (!window.confirm('هل تريد حذف هذا الملف؟')) return;
    const updated = { ...currentOrder, orderForms: currentOrder.orderForms.filter((f) => f.id !== fileId), updatedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
  };

  const handleUploadOrderForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newFile = { id: generateId(), name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string };
        const updated = { ...currentOrder, orderForms: [...(currentOrder.orderForms || []), newFile], updatedAt: new Date().toISOString() };
        dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleUploadInvoice = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newInv = { id: generateId(), name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string };
        const updated = { ...currentOrder, invoices: [...(currentOrder.invoices || []), newInv], updatedAt: new Date().toISOString() };
        dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDeleteInvoice = (invoiceId?: string) => {
    if (!window.confirm('هل تريد حذف هذه الفاتورة؟')) return;
    let updated: typeof currentOrder;
    if (!invoiceId) {
      updated = { ...currentOrder, invoice: undefined, updatedAt: new Date().toISOString() };
    } else {
      updated = { ...currentOrder, invoices: (currentOrder.invoices || []).filter((i) => i.id !== invoiceId), updatedAt: new Date().toISOString() };
    }
    dispatch({ type: 'UPDATE_ORDER', payload: updated, silent: true } as any);
  };

  const doArchive = () => {
    dispatch({ type: 'ARCHIVE_ORDER', payload: currentOrder.id } as any);
    addHistoryEntry(order.id, 'تم أرشفة الطلبية');
    onClose();
  };

  const handleTransfer = () => {
    if (transferDepts.length === 0) return;
    const from = departments.find((d) => d.id === order.departmentId)?.name || '';
    const now  = new Date().toISOString();

    if (transferDepts.length === 1) {
      // Single dept → move the existing order
      const toDept    = departments.find((d) => d.id === transferDepts[0]);
      const isDelivery = toDept?.name === 'قسم التسليم';
      dispatch({ type: 'MOVE_ORDER', payload: { orderId: order.id, status: 'new', departmentId: transferDepts[0], triggerUserId: currentUser?.id } });
      if (!isDelivery && currentOrder.completedAt) {
        dispatch({ type: 'UPDATE_ORDER', payload: { ...currentOrder, completedAt: undefined, updatedAt: now }, silent: true } as any);
      }
      addHistoryEntry(order.id, 'نقل إلى قسم آخر', from, toDept?.name || '');
    } else {
      // Multiple depts → create independent copy per dept, delete original
      transferDepts.forEach((deptId) => {
        const toDept    = departments.find((d) => d.id === deptId);
        const isDelivery = toDept?.name === 'قسم التسليم';
        const newOrder: Order = {
          ...currentOrder,
          id: generateId(),
          departmentId: deptId,
          departmentIds: [deptId],
          originDepartmentId: isDelivery
            ? (currentOrder.originDepartmentId || currentOrder.departmentId)
            : deptId,
          status: 'new' as any,
          completedAt: isDelivery ? currentOrder.completedAt : undefined,
          updatedAt: now,
          comments: [],
          history: [],
        };
        dispatch({ type: 'ADD_ORDER', payload: newOrder, triggerUserId: currentUser?.id } as any);
        addHistoryEntry(newOrder.id, `نُقلت من ${from}`, from, toDept?.name || '');
      });
      // Delete the original order
      dispatch({ type: 'DELETE_ORDER', payload: order.id });
    }
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
    { id: 'details',  label: tr.tabs.details },
    { id: 'files',    label: `${tr.tabs.files} (${(currentOrder.orderForms?.length || 0) + (currentOrder.invoices?.length || 0) + (currentOrder.invoice ? 1 : 0)})` },
    { id: 'chat',     label: `${tr.tabs.chat} (${currentOrder.comments.length})` },
    { id: 'history',  label: tr.tabs.history },
  ] as const;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-xl" onClick={(e) => e.stopPropagation()}>

        {/* Duplicate order number warning (edit mode) */}
        {editDupWarning && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, background: '#00000066',
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16,
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: 28, maxWidth: 360, width: '90%',
              boxShadow: '0 20px 60px #0003', textAlign: 'right',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: '#111', margin: 0 }}>رقم الطلبية مكرر</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>في قسم: <b>{editDupWarning.deptName}</b></p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.6 }}>
                يوجد طلبية بنفس الرقم <b>#{editData.orderNumber}</b> مسجلة في هذا القسم باسم العميل: <b>{editDupWarning.clientName}</b>
                <br />هل تريد الحفظ على أي حال؟
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditDupWarning(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}
                >
                  تعديل الرقم
                </button>
                <button
                  onClick={doSaveEdit}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  حفظ على أي حال
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="order-num-badge">#{currentOrder.orderNumber}</span>
            <span className="badge" style={{ background: status.bg, color: status.color }}>{translateCol(status.label)}</span>
            <span className="badge" style={{ background: priority.bg, color: priority.color }}>{priority.label}</span>
          </div>
          <div className="modal-header-actions">
            {editing ? (
              <>
                <button className="modal-icon-btn modal-icon-btn--green" onClick={handleSaveEdit} title={tr.save}><Save size={15} /></button>
                <button className="modal-icon-btn" onClick={() => setEditing(false)} title={tr.cancel}><X size={15} /></button>
              </>
            ) : (
              <button className="modal-icon-btn" title={tr.edit} onClick={() => {
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
                  departmentIds: currentOrder.departmentIds?.length ? currentOrder.departmentIds : [currentOrder.departmentId],
                  priority: currentOrder.priority as OrderPriority,
                  status: currentOrder.status as OrderStatus,
                  assignedUsers: currentOrder.assignedUsers || [],
                });
                setEditing(true);
              }}><Pencil size={15} /></button>
            )}
            {currentUser?.role === 'admin' && (
              <button className="modal-icon-btn modal-icon-btn--danger" onClick={handleDelete} title={tr.delete}><Trash2 size={15} /></button>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && !editing && department.name === 'قسم التسليم' && (
              <button
                className="modal-icon-btn modal-icon-btn--purple"
                title={archiveClicked ? 'اضغط مرة أخرى للتأكيد' : tr.archiveOrder}
                style={archiveClicked ? { background: '#7c3aed', color: '#fff', outline: '2px solid #7c3aed' } : {}}
                onClick={() => {
                  if (!archiveClicked) {
                    setArchiveClicked(true);
                    setTimeout(() => setArchiveClicked(false), 3000);
                  } else {
                    doArchive();
                  }
                }}
              >
                <Archive size={15} />
                {archiveClicked && <span style={{ fontSize: 11, marginRight: 4 }}>تأكيد؟</span>}
              </button>
            )}
            {canTransfer && !editing && (
              <div style={{ position: 'relative' }}>
                <button
                  className={`modal-icon-btn ${showTransferPopover ? 'modal-icon-btn--active' : ''}`}
                  title={tr.transfer}
                  onClick={() => setShowTransferPopover((v) => !v)}
                >
                  <ArrowRightLeft size={15} />
                </button>
                {showTransferPopover && (
                  <div className="transfer-popover" style={{ minWidth: 240 }}>
                    <p className="transfer-popover-label">{tr.transferToLabel}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                      {departments.filter((d) => d.id !== order.departmentId).map((d) => {
                        const sel = transferDepts.includes(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            className={`user-pick-btn ${sel ? 'user-selected' : ''}`}
                            style={{ padding: '7px 10px' }}
                            onClick={() => setTransferDepts((prev) =>
                              sel ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                            )}
                          >
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                            {sel && <span style={{ color: 'var(--primary)', fontSize: 13 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="transfer-popover-btn"
                      disabled={transferDepts.length === 0}
                      onClick={() => { handleTransfer(); setShowTransferPopover(false); setTransferDepts([]); }}
                    >
                      {transferDepts.length > 1 ? `${tr.transferConfirmMultiple} ${transferDepts.length} ${tr.transferDepts}` : tr.transferConfirm}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button
                className={`modal-icon-btn ${showProgressPopover ? 'modal-icon-btn--active' : ''}`}
                title={`${tr.progress}: ${currentOrder.progress || 0}%`}
                onClick={() => {
                  setShowProgressPopover((v) => !v);
                  setShowTransferPopover(false);
                  if (currentOrder.progressQuantity) {
                    setProgressMode('quantity');
                    setQtyInput({ quantity: String(currentOrder.progressQuantity), completed: String(currentOrder.progressCompleted ?? '') });
                  } else {
                    setProgressMode('slider');
                  }
                }}
                style={{ gap: 4, minWidth: 52, fontSize: 11, fontWeight: 700 }}
              >
                <Gauge size={14} />
                <span>{currentOrder.progress || 0}%</span>
              </button>
              {showProgressPopover && (
                <div className="transfer-popover" style={{ minWidth: 240 }}>
                  {/* Mode Toggle */}
                  <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 12, gap: 3 }}>
                    <button
                      onClick={() => setProgressMode('slider')}
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: progressMode === 'slider' ? '#fff' : 'transparent',
                        color: progressMode === 'slider' ? '#6366f1' : '#6b7280',
                        boxShadow: progressMode === 'slider' ? '0 1px 3px #0001' : 'none',
                      }}
                    >
                      {lang === 'ar' ? 'شريط' : 'Slider'}
                    </button>
                    <button
                      onClick={() => {
                        setProgressMode('quantity');
                        setQtyInput({ quantity: String(currentOrder.progressQuantity ?? ''), completed: String(currentOrder.progressCompleted ?? '') });
                      }}
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: progressMode === 'quantity' ? '#fff' : 'transparent',
                        color: progressMode === 'quantity' ? '#6366f1' : '#6b7280',
                        boxShadow: progressMode === 'quantity' ? '0 1px 3px #0001' : 'none',
                      }}
                    >
                      {lang === 'ar' ? 'كمية / منجز' : 'Qty / Done'}
                    </button>
                  </div>

                  {progressMode === 'slider' ? (
                    <>
                      <p className="transfer-popover-label">{tr.progressLabel} <b>{editData.progress}%</b></p>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={editData.progress}
                        onChange={(e) => setEditData(p => ({ ...p, progress: Number(e.target.value) }))}
                        style={{ width: '100%', accentColor: '#6366f1' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: -4, marginBottom: 10 }}>
                        <span>0%</span><span>50%</span><span>100%</span>
                      </div>
                      <button
                        className="transfer-popover-btn"
                        onClick={() => {
                          const now = new Date().toISOString();
                          dispatch({ type: 'UPDATE_ORDER', payload: { ...currentOrder, progress: editData.progress, progressQuantity: undefined, progressCompleted: undefined, updatedAt: now }, silent: true } as any);
                          setShowProgressPopover(false);
                        }}
                      >
                        {tr.save}
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                            {lang === 'ar' ? 'الكمية' : 'Quantity'}
                          </label>
                          <input
                            type="number" min={1}
                            value={qtyInput.quantity}
                            onChange={(e) => setQtyInput(p => ({ ...p, quantity: e.target.value }))}
                            style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                            placeholder="100"
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                            {lang === 'ar' ? 'المنجز' : 'Completed'}
                          </label>
                          <input
                            type="number" min={0}
                            value={qtyInput.completed}
                            onChange={(e) => setQtyInput(p => ({ ...p, completed: e.target.value }))}
                            style={{ width: '100%', padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                            placeholder="40"
                          />
                        </div>
                      </div>
                      {/* Live preview */}
                      {qtyInput.quantity && qtyInput.completed && Number(qtyInput.quantity) > 0 && (
                        (() => {
                          const pct = Math.min(100, Math.round((Number(qtyInput.completed) / Number(qtyInput.quantity)) * 100));
                          const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
                          return (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>
                                <span>{lang === 'ar' ? 'نسبة الإنجاز' : 'Progress'}</span>
                                <span>{pct}%</span>
                              </div>
                              <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          );
                        })()
                      )}
                      <button
                        className="transfer-popover-btn"
                        disabled={!qtyInput.quantity || !qtyInput.completed || Number(qtyInput.quantity) <= 0}
                        onClick={() => {
                          const qty = Number(qtyInput.quantity);
                          const done = Number(qtyInput.completed);
                          const pct = Math.min(100, Math.round((done / qty) * 100));
                          const now = new Date().toISOString();
                          dispatch({ type: 'UPDATE_ORDER', payload: { ...currentOrder, progress: pct, progressQuantity: qty, progressCompleted: done, updatedAt: now }, silent: true } as any);
                          setEditData(p => ({ ...p, progress: pct }));
                          setShowProgressPopover(false);
                        }}
                      >
                        {tr.save}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {currentOrder.status !== 'done' && !editing && department.name !== 'قسم التسليم' && (
              <button className="modal-icon-btn modal-icon-btn--green" onClick={handleMarkDone} title={tr.markDone}>
                <CheckCheck size={15} />
              </button>
            )}
            <button className="modal-close-corner" onClick={onClose} title={tr.close}><X size={15} /></button>
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
                <span className="od-label"><User size={13} /> {tr.clientName}</span>
                {editing ? (
                  <input className="od-edit-input" value={editData.clientName} onChange={(e) => setEditData(p => ({ ...p, clientName: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.clientName}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Hash size={13} /> {tr.orderNumber}</span>
                {editing ? (
                  <input className="od-edit-input" value={editData.orderNumber} onChange={(e) => setEditData(p => ({ ...p, orderNumber: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.orderNumber}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><FileText size={13} /> {tr.description}</span>
                {editing ? (
                  <textarea className="od-edit-input od-edit-textarea" rows={3} value={editData.description} onChange={(e) => setEditData(p => ({ ...p, description: e.target.value }))} />
                ) : <span className="od-value od-desc">{currentOrder.description || '—'}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Calendar size={13} /> {tr.dueDate}</span>
                {editing ? (
                  <input type="date" className="od-edit-input" value={editData.dueDate} onChange={(e) => setEditData(p => ({ ...p, dueDate: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.dueDate ? formatDate(currentOrder.dueDate) : tr.notSet}</span>}
              </div>
              <div className="od-detail-item">
                <span className="od-label"><Calendar size={13} /> {tr.orderDate}</span>
                {editing ? (
                  <input type="date" className="od-edit-input" value={editData.orderDate} onChange={(e) => setEditData(p => ({ ...p, orderDate: e.target.value }))} />
                ) : <span className="od-value">{currentOrder.orderDate ? formatDate(currentOrder.orderDate) : '—'}</span>}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label"><Building2 size={13} /> {tr.assignedDept}</span>
                {editing ? (
                  <div className="users-picker" style={{ marginTop: 4 }}>
                    {departments.filter((d) => d.name !== 'قسم التسليم').map((d) => {
                      const selected = editData.departmentId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          className={`user-pick-btn ${selected ? 'user-selected' : ''}`}
                          onClick={() => setEditData(p => ({ ...p, departmentId: d.id, departmentIds: [d.id] }))}
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
                <span className="od-label"><Tag size={13} /> {tr.fileExtensions}</span>
                {editing ? (
                  <div className="textarea-save-wrap">
                    <textarea className="od-edit-input od-edit-textarea" rows={4} value={editData.fileExtensions} onChange={(e) => setEditData(p => ({ ...p, fileExtensions: e.target.value }))} placeholder="PDF, AI, CDR, PNG..." />
                    {editData.fileExtensions !== (currentOrder.fileExtensions || '') && (
                      <button className="textarea-save-btn" onClick={handleSaveEdit} title="حفظ"><CheckCheck size={14} /></button>
                    )}
                  </div>
                ) : inlineExtensions !== null ? (
                  <div className="textarea-save-wrap">
                    <textarea
                      className="od-edit-input od-edit-textarea"
                      rows={4}
                      value={inlineExtensions}
                      autoFocus
                      onChange={(e) => setInlineExtensions(e.target.value)}
                      onBlur={handleSaveInlineExtensions}
                      onKeyDown={(e) => { if (e.key === 'Escape') setInlineExtensions(null); }}
                      placeholder="PDF, AI, CDR, PNG..."
                    />
                    {inlineExtensions !== (currentOrder.fileExtensions || '') && (
                      <button className="textarea-save-btn" onMouseDown={(e) => { e.preventDefault(); handleSaveInlineExtensions(); }} title="حفظ"><CheckCheck size={14} /></button>
                    )}
                  </div>
                ) : (
                  <span
                    className="od-value od-extensions od-inline-editable"
                    title="اضغط للتعديل"
                    onClick={() => setInlineExtensions(currentOrder.fileExtensions || '')}
                  >{currentOrder.fileExtensions || '—'}</span>
                )}
              </div>
              <div className="od-detail-item od-spacer" />
              <div className="od-detail-item">
                <span className="od-label">{tr.priority}</span>
                {editing ? (
                  <div className="priority-picker" style={{ marginTop: 4 }}>
                    {(['urgent', 'high', 'medium', 'low'] as OrderPriority[]).map((k) => { const v = priorityConfig[k]; return (
                      <button
                        key={k}
                        type="button"
                        className={`priority-opt ${editData.priority === k ? 'priority-active' : ''}`}
                        style={{
                          background: editData.priority === k ? v.bg : '#f9fafb',
                          color: v.color,
                          borderColor: editData.priority === k ? v.color : '#e5e7eb',
                          fontWeight: editData.priority === k ? 700 : 500,
                        }}
                        onClick={() => setEditData(p => ({ ...p, priority: k }))}
                      >
                        {v.label}
                      </button>
                    ); })}
                  </div>
                ) : (
                  <span className="od-value">
                    <span className="badge" style={{ background: priorityConfig[currentOrder.priority].bg, color: priorityConfig[currentOrder.priority].color }}>
                      {priorityConfig[currentOrder.priority].label}
                    </span>
                  </span>
                )}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label">{tr.notes}</span>
                {editing ? (
                  <div className="textarea-save-wrap">
                    <textarea className="od-edit-input od-edit-textarea" rows={4} value={editData.notes} onChange={(e) => setEditData(p => ({ ...p, notes: e.target.value }))} placeholder="أضف ملاحظات..." style={{ resize: 'vertical' }} />
                    {editData.notes !== (currentOrder.notes || '') && (
                      <button className="textarea-save-btn" onClick={handleSaveEdit} title="حفظ"><CheckCheck size={14} /></button>
                    )}
                  </div>
                ) : inlineNotes !== null ? (
                  <div className="textarea-save-wrap">
                    <textarea
                      className="od-edit-input od-edit-textarea"
                      rows={4}
                      value={inlineNotes}
                      autoFocus
                      style={{ resize: 'vertical' }}
                      onChange={(e) => setInlineNotes(e.target.value)}
                      onBlur={handleSaveInlineNotes}
                      onKeyDown={(e) => { if (e.key === 'Escape') setInlineNotes(null); }}
                      placeholder="أضف ملاحظات..."
                    />
                    {inlineNotes !== (currentOrder.notes || '') && (
                      <button className="textarea-save-btn" onMouseDown={(e) => { e.preventDefault(); handleSaveInlineNotes(); }} title="حفظ"><CheckCheck size={14} /></button>
                    )}
                  </div>
                ) : (
                  <span
                    className="od-value od-extensions od-inline-editable"
                    title="اضغط للتعديل"
                    onClick={() => setInlineNotes(currentOrder.notes || '')}
                  >{currentOrder.notes || '—'}</span>
                )}
              </div>
              <div className="od-detail-item od-full">
                <span className="od-label"><Users size={13} /> {tr.assignedUsers}</span>
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
                    }) : <span className="muted">{tr.noneAssigned}</span>}
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
                <div className="od-files-title-row">
                  <h4 className="od-files-title"><Image size={15} /> {tr.orderForms}</h4>
                  {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                    <label className="od-upload-btn" title={tr.upload}>
                      <Upload size={13} /> {tr.upload}
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.ai,.cdr,.psd,.svg" style={{ display: 'none' }} onChange={handleUploadOrderForm} />
                    </label>
                  )}
                </div>
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
                          <button className="od-action-btn" onClick={() => handlePreviewFile(f.dataUrl, f.name)} title={tr.view}>
                            <Image size={15} /> {tr.view}
                          </button>
                          <button className="od-action-btn" onClick={() => handleOpenFile(f.dataUrl, f.name)} title={tr.download}>
                            <Download size={15} /> {tr.download}
                          </button>
                          {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                            <button className="od-action-btn od-action-btn--danger" onClick={() => handleDeleteOrderForm(f.id)} title={tr.deleteFile}>
                              <Trash2 size={15} /> {tr.deleteFile}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="od-empty-files">{tr.noAttachedForms}</p>
                )}
              </div>

              {/* Invoices */}
              <div className="od-files-group">
                <div className="od-files-title-row">
                  <h4 className="od-files-title"><FileText size={15} /> {tr.invoices}</h4>
                  {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                    <label className="od-upload-btn" title={tr.upload}>
                      <Upload size={13} /> {tr.upload}
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={handleUploadInvoice} />
                    </label>
                  )}
                </div>
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
                        <button className="od-action-btn" onClick={() => handlePreviewFile(currentOrder.invoice?.dataUrl, currentOrder.invoice?.name || tr.invoices)} title={tr.view}><Image size={15} /> {tr.view}</button>
                        <button className="od-action-btn" onClick={() => handleOpenFile(currentOrder.invoice?.dataUrl, currentOrder.invoice?.name || tr.invoices)} title={tr.download}><Download size={15} /> {tr.download}</button>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                          <button className="od-action-btn od-action-btn--danger" onClick={() => handleDeleteInvoice()} title={tr.deleteFile}><Trash2 size={15} /> {tr.deleteFile}</button>
                        )}
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
                        <button className="od-action-btn" onClick={() => handlePreviewFile(inv.dataUrl, inv.name)} title={tr.view}><Image size={15} /> {tr.view}</button>
                        <button className="od-action-btn" onClick={() => handleOpenFile(inv.dataUrl, inv.name)} title={tr.download}><Download size={15} /> {tr.download}</button>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                          <button className="od-action-btn od-action-btn--danger" onClick={() => handleDeleteInvoice(inv.id)} title={tr.deleteFile}><Trash2 size={15} /> {tr.deleteFile}</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!currentOrder.invoice && (!currentOrder.invoices || currentOrder.invoices.length === 0) && (
                    <p className="od-empty-files">{tr.noInvoiceUploaded}</p>
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
                    <p>{tr.noMessages}</p>
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
                  placeholder={tr.chatCtrlEnter}
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
                <div className="empty-state"><Clock size={40} /><p>{tr.noHistory}</p></div>
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
