import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Image, Trash2, Users, Building2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Order, OrderPriority, FileAttachment } from '../../types';
import { generateId } from '../../utils/helpers';

interface AddOrderModalProps {
  departmentId: string;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: OrderPriority; label: string; color: string; bg: string }[] = [
  { value: 'urgent', label: 'قصوى',    color: '#dc2626', bg: '#fef2f2' },
  { value: 'high',   label: 'عالية',   color: '#ea580c', bg: '#fff7ed' },
  { value: 'medium', label: 'متوسطة',  color: '#d97706', bg: '#fffbeb' },
  { value: 'low',    label: 'عادية',   color: '#16a34a', bg: '#f0fdf4' },
];

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const AddOrderModal: React.FC<AddOrderModalProps> = ({ departmentId, onClose }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { users, departments, currentUser } = state;

  const [orderNumber, setOrderNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<string[]>(departmentId ? [departmentId] : []);
  const [priority, setPriority] = useState<OrderPriority>('low');
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [fileExtensions, setFileExtensions] = useState('');
  const [notes, setNotes] = useState('');
  const [orderForms, setOrderForms] = useState<FileAttachment[]>([]);
  const [invoices, setInvoices] = useState<FileAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dupWarning, setDupWarning] = useState<{ deptName: string; clientName: string } | null>(null);

  const formsRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  const toggleUser = (userId: string) => {
    setAssignedUsers((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId]
    );
  };

  const handleFormsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results: FileAttachment[] = [];
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      results.push({ id: generateId(), name: file.name, type: file.type, size: file.size, dataUrl });
    }
    setOrderForms((prev) => [...prev, ...results]);
    setUploading(false);
    e.target.value = '';
  };

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      setInvoices((prev) => [...prev, { id: generateId(), name: file.name, type: file.type, size: file.size, dataUrl }]);
    }
    e.target.value = '';
  };

  const removeInvoice = (id: string) => setInvoices((prev) => prev.filter((f) => f.id !== id));

  const removeForm = (id: string) => setOrderForms((prev) => prev.filter((f) => f.id !== id));

  const doSave = () => {
    if (!orderNumber.trim() || !clientName.trim() || !currentUser) return;
    const now = new Date().toISOString();
    const depts = selectedDepts.length > 0 ? selectedDepts : [''];
    const groupId = depts.length > 1 ? generateId() : undefined;
    depts.forEach((deptId) => {
      const newOrder: Order = {
        id: generateId(),
        orderNumber: orderNumber.trim(),
        clientName: clientName.trim(),
        title: `#${orderNumber.trim()} - ${clientName.trim()}`,
        description: description.trim(),
        status: 'new',
        priority,
        departmentId: deptId,
        departmentIds: [deptId],
        originDepartmentId: deptId,
        groupId,
        assignedUsers,
        createdBy: currentUser.id,
        createdAt: now,
        orderDate: new Date(orderDate).toISOString(),
        updatedAt: now,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        orderForms,
        invoices: invoices.length > 0 ? invoices : undefined,
        fileExtensions: fileExtensions.trim(),
        notes: notes.trim(),
        tags: [],
        comments: [],
        history: [],
      };
      dispatch({ type: 'ADD_ORDER', payload: newOrder, triggerUserId: state.currentUser?.id } as any);
      addHistoryEntry(newOrder.id, 'إنشاء الطلبية');
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !clientName.trim() || !currentUser) return;

    // Check for duplicate order number in the same department(s)
    const activeOrders = state.orders.filter((o) => !o.deletedAt);
    const depts = selectedDepts.length > 0 ? selectedDepts : [''];
    for (const deptId of depts) {
      const dup = activeOrders.find(
        (o) => o.departmentId === deptId &&
               o.orderNumber.trim().toLowerCase() === orderNumber.trim().toLowerCase()
      );
      if (dup) {
        const deptName = departments.find((d) => d.id === deptId)?.name || '';
        setDupWarning({ deptName, clientName: dup.clientName });
        return;
      }
    }
    doSave();
  };

  const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel modal-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Duplicate Order Number Warning */}
        {dupWarning && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, background: '#00000066',
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16,
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: 28, maxWidth: 380, width: '90%',
              boxShadow: '0 20px 60px #0003', textAlign: 'right',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: '#111', margin: 0 }}>رقم الطلبية مكرر</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>في قسم: <b>{dupWarning.deptName}</b></p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.6 }}>
                يوجد طلبية بنفس الرقم <b>#{orderNumber.trim()}</b> مسجلة في هذا القسم باسم العميل: <b>{dupWarning.clientName}</b>
                <br />هل تريد الحفظ على أي حال؟
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDupWarning(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}
                >
                  تعديل الرقم
                </button>
                <button
                  onClick={() => { setDupWarning(null); doSave(); }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  حفظ على أي حال
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="modal-header">
          <h3 className="modal-heading">إضافة طلبية جديدة</h3>
          <button className="modal-close-corner" onClick={onClose} title="إغلاق"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="add-order-body">

            {/* Left Column - Files & Users */}
            <div className="add-order-col">

              {/* Upload Order Forms */}
              <div className="form-group">
                <label className="form-label"><Image size={13} /> نماذج الطلبية</label>
                <div className="upload-zone" onClick={() => formsRef.current?.click()}>
                  <Upload size={22} />
                  <span>اضغط لرفع الملفات</span>
                  <span className="upload-hint">JPG, PNG, PDF, AI, CDR وغيرها</span>
                  <input
                    ref={formsRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.ai,.cdr,.eps,.svg,.psd"
                    onChange={handleFormsUpload}
                    hidden
                  />
                </div>
                {orderForms.length > 0 && (
                  <div className="file-list">
                    {orderForms.map((f) => (
                      <div key={f.id} className="file-item">
                        {f.dataUrl ? (
                          <img src={f.dataUrl} alt={f.name} className="file-thumb" />
                        ) : (
                          <div className="file-icon-box"><FileText size={18} /></div>
                        )}
                        <div className="file-info">
                          <span className="file-name">{f.name}</span>
                          <span className="file-size">{formatFileSize(f.size)}</span>
                        </div>
                        <button type="button" className="file-remove" onClick={() => removeForm(f.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload Invoice */}
              <div className="form-group">
                <label className="form-label"><FileText size={13} /> رفع الفاتورة (PDF)</label>
                {invoices.length > 0 && (
                  <div className="file-list">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="file-item">
                        <div className="file-icon-box invoice-icon"><FileText size={18} /></div>
                        <div className="file-info">
                          <span className="file-name">{inv.name}</span>
                          <span className="file-size">{formatFileSize(inv.size)}</span>
                        </div>
                        <button type="button" className="file-remove" onClick={() => removeInvoice(inv.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="upload-zone upload-zone-sm" onClick={() => invoiceRef.current?.click()}>
                  <Upload size={18} />
                  <span>{invoices.length > 0 ? 'إضافة فاتورة أخرى' : 'رفع الفاتورة'}</span>
                  <input ref={invoiceRef} type="file" accept=".pdf" multiple onChange={handleInvoiceUpload} hidden />
                </div>
              </div>

              {/* Assign Users */}
              <div className="form-group">
                <label className="form-label"><Users size={13} /> المستخدمون المسؤولون</label>
                <div className="users-picker">
                  {users.map((u) => {
                    const dept = departments.find((d) => d.id === u.departmentId);
                    const selected = assignedUsers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`user-pick-btn ${selected ? 'user-selected' : ''}`}
                        onClick={() => toggleUser(u.id)}
                      >
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.fullName} className="user-pick-avatar user-pick-avatar-img" />
                        ) : (
                          <div className="user-pick-avatar" style={{ background: dept?.color || '#6366f1' }}>
                            {u.fullName.charAt(0)}
                          </div>
                        )}
                        <div className="user-pick-info">
                          <span className="user-pick-name">{u.fullName}</span>
                          <span className="user-pick-dept">{dept?.name || 'بدون قسم'}</span>
                        </div>
                        {selected && <div className="user-pick-check">✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Column - Form Fields */}
            <div className="add-order-col">

              {/* Order Number + Client Name */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">رقم الطلبية *</label>
                  <input
                    className="form-input"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="مثال: 1001"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم العميل *</label>
                  <input
                    className="form-input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="اسم العميل"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">وصف الطلب</label>
                <textarea
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تفاصيل الطلبية..."
                  rows={3}
                />
              </div>

              {/* Order Date + Due Date */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">موعد التسليم</label>
                  <input type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={orderDate} />
                </div>
                <div className="form-group">
                  <label className="form-label">تاريخ الطلب</label>
                  <input type="date" className="form-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
              </div>

              {/* Department - Full Width */}
              <div className="form-group">
                <label className="form-label"><Building2 size={13} /> القسم المختص</label>
                <div className="dept-picker-grid">
                  {departments.filter((d) => d.name !== 'قسم التسليم').map((d) => {
                    const selected = selectedDepts.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`user-pick-btn ${selected ? 'user-selected' : ''}`}
                        onClick={() => setSelectedDepts(prev =>
                          selected ? prev.filter(id => id !== d.id) : [...prev, d.id]
                        )}
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
              </div>

              {/* Priority + File Extensions */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">الأولوية</label>
                  <div className="priority-picker">
                    {PRIORITY_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        className={`priority-opt ${priority === p.value ? 'priority-active' : ''}`}
                        style={{
                          background: priority === p.value ? p.bg : '#f9fafb',
                          color: p.color,
                          borderColor: priority === p.value ? p.color : '#e5e7eb',
                          fontWeight: priority === p.value ? 700 : 500,
                        }}
                        onClick={() => setPriority(p.value)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">امتداد الملفات المطلوبة</label>
                  <textarea
                    className="form-input"
                    value={fileExtensions}
                    onChange={(e) => setFileExtensions(e.target.value)}
                    placeholder="مثال: PDF, AI, CDR, PNG"
                    style={{ resize: 'none', flex: 1, minHeight: 80 }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">الملاحظات</label>
                <textarea
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أضف ملاحظات إضافية للطلبية..."
                  style={{ resize: 'none', minHeight: 72 }}
                />
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer add-order-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!orderNumber.trim() || !clientName.trim() || uploading}
            >
              إضافة الطلبية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrderModal;
