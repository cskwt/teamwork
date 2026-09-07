import localforage from 'localforage';
import { AppState, Order, AppNotification } from '../types';
import { mergeOrder, saveState, loadLocalState, getSyncStatus, markOrderCreated, serverLoad } from './storage';
import { mergeNotifications } from './notifications';
import { INITIAL_DEPARTMENTS, INITIAL_USERS } from '../data/initialData';

jest.mock('localforage', () => {
  const entries = new Map();
  return { config: jest.fn(), getItem: async (key: string) => entries.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { entries.set(key, value); return value; },
    removeItem: async (key: string) => { entries.delete(key); } };
});
const order = (patch: Partial<Order> = {}): Order => ({ id: 'order-1', createdAt: new Date().toISOString(), updatedAt: '2026-09-01', departmentId: 'a', status: 'new', comments: [], history: [], ...patch } as Order);
const state = (patch: Partial<AppState> = {}): AppState => ({ users: INITIAL_USERS, departments: INITIAL_DEPARTMENTS, orders: [], orderRequests: [], materials: [], orderCostRows: [], currentUser: null, notifications: [], opsRows: [], ...patch });
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
const fetchMock = jest.fn();
beforeAll(() => { global.fetch = fetchMock; });
beforeEach(() => fetchMock.mockReset());

test('a later comment cannot undo a transfer', () => {
  const moved = order({ departmentId: 'b', locationAt: '2026-09-03', updatedAt: '2026-09-03' });
  const commented = order({ locationAt: '2026-09-01', updatedAt: '2026-09-04', comments: [{ id: 'comment-1' } as any] });
  const result = mergeOrder(moved, commented);
  expect(result.departmentId).toBe('b');
  expect(result.comments).toHaveLength(1);
});
test('deletion survives an edit, while explicit newer restoration works', () => {
  const deleted = order({ deletedAt: '2026-09-03', locationAt: '2026-09-03' });
  expect(mergeOrder(deleted, order({ updatedAt: '2026-09-04', locationAt: '2026-09-01' })).deletedAt).toBeTruthy();
  expect(mergeOrder(deleted, order({ locationAt: '2026-09-05' })).deletedAt).toBeUndefined();
});
test('permanent deletion and attachment tombstones survive stale devices', () => {
  expect(mergeOrder(order({ purgedAt: '2026-09-03' }), order({ updatedAt: '2026-09-05' })).purgedAt).toBeTruthy();
  const result = mergeOrder(order({ deletedAttachmentIds: ['file-1'] }), order({ invoices: [{ id: 'file-1' }, { id: 'file-2' }] as any }));
  expect(result.invoices?.map((f) => f.id)).toEqual(['file-2']);
});
test('concurrent comments are retained', () => {
  expect(mergeOrder(order({ comments: [{ id: 'a' }] as any }), order({ comments: [{ id: 'b' }] as any })).comments).toHaveLength(2);
});
test('read notifications remain read on both devices', () => {
  const unread = { id: 'n', read: false } as AppNotification;
  const read = { ...unread, read: true };
  expect(mergeNotifications([unread], [read])[0].read).toBe(true);
  expect(mergeNotifications([read], [unread])[0].read).toBe(true);
});
test('conflicting writes re-read the server revision and preserve the other user’s create', async () => {
  let remote = state({ _syncRevision: 'revision-1' });
  let writes = 0;
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      writes++;
      if (writes === 1) {
        remote = state({ _syncRevision: 'revision-2', orders: [order({ id: 'other-user' })] });
        return response({}, false);
      }
      expect(body._syncRevision).toBe('revision-2');
      expect(body.orders.map((o: Order) => o.id).sort()).toEqual(['order-1', 'other-user']);
      remote = { ...body, _syncRevision: 'revision-3' };
      return response({ success: true });
    }
    return response(remote);
  });
  await saveState(state({ orders: [order()] }));
  expect(writes).toBe(2);
});
test('an offline create older than five minutes is saved when connection returns', async () => {
  let remote = state({ _syncRevision: 'revision-1' });
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === 'POST') { remote = JSON.parse(options.body); return response({ success: true }); }
    return response(remote);
  });
  markOrderCreated('order-1');
  await saveState(state({ orders: [order({ createdAt: '2020-01-01' })] }));
  expect(remote.orders).toHaveLength(1);
});
test('pending offline changes survive reopening the application', async () => {
  const pending = state({ orders: [order({ id: 'offline', createdAt: '2020-01-01' })] });
  await localforage.setItem('teamwork_pending_save_v1', { state: pending, createdOrderIds: ['offline'] });
  let remote = state({ _syncRevision: 'revision-1' });
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === 'POST') { remote = JSON.parse(options.body); return response({ success: true }); }
    return response(remote);
  });
  const restored = await loadLocalState();
  expect(restored.orders[0].id).toBe('offline');
  await saveState(restored);
  expect(remote.orders[0].id).toBe('offline');
});

test('failed network saves retry automatically without another user edit', async () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let online = false;
  let remote = state({ _syncRevision: 'revision-1' });
  fetchMock.mockImplementation(async (_url, options) => {
    if (!online) throw new Error('offline');
    if (options.method === 'POST') { remote = JSON.parse(options.body); return response({ success: true }); }
    return response(remote);
  });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  try {
    const saving = saveState(state({ orders: [order({ id: 'retry-order' })] }));
    for (let i = 0; i < 5 && getSyncStatus() !== 'pending'; i++) {
      await flush(); jest.advanceTimersByTime(5000); await flush();
    }
    await saving;
    expect(getSyncStatus()).toBe('pending');
    expect(await localforage.getItem('teamwork_pending_save_v1')).toBeTruthy();
    online = true;
    jest.advanceTimersByTime(10000);
    await flush();
    expect(remote.orders[0].id).toBe('retry-order');
    expect(getSyncStatus()).toBe('saved');
  } finally {
    warn.mockRestore();
    jest.useRealTimers();
  }
});

test('polling reuses a cached snapshot when the server revision has not changed', async () => {
  const remote = state({ _syncRevision: 'same-revision' });
  fetchMock.mockResolvedValueOnce(response(remote));
  await serverLoad();
  fetchMock.mockResolvedValueOnce({ status: 304, ok: false, json: jest.fn() });
  expect(await serverLoad(true)).toEqual(remote);
  expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBe('same-revision');
});

test('saving another change does not resurrect an old order removed from the server', async () => {
  let remote = state({ _syncRevision: 'revision-1' });
  fetchMock.mockImplementation(async (_url, options) => {
    if (options.method === 'POST') { remote = JSON.parse(options.body); return response({ success: true }); }
    return response(remote);
  });
  await saveState(state({ orders: [order({ id: 'legacy-removed', createdAt: '2020-01-01', locationAt: undefined })] }));
  expect(remote.orders).toHaveLength(0);
});
