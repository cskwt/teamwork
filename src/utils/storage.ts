import localforage from 'localforage';
import { AppState, AppNotification, OpsRow, User, Order } from '../types';
import { INITIAL_USERS, INITIAL_DEPARTMENTS, INITIAL_ORDERS, INITIAL_MATERIALS } from '../data/initialData';
import { splitOrdersAndRequests } from './orderRequests';
import { pickAvatar, snapshotAvatar } from './helpers';

const mergeNotificationsForSave = (
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
    let chosen = prev;
    if (!prev.read && n.read) chosen = prev;
    else if (prev.read && !n.read) chosen = n;
    else if ((n.createdAt || '') >= (prev.createdAt || '')) chosen = n;
    const other = chosen === prev ? n : prev;
    map.set(n.id, {
      ...chosen,
      actorId: chosen.actorId || other.actorId,
      actorName: chosen.actorName || other.actorName,
      actorAvatar: pickAvatar(chosen.actorAvatar, other.actorAvatar),
    });
  });
  return Array.from(map.values());
};

const pruneNotificationsAgainstOrders = (
  notifications: AppNotification[],
  orders: Order[],
  orderRequests: Order[],
): AppNotification[] => {
  const liveIds = new Set<string>([
    ...(orders || []).map((o) => o.id),
    ...(orderRequests || []).map((o) => o.id),
  ]);
  return (notifications || []).filter((n) => !n.orderId || liveIds.has(n.orderId));
};

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
    jobImage: (() => {
      const ai = a.jobImage || '';
      const bi = b.jobImage || '';
      if (ai.startsWith('http')) return ai;
      if (bi.startsWith('http')) return bi;
      return ai || bi || '';
    })(),
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
    if (!userId) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.now() - (lastActivity || 0) > SESSION_DURATION) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return userId;
  } catch {
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

// ─── Server API ───────────────────────────────────────────────────────────────
// Use www. — bare csapp.io currently hangs/times out on Hostinger
const API_URL = 'https://www.csapp.io/teamwork-api/api.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

// Hostinger file API first (reliable). Same-origin proxy second.
const OPS_API_CANDIDATES = [
  'https://www.csapp.io/teamwork-api/ops-sync.php',
  'https://csapp.io/teamwork-api/ops-sync.php',
  '/api/ops',
];

export type OpsServerPayload = {
  rows: OpsRow[];
  updatedAt: string | null;
  inProgressId?: string | null;
};

const parseOpsPayload = async (res: Response): Promise<OpsServerPayload | null> => {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  // SPA fallback returns text/html with 200 — must reject
  if (ct.includes('text/html')) return null;
  const text = await res.text();
  if (!text || text.trim().startsWith('<')) return null;
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || !Array.isArray(data.rows) || data.departments || data.orders) return null;
  return {
    rows: data.rows as OpsRow[],
    updatedAt: data.updatedAt || null,
    inProgressId: data.inProgressId ?? null,
  };
};

const opsFetchJson = async (
  method: 'GET' | 'POST',
  body?: OpsServerPayload,
): Promise<OpsServerPayload | 'saved' | null> => {
  for (const url of OPS_API_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method,
        headers: {
          'X-API-Key': API_KEY,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      if (method === 'POST') {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) continue;
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) continue;
        try {
          const data = JSON.parse(text);
          if (data && (data.success === true || Array.isArray(data.rows))) return 'saved';
        } catch { continue; }
        continue;
      }
      const parsed = await parseOpsPayload(res);
      if (parsed) return parsed;
    } catch { /* try next */ }
  }
  return null;
};

/** Dedicated ops sync — Hostinger ops-sync.php (file store) */
export const opsServerLoad = async (): Promise<OpsServerPayload | null> => {
  const result = await opsFetchJson('GET');
  if (!result || result === 'saved') return null;
  return result;
};

