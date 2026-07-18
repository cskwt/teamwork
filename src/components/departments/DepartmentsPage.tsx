import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, Users, Package } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Department } from '../../types';
import { generateId } from '../../utils/helpers';
import Header from '../layout/Header';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const ICONS = ['ShoppingCart', 'Headphones', 'Truck', 'Building2'];

const DepartmentsPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { departments, users, orders } = state;
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [managerId, setManagerId] = useState('');

  const openAdd = () => {
    setEditDept(null);
    setName('');
    setDescription('');
    setColor(COLORS[0]);
    setIcon(ICONS[0]);
    setManagerId('');
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditDept(dept);
    setName(dept.name);
    setDescription(dept.description);
    setColor(dept.color);
    setIcon(dept.icon);
    setManagerId(dept.managerId || '');
    setShowModal(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editDept) {
      dispatch({ type: 'UPDATE_DEPARTMENT', payload: { ...editDept, name, description, color, icon, managerId: managerId || undefined } });
    } else {
      const newDept: Department = {
        id: generateId(),
        name,
        description,
        color,
        icon,
        managerId: managerId || undefined,
        createdAt: new Date().toISOString(),
        columns: [
          { id: 'new', title: 'جديد', color: '#6366f1', order: 0 },
          { id: 'in_progress', title: 'قيد التنفيذ', color: '#f59e0b', order: 1 },
          { id: 'review', title: 'مراجعة', color: '#8b5cf6', order: 2 },
          { id: 'done', title: 'منجز', color: '#10b981', order: 3 },
        ],
      };
      dispatch({ type: 'ADD_DEPARTMENT', payload: newDept });
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا القسم؟ سيتم حذف جميع الطلبيات المرتبطة به.')) {
      dispatch({ type: 'DELETE_DEPARTMENT', payload: id });
    }
  };

  const managers = users.filter((u) => u.role === 'manager' || u.role === 'admin');

  return (
    <div className="page">
      <Header title="إدارة الأقسام" subtitle={`${departments.length} قسم`} />
      <div className="page-content">
        <div className="page-actions">
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={16} />
            <span>إضافة قسم</span>
          </button>
        </div>

        <div className="dept-cards-grid">
          {departments.map((dept) => {
            const manager = users.find((u) => u.id === dept.managerId);
            const deptOrders = orders.filter((o) => o.departmentId === dept.id);
            const deptMembers = users.filter((u) => u.departmentId === dept.id);
            return (
              <div key={dept.id} className="dept-card" style={{ '--dept-color': dept.color } as any}>
                <div className="dept-card-top" style={{ background: dept.color }}>
                  <h3>{dept.name}</h3>
                  <div className="dept-card-actions">
                    <button className="icon-btn-white" onClick={() => openEdit(dept)}><Pencil size={14} /></button>
                    <button className="icon-btn-white" onClick={() => handleDelete(dept.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="dept-card-body">
                  <p className="dept-card-desc">{dept.description || 'لا يوجد وصف'}</p>
                  <div className="dept-card-stats">
                    <div className="dept-card-stat">
                      <Package size={16} />
                      <span>{deptOrders.length} طلبية</span>
                    </div>
                    <div className="dept-card-stat">
                      <Users size={16} />
                      <span>{deptMembers.length} عضو</span>
                    </div>
                  </div>
                  {manager && (
                    <div className="dept-manager">
                      <div className="manager-avatar" style={{ background: dept.color }}>
                        {manager.fullName.charAt(0)}
                      </div>
                      <span>{manager.fullName}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-heading">{editDept ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body modal-form">
              <div className="form-group">
                <label className="form-label">اسم القسم *</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: قسم المبيعات" />
              </div>
              <div className="form-group">
                <label className="form-label">الوصف</label>
                <textarea className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">المدير المسؤول</label>
                <select className="form-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">بدون مدير</option>
                  {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">اللون</label>
                <div className="color-picker">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-btn ${color === c ? 'color-selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
                <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>
                  {editDept ? 'حفظ التعديلات' : 'إضافة القسم'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentsPage;
