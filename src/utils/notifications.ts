import { AppNotification } from '../types';

/** Reading is monotonic: an older unread copy cannot undo a dismissal. */
export const mergeNotifications = (...lists: AppNotification[][]): AppNotification[] => {
  const byId = new Map<string, AppNotification>();
  lists.forEach((list) => list.forEach((n) => {
    if (!n?.id) return;
    const prev = byId.get(n.id);
    byId.set(n.id, { ...prev, ...n, read: !!(prev?.read || n.read) });
  }));
  return Array.from(byId.values());
};
