import localforage from 'localforage';
import { AppState } from '../types';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS } from '../data/initialData';

// ─── Session management ───────────────────────────────────────────────────────
const SESSION_KEY      = 'teamwork_session';
const SESSION_DURATION = 4 * 60 * 60 * 1000; // أربع ساعات

export const saveSession = (userId: string) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, lastActivity: Date.now() }));
};

export const touchSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.lastActivity = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
};

export const loadSession = (): string | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { userId, lastActivity } = JSON.parse(raw);
    if (Date.now() - lastActivity > SESSION_DURATION) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return userId;
  } catch { return null; }
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

// ─── Server API ───────────────────────────────────────────────────────────────
const API_URL = 'https://csapp.io/teamwork-api/api.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

export const serverLoad = async (): Promise<AppState | null> => {
  try {
    const res = await fetch(API_URL, {
      headers: { 'X-API-Key': API_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.departments?.length) return data as AppState;
    return null;
  } catch { return null; }
};

const serverSave = async (state: AppState): Promise<boolean> => {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ ...state, currentUser: null }),
    });
    return res.ok;
  } catch { return false; }
};

// ─── Local fallback (IndexedDB) ───────────────────────────────────────────────
const DB_KEY = 'teamwork_app_data_v5';
const OLD_LS_KEYS = ['teamwork_app_data_v4', 'teamwork_app_data_v3', 'teamwork_app_data_v2', 'teamwork_app_data'];

localforage.config({
  name: 'TeamworkDB',
  storeName: 'app_state',
  description: 'Teamwork application data',
});

const getDefaultState = (): AppState => ({
  users: INITIAL_USERS,
  departments: INITIAL_DEPARTMENTS,
  orders: INITIAL_ORDERS,
  currentUser: null,
  notifications: [],
});

const migrateFromLocalStorage = (): AppState | null => {
  for (const key of OLD_LS_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.departments?.length) return { ...parsed, currentUser: null };
      }
    } catch { /* skip */ }
  }
  return null;
};

// ─── Public API ───────────────────────────────────────────────────────────────

const getMaxUpdatedAt = (orders: AppState['orders']): string => {
  if (!orders?.length) return '';
  return orders.reduce((max, o) => (o.updatedAt > max ? o.updatedAt : max), '');
};

// Smart merge: deletion takes priority; otherwise keep newer updatedAt.
// Server is treated as the source of truth for deletion — if the server says
// an order is deleted, it stays deleted unless local explicitly restored it AFTER
// the deletion timestamp AND the local is genuinely newer (not just stale cache).
const mergeOrder = (srv: AppState['orders'][0], loc: AppState['orders'][0]) => {
  const srvDel = !!srv.deletedAt;
  const locDel = !!loc.deletedAt;
  // Server deleted → honour deletion unless local was explicitly updated AFTER deletion
  if (srvDel && !locDel) {
    // Local must be strictly newer than deletion to count as a deliberate restore
    return (loc.updatedAt || '') > (srv.deletedAt || '') ? loc : srv;
  }
  // Local deleted → honour local deletion unless server has a genuinely newer update
  if (!srvDel && locDel) {
    return (srv.updatedAt || '') > (loc.deletedAt || '') ? srv : loc;
  }
  // Both same state → pick the newer one (server wins on tie)
  return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
};

const mergeOrders = (server: AppState['orders'], local: AppState['orders']): AppState['orders'] => {
  const srvMap = new Map(server.map((o) => [o.id, o]));
  const locMap = new Map(local.map((o) => [o.id, o]));

  // Start with all server orders (server is authoritative)
  const result: AppState['orders'][0][] = server.map((srv) => {
    const loc = locMap.get(srv.id);
    return loc ? mergeOrder(srv, loc) : srv;
  });
  // Add local-only orders ONLY if they are newer than the server's max updatedAt
  // (i.e., they were created offline and haven't reached the server yet).
  // Do NOT add local-only orders absent from server — server may have deleted them.
  const srvMaxUpdated = getMaxUpdatedAt(server);
  local.forEach((loc) => {
    if (!srvMap.has(loc.id) && !loc.deletedAt && (loc.updatedAt || '') > srvMaxUpdated) {
      result.push(loc);
    }
  });
  return result;
};

export const loadState = async (): Promise<AppState> => {
  // Load both sources in parallel
  const [fromServer, localRaw] = await Promise.all([
    serverLoad(),
    localforage.getItem<AppState>(DB_KEY).catch(() => null),
  ]);

  const local = localRaw as AppState | null;

  // Server available → server is the primary source of truth
  if (fromServer) {
    let mergedOrders = fromServer.orders || [];
    let departments = fromServer.departments || [];

    if (local) {
      // Merge orders: server is primary but respect local changes newer than server
      mergedOrders = mergeOrders(fromServer.orders || [], local.orders || []);

      // Departments: use whichever is newer
      const localDeptMax  = (local.departments || []).reduce((m, d) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      const serverDeptMax = departments.reduce((m: string, d: { updatedAt?: string }) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      if (local.departments?.length && localDeptMax > serverDeptMax) {
        departments = local.departments;
      }
    }

    const merged: AppState = {
      ...getDefaultState(),
      ...fromServer,
      departments,
      orders: mergedOrders,
      currentUser: null,
      notifications: fromServer.notifications || local?.notifications || [],
    };

    // Only push back to server if local had genuinely newer orders
    // (e.g. offline edits not yet synced) — never push back just because local was stale
    if (local) {
      const localMaxUpdated  = getMaxUpdatedAt(local.orders || []);
      const serverMaxUpdated = getMaxUpdatedAt(fromServer.orders || []);
      const localDeptMax     = (local.departments || []).reduce((m, d) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      const serverDeptMax    = (fromServer.departments || []).reduce((m: string, d: { updatedAt?: string }) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      if (localMaxUpdated > serverMaxUpdated || localDeptMax > serverDeptMax) {
        serverSave({ ...merged, currentUser: null });
      }
    }

    return merged;
  }

  // Server unavailable — fall back to local only
  if (local && local.departments?.length) {
    const full = { ...getDefaultState(), ...local, currentUser: null, notifications: local.notifications || [] };
    return full;
  }

  // Last resort: old localStorage keys
  const migrated = migrateFromLocalStorage();
  if (migrated) {
    const full = { ...getDefaultState(), ...migrated, currentUser: null, notifications: [] };
    serverSave(full);
    return full;
  }

  return getDefaultState();
};

export const saveState = async (state: AppState): Promise<void> => {
  const toSave = { ...state, currentUser: null };

  // Save locally first (instant, no block)
  localforage.setItem(DB_KEY, toSave).catch(() => {});

  // Save to server immediately (fire, but don't block UI)
  serverSave(toSave);
};

export const clearState = async (): Promise<void> => {
  await localforage.removeItem(DB_KEY);
};
