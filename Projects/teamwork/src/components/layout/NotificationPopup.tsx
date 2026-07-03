import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { AppNotification } from '../../types';

const NotificationPopup: React.FC = () => {
  const { state, dispatch } = useApp();
  const { currentUser, notifications } = state;
  const [popup, setPopup] = useState<AppNotification | null>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!currentUser) return;
    const myNotifs = notifications.filter((n) => n.userId === currentUser.id && !n.read);
    const count = myNotifs.length;

    if (count > prevCountRef.current) {
      // عرض آخر إشعار جديد
      const latest = myNotifs[myNotifs.length - 1];
      setPopup(latest);
    }

    prevCountRef.current = count;
  }, [notifications, currentUser]);

  const handleDismiss = () => {
    setPopup(null);
    if (currentUser) dispatch({ type: 'MARK_NOTIFICATIONS_READ', payload: currentUser.id });
  };

  if (!popup) return null;

  const typeIcon: Record<string, string> = {
    new_order: '🆕',
    assigned: '👤',
    chat: '💬',
    updated: '✏️',
  };

  return (
    <div className="notif-popup-overlay">
      <div className="notif-popup">
        <div className="notif-popup-header">
          <Bell size={16} color="#6366f1" />
          <span>إشعار جديد</span>
          <button className="notif-popup-close" onClick={handleDismiss}><X size={14} /></button>
        </div>
        <div className="notif-popup-body">
          <span className="notif-popup-icon">{typeIcon[popup.type] || '🔔'}</span>
          <p className="notif-popup-msg">{popup.message}</p>
        </div>
        {popup.clientName && (
          <p className="notif-popup-client">#{popup.orderNumber} — {popup.clientName}</p>
        )}
        <button className="notif-popup-btn" onClick={handleDismiss}>تم</button>
      </div>
    </div>
  );
};

export default NotificationPopup;
