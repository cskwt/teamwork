import React, { useEffect, useState } from 'react';
import { AppNotification, Order, User } from '../../types';
import { getInitials, pickAvatar } from '../../utils/helpers';

/** Resolve actor avatar from notification snapshot, live users, or (for new orders) creator. */
export const resolveNotifActor = (
  n: AppNotification,
  users: User[] = [],
  orders: Order[] = [],
): { name: string; avatar?: string; id?: string } => {
  let live = n.actorId
    ? users.find((u) => u.id === n.actorId && !u.deletedAt)
    : undefined;

  if (!live && n.actorName) {
    const byName = users.find(
      (u) => !u.deletedAt && u.fullName === n.actorName,
    );
    if (byName) live = byName;
  }

  // Creator is only a reasonable stand-in for brand-new orders, not moves/edits.
  if (!live && n.type === 'new_order' && n.orderId) {
    const order = orders.find((o) => o.id === n.orderId);
    if (order?.createdBy) {
      live = users.find((u) => u.id === order.createdBy && !u.deletedAt);
    }
  }

  return {
    id: live?.id || n.actorId,
    name: live?.fullName || n.actorName || '',
    avatar: pickAvatar(live?.avatar, n.actorAvatar),
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
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatar]);

  if (!force && !name && !avatar) return null;

  const showPhoto = !!avatar && !imgFailed;
  const initials = getInitials(name || '?') || '?';

  return (
    <div
      className={`notif-actor-avatar ${className}`.trim()}
      title={name || undefined}
      aria-label={name || 'مستخدم'}
      data-testid="notif-actor-avatar"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {showPhoto ? (
        <img
          src={avatar}
          alt={name || ''}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};

export default NotifActorAvatar;
