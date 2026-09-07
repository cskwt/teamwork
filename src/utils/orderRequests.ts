import { Order } from '../types';

/** True if this record belongs to Order Request (not department Kanban). */
export const isOrderRequestRecord = (o: Order | null | undefined): boolean => {
  if (!o) return false;
  if (o.isOrderRequest) return true;
  if (o.digitalPrinting || o.largeFormat) return true;
  return (o.tags || []).some((t) =>
    /digital|طباعة رقمية|large\s*format|طباعة كبيرة|الطباعة الكبيرة/i.test(t),
  );
};

/** Requests have no restore action: a deletion must survive stale edits and sync. */
export const mergeOrderRequests = (...lists: Order[][]): Order[] => {
  const map = new Map<string, Order>();
  lists.forEach((list) => list.forEach((order) => {
    if (!order?.id) return;
    const previous = map.get(order.id);
    const newer = !previous ||
      (order.updatedAt || order.createdAt || '') >= (previous.updatedAt || previous.createdAt || '')
      ? order : previous;
    const deletedAt = [previous?.deletedAt, order.deletedAt].filter(Boolean).sort().pop();
    map.set(order.id, { ...newer, isOrderRequest: true, ...(deletedAt ? { deletedAt } : {}) });
  }));
  return Array.from(map.values());
};

/**
 * Split legacy mixed `orders[]` into department orders + order requests.
 * Order Request records are tagged `isOrderRequest: true` and removed from Kanban.
 */
export const splitOrdersAndRequests = (
  orders: Order[] = [],
  existingRequests: Order[] = [],
): { orders: Order[]; orderRequests: Order[] } => {
  const dept: Order[] = [];
  const fromOrders: Order[] = [];
  (orders || []).forEach((o) => {
    if (isOrderRequestRecord(o)) {
      fromOrders.push({ ...o, isOrderRequest: true });
    } else {
      dept.push(o);
    }
  });

  return { orders: dept, orderRequests: mergeOrderRequests(existingRequests || [], fromOrders) };
};
