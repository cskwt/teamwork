import React, { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import localforage from 'localforage';
import { AppState, User, Department, Order, OrderComment, OrderHistoryEntry, KanbanColumn, AppNotification, OpsRow, Material, OrderCostRow } from '../types';
import { loadLocalState, loadLocalUsers, saveState, saveSession, loadSession, touchSession, clearSession, serverLoad, repairServerIfCorrupt, mergeOpsRows, resolveOpsRowsForSave, mergeUsers, mergeOrders, toOrderTombstone } from '../utils/storage';
import { ensureAttachmentUrl } from '../utils/files';
import { generateId, userBelongsToOrderDepartment, userDepartmentIds } from '../utils/helpers';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS, INITIAL_MATERIALS } from '../data/initialData';
import { splitOrdersAndRequests } from '../utils/orderRequests';

const DEFAULT_STATE: AppState = {
  users: INITIAL_USERS,
  departments: INITIAL_DEPARTMENTS,
  orders: INITIAL_ORDERS,
  orderRequests: [],
  materials: INITIAL_MATERIALS,
  orderCostRows: [],
  orderCostsUpdatedAt: undefined,
  currentUser: null,
  notifications: [],
  opsRows: [],
  opsUpdatedAt: undefined,
};

/** Normalize legacy department column titles (e.g. delivery dept) after load/sync */
const migrateDepts = (depts: Department[]) =>
  (depts || []).map((d) => {
    if (d.name === 'قسم التسليم') {
      const hasDefault = (d.columns || []).some((c) => c.id === 'new' && c.title === 'جديد');
      return {
        ...d,
        color: '#8b5cf6',
        columns: hasDefault
          ? [
              { id: 'new', title: 'الطلبيات الجاهزة', color: '#6366f1', order: 0 },
              { id: 'in_progress', title: 'للتوصيل', color: '#f59e0b', order: 1 },
              { id: 'review', title: 'قيد التسليم', color: '#8b5cf6', order: 2 },
              { id: 'done', title: 'للاستلام', color: '#10b981', order: 3 },
            ]
          : d.columns || [],
      };
    }
    return d;
  });

const makeNotif = (
  type: AppNotification['type'],
  userId: string,
  order: Order,
  message: string,
  actor?: User | null,
): AppNotification => ({
  id: generateId(),
  type,
  userId,
  orderId: order.id,
  orderNumber: order.orderNumber || '',
  clientName: order.clientName,
  departmentId: order.departmentId,
  actorId: actor?.id,
  actorName: actor?.fullName,
  // Keep profile photos on notifications when reasonably sized so other devices
  // can show them even if the live users list stripped a huge data: URL.
  actorAvatar:
    actor?.avatar && (!actor.avatar.startsWith('data:') || actor.avatar.length < 120000)
      ? actor.avatar
      : undefined,
  message,
  createdAt: new Date().toISOString(),
  read: false,
});

const resolveActor = (state: AppState, actorId?: string | null): User | null => {
  if (!actorId) return null;
  const fromList = state.users.find((u) => u.id === actorId && !u.deletedAt);
  if (fromList) return fromList;
  // currentUser may not be in users[] yet after login — still attach their profile
  if (state.currentUser?.id === actorId && !state.currentUser.deletedAt) {
    return state.currentUser;
  }
  return null;
};

/** Prefer unread when the same notification id appears on both sides. */
const mergeNotificationsById = (
  a: AppNotification[] = [],
  b: AppNotification[] = [],
): AppNotification[] => {
  const map = new Map<string, AppNotification>();
  [...a, ...b].forEach((n) => {
    if (!n?.id) return;
    const prev = map.get(n.id);
    if (!prev) {
      map.set(n.id, n);
      return;
    }
    // Keep unread if either side has unread; otherwise keep newer
    if (!prev.read && n.read) map.set(n.id, prev);
    else if (prev.read && !n.read) map.set(n.id, n);
    else if ((n.createdAt || '') >= (prev.createdAt || '')) map.set(n.id, n);
  });
  return Array.from(map.values());
};

const pruneOrphanNotifications = (
  notifications: AppNotification[],
  orders: Order[],
  orderRequests: Order[],
): AppNotification[] => {
  const liveIds = new Set<string>([
    ...orders.map((o) => o.id),
    ...orderRequests.map((o) => o.id),
  ]);
  return notifications.filter((n) => !n.orderId || liveIds.has(n.orderId));
};

