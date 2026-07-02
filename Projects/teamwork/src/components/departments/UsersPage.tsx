import React, { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Shield, Camera } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { User, UserRole } from '../../types';
import { generateId } from '../../utils/helpers';
import Header from '../layout/Header';

const UsersPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { users, departments, orders } = state;
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('manager');
  const [departmentId, setDepartmentId] = useState('');
  const [avatar, setAvatar] = useState('');
  const avatarRef = useRef<HTMLInputElement>(null);

  const openAdd = () => {
    setEditUser(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setRole('manager');
    setDepartmentId('');
    setAvatar('');
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    setFullName(user.fullName);
    setUsername(user.username);
    setPassword(user.password);
    setRole(user.role);
    setDepartmentId(user.departmentId || '');
    setAvatar(user.avatar || '');
    setShowModal(true);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 200;
        const ratio = Math.min(MAX / img.width, MAX / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setAvatar(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!fullName.trim() || !username.trim() || !password.trim()) return;
    if (editUser) {
      dispatch({
        type: 'UPDATE_USER',
        payload: { ...editUser, fullName, username, password, role, departmentId: departmentId || undefined, avatar: avatar || undefined },
      });
    } else {
      const newUser: User = {
        id: generateId(),
        fullName,
        username,
        password,
        role,
        departmentId: departmentId || undefined,
        avatar: avatar || undefined,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_USER', payload: newUser });
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      dispatch({ type: 'DELETE_USER', payload: id });
    }
  };

  const roleLabels: Record<UserRole, string> = {
    admin: 'مدير النظام',
    manager: 'مدير قسم',
    member: 'عضو',
  };

  const roleColors: Record<UserRole, string> = {
    admin: '#ef4444',
    manager: '#8b5cf6',
    member: '#3b82f6',
  };

  return (
    <div className="page">
      <Header title="إدارة المستخدمين" subtitle={`${users.length} مستخدم`} />
      <div className="page-content">
        <div className="page-actions">
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={16} />
            <span>إضافة مستخدم</span>
          </button>
        </div>

        <div className="table-card">
          <table className="orders-table full-table">
            <thead>
              <tr>
                <th>الإجراءات</th>
                <th>الطلبيات</th>
                <th>القسم</th>
                <th>الدور</th>
                <th>اسم الدخول</th>
                <th>المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const dept = departments.find((d) => d.id === u.departmentId);
                const userOrders = orders.filter((o) => o.assignedUsers?.includes(u.id));
                return (
                  <tr key={u.id} className="table-row">
                    <td>
                      <div className="action-btns">
                        <button className="icon-btn" onClick={() => openEdit(u)}><Pencil size={15} /></button>
                        <button className="icon-btn icon-danger" onClick={() => handleDelete(u.id)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                    <td>{userOrders.length}</td>
                    <td>
                      {dept ? (
                        <span className="dept-chip" style={{ background: dept.color + '22', color: dept.color }}>
                          {dept.name}
                        </span>
                      ) : <span className="muted">بدون قسم</span>}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: roleColors[u.role] + '22', color: roleColors[u.role] }}
                      >
                        <Shield size={12} />
                        {roleLabels[u.role]}
                      </span>
                    </td>
                    <td className="muted">@{u.username}</td>
                    <td>
                      <div className="user-cell">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.fullName} className="user-cell-avatar user-cell-avatar-img" />
                        ) : (
                          <div className="user-cell-avatar" style={{ background: dept?.color || '#6366f1' }}>
                            {u.fullName.charAt(0)}
                          </div>
                        )}
                        <span>{u.fullName}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-corner" onClick={() => setShowModal(false)} title="إغلاق"><X size={18} /></button>
            <div className="modal-header">
              <h3 className="modal-heading">{editUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}</h3>
            </div>
            <div className="modal-body modal-form">

              {/* Avatar Upload */}
              <div className="avatar-upload-section">
                <div className="avatar-preview-wrap" onClick={() => avatarRef.current?.click()}>
                  {avatar ? (
                    <img src={avatar} alt="avatar" className="avatar-preview-img" />
                  ) : (
                    <div className="avatar-preview-placeholder">
                      {fullName ? fullName.charAt(0) : '؟'}
                    </div>
                  )}
                  <div className="avatar-upload-overlay">
                    <Camera size={18} />
                    <span>تغيير الصورة</span>
                  </div>
                  <input
                    ref={avatarRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    hidden
                  />
                </div>
                {avatar && (
                  <button type="button" className="avatar-remove-btn" onClick={() => setAvatar('')}>
                    حذف الصورة
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">الاسم الكامل *</label>
                <input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">كلمة المرور *</label>
                  <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">اسم المستخدم *</label>
                  <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">الدور</label>
                  <select className="form-input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                    <option value="manager">مدير قسم</option>
                    <option value="admin">مدير النظام</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">القسم</label>
                  <select className="form-input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">بدون قسم</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>إلغاء</button>
                <button className="btn-primary" onClick={handleSave} disabled={!fullName || !username || !password}>
                  {editUser ? 'حفظ' : 'إضافة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
