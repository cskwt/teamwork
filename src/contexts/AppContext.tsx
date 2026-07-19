import React, { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import localforage from 'localforage';
import { AppState, User, Department, Order, OrderComment, OrderHistoryEntry, KanbanColumn, AppNotification } from '../types';
import { loadState, saveState, saveSession, loadSession, touchSession, serverLoad } from '../utils/storage';
import { generateId } from '../utils/helpers';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS } from '../data/initialData';

const DEFAULT_STATE: AppState = {
  users: INITIAL_USERS,
  departments: INITIAL_DEPARTMENTS,
  orders: INITIAL_ORDERS,
  currentUser: null,
  notifications: [],
};

const makeNotif = (
  type: AppNotification['type'],
  userId: string,
  order: Order,
  message: string
): AppNotification => ({
  id: generateId(),
  type,
  userId,
  orderId: order.id,
  orderNumber: order.orderNumber || '',
  clientName: order.clientName,
  message,
  createdAt: new Date().toISOString(),
  read: false,
});

type Action =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_ORDER'; payload: Order; triggerUserId?: string }
  | { type: 'UPDATE_ORDER'; payload: Order; triggerUserId?: string; prevAssignedUsers?: string[]; silent?: boolean }
  | { type: 'DELETE_ORDER'; payload: string }
  | { type: 'MOVE_ORDER'; payload: { orderId: string; status: string; departmentId?: string; triggerUserId?: string } }
  | { type: 'ADD_COMMENT'; payload: { orderId: string; comment: OrderComment }; triggerUserId?: string }
  | { type: 'ADD_DEPARTMENT'; payload: Department }
  | { type: 'UPDATE_DEPARTMENT'; payload: Department }
  | { type: 'DELETE_DEPARTMENT'; payload: string }
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
  | { type: 'INIT_STATE'; payload: AppState }
  | { type: 'SYNC_STATE'; payload: AppState };

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'INIT_STATE':
      return { ...action.payload, currentUser: null, notifications: action.payload.notifications || [] };
    case 'SYNC_STATE': {
      // Server is the source of truth. Merge only allows local to win when it has
      // a genuinely newer change (e.g. user just made an edit that hasn't saved yet).
      // archivedAt and deletedAt are treated as high-priority flags — once set locally,
      // they are preserved even if the server hasn't caught up yet.
      const mergeOrderSync = (srv: Order, loc: Order): Order => {
        // --- Deletion priority ---
        const srvDel = !!srv.deletedAt;
        const locDel = !!loc.deletedAt;
        if (srvDel && !locDel) {
          return (loc.updatedAt || '') > (srv.deletedAt || '') ? loc : srv;
        }
        if (!srvDel && locDel) {
          return (srv.updatedAt || '') > (loc.deletedAt || '') ? srv : loc;
        }
        // --- Archive priority ---
        // If local has archivedAt but server doesn't yet (save in flight),
        // keep the local version to prevent the order from reappearing on the board.
        const srvArc = !!srv.archivedAt;
        const locArc = !!loc.archivedAt;
        if (locArc && !srvArc) {
          // Local archived — keep it unless server has an update AFTER the archive (deliberate un-archive)
          return (srv.updatedAt || '') > (loc.archivedAt || '') ? srv : loc;
        }
        if (srvArc && !locArc) {
          // Server archived but local doesn't know yet — server wins
          return srv;
        }
        // Same state → newer wins (server wins on tie)
        return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
      };

      const serverOrders = action.payload.orders || [];
      const localOrders  = state.orders;
      const serverMap    = new Map(serverOrders.map((o: Order) => [o.id, o]));
      const localMap     = new Map(localOrders.map((o: Order) => [o.id, o]));

      // Start with server orders as base (server is authoritative)
      const mergedOrders: Order[] = serverOrders.map((srv: Order) => {
        const loc = localMap.get(srv.id);
        return loc ? mergeOrderSync(srv, loc) : srv;
      });
      // Include local-only orders only if they were created very recently (within 30s).
      // This covers the case where the user just added an order that hasn't been pushed
      // to the server yet. Stale local-only orders (permanently deleted on the server)
      // are intentionally excluded to prevent them from ghosting back into the board.
      const recentThreshold = new Date(Date.now() - 30000).toISOString();
      localOrders.forEach((loc: Order) => {
        if (
          !serverMap.has(loc.id) &&
          !loc.deletedAt &&
          !loc.archivedAt &&
          (loc.createdAt || loc.updatedAt || '') >= recentThreshold
        ) {
          mergedOrders.push(loc);
        }
      });

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

      return {
        ...state,
        users: action.payload.users || state.users,
        departments: mergedDepts,
        orders: mergedOrders,
        notifications: [
          ...state.notifications,
          ...(action.payload.notifications || []).filter(
            (n: AppNotification) => !state.notifications.find((existing) => existing.id === n.id)
          ),
        ],
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
      const order = action.payload;
      const newNotifs: AppNotification[] = state.users
        .filter((u) => u.id !== action.triggerUserId && (
          u.departmentId === order.departmentId ||
          order.assignedUsers?.includes(u.id)
        ))
        .map((u) => makeNotif('new_order', u.id, order, `طلبية جديدة: ${order.clientName} — رقم ${order.orderNumber}`));
      return { ...state, orders: [...state.orders, order], notifications: [...state.notifications, ...newNotifs] };
    }
    case 'UPDATE_ORDER': {
      const updated = action.payload;
      if (action.silent) {
        return { ...state, orders: state.orders.map((o) => (o.id === updated.id ? updated : o)) };
      }
      const newlyAssigned = (updated.assignedUsers || []).filter(
        (uid) => !(action.prevAssignedUsers || []).includes(uid) && uid !== action.triggerUserId
      );
      const notifReceivers = new Set<string>([
        ...state.users.filter((u) => u.departmentId === updated.departmentId && u.id !== action.triggerUserId).map((u) => u.id),
        ...(updated.assignedUsers || []).filter((uid) => uid !== action.triggerUserId),
      ]);
      const updateNotifs: AppNotification[] = Array.from(notifReceivers).map((uid) => {
        if (newlyAssigned.includes(uid))
          return makeNotif('assigned', uid, updated, `تم تعيينك في طلبية: ${updated.clientName} — رقم ${updated.orderNumber}`);
        return makeNotif('updated', uid, updated, `تم تعديل طلبية: ${updated.clientName} — رقم ${updated.orderNumber}`);
      });
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === updated.id ? updated : o)),
        notifications: [...state.notifications, ...updateNotifs],
      };
    }
    case 'DELETE_ORDER': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, deletedAt: now, updatedAt: now } : o
        ),
      };
    }
    case 'ARCHIVE_ORDER': {
      const now = new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload) return o;
          // Strip file attachments (DataURLs) to free memory — metadata kept
          const stripped = {
            ...o,
            deletedAt: now,
            archivedAt: now,
            updatedAt: now,
            invoice: o.invoice ? { ...o.invoice, dataUrl: undefined } : undefined,
            invoices: (o.invoices || []).map((f) => ({ ...f, dataUrl: undefined })),
            orderForms: (o.orderForms || []).map((f) => ({ ...f, dataUrl: undefined })),
          };
          return stripped;
        }),
      };
    }
    case 'CLEAR_ARCHIVE': {
      // Permanently remove all archived orders from state to free memory
      return {
        ...state,
        orders: state.orders.filter((o) => !o.archivedAt && !(o.deletedAt && o.status === 'done')),
      };
    }
    case 'RESTORE_ORDER':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, deletedAt: undefined, updatedAt: new Date().toISOString() } : o
        ),
      };
    case 'PERMANENT_DELETE':
      return { ...state, orders: state.orders.filter((o) => o.id !== action.payload) };
    case 'PURGE_OLD_TRASH': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return {
        ...state,
        orders: state.orders.filter((o) => !o.deletedAt || o.deletedAt > thirtyDaysAgo),
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
        const receivers = new Set<string>([
          ...state.users.filter((u) => (u.departmentId === movedOrder.departmentId || u.departmentId === targetDeptId) && u.id !== triggerUid).map((u) => u.id),
          ...(movedOrder.assignedUsers || []).filter((uid) => uid !== triggerUid),
        ]);
        return Array.from(receivers).map((uid) => makeNotif('updated', uid, movedOrder, msg));
      })() : [];
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          const newDeptId = action.payload.departmentId ?? o.departmentId;
          const newDeptIds = action.payload.departmentId
            ? [action.payload.departmentId]
            : o.departmentIds;
          return {
            ...o,
            status: action.payload.status as any,
            departmentId: newDeptId,
            departmentIds: newDeptIds,
            updatedAt: new Date().toISOString(),
          };
        }),
        notifications: [...state.notifications, ...moveNotifs],
      };
    }
    case 'ADD_COMMENT': {
      const commentOrder = state.orders.find((o) => o.id === action.payload.orderId);
      const chatNotifs: AppNotification[] = commentOrder ? (() => {
        const chatReceivers = new Set<string>([
          ...state.users.filter((u) => u.departmentId === commentOrder.departmentId && u.id !== action.triggerUserId).map((u) => u.id),
          ...(commentOrder.assignedUsers || []).filter((uid) => uid !== action.triggerUserId),
        ]);
        return Array.from(chatReceivers).map((uid) => ({
          ...makeNotif('chat', uid, commentOrder,
            `رسالة جديدة في طلبية: ${commentOrder.clientName} — رقم ${commentOrder.orderNumber}`),
          commentText: action.payload.comment.text,
        }));
      })() : [];
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.payload.orderId) return o;
          return { ...o, comments: [...o.comments, action.payload.comment] };
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
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.payload.id ? action.payload : u)),
        currentUser: state.currentUser?.id === action.payload.id ? action.payload : state.currentUser,
      };
    case 'DELETE_USER':
      return { ...state, users: state.users.filter((u) => u.id !== action.payload) };
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
  login: (username: string, password: string) => boolean;
  logout: () => void;
  addHistoryEntry: (orderId: string, action: string, from?: string, to?: string) => void;
  loaded: boolean;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// Actions that come FROM the server — should NOT be saved back to the server
