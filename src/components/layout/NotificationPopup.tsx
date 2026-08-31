import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { AppNotification } from '../../types';
import NotifActorAvatar, { resolveNotifActor } from './NotifActorAvatar';

interface NotificationPopupProps {
  onOpenOrder?: (departmentId?: string) => void;
}

const NotificationPopup: React.FC<NotificationPopupProps> = ({ onOpenOrder }) => {
  const { state, dispatch } = useApp();
  const { currentUser, notifications, orders, orderRequests, users } = state;
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
  const singleActor = single ? resolveNotifActor(single, users, orders) : null;

  return (
    <div className="notif-popup-overlay">
    <div className={`notif-popup${popups.length > 1 ? ' notif-popup--wide' : ''}`}>
        <div className="notif-popup-header">
          <Bell size={16} color="#6366f1" />
          <span>{single ? 'إشعار جديد' : `${popups.length} إشعارات جديدة`}</span>
          <button className="notif-popup-close" onClick={handleDismiss}><X size={14} /></button>
        </div>

        {single ? (
          <>
            <div className="notif-popup-main">
              <NotifActorAvatar
                notification={single}
                users={users}
                orders={orders}
                size={56}
                force
              />
              <div className="notif-popup-copy">
                {single.clientName && (
                  <p className="notif-popup-client">#{single.orderNumber} — {single.clientName}</p>
                )}
                {singleActor?.name && (
                  <p className="notif-popup-actor-name">{singleActor.name}</p>
                )}
                <p className="notif-popup-msg">{single.message}</p>
              </div>
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
                  <th>المستخدم</th>
                  <th>الطلبية</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {popups.map((n) => {
                  const actor = resolveNotifActor(n, users, orders);
                  return (
                    <tr
                      key={n.id}
                      className="notif-popup-row-clickable"
                      onClick={() => handleOpen(n)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="notif-popup-table-actor">
                        <NotifActorAvatar
                          notification={n}
                          users={users}
                          orders={orders}
                          size={36}
                          force
                        />
                      </td>
                      <td className="notif-popup-table-order">
                        {n.orderNumber ? `#${n.orderNumber}` : '—'}
                        {n.clientName && <span className="notif-popup-table-client">{n.clientName}</span>}
                      </td>
                      <td className="notif-popup-table-msg">
                        {actor.name && (
                          <span className="notif-popup-table-client" style={{ marginBottom: 2 }}>{actor.name}</span>
                        )}
                        {n.message}
                        {n.commentText && (
                          <span className="notif-popup-table-comment">"{n.commentText}"</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
