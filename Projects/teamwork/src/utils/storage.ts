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

// Smart merge: for each order keep the newer version (by updatedAt)
const mergeOrders = (server: AppState['orders'], local: AppState['orders']): AppState['orders'] => {
  const srvMap = new Map(server.map((o) => [o.id, o]));
  const locMap = new Map(local.map((o) => [o.id, o]));
  const allIds = new Set([...Array.from(srvMap.keys()), ...Array.from(locMap.keys())]);
  return Array.from(allIds).map((id) => {
    const srv = srvMap.get(id);
    const loc = locMap.get(id);
    if (!srv) return loc!;
    if (!loc) return srv;
    return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
  });
};

export const loadState = async (): Promise<AppState> => {
  // Load both sources in parallel
  const [fromServer, localRaw] = await Promise.all([
    serverLoad(),
    localforage.getItem<AppState>(DB_KEY).catch(() => null),
  ]);

  const local = localRaw as AppState | null;

  // Both sources available → smart merge orders, keep local departments if newer
  if (fromServer && local && local.departments?.length) {
    const mergedOrders = mergeOrders(fromServer.orders || [], local.orders || []);
    const localDeptMaxUpdated  = local.departments.reduce((m, d) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
    const serverDeptMaxUpdated = (fromServer.departments || []).reduce((m: string, d: { updatedAt?: string }) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
    const departments = localDeptMaxUpdated > serverDeptMaxUpdated ? local.departments : (fromServer.departments || local.departments);
    const merged: AppState = {
      ...getDefaultState(),
      ...fromServer,
      departments,
      orders: mergedOrders,
      currentUser: null,
      notifications: fromServer.notifications || local.notifications || [],
    };
    // Push merged back to server if local had newer data
    const localMaxUpdated = getMaxUpdatedAt(local.orders || []);
    const serverMaxUpdated = getMaxUpdatedAt(fromServer.orders || []);
    if (localMaxUpdated > serverMaxUpdated || localDeptMaxUpdated > serverDeptMaxUpdated) {
      serverSave({ ...merged, currentUser: null });
    }
    return merged;
  }

  // Only local available
  if (local && local.departments?.length) {
    const full = { ...getDefaultState(), ...local, currentUser: null, notifications: local.notifications || [] };
    serverSave(full);
    return full;
  }

  // Only server available
  if (fromServer) {
    return { ...getDefaultState(), ...fromServer, currentUser: null, notifications: fromServer.notifications || [] };
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
