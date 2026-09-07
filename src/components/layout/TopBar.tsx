import { getSyncStatus, subscribeSyncStatus } from '../../utils/storage';
import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { Home, Bell, Search, X, RefreshCw, Languages, Smartphone, Monitor, Menu } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { useViewMode } from '../../contexts/ViewModeContext';
import { formatDate, getPriorityConfig, getColumnStatus } from '../../utils/helpers';
import { Order } from '../../types';
import OrderDetailModal from '../modals/OrderDetailModal';
import NotifActorAvatar, { resolveNotifActor } from './NotifActorAvatar';

interface TopBarProps {
  onNavigate: (page: string) => void;
  onOpenOrder?: (departmentId?: string, orderId?: string) => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ onNavigate, onOpenOrder, onToggleSidebar }) => {
  const { state, dispatch, refreshData } = useApp();
  const { lang, toggleLang, tr } = useLang();
  const { isPhone, toggleViewMode } = useViewMode();
  const priorityConfig = getPriorityConfig(lang);
  const syncStatus = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const [refreshing, setRefreshing] = useState(false);
  const { orders, orderRequests, departments, currentUser, notifications: allNotifs, users } = state;
  const [showNotif, setShowNotif] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const myNotifs = allNotifs.filter((n) => n.userId === currentUser?.id);
  const unreadCount = myNotifs.filter((n) => !n.read).length;

  const searchResults = searchQuery.trim().length >= 1
    ? orders.filter((o) =>
        !o.deletedAt &&
        !o.archivedAt &&
        !o.purgedAt &&
        !o.isOrderRequest &&
        !o.digitalPrinting &&
        !o.largeFormat &&
        (
          o.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  const handleOpenNotif = () => {
    setShowNotif((v) => !v);
    if (!showNotif && currentUser) {
      dispatch({ type: 'MARK_NOTIFICATIONS_READ', payload: currentUser.id } as any);
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <>
    <header className="topbar-global">
      <div className="topbar-right">
        {isPhone && (
          <button
            className="topbar-icon-btn topbar-menu-btn"
            title={tr.openMenu}
            onClick={onToggleSidebar}
            type="button"
          >
            <Menu size={22} strokeWidth={1.75} />
            <span>{tr.openMenu}</span>
          </button>
        )}
        <button className="topbar-icon-btn" onClick={() => onNavigate('dashboard')} title={tr.home}>
          <Home size={isPhone ? 22 : 18} strokeWidth={isPhone ? 1.75 : 2} />
          <span>{tr.home}</span>
        </button>
        <button
          className="topbar-icon-btn lang-toggle-btn"
          title={isPhone ? tr.desktopView : tr.phoneView}
          onClick={toggleViewMode}
          type="button"
        >
          {isPhone ? <Monitor size={22} strokeWidth={1.75} /> : <Smartphone size={17} />}
          <span>{isPhone ? tr.desktopView : tr.phoneView}</span>
        </button>
        <button
          className="topbar-icon-btn lang-toggle-btn"
          title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
          onClick={toggleLang}
        >
          <Languages size={isPhone ? 22 : 17} strokeWidth={isPhone ? 1.75 : 2} />
          <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
        </button>
        <button
          className="topbar-icon-btn"
          title="مزامنة فورية من السيرفر"
          onClick={async () => {
            if (refreshing) return;
            setRefreshing(true);
            await refreshData();
            setRefreshing(false);
          }}
          style={{
            opacity: refreshing ? 0.6 : 1,
            position: 'relative',
          }}
        >
          <RefreshCw
            size={isPhone ? 22 : 17}
            strokeWidth={isPhone ? 1.75 : 2}
            style={{
              transition: 'transform 0.8s ease',
              transform: refreshing ? 'rotate(720deg)' : 'none',
            }}
          />
          {refreshing && (
            <span style={{
              position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
              fontSize: 10, color: '#6366f1', whiteSpace: 'nowrap', fontWeight: 600,
            }}>
              جاري...
            </span>
          )}
        </button>
        {syncStatus !== 'idle' && (
          <span role="status" style={{ fontSize: 11, color: syncStatus === 'pending' ? '#b45309' : '#64748b', maxWidth: 150 }}>
            {syncStatus === 'pending'
              ? (lang === 'ar' ? 'لم تكتمل المزامنة — جارٍ إعادة المحاولة' : 'Sync pending — retrying')
              : syncStatus === 'saving'
                ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
                : (lang === 'ar' ? 'تم الحفظ' : 'Saved')}
          </span>
        )}
        <div className="notif-wrap" ref={notifRef}>
          <button className="topbar-icon-btn notif-btn" onClick={handleOpenNotif} title={tr.notifications}>
            <Bell size={isPhone ? 22 : 18} strokeWidth={isPhone ? 1.75 : 2} color={unreadCount > 0 ? '#ef4444' : undefined} />
            {unreadCount > 0 && <span className="notif-dot">{unreadCount}</span>}
          </button>

          {showNotif && (
            <div className="notif-panel">
              <div className="notif-panel-header">
                <Bell size={15} />
                <span>{tr.notifications}</span>
                {myNotifs.length > 0 && <span className="notif-count-badge">{myNotifs.length}</span>}
              </div>

              {myNotifs.length === 0 ? (
                <div className="notif-empty">
                  <Bell size={32} color="#d1d5db" />
                  <p>{tr.noNotifications}</p>
                </div>
              ) : (
                <div className="notif-list">
                  {[...myNotifs].reverse().map((n) => {
                    const actor = resolveNotifActor(n, users, orders);
                    return (
                    <div
                      key={n.id}
                      className={`notif-item ${n.read ? 'notif-read' : 'notif-unread'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        const deptId =
                          n.departmentId ||
                          orders.find((o) => o.id === n.orderId)?.departmentId ||
                          (orderRequests || []).find((o) => o.id === n.orderId)?.departmentId;
                        onOpenOrder?.(deptId, n.orderId);
                        setShowNotif(false);
                        if (currentUser) dispatch({ type: 'MARK_NOTIFICATIONS_READ', payload: currentUser.id });
                      }}
                    >
                      <div className="notif-item-avatar">
                        <NotifActorAvatar
                          notification={n}
                          users={users}
                          orders={orders}
                          size={36}
                          force
                        />
                      </div>
                      <div className="notif-item-body">
                        {actor.name && <p className="notif-item-sub">{actor.name}</p>}
                        <p className="notif-item-title">{n.message}</p>
                        {n.commentText && <p className="notif-item-comment">«{n.commentText}»</p>}
                        <p className="notif-item-date">{formatDate(n.createdAt)}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-left">
        <div className="topbar-search-wrap" ref={searchRef}>
          <div className="topbar-search">
            <Search size={15} />
            <input
              type="text"
              placeholder={tr.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => { setSearchQuery(''); setShowSearch(false); }}>
                <X size={13} />
              </button>
            )}
          </div>
          {showSearch && searchQuery.trim() && (
            <div className="search-results-panel">
              {searchResults.length === 0 ? (
                <div className="search-no-results">{tr.noResults} "{searchQuery}"</div>
              ) : (
                <>
                  <div className="search-results-header">
                    {searchResults.length} {tr.results}
                  </div>
                  <div className="search-results-list">
                {searchResults.map((o) => {
                  const dept = departments.find((d) => d.id === o.departmentId);
                  const pr = priorityConfig[o.priority] || priorityConfig['medium'];
                  const st = getColumnStatus(o, departments);
                  return (
                    <div key={o.id} className="search-result-item" onClick={() => { setSelectedOrder(o); setSearchQuery(''); setShowSearch(false); }}>
                      <div className="search-result-main">
                        <span className="search-result-num">#{o.orderNumber}</span>
                        <span className="search-result-name">{o.clientName}</span>
                      </div>
                      <div className="search-result-meta">
                        {dept && <span className="dept-chip" style={{ background: dept.color + '22', color: dept.color, fontSize: 10 }}>{dept.name}</span>}
                        <span className="badge" style={{ background: pr.bg, color: pr.color, fontSize: 10 }}>{pr.label}</span>
                        <span className="badge" style={{ background: st.bg, color: st.color, fontSize: 10 }}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>

    {selectedOrder && departments.find((d) => d.id === selectedOrder.departmentId) && (
      <OrderDetailModal
        order={selectedOrder}
        department={departments.find((d) => d.id === selectedOrder.departmentId)!}
        onClose={() => setSelectedOrder(null)}
      />
    )}
    </>
  );
};

export default TopBar;
