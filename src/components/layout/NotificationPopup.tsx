import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { AppNotification } from '../../types';

const typeIcon: Record<string, string> = {
  new_order: '🆕',
  assigned: '👤',
  chat: '💬',
  updated: '✏️',
};

interface NotificationPopupProps {
  onOpenOrder?: (departmentId?: string) => void;
}

const NotificationPopup: React.FC<NotificationPopupProps> = ({ onOpenOrder }) => {
  const { state, dispatch } = useApp();
  const { currentUser, notifications, orders, orderRequests } = state;
  const [popups, setPopups] = useState<AppNotification[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const resolveDeptId = (n: AppNotification): string | undefined => {
    if (n.departmentId) return n.departmentId;
    const order =
      orders.find((o) => o.id === n.orderId) ||
      (orderRequests || []).find((o) => o.id === n.orderId);
    return order?.departmentId;
  };

  useEffect(() => {
    if (!currentUser) return;
    const myUnread = notifications.filter((n) => n.userId === currentUser.id && !n.read);

    // On first run: record all existing unread IDs as "already known" — don't show them
    if (!initializedRef.current) {
      myUnread.forEach((n) => knownIdsRef.current.add(n.id));
      initializedRef.current = true;
      return;
    }

    // Show only notifications that arrived after initialization
    const newOnes = myUnread.filter((n) => !knownIdsRef.current.has(n.id));
    if (newOnes.length > 0) {
      newOnes.forEach((n) => knownIdsRef.current.add(n.id));
      setPopups(newOnes);
    }
  }, [notifications, currentUser]);

  const handleDismiss = () => {
    setPopups([]);
    if (currentUser) dispatch({ type: 'MARK_NOTIFICATIONS_READ', payload: currentUser.id });
  };

  const handleOpen = (n: AppNotification) => {
    onOpenOrder?.(resolveDeptId(n));
    handleDismiss();
  };

  if (popups.length === 0) return null;

  const single = popups.length === 1 ? popups[0] : null;

  return (
    <div className="notif-popup-overlay">
    <div className="notif-popup">
        <div className="notif-popup-header">
          <Bell size={16} color="#6366f1" />
          <span>{single ? 'إشعار جديد' : `${popups.length} إشعارات جديدة`}</span>
          <button className="notif-popup-close" onClick={handleDismiss}><X size={14} /></button>
        </div>

        {single ? (
          <>
            {single.clientName && (
              <p className="notif-popup-client">#{single.orderNumber} — {single.clientName}</p>
            )}
            <div className="notif-popup-body">
              <span className="notif-popup-icon">{typeIcon[single.type] || '🔔'}</span>
              <p className="notif-popup-msg">{single.message}</p>
            </div>
            {single.commentText && (
              <div className="notif-popup-comment">
                <p className="notif-popup-comment-text">"{single.commentText}"</p>
              </div>
            )}
          </>
        ) : (
          <div className="notif-popup-table-wrap">
            <table className="notif-popup-table">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>الطلبية</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {popups.map((n) => (
                  <tr
                    key={n.id}
                    className="notif-popup-row-clickable"
                    onClick={() => handleOpen(n)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="notif-popup-table-icon">{typeIcon[n.type] || '🔔'}</td>
                    <td className="notif-popup-table-order">
                      {n.orderNumber ? `#${n.orderNumber}` : '—'}
                      {n.clientName && <span className="notif-popup-table-client">{n.clientName}</span>}
                    </td>
                    <td className="notif-popup-table-msg">
                      {n.message}
                      {n.commentText && (
                        <span className="notif-popup-table-comment">"{n.commentText}"</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {single && (
            <button className="notif-popup-btn" onClick={() => handleOpen(single)} style={{ flex: 1 }}>
              فتح القسم
            </button>
          )}
          <button className="notif-popup-btn" onClick={handleDismiss} style={{ flex: 1, opacity: single ? 0.85 : 1 }}>
            تم
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;
