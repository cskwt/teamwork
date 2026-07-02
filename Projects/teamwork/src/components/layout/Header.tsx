import React from 'react';
import { Plus, BarChart2, LayoutGrid, Settings, Trash2, UserCog, Archive, Users, Building2 } from 'lucide-react';

const PAGE_ICONS: Record<string, React.ReactNode> = {
  'لوحة الإنجاز':        <BarChart2 size={22} />,
  'الأقسام':             <LayoutGrid size={22} />,
  'إدارة الأقسام':       <Building2 size={22} />,
  'الارشيف':             <Archive size={22} />,
  'الأرشيف':             <Archive size={22} />,
  'سلة المهملات':        <Trash2 size={22} />,
  'اعضاء الفريق':        <UserCog size={22} />,
  'إدارة المستخدمين':    <Users size={22} />,
  'الإعدادات':           <Settings size={22} />,
};

interface HeaderProps {
  title: string;
  subtitle?: string;
  onAddOrder?: () => void;
  onToggleSidebar?: () => void;
  icon?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, onAddOrder, icon }) => {
  const pageIcon = icon ?? PAGE_ICONS[title];

  return (
    <header className="main-header">
      <div className="header-left">
        <div className="header-title-wrap">
          {pageIcon && <span className="header-page-icon">{pageIcon}</span>}
          <div>
            <h1 className="header-title">{title}</h1>
            {subtitle && <p className="header-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="header-right">
        {onAddOrder && (
          <button className="header-add-btn" onClick={onAddOrder}>
            <Plus size={18} />
            <span>طلبية جديدة</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