export const opsServerSave = async (
  rows: OpsRow[],
  updatedAt: string,
  inProgressId?: string | null,
): Promise<boolean> => {
  // Preserve shared image URLs already on the server when this device has empty jobImage
  let remoteMap = new Map<string, OpsRow>();
  let remoteProgress: string | null = null;
  try {
    const remote = await opsServerLoad();
    (remote?.rows || []).forEach((r) => remoteMap.set(r.id, r));
    remoteProgress = remote?.inProgressId ?? null;
  } catch { /* ignore */ }

  const payload: OpsServerPayload = {
    rows: (rows || []).map((r) => {
      const prev = remoteMap.get(r.id);
      const localImg = r.jobImage || '';
      const remoteImg = prev?.jobImage || '';
      const jobImage =
        localImg.startsWith('http') ? localImg :
        remoteImg.startsWith('http') ? remoteImg :
        '';
      return { ...r, jobImage };
    }),
    updatedAt,
    // undefined → keep whatever server already has; null/'' → clear; string → set
    inProgressId: inProgressId === undefined ? remoteProgress : (inProgressId || null),
  };
  const result = await opsFetchJson('POST', payload);
  return result === 'saved';
};

/** Prefer rows that actually have text content over empty shells */
export const opsRowsScore = (rows: OpsRow[]): number =>
  (rows || []).reduce((sum, r) => {
    const filled = ['customer', 'job', 'qty', 'target', 'finishedQty', 'date', 'finish']
      .filter((k) => !!(r as any)[k] && String((r as any)[k]).trim()).length;
    return sum + filled;
  }, 0);

/** True when payload is real app state (not a stray file-upload JSON). */
export const isValidAppState = (data: any): data is AppState =>
  !!(data && Array.isArray(data.departments) && data.departments.length > 0 && Array.isArray(data.orders));

/** Server returned 200 JSON that is NOT app state (e.g. a file {id,name,dataUrl} wipe). */
export const isCorruptAppStatePayload = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (isValidAppState(data)) return false;
  // Classic corruption: a single attachment overwritten into app_state
  if (typeof data.dataUrl === 'string' && !data.departments) return true;
  if (data.id && data.name && data.type && !data.departments && !data.orders) return true;
  return Array.isArray(data.departments) === false && data.orders === undefined;
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
      if (isValidAppState(data)) return data as AppState;
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch { return null; }
};

