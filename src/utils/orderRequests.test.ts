import { Order } from '../types';
import { mergeOrderRequests, splitOrdersAndRequests } from './orderRequests';

const request = (overrides: Partial<Order> = {}): Order => ({
  id: 'request-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isOrderRequest: true,
  ...overrides,
} as Order);

const deleted = request({ deletedAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' });

test.each(['2026-09-01', '2026-09-02', '2026-09-03'])('deletion survives a stale copy updated on %s in either merge order', (date) => {
  const active = request({ updatedAt: `${date}T00:00:00.000Z` });
  expect(mergeOrderRequests([active], [deleted])[0].deletedAt).toBe(deleted.deletedAt);
  expect(mergeOrderRequests([deleted], [active])[0].deletedAt).toBe(deleted.deletedAt);
});

test('save/load migration preserves deletion across repeated merges with legacy orders', () => {
  const legacy = request({ updatedAt: '2026-09-03T00:00:00.000Z' });
  const saved = splitOrdersAndRequests([legacy], [deleted]);
  const reloaded = splitOrdersAndRequests([legacy], saved.orderRequests);
  expect(reloaded.orders).toEqual([]);
  expect(reloaded.orderRequests).toHaveLength(1);
  expect(reloaded.orderRequests[0].deletedAt).toBe(deleted.deletedAt);
});

test('active requests keep the latest edit and unrelated records', () => {
  const updated = request({ clientName: 'Updated', updatedAt: '2026-09-03T00:00:00.000Z' });
  const result = mergeOrderRequests([request(), request({ id: 'request-2' })], [updated]);
  expect(result).toHaveLength(2);
  expect(result[0].clientName).toBe('Updated');
  expect(result[0].deletedAt).toBeUndefined();
});
