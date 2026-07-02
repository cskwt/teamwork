import React, { useState } from 'react';
import {
  Plus, Folder,
  Pencil, Trash2, X,
  ShoppingCart, Palette, Zap, Printer, Truck, Building2
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Department } from '../../types';
import { generateId } from '../../utils/helpers';
import Header from '../layout/Header';

type IconComponent = React.FC<{ size?: number; color?: string }>;

const iconMap: Record<string, IconComponent> = {
  ShoppingCart, Palette, Zap, Printer, Truck, Building2, Folder,
};

const renderIcon = (key: string, size = 34, color = '#fff') => {
  const Icon = iconMap[key] || Building2;
  return <Icon size={size} color={color} />;
};

interface ProjectsPageProps {
  onOpenBoard: (deptId: string) => void;
}

const COLORS = [
  '#22c55e', '#f97316', '#3b82f6', '#eab308',
  '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444',
];

const ProjectsPage: React.FC<ProjectsPageProps> = ({ onOpenBoard }) => {
  const { state, dispatch } = useApp();
  const { departments, orders, currentUser } = state;

  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState('Building2');

  const isAdmin = currentUser?.role === 'admin';

  const visibleDepts = isAdmin
    ? departments
    : departments.filter(
        (d) => d.managerId === currentUser?.id || d.id === currentUser?.departmentId
      );

  const openAdd = () => {
    setEditDept(null);
    setName('');
    setNameEn('');
    setColor(COLORS[0]);
    setIcon('Building2');
    setShowModal(true);
  };

  const openEdit = (e: React.MouseEvent, dept: Department) => {
    e.stopPropagation();
    setEditDept(dept);
    setName(dept.name);
    setNameEn(dept.description);
    setColor(dept.color);
    setIcon(dept.icon || 'Building2');
    setShowModal(true);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('هل أنت متأكد من حذف هذا القسم؟')) {
      dispatch({ type: 'DELETE_DEPARTMENT', payload: id });
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editDept) {
      dispatch({
        type: 'UPDATE_DEPARTMENT',
        payload: { ...editDept, name, description: nameEn, color, icon },
      });
    } else {
      const newDept: Department = {
        id: generateId(),
        name,
        description: nameEn,
        color,
        icon,
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

  return (
    <div className="projects-page">
      <Header title="الأقسام" />

      {isAdmin && (
        <div className="page-actions" style={{ padding: '0 24px 12px' }}>
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={16} />
            <span>إضافة قسم</span>
          </button>
        </div>
      )}

      {/* Department Cards */}
      <div className="dept-cards-container">
        {[...visibleDepts].reverse().map((dept) => {
          const cols = dept.columns?.length ? dept.columns : [
            { id: 'new', title: 'جديد', color: '#6366f1', order: 0 },
            { id: 'in_progress', title: 'قيد التنفيذ', color: '#f59e0b', order: 1 },
            { id: 'review', title: 'مراجعة', color: '#8b5cf6', order: 2 },
            { id: 'done', title: 'منجز', color: '#10b981', order: 3 },
          ];
          const allDeptOrders = orders.filter((o) => !o.deletedAt && o.departmentId === dept.id && o.status !== 'cancelled');
          const lastColId = cols[cols.length - 1].id;
          const doneCount = allDeptOrders.filter((o) => o.status === lastColId).length;

          const colStats = cols.map((col) => ({
            ...col,
            count: allDeptOrders.filter((o) => o.status === col.id).length,
          }));

          return (
            <div
              key={dept.id}
              className="dept-project-card"
              onClick={() => onOpenBoard(dept.id)}
            >
              {/* Card Header */}
              <div className="dpc-header" style={{ background: dept.color }}>
                <div className="dpc-header-icon">
                  {renderIcon(dept.icon, 30)}
                </div>
                {isAdmin && (
                  <div className="dpc-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="dpc-action-btn" onClick={(e) => openEdit(e, dept)} title="تعديل">
                      <Pencil size={13} />
                    </button>
                    <button className="dpc-action-btn dpc-danger" onClick={(e) => handleDelete(e, dept.id)} title="حذف">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="dpc-body">
                <h3 className="dpc-name">{dept.name}</h3>
                {dept.description && <p className="dpc-desc">{dept.description}</p>}


                {/* Stats — عمود بعمود */}
                <div className="dpc-stats">
                  {colStats.map((col) => (
                    <div className="dpc-stat" key={col.id}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: col.color, display: 'inline-block', flexShrink: 0
                      }} />
                      <span>{col.count}</span>
                      <span className="dpc-stat-label">{col.title}</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          );
        })}

        {/* Add Card */}

        {visibleDepts.length === 0 && !isAdmin && (
          <div className="dept-empty-state">
            <Folder size={52} color="#d1d5db" />
            <p>لا توجد أقسام بعد</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-heading">{editDept ? 'تعديل القسم' : 'إضافة قسم جديد'}</h3>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body modal-form">
              <div className="form-group">
                <label className="form-label">اسم القسم (عربي) *</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: قسم المبيعات"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">اسم القسم (إنجليزي)</label>
                <input
                  className="form-input"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Sales Section"
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label className="form-label">أيقونة القسم</label>
                <div className="icon-picker">
                  {Object.keys(iconMap).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`icon-pick-btn ${icon === key ? 'icon-selected' : ''}`}
                      style={{ background: icon === key ? color : '#1a1a1a' }}
                      onClick={() => setIcon(key)}
                      title={key}
                    >
                      {renderIcon(key, 18, icon === key ? '#fff' : '#888')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">لون القسم</label>
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
                <div className="color-preview" style={{ background: color + '22', borderColor: color }}>
                  <div style={{ background: color, borderRadius: 8, padding: 6, display: 'flex' }}>
                    {renderIcon(icon, 18)}
                  </div>
                  <span style={{ color, fontWeight: 700 }}>{name || 'اسم القسم'}</span>
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

export default ProjectsPage;
