import localforage from 'localforage';
import { AppState } from '../types';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS } from '../data/initialData';

// ─── Session management ───────────────────────────────────────────────────────
const SESSION_KEY      = 'teamwork_session';
const SESSION_DURATION = 2 * 60 * 60 * 1000; // ساعتان

export const saveSession = (userId: string) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, loginTime: Date.now() }));
};

export const loadSession = (): string | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { userId, loginTime } = JSON.parse(raw);
    if (Date.now() - loginTime > SESSION_DURATION) {
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
const API_URL = 'https://cskwt.com/teamwork-api/api.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

const serverLoad = async (): Promise<AppState | null> => {
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
export const loadState = async (): Promise<AppState> => {
  // Load both sources in parallel
  const [fromServer, localRaw] = await Promise.all([
    serverLoad(),
    localforage.getItem<AppState>(DB_KEY).catch(() => null),
  ]);

  const local = localRaw as AppState | null;
  const serverOrders = fromServer?.orders?.length ?? 0;
  const localOrders  = local?.orders?.length ?? 0;

  // If local has MORE data than server → push local to server and use it
  if (local && local.departments?.length && localOrders > serverOrders) {
    const full = { ...getDefaultState(), ...local, currentUser: null, notifications: local.notifications || [] };
    serverSave(full); // sync to server in background
    return full;
  }

  // Server has equal or more data → use server
  if (fromServer) {
    return { ...getDefaultState(), ...fromServer, currentUser: null, notifications: fromServer.notifications || [] };
  }

  // Fallback: local only
  if (local && local.departments?.length) {
    const full = { ...getDefaultState(), ...local, currentUser: null, notifications: local.notifications || [] };
    serverSave(full);
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

  // Always save locally first (instant)
  try { await localforage.setItem(DB_KEY, toSave); } catch { /* ignore */ }

  // Then save to server (sync across devices)
  serverSave(toSave);
};

export const clearState = async (): Promise<void> => {
  await localforage.removeItem(DB_KEY);
};
