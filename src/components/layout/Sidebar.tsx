import React from 'react';
import {
  BarChart2, Settings, LogOut,
  Archive, Trash2, UserCog, LayoutGrid, Monitor
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import logoWhite from '../../assets/teamwork-logo-white.png';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  activeDeptId: string | null;
  onSelectDept: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate }) => {
  const { state, logout } = useApp();
  const { tr } = useLang();
  const { currentUser } = state;

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';

  const navItems = [
    { id: 'dashboard', label: tr.dashboard, icon: <BarChart2 size={18} /> },
    { id: 'projects', label: tr.departments, icon: <LayoutGrid size={18} /> },
    { id: 'operations', label: 'شاشة العمليات', icon: <Monitor size={18} /> },
    { id: 'archive', label: tr.archive, icon: <Archive size={18} /> },
    { id: 'trash', label: tr.trash, icon: <Trash2 size={18} /> },
  ];

  const adminItems = [
    { id: 'users', label: tr.users, icon: <UserCog size={18} /> },
    { id: 'settings', label: tr.settings, icon: <Settings size={18} /> },
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
            {currentUser?.role === 'admin' ? tr.admin : currentUser?.role === 'manager' ? tr.manager : tr.member}
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

        {isManager && (
          <>
            <div className="nav-divider" />
            <button
              className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
              onClick={() => onNavigate('settings')}
            >
              <span>{tr.settings}</span>
              <span className="nav-icon-box"><Settings size={18} /></span>
            </button>
          </>
        )}
      </nav>

      <button className="sidebar-logout" onClick={logout}>
        <span>{tr.logout}</span>
        <span className="nav-icon-box" style={{ background: 'rgba(239,68,68,.12)' }}><LogOut size={16} color="#f87171" /></span>
      </button>
    </aside>
  );
};

export default Sidebar;
