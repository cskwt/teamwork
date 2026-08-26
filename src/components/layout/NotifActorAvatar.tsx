import React from 'react';
import { AppNotification, Order, User } from '../../types';
import { getInitials } from '../../utils/helpers';

/** Resolve actor avatar from notification snapshot, live users, or order creator. */
export const resolveNotifActor = (
  n: AppNotification,
  users: User[] = [],
  orders: Order[] = [],
): { name: string; avatar?: string; id?: string } => {
  let live = n.actorId
    ? users.find((u) => u.id === n.actorId && !u.deletedAt)
    : undefined;

  if (!live && n.orderId) {
    const order = orders.find((o) => o.id === n.orderId);
    if (order?.createdBy) {
      live = users.find((u) => u.id === order.createdBy && !u.deletedAt);
    }
  }

  if (!live && n.actorName) {
    const byName = users.find(
      (u) => !u.deletedAt && u.fullName === n.actorName,
    );
    if (byName) live = byName;
  }

  return {
    id: live?.id || n.actorId,
    name: live?.fullName || n.actorName || '',
    avatar: live?.avatar || n.actorAvatar,
  };
};

interface NotifActorAvatarProps {
  notification: AppNotification;
  users?: User[];
  orders?: Order[];
  size?: number;
  className?: string;
  /** Show initials/placeholder even when actor is unknown */
  force?: boolean;
}

const NotifActorAvatar: React.FC<NotifActorAvatarProps> = ({
  notification,
  users = [],
  orders = [],
  size = 36,
  className = '',
  force = false,
}) => {
  const { name, avatar } = resolveNotifActor(notification, users, orders);
  if (!force && !name && !avatar) return null;

  return (
    <div
      className={`notif-actor-avatar ${className}`.trim()}
      title={name || undefined}
      style={{ width: size, height: size, minWidth: size }}
    >
      {avatar ? (
        <img src={avatar} alt={name || ''} />
      ) : (
        <span>{getInitials(name || '?')}</span>
      )}
    </div>
  );
};

export default NotifActorAvatar;
