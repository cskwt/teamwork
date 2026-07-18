import React, { useState, useRef } from 'react';
import { User, Lock, Download, Upload, Trash2, Camera, Save, Eye, EyeOff, AlertTriangle, RefreshCw, Wrench, Archive } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import Header from '../layout/Header';
import { clearState, saveState } from '../../utils/storage';
import { Order } from '../../types';

const SettingsPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { currentUser, orders, departments } = state;
  const [fixTarget, setFixTarget] = useState<{ order: Order; newDeptId: string } | null>(null);
  const [fixMsg, setFixMsg] = useState('');
  const avatarRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [passMsg, setPassMsg] = useState('');

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

  const handleSaveProfile = () => {
    if (!fullName.trim() || !username.trim()) return;
    if (!currentUser) return;
    dispatch({ type: 'UPDATE_USER', payload: { ...currentUser, fullName, username, avatar: avatar || undefined } });
    setProfileMsg('تم حفظ البيانات بنجاح ✓');
    setTimeout(() => setProfileMsg(''), 3000);
  };

  const handleChangePassword = () => {
    if (!currentUser) return;
    if (oldPassword !== currentUser.password) { setPassMsg('كلمة المرور الحالية غير صحيحة'); return; }
    if (newPassword.length < 6) { setPassMsg('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'); return; }
    if (newPassword !== confirmPassword) { setPassMsg('كلمة المرور الجديدة غير متطابقة'); return; }
    dispatch({ type: 'UPDATE_USER', payload: { ...currentUser, password: newPassword } });
    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    setPassMsg('تم تغيير كلمة المرور بنجاح ✓');
    setTimeout(() => setPassMsg(''), 3000);
  };

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    await saveState(state);
    setSyncing(false);
    setSyncMsg('تم مزامنة البيانات مع السيرفر بنجاح ✓');
    setTimeout(() => setSyncMsg(''), 4000);
  };

  const handleExport = () => {
    const data = JSON.stringify({ users: state.users, departments: state.departments, orders: state.orders }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teamwork-backup-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.users && data.departments && data.orders) {
          const newState = { ...state, ...data, currentUser: state.currentUser };
          dispatch({ type: 'INIT_STATE' as any, payload: { ...data, currentUser: null } });
          await saveState(newState);
          alert('تم استيراد البيانات بنجاح وحفظها على السيرفر. سيتم إعادة تحميل الصفحة.');
          window.location.reload();
        } else { alert('الملف غير صالح'); }
      } catch { alert('خطأ في قراءة الملف'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من إعادة ضبط البرنامج؟ سيتم حذف جميع البيانات نهائياً.')) {
      clearState().then(() => window.location.reload());
    }
  };

  return (
    <div className="page">
      <Header title="الإعدادات" />
      <div className="page-content">
        <div className="settings-grid">

          {/* Profile */}
          <div className="settings-card">
            <div className="settings-card-header">
              <User size={18} />
              <h3>الملف الشخصي</h3>
            </div>
            <div className="settings-avatar-row">
              <div className="settings-avatar-wrap" onClick={() => avatarRef.current?.click()}>
                {avatar
                  ? <img src={avatar} alt="avatar" className="settings-avatar-img" />
                  : <div className="settings-avatar-placeholder">{fullName.charAt(0) || 'U'}</div>}
                <div className="settings-avatar-overlay"><Camera size={16} /></div>
              </div>
              <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
              <p className="settings-avatar-hint">اضغط لتغيير الصورة</p>
            </div>
            <div className="settings-form">
              <div className="form-group">
                <label className="form-label">الاسم الكامل</label>
                <input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">اسم المستخدم</label>
                <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              {profileMsg && <p className={`settings-msg ${profileMsg.includes('✓') ? 'msg-success' : 'msg-error'}`}>{profileMsg}</p>}
              <button className="btn-primary" onClick={handleSaveProfile}><Save size={15} /> حفظ التغييرات</button>
            </div>
          </div>

          {/* Password */}
          <div className="settings-card">
            <div className="settings-card-header">
              <Lock size={18} />
              <h3>تغيير كلمة المرور</h3>
            </div>
            <div className="settings-form">
              <div className="form-group">
                <label className="form-label">كلمة المرور الحالية</label>
                <div className="input-wrapper">
                  <input className="form-input has-toggle" type={showOld ? 'text' : 'password'} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                  <button type="button" className="toggle-password" onClick={() => setShowOld(!showOld)}>{showOld ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">كلمة المرور الجديدة</label>
                <div className="input-wrapper">
                  <input className="form-input has-toggle" type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <button type="button" className="toggle-password" onClick={() => setShowNew(!showNew)}>{showNew ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">تأكيد كلمة المرور</label>
                <input className="form-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              {passMsg && <p className={`settings-msg ${passMsg.includes('✓') ? 'msg-success' : 'msg-error'}`}>{passMsg}</p>}
              <button className="btn-primary" onClick={handleChangePassword}><Lock size={15} /> تغيير كلمة المرور</button>
            </div>
          </div>

          {/* Fix Orders - Admin only */}
          {currentUser?.role === 'admin' && (() => {
            const activeOrders = orders.filter((o) => !o.deletedAt);
            return (
              <div className="settings-card">
                <div className="settings-card-header">
                  <Wrench size={18} />
                  <h3>إصلاح قسم الطلبيات</h3>
                </div>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                  إذا ظهرت طلبية في قسم خاطئ، يمكنك تصحيح قسمها مباشرة من هنا دون الحاجة لفتحها.
                </p>
                {fixMsg && <p style={{ color: '#16a34a', fontSize: 12, marginBottom: 8 }}>{fixMsg}</p>}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>العميل</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>القسم الحالي</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>نقل إلى</th>
                        <th style={{ padding: '8px 10px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOrders.map((o) => {
                        const currDept = departments.find((d) => d.id === o.departmentId);
                        const isFix = fixTarget?.order.id === o.id;
                        return (
                          <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6', background: isFix ? '#eef2ff' : undefined }}>
                            <td style={{ padding: '7px 10px', color: '#9ca3af' }}>{o.orderNumber}</td>
                            <td style={{ padding: '7px 10px', fontWeight: 600 }}>{o.clientName}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: currDept?.color || '#6b7280', flexShrink: 0 }} />
                                {currDept?.name || o.departmentId}
                              </span>
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              <select
                                style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }}
                                value={isFix ? fixTarget.newDeptId : o.departmentId}
                                onChange={(e) => setFixTarget({ order: o, newDeptId: e.target.value })}
                              >
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '7px 10px' }}>
                              <button
                                style={{
                                  padding: '5px 12px', background: '#6366f1', color: '#fff', border: 'none',
                                  borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                  opacity: (isFix && fixTarget.newDeptId !== o.departmentId) ? 1 : 0.4,
                                }}
                                disabled={!isFix || fixTarget.newDeptId === o.departmentId}
                                onClick={() => {
                                  if (!fixTarget || fixTarget.newDeptId === o.departmentId) return;
                                  const now = new Date().toISOString();
                                  dispatch({
                                    type: 'UPDATE_ORDER',
                                    payload: {
                                      ...o,
                                      departmentId: fixTarget.newDeptId,
                                      departmentIds: [fixTarget.newDeptId],
                                      status: 'new',
                                      updatedAt: now,
                                    },
                                  } as any);
                                  setFixMsg(`✓ تم نقل "${o.clientName}" إلى ${departments.find(d => d.id === fixTarget.newDeptId)?.name}`);
                                  setFixTarget(null);
                                  setTimeout(() => setFixMsg(''), 4000);
                                }}
                              >
                                نقل
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Data - Admin only */}
          {currentUser?.role === 'admin' && <div className="settings-card">
            <div className="settings-card-header">
              <Download size={18} />
              <h3>إدارة البيانات</h3>
            </div>
            <div className="settings-form">
              <div className="settings-data-item">
                <div>
                  <p className="settings-data-title">مزامنة مع السيرفر</p>
                  <p className="settings-data-desc">رفع بيانات هذا الجهاز إلى السيرفر لتظهر على جميع الأجهزة</p>
                  {syncMsg && <p style={{ color: '#16a34a', fontSize: 12, marginTop: 4 }}>{syncMsg}</p>}
                </div>
                <button className="btn-primary" onClick={handleSync} disabled={syncing}>
                  <RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'جاري المزامنة...' : 'مزامنة'}
                </button>
              </div>
              <div className="settings-data-item">
                <div>
                  <p className="settings-data-title">تصدير البيانات</p>
                  <p className="settings-data-desc">تحميل نسخة احتياطية من جميع بياناتك</p>
                </div>
                <button className="btn-secondary" onClick={handleExport}><Download size={15} /> تصدير</button>
              </div>
              <div className="settings-data-item">
                <div>
                  <p className="settings-data-title">استيراد البيانات</p>
                  <p className="settings-data-desc">استعادة البيانات من نسخة احتياطية</p>
                </div>
                <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={15} /> استيراد
                  <input type="file" accept=".json" hidden onChange={handleImport} />
                </label>
              </div>
              <div className="settings-data-item" style={{ borderTop: '1px solid #fde68a', paddingTop: 12 }}>
                <div>
                  <p className="settings-data-title"><Archive size={13} color="#d97706" /> مسح الأرشيف</p>
                  <p className="settings-data-desc">حذف جميع الطلبيات المؤرشفة نهائياً لتحرير الذاكرة وتسريع البرنامج</p>
                </div>
                <button
                  className="btn-danger"
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                  onClick={() => {
                    if (window.confirm('هل أنت متأكد من حذف جميع الطلبيات المؤرشفة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) {
                      dispatch({ type: 'CLEAR_ARCHIVE' } as any);
                    }
                  }}
                >
                  <Archive size={15} /> مسح الأرشيف
                </button>
              </div>
              <div className="settings-data-item settings-danger-item">
                <div>
                  <p className="settings-data-title"><AlertTriangle size={13} color="#ef4444" /> إعادة ضبط البرنامج</p>
                  <p className="settings-data-desc">حذف جميع البيانات وإعادة البدء من جديد</p>
                </div>
                <button className="btn-danger" onClick={handleReset}><Trash2 size={15} /> إعادة ضبط</button>
              </div>
            </div>
          </div>}

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
