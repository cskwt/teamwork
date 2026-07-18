import React, { useState, useRef, useEffect } from 'react';
import { Home, Bell, Search, X, MessageSquare, Plus, Pencil, UserCheck, RefreshCw, Languages } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { formatDate, getPriorityConfig, getColumnStatus } from '../../utils/helpers';
import { Order } from '../../types';
import OrderDetailModal from '../modals/OrderDetailModal';

interface TopBarProps {
  onNavigate: (page: string) => void;
}

const TopBar: React.FC<TopBarProps> = ({ onNavigate }) => {
  const { state, dispatch, refreshData } = useApp();
  const { lang, toggleLang, tr } = useLang();
  const priorityConfig = getPriorityConfig(lang);
  const [refreshing, setRefreshing] = useState(false);
  const { orders, departments, currentUser, notifications: allNotifs } = state;
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
        (
          o.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  const notifIcon = (type: string) => {
    if (type === 'new_order') return <Plus size={14} color="#6366f1" />;
    if (type === 'assigned') return <UserCheck size={14} color="#10b981" />;
    if (type === 'chat') return <MessageSquare size={14} color="#f59e0b" />;
    return <Pencil size={14} color="#3b82f6" />;
  };

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
        <button className="topbar-icon-btn" onClick={() => onNavigate('dashboard')} title={tr.home}>
          <Home size={18} />
          <span>{tr.home}</span>
        </button>
        <button
          className="topbar-icon-btn lang-toggle-btn"
          title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
          onClick={toggleLang}
        >
          <Languages size={17} />
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
            size={17}
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
        <div className="notif-wrap" ref={notifRef}>
          <button className="topbar-icon-btn notif-btn" onClick={handleOpenNotif} title={tr.notifications}>
            <Bell size={18} color={unreadCount > 0 ? '#ef4444' : undefined} />
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
                  {[...myNotifs].reverse().map((n) => (
                    <div key={n.id} className={`notif-item ${n.read ? 'notif-read' : 'notif-unread'}`}>
                      <div className="notif-item-icon">{notifIcon(n.type)}</div>
                      <div className="notif-item-body">
                        <p className="notif-item-title">{n.message}</p>
                        <p className="notif-item-date">{formatDate(n.createdAt)}</p>
                      </div>
                    </div>
                  ))}
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