type Action =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_ORDER'; payload: Order; triggerUserId?: string }
  | { type: 'UPDATE_ORDER'; payload: Order; triggerUserId?: string; prevAssignedUsers?: string[]; silent?: boolean }
  | { type: 'SET_ORDERS_SORT'; payload: { id: string; sortOrder: number; sortOrderAt: string }[] }
  | { type: 'DELETE_ORDER'; payload: string }
  | { type: 'ADD_ORDER_REQUEST'; payload: Order }
  | { type: 'UPDATE_ORDER_REQUEST'; payload: Order }
  | { type: 'DELETE_ORDER_REQUEST'; payload: string }
  | { type: 'MOVE_ORDER'; payload: { orderId: string; status: string; departmentId?: string; triggerUserId?: string } }
  | { type: 'ACKNOWLEDGE_NEW_ORDER'; payload: { orderId: string; userId: string } }
  | { type: 'ADD_COMMENT'; payload: { orderId: string; comment: OrderComment }; triggerUserId?: string }
  | { type: 'ADD_DEPARTMENT'; payload: Department }
  | { type: 'UPDATE_DEPARTMENT'; payload: Department }
  | { type: 'DELETE_DEPARTMENT'; payload: string }
  | { type: 'ADD_MATERIAL'; payload: Material }
  | { type: 'UPDATE_MATERIAL'; payload: Material }
  | { type: 'DELETE_MATERIAL'; payload: string }
  | { type: 'SET_ORDER_COST_ROWS'; payload: OrderCostRow[] }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'DELETE_USER'; payload: string }
  | { type: 'ADD_HISTORY'; payload: { orderId: string; entry: OrderHistoryEntry } }
  | { type: 'UPDATE_COLUMN'; payload: { departmentId: string; column: KanbanColumn } }
  | { type: 'ADD_COLUMN'; payload: { departmentId: string; column: KanbanColumn } }
  | { type: 'DELETE_COLUMN'; payload: { departmentId: string; columnId: string } }
  | { type: 'RESTORE_ORDER'; payload: string }
  | { type: 'PERMANENT_DELETE'; payload: string }
  | { type: 'ARCHIVE_ORDER'; payload: string }   // orderId
  | { type: 'CLEAR_ARCHIVE' }
  | { type: 'PURGE_OLD_TRASH' }
  | { type: 'MARK_NOTIFICATIONS_READ'; payload: string }  // userId
  | { type: 'SET_OPS_ROWS'; payload: OpsRow[]; opsUpdatedAt?: string }
  | { type: 'INIT_STATE'; payload: AppState }
  | { type: 'SYNC_STATE'; payload: AppState };

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'INIT_STATE': {
      const ops = resolveOpsRowsForSave(
        action.payload.opsRows || [],
        state.opsRows || [],
        action.payload.opsUpdatedAt,
        state.opsUpdatedAt,
      );
      const split = splitOrdersAndRequests(
        action.payload.orders || [],
        action.payload.orderRequests || [],
      );
      return {
        ...action.payload,
        orders: split.orders,
        orderRequests: split.orderRequests,
        currentUser: null,
        notifications: action.payload.notifications || [],
        opsRows: ops.opsRows,
        opsUpdatedAt: ops.opsUpdatedAt,
      };
    }
    case 'SYNC_STATE': {
      // Server is the source of truth for department / delete / archive.
      // locationAt (not updatedAt) decides where an order lives, so opening a
      // card on a stale device cannot resurrect a transferred or deleted order.
      const serverOrders = action.payload.orders || [];
      const localOrders  = state.orders;
      const serverSplit = splitOrdersAndRequests(serverOrders, action.payload.orderRequests || []);
      const localSplit = splitOrdersAndRequests(localOrders, state.orderRequests || []);
      const localMap     = new Map(localSplit.orders.map((o: Order) => [o.id, o]));

      // Union file lists + enrich urls/dataUrls, but honor deletedAttachmentIds tombstones
      // so deletes stay deleted and new uploads are not wiped by a slightly-newer server order.
      const restoreDataUrls = (merged: Order, loc: Order, srv: Order): Order => {
        const mergeFile = (...parts: any[]) => {
          const present = parts.filter(Boolean);
          if (!present.length) return undefined;
          const base = { ...present[0] };
          base.dataUrl = present.map((p) => p.dataUrl).find(Boolean);
          base.url = present.map((p) => p.url).find(Boolean);
          return base;
        };
        const deletedIds = new Set<string>([
          ...(merged.deletedAttachmentIds || []),
          ...(loc.deletedAttachmentIds || []),
          ...(srv.deletedAttachmentIds || []),
        ]);
        const unionList = (...lists: (any[] | undefined)[]) => {
          const byId = new Map<string, any>();
          lists.flat().forEach((f) => {
            if (!f?.id || deletedIds.has(f.id)) return;
            byId.set(f.id, mergeFile(byId.get(f.id), f));
          });
          return Array.from(byId.values());
        };
        // Legacy single invoice: keep if present on winner/loc/srv and not tombstoned
        const legacyInvoice = (() => {
          const inv = mergeFile(merged.invoice, loc.invoice, srv.invoice);
          if (!inv) return undefined;
          if (inv.id && deletedIds.has(inv.id)) return undefined;
          // Winner cleared legacy invoice without an id tombstone — respect clear
          if (!merged.invoice && (merged.updatedAt || '') >= (loc.updatedAt || '') && (merged.updatedAt || '') >= (srv.updatedAt || '')) {
            return undefined;
          }
          return inv;
        })();
        return {
          ...merged,
          deletedAttachmentIds: Array.from(deletedIds),
          invoice: legacyInvoice,
          invoices: unionList(merged.invoices, loc.invoices, srv.invoices),
          orderForms: unionList(merged.orderForms, loc.orderForms, srv.orderForms),
        };
      };

      const mergedOrders: Order[] = mergeOrders(serverSplit.orders, localSplit.orders).map((merged) => {
        if (merged.purgedAt) return merged;
        const loc = localMap.get(merged.id);
        const srv = serverSplit.orders.find((o) => o.id === merged.id);
        if (!loc) return merged;
        return restoreDataUrls(merged, loc, srv || merged);
      });

      // Merge Order Request list separately (never mixed into Kanban orders)
      const reqMap = new Map<string, Order>();
      const mergeReq = (o: Order) => {
        if (!o?.id) return;
        const tagged = { ...o, isOrderRequest: true as const };
        const prev = reqMap.get(o.id);
        if (!prev) {
          reqMap.set(o.id, tagged);
          return;
        }
        const newer =
          (tagged.updatedAt || tagged.createdAt || '') >= (prev.updatedAt || prev.createdAt || '')
            ? tagged
            : prev;
        // Prefer non-deleted when timestamps tie awkwardly
        if (prev.deletedAt && !tagged.deletedAt) reqMap.set(o.id, tagged);
        else if (!prev.deletedAt && tagged.deletedAt) reqMap.set(o.id, prev);
        else reqMap.set(o.id, newer);
      };
      serverSplit.orderRequests.forEach(mergeReq);
      localSplit.orderRequests.forEach(mergeReq);
      const mergedOrderRequests = Array.from(reqMap.values());

      // Merge departments: server is primary; local wins only if explicitly newer
      const serverDepts: Department[] = action.payload.departments || [];
      const localDepts  = state.departments;
      const srvDeptMap  = new Map(serverDepts.map((d: Department) => [d.id, d]));
      const locDeptMap  = new Map(localDepts.map((d: Department) => [d.id, d]));
      // Build from server departments first, then add local-only ones
      const mergedDepts: Department[] = serverDepts.map((srv: Department) => {
        const loc = locDeptMap.get(srv.id);
        if (!loc) return srv;
        return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
      });
      localDepts.forEach((loc: Department) => {
        if (!srvDeptMap.has(loc.id)) mergedDepts.push(loc);
      });

      // Merge materials catalog (same pattern as departments)
      const serverMats: Material[] = action.payload.materials || [];
      const localMats = state.materials || [];
      const srvMatMap = new Map(serverMats.map((m) => [m.id, m]));
      const locMatMap = new Map(localMats.map((m) => [m.id, m]));
      const mergedMats: Material[] = serverMats.map((srv) => {
        const loc = locMatMap.get(srv.id);
        if (!loc) return srv;
        return (srv.updatedAt || srv.createdAt || '') >= (loc.updatedAt || loc.createdAt || '') ? srv : loc;
      });
      localMats.forEach((loc) => {
        if (!srvMatMap.has(loc.id)) mergedMats.push(loc);
      });

      // Merge order cost rows — list membership follows the newer orderCostsUpdatedAt
      // so deletes are not resurrected by a stale server union.
      const serverCosts: OrderCostRow[] = action.payload.orderCostRows || [];
      const localCosts = state.orderCostRows || [];
      const srvCostMap = new Map(serverCosts.map((r) => [r.id, r]));
      const locCostMap = new Map(localCosts.map((r) => [r.id, r]));
      const serverCostsAt = action.payload.orderCostsUpdatedAt || '';
      const localCostsAt = state.orderCostsUpdatedAt || '';
      const maxStamp = (rows: OrderCostRow[]) =>
        rows.reduce((m, r) => ((r.updatedAt || '') > m ? (r.updatedAt || '') : m), '');
      const serverCostMax = serverCostsAt || maxStamp(serverCosts);
      const localCostMax = localCostsAt || maxStamp(localCosts);

      let mergedCosts: OrderCostRow[];
      let mergedCostsAt = localCostsAt || serverCostsAt || undefined;
      // Sheet membership follows newer orderCostsUpdatedAt (local wins ties)
      // so deletes are never resurrected by a stale server union.
      if ((localCostMax || '') >= (serverCostMax || '')) {
        mergedCosts = localCosts.map((loc) => {
          const srv = srvCostMap.get(loc.id);
          if (!srv) return loc;
          return (loc.updatedAt || '') >= (srv.updatedAt || '') ? loc : srv;
        });
        mergedCostsAt = localCostsAt || localCostMax || mergedCostsAt;
      } else {
        mergedCosts = serverCosts.map((srv) => {
          const loc = locCostMap.get(srv.id);
          if (!loc) return srv;
          return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
        });
        mergedCostsAt = serverCostsAt || serverCostMax || mergedCostsAt;
      }

      const mergedUsers = mergeUsers(action.payload.users || [], state.users || []);
      const refreshedUser = state.currentUser
        ? (mergedUsers.find((u) => u.id === state.currentUser!.id && !u.deletedAt) || state.currentUser)
        : null;

      return {
        ...state,
        users: mergedUsers,
        currentUser: refreshedUser,
        departments: mergedDepts,
        materials: mergedMats,
        orderCostRows: mergedCosts,
        orderCostsUpdatedAt: mergedCostsAt,
        orders: mergedOrders,
        orderRequests: mergedOrderRequests,
        ...(() => {
          const ops = resolveOpsRowsForSave(
            action.payload.opsRows || [],
            state.opsRows || [],
            action.payload.opsUpdatedAt,
            state.opsUpdatedAt,
          );
          // On sync, prefer whichever side has the newer opsUpdatedAt (or richer content)
          const serverAt = action.payload.opsUpdatedAt || '';
          const localAt = state.opsUpdatedAt || '';
          if (localAt && localAt > serverAt) {
            return { opsRows: mergeOpsRows(state.opsRows || [], action.payload.opsRows || []), opsUpdatedAt: localAt };
          }
          if (serverAt && serverAt >= localAt) {
            return {
              opsRows: mergeOpsRows(action.payload.opsRows || [], state.opsRows || []),
              opsUpdatedAt: serverAt,
            };
          }
          return { opsRows: ops.opsRows, opsUpdatedAt: ops.opsUpdatedAt };
        })(),
        notifications: pruneOrphanNotifications(
          mergeNotificationsById(state.notifications, action.payload.notifications || []),
          mergedOrders,
          mergedOrderRequests,
        ),
      };
    }
    case 'LOGIN':
      return { ...state, currentUser: action.payload };
    case 'LOGOUT':
      return { ...state, currentUser: null };
    case 'MARK_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.userId === action.payload ? { ...n, read: true } : n
        ),
      };
    case 'ADD_ORDER': {
      // Guard: Order Request forms must never land in department Kanban
      if (action.payload.isOrderRequest || action.payload.digitalPrinting || action.payload.largeFormat) {
        const req = { ...action.payload, isOrderRequest: true };
        return { ...state, orderRequests: [...(state.orderRequests || []), req] };
      }
      const order = {
        ...action.payload,
        isNew: action.payload.isNew !== false,
        isOrderRequest: false,
        locationAt: action.payload.locationAt || action.payload.updatedAt || action.payload.createdAt,
        departmentIds: action.payload.departmentId
          ? [action.payload.departmentId]
          : action.payload.departmentIds,
      };
      const actorId = action.triggerUserId || order.createdBy;
      const actor =
        resolveActor(state, actorId) ||
        (actorId
          ? ({
              id: actorId,
              fullName:
                state.currentUser?.id === actorId
                  ? state.currentUser.fullName
                  : state.users.find((u) => u.id === actorId)?.fullName || 'مستخدم',
              avatar:
                state.currentUser?.id === actorId ? state.currentUser.avatar : undefined,
              username: '',
              password: '',
              role: 'member' as const,
              createdAt: new Date().toISOString(),
            } satisfies User)
          : null);
      const newNotifs: AppNotification[] = state.users
        .filter((u) => !u.deletedAt && u.id !== action.triggerUserId && (
          userBelongsToOrderDepartment(u, order) ||
          order.assignedUsers?.includes(u.id)
        ))
        .map((u) => makeNotif('new_order', u.id, order, `طلبية جديدة: ${order.clientName} — رقم ${order.orderNumber}`, actor));
      return { ...state, orders: [...state.orders, order], notifications: [...state.notifications, ...newNotifs] };
    }
    case 'ADD_ORDER_REQUEST': {
      const req = { ...action.payload, isOrderRequest: true };
      return { ...state, orderRequests: [...(state.orderRequests || []), req] };
    }
    case 'UPDATE_ORDER_REQUEST': {
      const updated = { ...action.payload, isOrderRequest: true };
      return {
        ...state,
        orderRequests: (state.orderRequests || []).map((o) => (o.id === updated.id ? updated : o)),
      };
    }
    case 'DELETE_ORDER_REQUEST': {
      const now = new Date().toISOString();
      return {
        ...state,
        orderRequests: (state.orderRequests || []).map((o) =>
          o.id === action.payload ? { ...o, deletedAt: now, updatedAt: now } : o,
        ),
      };
    }
    case 'UPDATE_ORDER': {
      const updated = action.payload;
      if (updated.isOrderRequest || updated.digitalPrinting || updated.largeFormat) {
        const req = { ...updated, isOrderRequest: true };
        const exists = (state.orderRequests || []).some((o) => o.id === req.id);
        return {
          ...state,
          orders: state.orders.filter((o) => o.id !== req.id),
          orderRequests: exists
            ? (state.orderRequests || []).map((o) => (o.id === req.id ? req : o))
            : [...(state.orderRequests || []), req],
        };
      }
      if (action.silent) {
        const prev = state.orders.find((o) => o.id === updated.id);
        const locChanged = !!(prev && (
          prev.departmentId !== updated.departmentId ||
          prev.status !== updated.status ||
          !!prev.deletedAt !== !!updated.deletedAt ||
          !!prev.archivedAt !== !!updated.archivedAt
        ));
        const now = new Date().toISOString();
        const next = {
          ...updated,
          departmentIds: updated.departmentId
            ? [updated.departmentId]
            : updated.departmentIds,
          ...(locChanged ? { locationAt: updated.locationAt || now } : {}),
        };
        return { ...state, orders: state.orders.map((o) => (o.id === next.id ? next : o)) };
      }
      const newlyAssigned = (updated.assignedUsers || []).filter(
        (uid) => !(action.prevAssignedUsers || []).includes(uid) && uid !== action.triggerUserId
      );
      const actor = resolveActor(state, action.triggerUserId);
      const notifReceivers = new Set<string>([
        ...state.users
          .filter((u) => !u.deletedAt && userBelongsToOrderDepartment(u, updated) && u.id !== action.triggerUserId)
          .map((u) => u.id),
        ...(updated.assignedUsers || []).filter((uid) => uid !== action.triggerUserId),
      ]);
      const updateNotifs: AppNotification[] = Array.from(notifReceivers).map((uid) => {
        if (newlyAssigned.includes(uid))
          return makeNotif('assigned', uid, updated, `تم تعيينك في طلبية: ${updated.clientName} — رقم ${updated.orderNumber}`, actor);
        return makeNotif('updated', uid, updated, `تم تعديل طلبية: ${updated.clientName} — رقم ${updated.orderNumber}`, actor);
      });
      const prev = state.orders.find((o) => o.id === updated.id);
      const locChanged = !!(prev && (
        prev.departmentId !== updated.departmentId ||
        prev.status !== updated.status ||
        !!prev.deletedAt !== !!updated.deletedAt ||
        !!prev.archivedAt !== !!updated.archivedAt
      ));
      const now = new Date().toISOString();
      const next = {
        ...updated,
        departmentIds: updated.departmentId ? [updated.departmentId] : updated.departmentIds,
        ...(locChanged ? { locationAt: updated.locationAt || now } : {}),
      };
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === next.id ? next : o)),
        notifications: [...state.notifications, ...updateNotifs],
      };
    }
    case 'SET_ORDERS_SORT': {
      const map = new Map(action.payload.map((p) => [p.id, p]));
      return {
        ...state,
        orders: state.orders.map((o) => {
          const patch = map.get(o.id);
          if (!patch) return o;
          return { ...o, sortOrder: patch.sortOrder, sortOrderAt: patch.sortOrderAt };
        }),
      };
    }
    case 'DELETE_ORDER': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, deletedAt: now, updatedAt: now, locationAt: now } : o
        ),
      };
    }
    case 'ARCHIVE_ORDER': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload) return o;
          // No files in archive — keeps sync payload small and reliable
          return {
            ...o,
            deletedAt: now,
            archivedAt: now,
            updatedAt: now,
            locationAt: now,
            invoice: undefined,
            invoices: [],
            orderForms: [],
          };
        }),
      };
    }
    case 'CLEAR_ARCHIVE': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (!o.archivedAt && !(o.deletedAt && o.status === 'done')) return o;
          return toOrderTombstone({
            ...o,
            purgedAt: o.purgedAt || now,
            deletedAt: o.deletedAt || now,
            updatedAt: now,
            locationAt: o.locationAt || now,
          });
        }),
      };
    }
    case 'SET_OPS_ROWS':
      return {
        ...state,
        opsRows: action.payload,
        opsUpdatedAt: action.opsUpdatedAt || new Date().toISOString(),
      };
    case 'RESTORE_ORDER':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload
            ? { ...o, deletedAt: undefined, purgedAt: undefined, updatedAt: new Date().toISOString(), locationAt: new Date().toISOString() }
            : o
        ),
      };
    case 'PERMANENT_DELETE': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload
            ? toOrderTombstone({ ...o, purgedAt: now, deletedAt: o.deletedAt || now, updatedAt: now, locationAt: now })
            : o
        ),
      };
    }
    case 'PURGE_OLD_TRASH': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (!o.deletedAt || o.deletedAt > thirtyDaysAgo) return o;
          if (o.purgedAt) return toOrderTombstone(o);
          return toOrderTombstone({ ...o, purgedAt: now, updatedAt: now, locationAt: o.locationAt || now });
        }),
      };
    }
    case 'MOVE_ORDER': {
      const movedOrder = state.orders.find((o) => o.id === action.payload.orderId);
      const moveNotifs: AppNotification[] = movedOrder ? (() => {
        const isDeptChange = action.payload.departmentId && action.payload.departmentId !== movedOrder.departmentId;
        const targetDeptId = action.payload.departmentId ?? movedOrder.departmentId;
        const oldDept = state.departments.find((d) => d.id === movedOrder.departmentId);
        const newDept = state.departments.find((d) => d.id === targetDeptId);
        const oldCol = oldDept?.columns.find((c) => c.id === movedOrder.status);
        const newCol = newDept?.columns.find((c) => c.id === action.payload.status);
        const msg = isDeptChange
          ? `نُقلت طلبية: ${movedOrder.clientName} إلى قسم ${newDept?.name || targetDeptId}`
          : `تغيير عمود: ${movedOrder.clientName} من ${oldCol?.title || movedOrder.status} إلى ${newCol?.title || action.payload.status}`;
        const triggerUid = action.payload.triggerUserId;
        const actor = resolveActor(state, triggerUid);
        const receivers = new Set<string>([
          ...state.users
            .filter((u) => {
              if (u.deletedAt || u.id === triggerUid) return false;
              const depts = userDepartmentIds(u);
              return depts.includes(movedOrder.departmentId) || depts.includes(targetDeptId);
            })
            .map((u) => u.id),
          ...(movedOrder.assignedUsers || []).filter((uid) => uid !== triggerUid),
        ]);
        return Array.from(receivers).map((uid) => makeNotif('updated', uid, movedOrder, msg, actor));
      })() : [];
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          const now = new Date().toISOString();
          const newDeptId = action.payload.departmentId ?? o.departmentId;
          return {
            ...o,
            status: action.payload.status as any,
            departmentId: newDeptId,
            departmentIds: newDeptId ? [newDeptId] : o.departmentIds,
            updatedAt: now,
            locationAt: now,
            // Highlight as NEW when transferred to another dept or placed in "جديد"
            isNew: (action.payload.departmentId && action.payload.departmentId !== o.departmentId)
              || action.payload.status === 'new'
              ? true
              : o.isNew,
          };
        }),
        notifications: [...state.notifications, ...moveNotifs],
      };
    }
    case 'ACKNOWLEDGE_NEW_ORDER': {
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          if (o.isNew === false) return o;
          return { ...o, isNew: false };
        }),
      };
    }
    case 'ADD_COMMENT': {
      const commentOrder = state.orders.find((o) => o.id === action.payload.orderId);
      const chatNotifs: AppNotification[] = commentOrder ? (() => {
        const actor = resolveActor(state, action.triggerUserId || action.payload.comment.userId);
        const chatReceivers = new Set<string>([
          ...state.users
            .filter((u) => !u.deletedAt && userBelongsToOrderDepartment(u, commentOrder) && u.id !== action.triggerUserId)
            .map((u) => u.id),
          ...(commentOrder.assignedUsers || []).filter((uid) => uid !== action.triggerUserId),
        ]);
        return Array.from(chatReceivers).map((uid) => ({
          ...makeNotif('chat', uid, commentOrder,
            `رسالة جديدة في طلبية: ${commentOrder.clientName} — رقم ${commentOrder.orderNumber}`, actor),
          commentText: action.payload.comment.text,
        }));
      })() : [];
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          return {
            ...o,
            comments: [...(o.comments || []), action.payload.comment],
            updatedAt: now,
          };
        }),
        notifications: [...state.notifications, ...chatNotifs],
      };
    }
    case 'ADD_DEPARTMENT':
      return { ...state, departments: [...state.departments, action.payload] };
    case 'UPDATE_DEPARTMENT':
      return {
        ...state,
        departments: state.departments.map((d) =>
          d.id === action.payload.id ? { ...action.payload, updatedAt: new Date().toISOString() } : d
        ),
      };
    case 'DELETE_DEPARTMENT':
      return {
        ...state,
        departments: state.departments.filter((d) => d.id !== action.payload),
      };
    case 'ADD_MATERIAL':
      return { ...state, materials: [...(state.materials || []), action.payload] };
    case 'UPDATE_MATERIAL':
      return {
        ...state,
        materials: (state.materials || []).map((m) =>
          m.id === action.payload.id ? { ...action.payload, updatedAt: new Date().toISOString() } : m
        ),
      };
    case 'DELETE_MATERIAL':
      return {
        ...state,
        materials: (state.materials || []).filter((m) => m.id !== action.payload),
      };
    case 'SET_ORDER_COST_ROWS':
      return {
        ...state,
        orderCostRows: action.payload,
        orderCostsUpdatedAt: new Date().toISOString(),
      };
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.payload.id ? action.payload : u)),
        currentUser: state.currentUser?.id === action.payload.id ? action.payload : state.currentUser,
      };
    case 'DELETE_USER':
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.payload
            ? { ...u, deletedAt: new Date().toISOString() }
            : u
        ),
        currentUser: state.currentUser?.id === action.payload ? null : state.currentUser,
      };
    case 'ADD_HISTORY':
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          return { ...o, history: [...o.history, action.payload.entry] };
        }),
      };
    case 'UPDATE_COLUMN':
      return {
        ...state,
        departments: state.departments.map((d) =>
          d.id !== action.payload.departmentId ? d : {
            ...d,
            updatedAt: new Date().toISOString(),
            columns: d.columns.map((c) => c.id === action.payload.column.id ? action.payload.column : c),
          }
        ),
      };
    case 'ADD_COLUMN':
      return {
        ...state,
        departments: state.departments.map((d) =>
          d.id !== action.payload.departmentId ? d : {
            ...d,
            updatedAt: new Date().toISOString(),
            columns: [...d.columns, action.payload.column],
          }
        ),
      };
    case 'DELETE_COLUMN':
      return {
        ...state,
        departments: state.departments.map((d) =>
          d.id !== action.payload.departmentId ? d : {
            ...d,
            updatedAt: new Date().toISOString(),
            columns: d.columns.filter((c) => c.id !== action.payload.columnId),
          }
        ),
      };
    default:
      return state;
  }
};

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  login: (username: string, password: string) => boolean | Promise<boolean>;
  logout: () => void;
  addHistoryEntry: (orderId: string, action: string, from?: string, to?: string) => void;
  loaded: boolean;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// Actions that come FROM the server — should NOT be saved back to the server
