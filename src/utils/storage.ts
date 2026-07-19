import localforage from 'localforage';
import { AppState, OpsRow } from '../types';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS } from '../data/initialData';

/** How many text fields are filled — used to prefer richer ops rows over empty ones */
export const opsRowScore = (r: OpsRow): number =>
  ['date', 'customer', 'job', 'qty', 'target', 'finishedQty', 'finish', 'workers', 'progress']
    .filter((k) => !!(r as any)[k] && String((r as any)[k]).trim()).length;

/** Merge two ops rows field-by-field; never lose non-empty text; keep local image */
export const mergeOpsRow = (a: OpsRow, b: OpsRow): OpsRow => {
  const pick = (x?: string, y?: string) => {
    const xs = (x || '').trim();
    const ys = (y || '').trim();
    if (xs && ys) {
      // Prefer newer updatedAt when both have values
      if ((a.updatedAt || '') >= (b.updatedAt || '')) return xs;
      return ys;
    }
    return xs || ys;
  };
  const newer = (a.updatedAt || '') >= (b.updatedAt || '') ? a : b;
  return {
    id: a.id || b.id,
    date: pick(a.date, b.date),
    customer: pick(a.customer, b.customer),
    job: pick(a.job, b.job),
    jobImage: a.jobImage || b.jobImage || '',
    qty: pick(a.qty, b.qty),
    target: pick(a.target, b.target),
    finishedQty: pick(a.finishedQty, b.finishedQty),
    finish: pick(a.finish, b.finish),
    workers: pick(a.workers, b.workers),
    progress: pick(a.progress, b.progress),
    updatedAt: newer.updatedAt || a.updatedAt || b.updatedAt,
  };
};

/**
 * Merge opsRows from two sources.
 * - Never let an empty/stale side wipe filled rows on the other side.
 * - Union by id; field-level merge for shared ids.
 * - If one side is clearly empty of text and the other isn't, prefer the richer side's set.
 */
export const mergeOpsRows = (server: OpsRow[] = [], local: OpsRow[] = []): OpsRow[] => {
  const serverSafe = (server || []).filter((r) => r && r.id);
  const localSafe = (local || []).filter((r) => r && r.id);
  server = serverSafe;
  local = localSafe;
  const srvScore = server.reduce((s, r) => s + opsRowScore(r), 0);
  const locScore = local.reduce((s, r) => s + opsRowScore(r), 0);

  // One side has real data, the other is empty shells → keep the rich side
  if (locScore > 0 && srvScore === 0) return local.map((r) => ({ ...r }));
  if (srvScore > 0 && locScore === 0) {
    // Still restore images from local for matching ids
    const locMap = new Map(local.map((r) => [r.id, r]));
    return server.map((r) => ({ ...r, jobImage: r.jobImage || locMap.get(r.id)?.jobImage || '' }));
  }

  // Both empty → keep whichever has rows (shells with images), prefer local images
  if (srvScore === 0 && locScore === 0) {
    if (local.length === 0) return server;
    if (server.length === 0) return local;
  }

  // Both have data (or both empty with rows): union + field merge
  // Prefer local array as authority for which rows exist when local was just edited
  // (local has updatedAt newer on any row), otherwise union.
  const localNewer = local.some((r) => {
    const s = server.find((x) => x.id === r.id);
    return !s || (r.updatedAt || '') > (s.updatedAt || '');
  });
  const localDeleted = local.length < server.length && localNewer && locScore > 0;

  const map = new Map<string, OpsRow>();
  const base = localDeleted ? local : [...server, ...local];
  if (localDeleted) {
    local.forEach((r) => {
      const s = server.find((x) => x.id === r.id);
      map.set(r.id, s ? mergeOpsRow(r, s) : r);
    });
  } else {
    base.forEach((r) => {
      const existing = map.get(r.id);
      map.set(r.id, existing ? mergeOpsRow(existing, r) : r);
    });
  }

  return Array.from(map.values());
};

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
// Use www. — bare csapp.io currently hangs/times out on Hostinger
const API_URL = 'https://www.csapp.io/teamwork-api/api.php';
const OPS_API_URL = 'https://www.csapp.io/teamwork-api/ops-sync.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

export type OpsServerPayload = { rows: OpsRow[]; updatedAt: string | null };

/** Fast dedicated ops API (file-based on Hostinger) */
export const opsServerLoad = async (): Promise<OpsServerPayload | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(OPS_API_URL, {
      headers: { 'X-API-Key': API_KEY },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.rows) || data.departments || data.orders) {
      return { rows: [], updatedAt: null };
    }
    return { rows: data.rows as OpsRow[], updatedAt: data.updatedAt || null };
  } catch {
    return null;
  }
};

