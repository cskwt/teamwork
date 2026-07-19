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

// Files smaller than this threshold are included in the server payload so they
// can be shared across devices. Larger files are stripped to prevent the JSON
// payload from exceeding PHP / server limits.
const MAX_DATAURL_SERVER = 3 * 1024 * 1024; // 3 MB in characters (~2.25 MB binary)

const stripLargeDataUrls = (state: AppState): AppState => {
  const shouldStrip = (url?: string) => url && url.length > MAX_DATAURL_SERVER;
  return {
    ...state,
    orders: (state.orders || []).map((o) => ({
      ...o,
      invoice: o.invoice
        ? { ...o.invoice, dataUrl: shouldStrip(o.invoice.dataUrl) ? undefined : o.invoice.dataUrl }
        : undefined,
      invoices: (o.invoices || []).map((inv) => ({
        ...inv,
        dataUrl: shouldStrip(inv.dataUrl) ? undefined : inv.dataUrl,
      })),
      orderForms: (o.orderForms || []).map((f) => ({
        ...f,
        dataUrl: shouldStrip(f.dataUrl) ? undefined : f.dataUrl,
      })),
    })),
  };
};

const serverSave = async (state: AppState): Promise<boolean> => {
  try {
    const payload = stripLargeDataUrls({ ...state, currentUser: null });
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(payload),
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

// Smart merge: deletion and archive flags take priority over generic updatedAt comparisons.
// This prevents a slower server-save from overwriting a locally applied archive/delete.
const mergeOrder = (srv: AppState['orders'][0], loc: AppState['orders'][0]) => {
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
  // If local has archivedAt but server hasn't saved it yet, keep local to prevent
  // the order from reappearing on the board after the next 3-second poll.
  const srvArc = !!srv.archivedAt;
  const locArc = !!loc.archivedAt;
  if (locArc && !srvArc) {
    // Local archived — keep unless server has an explicit update after the archive
    return (srv.updatedAt || '') > (loc.archivedAt || '') ? srv : loc;
  }
  if (srvArc && !locArc) {
    // Server archived, local not updated yet — server wins
    return srv;
  }
  // Same state → newer wins (server wins on tie)
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

      // Re-attach local file DataURLs that were stripped before server save.
      // The server only stores metadata; the actual files live in local IndexedDB.
      const localMap = new Map((local.orders || []).map((o) => [o.id, o]));
      mergedOrders = mergedOrders.map((o) => {
        const loc = localMap.get(o.id);
        if (!loc) return o;
        return {
          ...o,
          invoice: o.invoice
            ? { ...o.invoice, dataUrl: o.invoice.dataUrl ?? loc.invoice?.dataUrl }
            : loc.invoice,
          invoices: (o.invoices || []).map((inv) => {
            const locInv = (loc.invoices || []).find((i) => i.id === inv.id);
            return locInv ? { ...inv, dataUrl: inv.dataUrl ?? locInv.dataUrl } : inv;
          }),
          orderForms: (o.orderForms || []).map((f) => {
            const locF = (loc.orderForms || []).find((lf) => lf.id === f.id);
            return locF ? { ...f, dataUrl: f.dataUrl ?? locF.dataUrl } : f;
          }),
        };
      });

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

// Merge users: union of both sides — never drop a user that exists on either side.
// Server is authoritative for updates; local-only users (new, not yet synced) are kept.
const mergeUsers = (server: AppState['users'], local: AppState['users']): AppState['users'] => {
  const locMap = new Map(local.map((u) => [u.id, u]));
  const result: AppState['users'] = [...server]; // start with all server users
  // Add any local-only users (created on this device, not yet on server)
  local.forEach((u) => {
    if (!result.find((s) => s.id === u.id)) result.push(u);
  });
  // For users present on both sides, prefer the local version only if it changed
  // (e.g. password/avatar update initiated from this device)
  return result.map((u) => {
    const loc = locMap.get(u.id);
    // If local has a different password/avatar it was probably updated here — keep local
    if (loc && (loc.password !== u.password || loc.avatar !== u.avatar || loc.fullName !== u.fullName)) {
      return loc;
    }
    return u;
  });
};

export const saveState = async (state: AppState): Promise<void> => {
  const toSave = { ...state, currentUser: null };

  // Save locally first (instant)
  localforage.setItem(DB_KEY, toSave).catch(() => {});

  // Before pushing to server, fetch current server state and merge.
  // This prevents a device with stale data from overwriting newer changes
  // (e.g. an archive/delete made on another device a moment earlier).
  serverLoad().then((serverCurrent) => {
    if (!serverCurrent) {
      serverSave(toSave);
      return;
    }
    // Merge orders: keep whichever version is "more final"
    const srvMap = new Map((serverCurrent.orders || []).map((o) => [o.id, o]));

    const mergedOrders: AppState['orders'] = [];
    (toSave.orders || []).forEach((loc) => {
      const srv = srvMap.get(loc.id);
      if (!srv) {
        // Order is not on server. Push it unless it was locally soft-deleted
        // (SYNC_STATE already removes permanently-deleted orders from local state
        //  within 3 seconds, so by the time saveState runs they should be gone).
        if (!loc.deletedAt) mergedOrders.push(loc);
        return;
      }
      mergedOrders.push(mergeOrder(srv, loc));
    });
    // Add server-only orders (created on another device, not yet in local state)
    (serverCurrent.orders || []).forEach((srv) => {
      if (!mergedOrders.find((o) => o.id === srv.id)) {
        mergedOrders.push(srv);
      }
    });
    // Merge users: union — never drop a user from either side
    const mergedUsers = mergeUsers(serverCurrent.users || [], toSave.users || []);
    serverSave({ ...toSave, users: mergedUsers, orders: mergedOrders });
  }).catch(() => {
    // If fetch fails, save what we have — better than losing local changes
    serverSave(toSave);
  });
};

export const clearState = async (): Promise<void> => {
  await localforage.removeItem(DB_KEY);
};
