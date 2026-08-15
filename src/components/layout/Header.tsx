import React from 'react';
import { Plus, BarChart2, LayoutGrid, Settings, Trash2, UserCog, Archive, Users, Building2, Menu } from 'lucide-react';
import { useViewMode } from '../../contexts/ViewModeContext';
import { useLang } from '../../contexts/LanguageContext';

const PAGE_ICONS: Record<string, React.ReactNode> = {
  'لوحة الإنجاز':        <BarChart2 size={20} strokeWidth={1.75} />,
  'الأقسام':             <LayoutGrid size={20} strokeWidth={1.75} />,
  'إدارة الأقسام':       <Building2 size={20} strokeWidth={1.75} />,
  'الارشيف':             <Archive size={20} strokeWidth={1.75} />,
  'الأرشيف':             <Archive size={20} strokeWidth={1.75} />,
  'سلة المهملات':        <Trash2 size={20} strokeWidth={1.75} />,
  'اعضاء الفريق':        <UserCog size={20} strokeWidth={1.75} />,
  'إدارة المستخدمين':    <Users size={20} strokeWidth={1.75} />,
  'الإعدادات':           <Settings size={20} strokeWidth={1.75} />,
};

const PAGE_ICONS_PHONE: Record<string, React.ReactNode> = {
  'لوحة الإنجاز':        <BarChart2 size={22} strokeWidth={1.75} />,
  'الأقسام':             <LayoutGrid size={22} strokeWidth={1.75} />,
  'إدارة الأقسام':       <Building2 size={22} strokeWidth={1.75} />,
  'الارشيف':             <Archive size={22} strokeWidth={1.75} />,
  'الأرشيف':             <Archive size={22} strokeWidth={1.75} />,
  'سلة المهملات':        <Trash2 size={22} strokeWidth={1.75} />,
  'اعضاء الفريق':        <UserCog size={22} strokeWidth={1.75} />,
  'إدارة المستخدمين':    <Users size={22} strokeWidth={1.75} />,
  'الإعدادات':           <Settings size={22} strokeWidth={1.75} />,
};

interface HeaderProps {
  title: string;
  subtitle?: string;
  onAddOrder?: () => void;
  onToggleSidebar?: () => void;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, onAddOrder, onToggleSidebar, icon, actions }) => {
  const { isPhone } = useViewMode();
  const { tr } = useLang();
  const pageIcon = icon ?? (isPhone ? PAGE_ICONS_PHONE : PAGE_ICONS)[title];

  return (
    <header className="main-header">
      <div className="header-left">
        {isPhone && onToggleSidebar && (
          <button
            type="button"
            className="header-menu-btn"
            title={tr.openMenu}
            onClick={onToggleSidebar}
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>
        )}
        <div className="header-title-wrap">
          {pageIcon && <span className="header-page-icon">{pageIcon}</span>}
          <div>
            <h1 className="header-title">{title}</h1>
            {subtitle && <p className="header-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="header-right">
        {actions}
        {onAddOrder && (
          <button className="header-add-btn" onClick={onAddOrder}>
            <Plus size={isPhone ? 20 : 18} strokeWidth={isPhone ? 1.75 : 2} />
            <span>{tr.newOrderFab}</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