export const opsServerSave = async (rows: OpsRow[], updatedAt: string): Promise<boolean> => {
  try {
    const payload: OpsServerPayload = {
      rows: (rows || []).map((r) => ({ ...r, jobImage: '' })),
      updatedAt,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(OPS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
};

export const serverLoad = async (): Promise<AppState | null> => {
  try {
    const controller = new AbortController();
    // After compacting state (~0.5MB) this should be fast; keep 30s safety margin
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(API_URL, {
        headers: { 'X-API-Key': API_KEY },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.departments?.length) return data as AppState;
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch { return null; }
};

/** Strip ALL file DataURLs from server payload — files stay in local IndexedDB only.
 *  Keeping them on the server bloated the JSON to ~20MB and broke sync for everyone. */
const stripAllDataUrls = (state: AppState): AppState => {
  const meta = (f: any) => {
    if (!f) return f;
    const { dataUrl, ...rest } = f;
    return rest;
  };
  return {
    ...state,
    users: (state.users || []).map((u) => ({
      ...u,
      avatar: (u.avatar && u.avatar.startsWith('data:') && u.avatar.length > 50000) ? '' : u.avatar,
    })),
    orders: (state.orders || []).map((o) => ({
      ...o,
      invoice: o.invoice ? meta(o.invoice) : undefined,
      invoices: (o.invoices || []).map(meta),
      orderForms: (o.orderForms || []).map(meta),
    })),
    opsRows: (state.opsRows || []).map((r) => ({ ...r, jobImage: '' })),
  };
};

const serverSave = async (state: AppState): Promise<boolean> => {
  try {
    const payload = stripAllDataUrls({ ...state, currentUser: null }) as any;
    delete payload.opsRows;
    delete payload.opsUpdatedAt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch { return false; }
};

/** Merge local + server orders for a safe write — never drop either side's orders */
const mergeOrdersForSave = (
  serverOrders: AppState['orders'],
  localOrders: AppState['orders'],
): AppState['orders'] => {
  const srvMap = new Map((serverOrders || []).map((o) => [o.id, o]));
  const result: AppState['orders'] = [];
  (localOrders || []).forEach((loc) => {
    const srv = srvMap.get(loc.id);
    if (!srv) {
      if (!loc.deletedAt) result.push(loc);
      return;
    }
    result.push(mergeOrder(srv, loc));
  });
  (serverOrders || []).forEach((srv) => {
    if (!result.find((o) => o.id === srv.id)) result.push(srv);
  });
  return result;
};

// Serialize server writes — concurrent saveState calls were racing and wiping orders
let saveQueue: Promise<void> = Promise.resolve();
let pendingSave: AppState | null = null;

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
  opsRows: [],
  opsUpdatedAt: undefined,
});

/**
 * Resolve which opsRows to write to the server.
 * Critical: devices that never edited the ops screen must NOT wipe server data.
 */
export const resolveOpsRowsForSave = (
  serverRows: OpsRow[] = [],
  localRows: OpsRow[] = [],
  serverAt?: string,
  localAt?: string,
): { opsRows: OpsRow[]; opsUpdatedAt?: string } => {
  const sAt = serverAt || '';
  const lAt = localAt || '';
  const srvScore = serverRows.reduce((s, r) => s + opsRowScore(r), 0);
  const locScore = localRows.reduce((s, r) => s + opsRowScore(r), 0);

  // Local never touched ops screen → always keep server ops as-is
  if (!lAt) {
    return {
      opsRows: srvScore > 0 || serverRows.length > 0 ? serverRows : localRows,
      opsUpdatedAt: sAt || undefined,
    };
  }

  // Local edited more recently (or same time) → local table is authority
  if (lAt >= sAt) {
    return { opsRows: localRows, opsUpdatedAt: lAt };
  }

  // Server ops newer → keep server, but fill empty text from local if useful
  if (srvScore > 0) {
    return { opsRows: mergeOpsRows(serverRows, localRows), opsUpdatedAt: sAt };
  }

  // Server newer stamp but empty content, local has content → keep local
  if (locScore > 0) {
    return { opsRows: localRows, opsUpdatedAt: lAt };
  }

  return { opsRows: mergeOpsRows(serverRows, localRows), opsUpdatedAt: sAt || lAt || undefined };
};

/** Dedicated push of ops table — retries with fresh server fetch to beat race conditions */
export const saveOpsRowsToServer = async (opsRows: OpsRow[], opsUpdatedAt: string): Promise<boolean> => {
  const cleanRows = (opsRows || []).map((r) => ({ ...r, jobImage: '' }));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const server = await serverLoad();
      if (!server) {
        // No server — still save locally elsewhere; can't push
        return false;
      }
      const resolved = resolveOpsRowsForSave(
        server.opsRows || [],
        cleanRows,
        server.opsUpdatedAt,
        opsUpdatedAt,
      );
      // When this call is from an intentional edit, force our rows if our stamp is newest
      const finalRows = (opsUpdatedAt >= (server.opsUpdatedAt || ''))
        ? cleanRows
        : resolved.opsRows;
      const finalAt = opsUpdatedAt >= (server.opsUpdatedAt || '')
        ? opsUpdatedAt
        : (resolved.opsUpdatedAt || opsUpdatedAt);

      const ok = await serverSave({
        ...server,
        currentUser: null,
        opsRows: finalRows,
        opsUpdatedAt: finalAt,
      });
      if (!ok) continue;

      // Verify write stuck
      const verify = await serverLoad();
      if (!verify) continue;
      const vAt = verify.opsUpdatedAt || '';
      if (vAt >= opsUpdatedAt) return true;
      const vScore = (verify.opsRows || []).reduce((s, r) => s + opsRowScore(r), 0);
      const eScore = cleanRows.reduce((s, r) => s + opsRowScore(r), 0);
      if (eScore === 0 || vScore >= eScore) return true;
    } catch { /* retry */ }
  }
  return false;
};

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

/** Fast local-only load — opens the app within ~1–2 seconds */
export const loadLocalState = async (): Promise<AppState> => {
  try {
    const localRaw = await Promise.race([
      localforage.getItem<AppState>(DB_KEY).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    const local = localRaw as AppState | null;
    if (local && local.departments?.length) {
      return {
        ...getDefaultState(),
        ...local,
        currentUser: null,
        notifications: local.notifications || [],
        opsRows: local.opsRows || [],
      };
    }
    const migrated = migrateFromLocalStorage();
    if (migrated) {
      return { ...getDefaultState(), ...migrated, currentUser: null, notifications: [], opsRows: (migrated as any).opsRows || [] };
    }
  } catch { /* fall through */ }
  return getDefaultState();
};

export const loadState = async (): Promise<AppState> => {
  try {
  // Load both sources in parallel (each has its own timeout / catch)
  const localPromise = Promise.race([
    localforage.getItem<AppState>(DB_KEY).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
  const [fromServer, localRaw] = await Promise.all([
    serverLoad(),
    localPromise,
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
      ...resolveOpsRowsForSave(
        fromServer.opsRows || [],
        local?.opsRows || [],
        fromServer.opsUpdatedAt,
        local?.opsUpdatedAt,
      ),
    };

    // Push back to server when:
    // 1. Local has newer orders/depts (offline edits not yet synced), OR
    // 2. Local has file DataURLs that the server is missing (e.g. after the brief
    //    period where all DataURLs were stripped — recover them on next load)
    if (local) {
      const localMaxUpdated  = getMaxUpdatedAt(local.orders || []);
      const serverMaxUpdated = getMaxUpdatedAt(fromServer.orders || []);
      const localDeptMax     = (local.departments || []).reduce((m, d) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      const serverDeptMax    = (fromServer.departments || []).reduce((m: string, d: { updatedAt?: string }) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');

      // Never push file DataURLs back to server (they re-inflate the 20MB blob).
      // Only push if local has newer order/dept metadata.
      if (localMaxUpdated > serverMaxUpdated || localDeptMax > serverDeptMax) {
        serverSave({ ...merged, currentUser: null });
      }
    }

    return merged;
  }

  // Server unavailable — fall back to local only
  if (local && local.departments?.length) {
    const full = { ...getDefaultState(), ...local, currentUser: null, notifications: local.notifications || [], opsRows: local.opsRows || [] };
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
  } catch {
    // Never block the app on a load failure
    return getDefaultState();
  }
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

  // Always persist locally first (instant, offline-safe)
  localforage.setItem(DB_KEY, toSave).catch(() => {});

  // Coalesce rapid saves: keep only the latest pending snapshot
  pendingSave = toSave;
  saveQueue = saveQueue.then(async () => {
    const snapshot = pendingSave;
    if (!snapshot) return;
    pendingSave = null;

    // MUST load server before write. If load fails, RETRY — never overwrite blindly
    // (blind overwrite was wiping other devices' new orders).
    let serverCurrent: AppState | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      serverCurrent = await serverLoad();
      if (serverCurrent) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    if (!serverCurrent) {
      // Keep local only; next successful save/poll will sync. Do NOT wipe server.
      console.warn('[sync] serverLoad failed — skip server write to protect other devices');
      return;
    }

    const mergedOrders = mergeOrdersForSave(serverCurrent.orders || [], snapshot.orders || []);
    const mergedUsers = mergeUsers(serverCurrent.users || [], snapshot.users || []);
    // Departments: prefer newer by updatedAt, union by id
    const deptMap = new Map<string, AppState['departments'][0]>();
    [...(serverCurrent.departments || []), ...(snapshot.departments || [])].forEach((d) => {
      const prev = deptMap.get(d.id);
      if (!prev) deptMap.set(d.id, d);
      else deptMap.set(d.id, (d.updatedAt || '') >= (prev.updatedAt || '') ? d : prev);
    });
    const mergedDepts: AppState['departments'] = [];
    deptMap.forEach((d) => { mergedDepts.push(d); });

    const ok = await serverSave({
      ...snapshot,
      users: mergedUsers,
      departments: mergedDepts,
      orders: mergedOrders,
      notifications: snapshot.notifications || serverCurrent.notifications || [],
    });
    if (!ok) {
      console.warn('[sync] serverSave failed — will retry on next change');
    }
  }).catch((err) => {
    console.warn('[sync] save queue error', err);
  });

  await saveQueue;
};

export const clearState = async (): Promise<void> => {
  await localforage.removeItem(DB_KEY);
};
