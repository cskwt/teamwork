import React from 'react';
import {
  Users, BarChart2, Settings, LogOut,
  Archive, Trash2, UserCog, LayoutGrid
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import logoWhite from '../../assets/teamwork-logo-white.png';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  activeDeptId: string | null;
  onSelectDept: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate }) => {
  const { state, logout } = useApp();
  const { currentUser } = state;

  const isAdmin = currentUser?.role === 'admin';

  const navItems = [
    { id: 'dashboard', label: 'لوحة الإنجاز', icon: <BarChart2 size={18} /> },
    { id: 'projects', label: 'الأقسام', icon: <LayoutGrid size={18} /> },
    { id: 'archive', label: 'الارشيف', icon: <Archive size={18} /> },
    { id: 'trash', label: 'سلة المهملات', icon: <Trash2 size={18} /> },
  ];

  const adminItems = [
    { id: 'users', label: 'اعضاء الفريق', icon: <UserCog size={18} /> },
    { id: 'settings', label: 'الاعدادات', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo-wrap">
        <img src={logoWhite} alt="TEAMWORK" className="sidebar-logo-img" />
      </div>

      {/* User Profile */}
      <div className="sidebar-profile">
        <div className="sidebar-avatar">
          {currentUser?.avatar ? (
            <img src={currentUser.avatar} alt={currentUser.fullName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          ) : (
            currentUser?.fullName.charAt(0)
          )}
        </div>
        <div className="sidebar-user-info">
          <span className="sidebar-username">{currentUser?.fullName}</span>
          <span className="sidebar-userrole">
            {currentUser?.role === 'admin' ? 'مدير النظام' : currentUser?.role === 'manager' ? 'مدير قسم' : 'عضو'}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.label}</span>
            <span className="nav-icon-box">{item.icon}</span>
          </button>
        ))}

        {isAdmin && (
          <>
            <div className="nav-divider" />
            {adminItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span>{item.label}</span>
                <span className="nav-icon-box">{item.icon}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      <button className="sidebar-logout" onClick={logout}>
        <span>الخروج</span>
        <span className="nav-icon-box" style={{ background: 'rgba(239,68,68,.12)' }}><LogOut size={16} color="#f87171" /></span>
      </button>
    </aside>
  );
};

export default Sidebar;