const SERVER_DRIVEN_ACTIONS = new Set(['SYNC_STATE', 'INIT_STATE', 'PURGE_OLD_TRASH']);
const LOCAL_ONLY_ACTIONS = new Set(['LOGIN', 'LOGOUT']);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);
  const lastActionRef = useRef<string>('');

  useEffect(() => { stateRef.current = state; }, [state]);

  // Wrap dispatch to track the last action type
  const trackedDispatch: typeof dispatch = (action: any) => {
    lastActionRef.current = action.type || '';
    dispatch(action);
  };

  // Open instantly from local cache, then sync server in background
  useEffect(() => {
    let cancelled = false;
    const finish = () => { if (!cancelled) setLoaded(true); };
    const safetyTimer = setTimeout(finish, 2000); // hard cap: 2 seconds

    const tryRestoreSession = (users: User[]) => {
      if (stateRef.current.currentUser) return;
      const sessionUserId = loadSession();
      if (!sessionUserId) return;
      const sessionUser = (users || []).find((u) => u.id === sessionUserId && !u.deletedAt);
      if (sessionUser) {
        trackedDispatch({ type: 'LOGIN', payload: sessionUser });
        touchSession();
      }
    };

    // 1) Local first — show UI immediately
    loadLocalState()
      .then((saved) => {
        if (cancelled) return;
        try {
          trackedDispatch({
            type: 'INIT_STATE',
            payload: { ...saved, departments: migrateDepts(saved.departments || []), opsRows: saved.opsRows || [] },
          });
          trackedDispatch({ type: 'PURGE_OLD_TRASH' });
          tryRestoreSession(saved.users || []);
        } catch { /* ignore */ }
        clearTimeout(safetyTimer);
        finish();

        // 2) Background server sync (does not block opening)
        serverLoad().then((serverData) => {
          if (cancelled || !serverData) return;
          trackedDispatch({
            type: 'SYNC_STATE',
            payload: {
              ...serverData,
              departments: migrateDepts(serverData.departments || []),
              opsRows: serverData.opsRows || [],
            },
          });
          // Local cache may have been empty — restore session once users arrive from server
          tryRestoreSession(serverData.users || []);
        }).catch(() => {});
      })
      .catch(() => {
        clearTimeout(safetyTimer);
        finish();
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  // After load: upload any local-only files (dataUrl without url) to shared storage
  useEffect(() => {
    if (!loaded || !state.currentUser) return;
    let cancelled = false;
    (async () => {
      const snapshot = stateRef.current.orders;
      for (const o of snapshot) {
        if (cancelled) return;
        if (o.deletedAt || o.archivedAt) continue;
        const needs =
          (o.invoice?.dataUrl && !o.invoice?.url) ||
          (o.invoices || []).some((i) => i.dataUrl && !i.url) ||
          (o.orderForms || []).some((f) => f.dataUrl && !f.url);
        if (!needs) continue;

        let order = { ...o };
        let changed = false;
        if (order.invoice?.dataUrl && !order.invoice.url) {
          const inv = await ensureAttachmentUrl(order.invoice);
          if (inv.url) {
            order = { ...order, invoice: inv };
            changed = true;
          }
        }
        if (order.invoices?.length) {
          const invs = await Promise.all(order.invoices.map((i) => ensureAttachmentUrl(i)));
          if (invs.some((i, idx) => i.url && i.url !== order.invoices![idx].url)) {
            order = { ...order, invoices: invs };
            changed = true;
          }
        }
        if (order.orderForms?.length) {
          const forms = await Promise.all(order.orderForms.map((f) => ensureAttachmentUrl(f)));
          if (forms.some((f, idx) => f.url && f.url !== order.orderForms![idx].url)) {
            order = { ...order, orderForms: forms };
            changed = true;
          }
        }
        if (!changed) continue;

        // Never clobber a newer local edit (e.g. user uploaded a file while migrating)
        const live = stateRef.current.orders.find((p) => p.id === o.id);
        if (!live) continue;
        if ((live.updatedAt || '') > (o.updatedAt || '')) {
          // Patch urls onto the live order's matching attachments only
          const patchUrl = (liveF?: any, migF?: any) => {
            if (!liveF) return liveF;
            if (liveF.url || !migF?.url || liveF.id !== migF.id) return liveF;
            return { ...liveF, url: migF.url };
          };
          const patched = {
            ...live,
            invoice: patchUrl(live.invoice, order.invoice) || live.invoice,
            invoices: (live.invoices || []).map((f) => {
              const m = (order.invoices || []).find((x) => x.id === f.id);
              return patchUrl(f, m) || f;
            }),
            orderForms: (live.orderForms || []).map((f) => {
              const m = (order.orderForms || []).find((x) => x.id === f.id);
              return patchUrl(f, m) || f;
            }),
          };
          const urlsAdded =
            patched.invoice?.url !== live.invoice?.url ||
            (patched.invoices || []).some((f, i) => f.url !== live.invoices?.[i]?.url) ||
            (patched.orderForms || []).some((f, i) => f.url !== live.orderForms?.[i]?.url);
          if (urlsAdded) {
            trackedDispatch({
              type: 'UPDATE_ORDER',
              payload: { ...patched, updatedAt: new Date().toISOString() },
              silent: true,
            } as any);
          }
          continue;
        }

        trackedDispatch({
          type: 'UPDATE_ORDER',
          payload: { ...order, updatedAt: new Date().toISOString() },
          silent: true,
        } as any);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state.currentUser?.id]);

  // Save whenever state changes (after initial load)
  // — save to IndexedDB always (for offline use)
  // — save to server only for user-initiated actions (not server-driven syncs)
  useEffect(() => {
    if (!loaded) return;
    const action = lastActionRef.current;
    if (SERVER_DRIVEN_ACTIONS.has(action) || LOCAL_ONLY_ACTIONS.has(action)) {
      // Never persist a bare default INIT over a richer IndexedDB (timeout race used to wipe users)
      const isBareDefault =
        action === 'INIT_STATE' &&
        (state.users || []).length <= 1 &&
        (state.users?.[0]?.username || '') === 'admin' &&
        (state.orders || []).length <= 1;
      if (!isBareDefault) {
        localforage.setItem('teamwork_app_data_v5', { ...state, currentUser: null }).catch(() => {});
      }
    } else {
      saveState(state);
    }
  }, [state, loaded]);

  // مزامنة فورية من السيرفر كل 3 ثوانٍ
  useEffect(() => {
    if (!loaded) return;

    const getSignature = (s: AppState) => {
      const orders = s.orders || [];
      const reqs = s.orderRequests || [];
      const depts  = s.departments || [];
      const mats   = s.materials || [];
      const costs  = s.orderCostRows || [];
      const maxOrderUpdated = orders.length
        ? orders.reduce((m, o) => (o.updatedAt > m ? o.updatedAt : m), '')
        : '';
      const maxReqUpdated = reqs.length
        ? reqs.reduce((m, o) => ((o.updatedAt || '') > m ? (o.updatedAt || '') : m), '')
        : '';
      const maxDeptUpdated = depts.length
        ? depts.reduce((m, d) => ((d.updatedAt || '') > m ? (d.updatedAt || '') : m), '')
        : '';
      const maxMatUpdated = mats.length
        ? mats.reduce((m, x) => ((x.updatedAt || x.createdAt || '') > m ? (x.updatedAt || x.createdAt || '') : m), '')
        : '';
      const maxCostUpdated = s.orderCostsUpdatedAt || (costs.length
        ? costs.reduce((m, x) => ((x.updatedAt || '') > m ? (x.updatedAt || '') : m), '')
        : '');
      const sortSum      = orders.reduce((s, o) => s + (o.sortOrder ?? 0), 0);
      const deletedCount = orders.filter((o) => !!o.deletedAt).length;
      const archivedCount = orders.filter((o) => !!o.archivedAt).length;
      // Lightweight ID hash — prevents false "equal" signatures when order sets differ
      // (e.g. one device has 3 orders A,B,C while server has 3 orders A,C,D)
      const idHash = orders.reduce((h, o) => {
        let v = 0;
        for (let i = 0; i < Math.min(o.id.length, 8); i++) v += o.id.charCodeAt(i);
        return (h + v) % 999983;
      }, 0);
      const reqHash = reqs.reduce((h, o) => {
        let v = 0;
        for (let i = 0; i < Math.min(o.id.length, 8); i++) v += o.id.charCodeAt(i);
        return (h + v) % 999983;
      }, 0);
      const locHash = orders.reduce((h, o) => {
        const s = `${o.id}:${o.departmentId || ''}:${o.status}:${o.deletedAt ? 1 : 0}:${o.archivedAt ? 1 : 0}:${o.purgedAt ? 1 : 0}:${o.locationAt || ''}`;
        let v = 0;
        for (let i = 0; i < s.length; i++) v += s.charCodeAt(i);
        return (h + v) % 999983;
      }, 0);
      const apprHash = orders.reduce((h, o) => {
        const bits = (o.artworkApprovals || []).map((a) => `${a.id}:${a.status}:${a.repliedAt || ''}`).join('|');
        let v = 0;
        for (let i = 0; i < bits.length; i++) v += bits.charCodeAt(i);
        return (h + v) % 999983;
      }, 0);
      const opsRows = s.opsRows || [];
      const opsHash = opsRows.map((r) =>
        [r.id, r.customer, r.job, r.qty, r.target, r.finishedQty, r.finish, r.date, r.updatedAt || ''].join(',')
      ).join('|');
      return `${orders.length}:${maxOrderUpdated}:${sortSum}:${deletedCount}:${archivedCount}:${idHash}:${locHash}:${apprHash}|req:${reqs.length}:${maxReqUpdated}:${reqHash}|${depts.length}:${maxDeptUpdated}|mat:${mats.length}:${maxMatUpdated}|cost:${costs.length}:${maxCostUpdated}|ops:${s.opsUpdatedAt || ''}:${opsRows.length}:${opsHash.length}:${opsHash.slice(0, 120)}`;
    };

    const poll = async () => {
      try {
        const serverData = await serverLoad();
        if (!serverData) return;
        const serverSig = getSignature(serverData);
        const localSig  = getSignature(stateRef.current);
        if (serverSig !== localSig) {
          trackedDispatch({ type: 'SYNC_STATE', payload: serverData });
        }
      } catch { /* silent */ }
    };

    poll();
    const interval = setInterval(poll, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loaded]);

  // تحديث lastActivity عند أي تفاعل من المستخدم
  useEffect(() => {
    if (!loaded) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        if (state.currentUser) touchSession();
        throttleTimer = null;
      }, 30000); // تحديث مرة كل 30 ثانية كحد أقصى
    };
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [loaded, state.currentUser]);

  // If session exists but user wasn't available at first paint, restore after users sync in
  useEffect(() => {
    if (!loaded || state.currentUser) return;
    const sessionUserId = loadSession();
    if (!sessionUserId) return;
    const sessionUser = state.users.find((u) => u.id === sessionUserId && !u.deletedAt);
    if (sessionUser) {
      trackedDispatch({ type: 'LOGIN', payload: sessionUser });
      touchSession();
    }
  }, [loaded, state.users, state.currentUser]);

  // تسجيل خروج تلقائي بعد ٤ ساعات من عدم النشاط
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      if (stateRef.current.currentUser) {
        const stillValid = loadSession();
        if (!stillValid) {
          clearSession();
          trackedDispatch({ type: 'LOGOUT' });
        }
      }
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [loaded]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const userName = username.trim().toLowerCase().replace(/\s+/g, '');
    const pass = password.trim();
    const match = (users: User[]) =>
      users.find(
        (u) =>
          !u.deletedAt &&
          (u.username || '').trim().toLowerCase().replace(/\s+/g, '') === userName &&
          (u.password || '') === pass,
      );

    let user = match(stateRef.current.users);

    // IndexedDB may still hold the real users list even if memory was reset to defaults
    if (!user) {
      try {
        const localUsers = await loadLocalUsers();
        user = match(localUsers);
        if (user && localUsers.length > (stateRef.current.users || []).length) {
          const localFull = await loadLocalState();
          if (localFull.departments?.length) {
            trackedDispatch({
              type: 'INIT_STATE',
              payload: {
                ...localFull,
                departments: migrateDepts(localFull.departments || []),
              },
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Server sync (skipped automatically when app_state is corrupt)
    if (!user) {
      try {
        const serverData = await serverLoad();
        if (serverData) {
          trackedDispatch({
            type: 'SYNC_STATE',
            payload: {
              ...serverData,
              departments: migrateDepts(serverData.departments || []),
              opsRows: serverData.opsRows || [],
            },
          });
          const merged = mergeUsers(serverData.users || [], stateRef.current.users || []);
          user = match(merged) || match(stateRef.current.users);
        }
      } catch {
        /* ignore */
      }
    }

    if (user) {
      trackedDispatch({ type: 'LOGIN', payload: user });
      saveSession(user.id);
      // Restore wiped server from this device's local data when possible
      (async () => {
        const local = await loadLocalState();
        await repairServerIfCorrupt({
          ...local,
          users: mergeUsers(local.users || [], stateRef.current.users || []),
          currentUser: null,
        });
      })().catch(() => {});
      return true;
    }
    return false;
  };

  const logout = () => {
    clearSession();
    trackedDispatch({ type: 'LOGOUT' });
  };

  const refreshData = async () => {
    // Pull fresh state from server and apply via SYNC_STATE (preserves currentUser session)
    const serverData = await serverLoad();
    if (serverData) {
      await localforage.setItem('teamwork_app_data_v5', { ...serverData, currentUser: null }).catch(() => {});
      trackedDispatch({ type: 'SYNC_STATE', payload: serverData });
    }
  };

  const addHistoryEntry = (orderId: string, action: string, from?: string, to?: string) => {
    if (!state.currentUser) return;
    const entry: OrderHistoryEntry = {
      id: generateId(),
      orderId,
      userId: state.currentUser.id,
      action,
      fromValue: from,
      toValue: to,
      timestamp: new Date().toISOString(),
    };
    trackedDispatch({ type: 'ADD_HISTORY', payload: { orderId, entry } });
  };

  return (
    <AppContext.Provider value={{ state, dispatch: trackedDispatch, login, logout, addHistoryEntry, loaded, refreshData }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