const SERVER_DRIVEN_ACTIONS = new Set(['SYNC_STATE', 'INIT_STATE', 'PURGE_OLD_TRASH']);

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

  // Load from IndexedDB on mount
  useEffect(() => {
    loadState().then((saved) => {
      // Migrate قسم التسليم columns to delivery-specific names
      const migratedDepts = saved.departments.map((d) => {
        if (d.name === 'قسم التسليم') {
          const hasDefault = d.columns.some((c) => c.id === 'new' && c.title === 'جديد');
          return {
            ...d,
            color: '#8b5cf6',
            columns: hasDefault ? [
              { id: 'new',         title: 'الطلبيات الجاهزة', color: '#6366f1', order: 0 },
              { id: 'in_progress', title: 'للتوصيل',           color: '#f59e0b', order: 1 },
              { id: 'review',      title: 'قيد التسليم',       color: '#8b5cf6', order: 2 },
              { id: 'done',        title: 'للاستلام',          color: '#10b981', order: 3 },
            ] : d.columns,
          };
        }
        return d;
      });
      trackedDispatch({ type: 'INIT_STATE', payload: { ...saved, departments: migratedDepts } });
      trackedDispatch({ type: 'PURGE_OLD_TRASH' });

      // استعادة الجلسة إذا كانت صالحة
      const sessionUserId = loadSession();
      if (sessionUserId) {
        const sessionUser = saved.users.find((u) => u.id === sessionUserId);
        if (sessionUser) trackedDispatch({ type: 'LOGIN', payload: sessionUser });
      }

      setLoaded(true);
    });
  }, []);

  // Save whenever state changes (after initial load)
  // — save to IndexedDB always (for offline use)
  // — save to server only for user-initiated actions (not server-driven syncs)
  useEffect(() => {
    if (!loaded) return;
    const action = lastActionRef.current;
    if (SERVER_DRIVEN_ACTIONS.has(action)) {
      // Only update local cache; don't push back to server what we just received from it
      localforage.setItem('teamwork_app_data_v5', { ...state, currentUser: null }).catch(() => {});
    } else {
      saveState(state);
    }
  }, [state, loaded]);

  // مزامنة فورية من السيرفر كل 3 ثوانٍ
  useEffect(() => {
    if (!loaded) return;

    const getSignature = (s: AppState) => {
      const orders = s.orders || [];
      const depts  = s.departments || [];
      const maxOrderUpdated = orders.length
        ? orders.reduce((m, o) => (o.updatedAt > m ? o.updatedAt : m), '')
        : '';
      const maxDeptUpdated = depts.length
        ? depts.reduce((m, d) => ((d.updatedAt || '') > m ? (d.updatedAt || '') : m), '')
        : '';
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
      return `${orders.length}:${maxOrderUpdated}:${sortSum}:${deletedCount}:${archivedCount}:${idHash}|${depts.length}:${maxDeptUpdated}`;
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

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
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

  // تسجيل خروج تلقائي بعد ٤ ساعات من عدم النشاط
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      if (state.currentUser) {
        const stillValid = loadSession();
        if (!stillValid) {
          trackedDispatch({ type: 'LOGOUT' });
        }
      }
    }, 60 * 1000); // يفحص كل دقيقة
    return () => clearInterval(interval);
  }, [loaded, state.currentUser]);

  const login = (username: string, password: string): boolean => {
    const user = state.users.find(
      (u: User) => u.username === username && u.password === password
    );
    if (user) {
      trackedDispatch({ type: 'LOGIN', payload: user });
      saveSession(user.id);
      return true;
    }
    return false;
  };

  const logout = () => {
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
