import localforage from 'localforage';
import { AppState } from '../types';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS } from '../data/initialData';

const SESSION_KEY = 'teamwork_session';
const SESSION_DURATION = 2 * 60 * 60 * 1000; // ساعتان بالميلي ثانية

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

// Migrate old localStorage data to IndexedDB
const migrateFromLocalStorage = (): AppState | null => {
  for (const key of OLD_LS_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.departments?.length) {
          console.log(`Migrating data from ${key} to IndexedDB`);
          return { ...parsed, currentUser: null };
        }
      }
    } catch { /* skip */ }
  }
  return null;
};

export const loadState = async (): Promise<AppState> => {
  try {
    // Try IndexedDB first
    const state = await localforage.getItem<AppState>(DB_KEY);
    if (state && typeof state === 'object' && (state as any).departments?.length) {
      return {
        ...getDefaultState(),
        ...(state as any),
        currentUser: null,
        notifications: (state as any).notifications || [],
      };
    }
    // Fall back to localStorage migration
    const migrated = migrateFromLocalStorage();
    if (migrated) {
      const full = { ...getDefaultState(), ...migrated, currentUser: null, notifications: [] };
      await localforage.setItem(DB_KEY, full);
      return full;
    }
    return getDefaultState();
  } catch {
    const migrated = migrateFromLocalStorage();
    if (migrated) return { ...getDefaultState(), ...migrated, currentUser: null, notifications: [] };
    return getDefaultState();
  }
};

export const saveState = async (state: AppState): Promise<void> => {
  try {
    const toSave = { ...state, currentUser: null };
    await localforage.setItem(DB_KEY, toSave);
  } catch (err) {
    console.error('Failed to save state:', err);
  }
};

export const clearState = async (): Promise<void> => {
  await localforage.removeItem(DB_KEY);
};