/** Peek raw server JSON (for corruption repair). */
const serverLoadRaw = async (): Promise<{ ok: boolean; data: any } | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(API_URL, {
        headers: { 'X-API-Key': API_KEY },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return { ok: false, data: null };
      const data = await res.json();
      return { ok: true, data };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
};

/** Strip ALL file DataURLs from server payload — files stay in local IndexedDB
 *  and/or on Hostinger uploads/ via files-api.php (url field is kept). */
const stripAllDataUrls = (state: AppState): AppState => {
  const meta = (f: any) => {
    if (!f) return f;
    const { dataUrl, ...rest } = f;
    return rest; // keep url, name, size, type, id
  };
  return {
    ...state,
    users: (state.users || []).map((u) => ({
      ...u,
      avatar: snapshotAvatar(u.avatar) || '',
    })),
    orders: (state.orders || []).map((o) => ({
      ...o,
      invoice: o.invoice ? meta(o.invoice) : undefined,
      invoices: (o.invoices || []).map(meta),
      orderForms: (o.orderForms || []).map(meta),
    })),
    opsRows: (state.opsRows || []).map((r) => ({
      ...r,
      jobImage: (r.jobImage || '').startsWith('http') ? r.jobImage : '',
    })),
    notifications: (state.notifications || []).map((n) => ({
      ...n,
      actorAvatar: snapshotAvatar(n.actorAvatar),
    })),
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
  orderRequests: [],
  materials: INITIAL_MATERIALS,
  orderCostRows: [],
  orderCostsUpdatedAt: undefined,
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
  const cleanRows = (opsRows || []).map((r) => ({
    ...r,
    jobImage: (r.jobImage || '').startsWith('http') ? r.jobImage : '',
  }));
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
const mergeById = <T extends { id: string; createdAt?: string }>(
  a: T[] = [],
  b: T[] = [],
): T[] => {
  const map = new Map<string, T>();
  [...(a || []), ...(b || [])].forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values()).sort((x, y) =>
    (x.createdAt || '').localeCompare(y.createdAt || '')
  );
};

const mergeOrder = (srv: AppState['orders'][0], loc: AppState['orders'][0]) => {
  // --- Deletion priority ---
  const srvDel = !!srv.deletedAt;
  const locDel = !!loc.deletedAt;
  let base: AppState['orders'][0];
  if (srvDel && !locDel) {
    base = (loc.updatedAt || '') > (srv.deletedAt || '') ? loc : srv;
  } else if (!srvDel && locDel) {
    base = (srv.updatedAt || '') > (loc.deletedAt || '') ? srv : loc;
  } else {
    // --- Archive priority ---
    const srvArc = !!srv.archivedAt;
    const locArc = !!loc.archivedAt;
    if (locArc && !srvArc) {
      base = (srv.updatedAt || '') > (loc.archivedAt || '') ? srv : loc;
    } else if (srvArc && !locArc) {
      base = srv;
    } else {
      // Same state → newer wins (server wins on tie)
      base = (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
    }
  }
  const deletedIds = new Set<string>([
    ...(base.deletedAttachmentIds || []),
    ...(srv.deletedAttachmentIds || []),
    ...(loc.deletedAttachmentIds || []),
  ]);
  const mergeFile = (...parts: any[]) => {
    const present = parts.filter(Boolean);
    if (!present.length) return undefined;
    const out = { ...present[0] };
    out.dataUrl = present.map((p) => p.dataUrl).find(Boolean);
    out.url = present.map((p) => p.url).find(Boolean);
    return out;
  };
  const unionList = (a: any[] = [], b: any[] = []) => {
    const map = new Map<string, any>();
    [...a, ...b].forEach((f) => {
      if (!f?.id || deletedIds.has(f.id)) return;
      map.set(f.id, mergeFile(map.get(f.id), f));
    });
    return Array.from(map.values());
  };
  const legacyInvoice = (() => {
    const inv = mergeFile(base.invoice, srv.invoice, loc.invoice);
    if (!inv) return undefined;
    if (inv.id && deletedIds.has(inv.id)) return undefined;
    if (!base.invoice && (base.updatedAt || '') >= (loc.updatedAt || '') && (base.updatedAt || '') >= (srv.updatedAt || '')) {
      return undefined;
    }
    return inv;
  })();
  // Always keep the union of chat + history + attachments from both sides
  // sortOrder is cosmetic and uses its own timestamp so sync doesn't wipe reorders
  const sortOrderAt =
    (loc.sortOrderAt || '') >= (srv.sortOrderAt || '') ? (loc.sortOrderAt || srv.sortOrderAt) : (srv.sortOrderAt || loc.sortOrderAt);
  const sortOrder =
    (loc.sortOrderAt || '') >= (srv.sortOrderAt || '')
      ? (loc.sortOrder ?? srv.sortOrder)
      : (srv.sortOrder ?? loc.sortOrder);
  return {
    ...base,
    sortOrder,
    sortOrderAt,
    deletedAttachmentIds: Array.from(deletedIds),
    invoice: legacyInvoice,
    invoices: unionList(srv.invoices, loc.invoices),
    orderForms: unionList(srv.orderForms, loc.orderForms),
    comments: mergeById(srv.comments, loc.comments),
    history: mergeById(srv.history, loc.history),
  };
};

const mergeOrders = (server: AppState['orders'], local: AppState['orders']): AppState['orders'] => {
  const srvMap = new Map(server.map((o) => [o.id, o]));
  const locMap = new Map(local.map((o) => [o.id, o]));

  // Start with all server orders (server is authoritative)
  const result: AppState['orders'][0][] = server.map((srv) => {
    const loc = locMap.get(srv.id);
    return loc ? mergeOrder(srv, loc) : srv;
  });
  // Keep local-only orders that look like recent offline creates (15 min),
  // or newer than the server's newest order. Never resurrect soft-deleted ones.
  const recentThreshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const srvMaxUpdated = getMaxUpdatedAt(server);
  local.forEach((loc) => {
    if (srvMap.has(loc.id) || loc.deletedAt) return;
    const stamp = loc.updatedAt || loc.createdAt || '';
    if (stamp > srvMaxUpdated || stamp >= recentThreshold) {
      result.push(loc);
    }
  });
  return result;
};

/**
 * Load from IndexedDB. Do NOT race a short timeout that returns empty defaults —
 * that used to wipe real local users (e.g. Hassan) when IDB was slow, then
 * INIT_STATE persisted the empty default back over IndexedDB.
 */
export const loadLocalState = async (): Promise<AppState> => {
  try {
    const local = (await localforage.getItem<AppState>(DB_KEY).catch(() => null)) as AppState | null;
    if (local && local.departments?.length) {
      const split = splitOrdersAndRequests(local.orders || [], local.orderRequests || []);
      return {
        ...getDefaultState(),
        ...local,
        orders: split.orders,
        orderRequests: split.orderRequests,
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

/** Direct IndexedDB read for login (no defaults, no timeout). */
export const loadLocalUsers = async (): Promise<User[]> => {
  try {
    const local = (await localforage.getItem<AppState>(DB_KEY).catch(() => null)) as AppState | null;
    return Array.isArray(local?.users) ? local!.users! : [];
  } catch {
    return [];
  }
};

/** If server app_state was overwritten by a file upload, push local snapshot to repair it. */
export const repairServerIfCorrupt = async (local: AppState): Promise<boolean> => {
  const raw = await serverLoadRaw();
  if (!(raw?.ok && isCorruptAppStatePayload(raw.data))) return false;
  const localOk =
    Array.isArray(local.departments) &&
    local.departments.length > 0 &&
    Array.isArray(local.users) &&
    local.users.length > 0;
  if (!localOk) return false;
  console.warn('[sync] repairing corrupted server app_state from local device');
  return serverSave({ ...local, currentUser: null });
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
    let materials = fromServer.materials || [];
    let orderCostRows = fromServer.orderCostRows || [];
    let orderCostsUpdatedAt = fromServer.orderCostsUpdatedAt;

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
          // Do NOT restore loc.invoice when server/merged cleared it — that resurrected deleted invoices
          invoice: o.invoice
            ? {
                ...o.invoice,
                dataUrl: o.invoice.dataUrl ?? loc.invoice?.dataUrl,
                url: o.invoice.url ?? loc.invoice?.url,
              }
            : undefined,
          invoices: (o.invoices || [])
            .filter((inv) => !(o.deletedAttachmentIds || []).includes(inv.id))
            .map((inv) => {
            const locInv = (loc.invoices || []).find((i) => i.id === inv.id);
            return locInv
              ? { ...inv, dataUrl: inv.dataUrl ?? locInv.dataUrl, url: inv.url ?? locInv.url }
              : inv;
          }),
          orderForms: (o.orderForms || [])
            .filter((f) => !(o.deletedAttachmentIds || []).includes(f.id))
            .map((f) => {
            const locF = (loc.orderForms || []).find((lf) => lf.id === f.id);
            return locF
              ? { ...f, dataUrl: f.dataUrl ?? locF.dataUrl, url: f.url ?? locF.url }
              : f;
          }),
        };
      });

      // Departments: use whichever is newer
      const localDeptMax  = (local.departments || []).reduce((m, d) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      const serverDeptMax = departments.reduce((m: string, d: { updatedAt?: string }) => (d.updatedAt || '') > m ? (d.updatedAt || '') : m, '');
      if (local.departments?.length && localDeptMax > serverDeptMax) {
        departments = local.departments;
      }

      // Materials catalog: use whichever is newer
      const localMatMax = (local.materials || []).reduce(
        (m, x) => ((x.updatedAt || x.createdAt || '') > m ? (x.updatedAt || x.createdAt || '') : m),
        '',
      );
      const serverMatMax = (fromServer.materials || []).reduce(
        (m: string, x: { updatedAt?: string; createdAt?: string }) =>
          ((x.updatedAt || x.createdAt || '') > m ? (x.updatedAt || x.createdAt || '') : m),
        '',
      );
      if ((local.materials || []).length && localMatMax > serverMatMax) {
        materials = local.materials;
      }

      // Order cost rows: sheet membership follows newer orderCostsUpdatedAt (local wins ties)
      const rowCostMax = (rows: { updatedAt?: string }[]) =>
        rows.reduce((m, x) => ((x.updatedAt || '') > m ? (x.updatedAt || '') : m), '');
      const localCostMax = local.orderCostsUpdatedAt || rowCostMax(local.orderCostRows || []);
      const serverCostMax =
        fromServer.orderCostsUpdatedAt || rowCostMax(fromServer.orderCostRows || []);
      if (
        Array.isArray(local.orderCostRows) &&
        (localCostMax || '') >= (serverCostMax || '')
      ) {
        orderCostRows = local.orderCostRows;
        orderCostsUpdatedAt = local.orderCostsUpdatedAt || localCostMax || orderCostsUpdatedAt;
      }
    }

    const split = splitOrdersAndRequests(
      mergedOrders,
      [
        ...(fromServer.orderRequests || []),
        ...(local?.orderRequests || []),
      ],
    );

    const merged: AppState = {
      ...getDefaultState(),
      ...fromServer,
      departments,
      materials: materials || fromServer.materials || local?.materials || [],
      orderCostRows: orderCostRows || fromServer.orderCostRows || local?.orderCostRows || [],
      orderCostsUpdatedAt:
        orderCostsUpdatedAt || fromServer.orderCostsUpdatedAt || local?.orderCostsUpdatedAt,
      orders: split.orders,
      orderRequests: split.orderRequests,
      currentUser: null,
      notifications: pruneNotificationsAgainstOrders(
        mergeNotificationsForSave(fromServer.notifications || [], local?.notifications || []),
        split.orders,
        split.orderRequests,
      ),
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
      const localMatMax = (local.materials || []).reduce(
        (m, x) => ((x.updatedAt || x.createdAt || '') > m ? (x.updatedAt || x.createdAt || '') : m),
        '',
      );
      const serverMatMax = (fromServer.materials || []).reduce(
        (m: string, x: { updatedAt?: string; createdAt?: string }) =>
          ((x.updatedAt || x.createdAt || '') > m ? (x.updatedAt || x.createdAt || '') : m),
        '',
      );

      // Never push file DataURLs back to server (they re-inflate the 20MB blob).
      // Only push if local has newer order/dept/material metadata.
      if (localMaxUpdated > serverMaxUpdated || localDeptMax > serverDeptMax || localMatMax > serverMatMax) {
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

// Merge users: union by id; deletedAt tombstones win so deletions stick across devices.
export const mergeUsers = (server: AppState['users'], local: AppState['users']): AppState['users'] => {
  const map = new Map<string, AppState['users'][0]>();
  const add = (u: AppState['users'][0]) => {
    if (!u?.id) return;
    const prev = map.get(u.id);
    if (!prev) {
      map.set(u.id, u);
      return;
    }
    const prevDel = !!prev.deletedAt;
    const uDel = !!u.deletedAt;
    if (uDel && !prevDel) {
      map.set(u.id, u);
      return;
    }
    if (prevDel && !uDel) return;
    if (uDel && prevDel) {
      map.set(u.id, (u.deletedAt || '') >= (prev.deletedAt || '') ? u : prev);
      return;
    }
    // Both active — prefer local profile edits when they differ
    let winner = prev;
    if (
      u.password !== prev.password ||
      u.avatar !== prev.avatar ||
      u.fullName !== prev.fullName ||
      u.username !== prev.username ||
      u.role !== prev.role ||
      u.departmentId !== prev.departmentId ||
      JSON.stringify(u.departmentIds || []) !== JSON.stringify(prev.departmentIds || [])
    ) {
      // Prefer the one that looks like a local edit: keep whichever was passed later (local is added second)
      winner = u;
    }
    const avatar = pickAvatar(winner.avatar, prev.avatar, u.avatar);
    map.set(u.id, avatar && avatar !== winner.avatar ? { ...winner, avatar } : winner);
  };
  (server || []).forEach(add);
  (local || []).forEach(add);
  return Array.from(map.values());
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

    // If server JSON was corrupted by a file upload (no departments), repair from local.
    if (!serverCurrent) {
      const raw = await serverLoadRaw();
      const corrupt = !!(raw?.ok && isCorruptAppStatePayload(raw.data));
      const localOk =
        Array.isArray(snapshot.departments) &&
        snapshot.departments.length > 0 &&
        Array.isArray(snapshot.users) &&
        snapshot.users.length > 0;
      if (corrupt && localOk) {
        console.warn('[sync] repairing corrupted server app_state from local device');
        const ok = await serverSave(snapshot);
        if (!ok) console.warn('[sync] repair save failed');
        return;
      }
      // Network / empty — keep local only; do NOT wipe server.
      console.warn('[sync] serverLoad failed — skip server write to protect other devices');
      return;
    }

    // Re-load once more right before merge to shrink TOCTOU races between devices
    const latest = await serverLoad();
    if (latest) serverCurrent = latest;

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

    // Materials / cost rows: union by id, prefer newer
    const matMap = new Map<string, AppState['materials'][0]>();
    [...(serverCurrent.materials || []), ...(snapshot.materials || [])].forEach((m) => {
      if (!m?.id) return;
      const prev = matMap.get(m.id);
      if (!prev) matMap.set(m.id, m);
      else {
        const pt = prev.updatedAt || prev.createdAt || '';
        const mt = m.updatedAt || m.createdAt || '';
        matMap.set(m.id, mt >= pt ? m : prev);
      }
    });
    const snapCosts = snapshot.orderCostRows || [];
    const srvCosts = serverCurrent.orderCostRows || [];
    const costStamp = (rows: AppState['orderCostRows'], at?: string) =>
      at || rows.reduce((m, r) => ((r.updatedAt || '') > m ? (r.updatedAt || '') : m), '');
    const localCostAt = costStamp(snapCosts, snapshot.orderCostsUpdatedAt);
    const serverCostAt = costStamp(srvCosts, serverCurrent.orderCostsUpdatedAt);

    let mergedCostRows: AppState['orderCostRows'];
    let mergedCostAt = snapshot.orderCostsUpdatedAt || serverCurrent.orderCostsUpdatedAt;
    if ((localCostAt || '') >= (serverCostAt || '')) {
      // Local sheet wins membership (deletes stick; empty sheet is valid)
      mergedCostRows = snapCosts.map((loc) => {
        const srv = srvCosts.find((s) => s.id === loc.id);
        if (!srv) return loc;
        return (loc.updatedAt || '') >= (srv.updatedAt || '') ? loc : srv;
      });
      mergedCostAt = snapshot.orderCostsUpdatedAt || localCostAt;
    } else {
      // Server sheet is strictly newer — take its membership only (no union)
      mergedCostRows = srvCosts.map((srv) => {
        const loc = snapCosts.find((s) => s.id === srv.id);
        if (!loc) return srv;
        return (srv.updatedAt || '') >= (loc.updatedAt || '') ? srv : loc;
      });
      mergedCostAt = serverCurrent.orderCostsUpdatedAt || serverCostAt;
    }

    // Keep Order Request fully separate; also peel any legacy mixed records out of orders
    const splitSave = splitOrdersAndRequests(mergedOrders, [
      ...(serverCurrent.orderRequests || []),
      ...(snapshot.orderRequests || []),
    ]);

    const ok = await serverSave({
      ...snapshot,
      users: mergedUsers,
      departments: mergedDepts,
      materials: Array.from(matMap.values()),
      orderCostRows: mergedCostRows,
      orderCostsUpdatedAt: mergedCostAt,
      orders: splitSave.orders,
      orderRequests: splitSave.orderRequests,
      notifications: pruneNotificationsAgainstOrders(
        mergeNotificationsForSave(snapshot.notifications || [], serverCurrent.notifications || []),
        splitSave.orders,
        splitSave.orderRequests,
      ),
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
