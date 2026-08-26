import React from 'react';
import { AppNotification, User } from '../../types';
import { getInitials } from '../../utils/helpers';

/** Resolve actor avatar from notification snapshot or live user list. */
export const resolveNotifActor = (
  n: AppNotification,
  users: User[] = [],
): { name: string; avatar?: string } => {
  const live = n.actorId ? users.find((u) => u.id === n.actorId && !u.deletedAt) : undefined;
  return {
    name: live?.fullName || n.actorName || '',
    avatar: live?.avatar || n.actorAvatar,
  };
};

interface NotifActorAvatarProps {
  notification: AppNotification;
  users?: User[];
  size?: number;
  className?: string;
}

const NotifActorAvatar: React.FC<NotifActorAvatarProps> = ({
  notification,
  users = [],
  size = 36,
  className = '',
}) => {
  const { name, avatar } = resolveNotifActor(notification, users);
  if (!name && !avatar) return null;

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
