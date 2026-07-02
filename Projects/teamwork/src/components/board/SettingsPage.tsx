import React, { useState, useRef } from 'react';
import { User, Lock, Download, Upload, Trash2, Camera, Save, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import Header from '../layout/Header';
import { clearState } from '../../utils/storage';

const SettingsPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { currentUser } = state;
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
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.users && data.departments && data.orders) {
          dispatch({ type: 'INIT_STATE' as any, payload: { ...data, currentUser: null } });
          alert('تم استيراد البيانات بنجاح. سيتم إعادة تحميل الصفحة.');
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

          {/* Data - Admin only */}
          {currentUser?.role === 'admin' && <div className="settings-card">
            <div className="settings-card-header">
              <Download size={18} />
              <h3>إدارة البيانات</h3>
            </div>
            <div className="settings-form">
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
