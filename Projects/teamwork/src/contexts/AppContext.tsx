import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { AppState, User, Department, Order, OrderComment, OrderHistoryEntry, KanbanColumn, AppNotification } from '../types';
import { loadState, saveState, saveSession, loadSession, serverLoad } from '../utils/storage';
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
  | { type: 'PURGE_OLD_TRASH' }
  | { type: 'MARK_NOTIFICATIONS_READ'; payload: string }  // userId
  | { type: 'INIT_STATE'; payload: AppState }
  | { type: 'SYNC_STATE'; payload: AppState };

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'INIT_STATE':
      return { ...action.payload, currentUser: null, notifications: action.payload.notifications || [] };
    case 'SYNC_STATE':
      return {
        ...state,
        users: action.payload.users || state.users,
        departments: action.payload.departments || state.departments,
        orders: action.payload.orders || state.orders,
        notifications: [
          ...state.notifications,
          ...(action.payload.notifications || []).filter(
            (n) => !state.notifications.find((existing) => existing.id === n.id)
          ),
        ],
      };
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
    case 'DELETE_ORDER':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, deletedAt: new Date().toISOString() } : o
        ),
      };
    case 'RESTORE_ORDER':
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.payload ? { ...o, deletedAt: undefined } : o
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
          d.id === action.payload.id ? action.payload : d
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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

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
      dispatch({ type: 'INIT_STATE', payload: { ...saved, departments: migratedDepts } });
      dispatch({ type: 'PURGE_OLD_TRASH' });

      // استعادة الجلسة إذا كانت صالحة
      const sessionUserId = loadSession();
      if (sessionUserId) {
        const sessionUser = saved.users.find((u) => u.id === sessionUserId);
        if (sessionUser) dispatch({ type: 'LOGIN', payload: sessionUser });
      }

      setLoaded(true);
    });
  }, []);

  // Save to IndexedDB whenever state changes (after initial load)
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  // مزامنة تلقائية من السيرفر كل 20 ثانية
  useEffect(() => {
    if (!loaded) return;
    const getSignature = (orders: Order[]) => {
      if (!orders?.length) return '0';
      const maxUpdated = orders.reduce((max, o) => (o.updatedAt > max ? o.updatedAt : max), '');
      return `${orders.length}:${maxUpdated}`;
    };
    const poll = async () => {
      try {
        const serverData = await serverLoad();
        if (!serverData) return;
        const serverSig = getSignature(serverData.orders || []);
        const localSig  = getSignature(state.orders || []);
        if (serverSig !== localSig) {
          dispatch({ type: 'SYNC_STATE', payload: serverData });
        }
      } catch { /* silent */ }
    };
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [loaded, state.orders]);

  // تسجيل خروج تلقائي بعد انتهاء مدة الجلسة (ساعتان)
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      if (state.currentUser) {
        const stillValid = loadSession();
        if (!stillValid) {
          dispatch({ type: 'LOGOUT' });
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
      dispatch({ type: 'LOGIN', payload: user });
      saveSession(user.id);
      return true;
    }
    return false;
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  const refreshData = async () => {
    const serverData = await serverLoad();
    if (serverData) {
      dispatch({ type: 'SYNC_STATE', payload: serverData });
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
    dispatch({ type: 'ADD_HISTORY', payload: { orderId, entry } });
  };

  return (
    <AppContext.Provider value={{ state, dispatch, login, logout, addHistoryEntry, loaded, refreshData }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
