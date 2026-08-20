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

  const map = new Map<string, Order>();
  [...(existingRequests || []), ...fromOrders].forEach((o) => {
    if (!o?.id) return;
    const prev = map.get(o.id);
    if (!prev) {
      map.set(o.id, { ...o, isOrderRequest: true });
      return;
    }
    const newer =
      (o.updatedAt || o.createdAt || '') >= (prev.updatedAt || prev.createdAt || '') ? o : prev;
    map.set(o.id, { ...newer, isOrderRequest: true });
  });

  return { orders: dept, orderRequests: Array.from(map.values()) };
};
