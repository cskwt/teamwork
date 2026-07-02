import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import logo from '../../assets/teamwork-logo-login.png';

const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const success = login(username.trim(), password);
    if (!success) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    setLoading(false);
  };

  return (
    <div className="login-bg">
      <div className="login-overlay" />
      <div className="login-container">
        {/* Logo & Brand */}
        <div className="login-brand">
          <img src={logo} alt="TEAMWORK" className="login-logo-img" />
          <p className="login-subtitle">نظام إدارة فريق العمل والطلبيات</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <h2 className="login-form-title">تسجيل الدخول</h2>

          <div className="form-group">
            <label className="form-label">اسم المستخدم</label>
            <div className="input-wrapper">
              <User className="input-icon" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="form-input"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">كلمة المرور</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="form-input has-toggle"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : 'دخول'}
          </button>

        </form>
      </div>
    </div>
  );
};

export default LoginPage;
