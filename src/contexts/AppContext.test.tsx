import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import { loadLocalState, serverLoad, saveState } from '../utils/storage';
import { INITIAL_DEPARTMENTS, INITIAL_USERS } from '../data/initialData';
import { AppState } from '../types';

jest.mock('../utils/storage', () => ({ ...jest.requireActual('../utils/storage'), loadLocalState: jest.fn(), serverLoad: jest.fn(), saveState: jest.fn(), repairServerIfCorrupt: jest.fn(async () => false), loadSession: () => null }));
jest.mock('localforage', () => ({ config: () => {}, setItem: async () => {}, getItem: async () => null }));
const initial: AppState = { users: INITIAL_USERS, departments: INITIAL_DEPARTMENTS, orders: [], orderRequests: [], notifications: [], materials: [], orderCostRows: [], opsRows: [], currentUser: null };
let dispatch: ReturnType<typeof useApp>['dispatch'];
const Probe = () => {
  const app = useApp(); dispatch = app.dispatch;
  return <><span data-testid="name">{app.state.users[0]?.fullName}</span><span data-testid="notifs">{app.state.notifications.length}</span><span data-testid="requests">{app.state.orderRequests.filter((o) => !o.deletedAt).length}</span></>;
};
beforeEach(() => {
  jest.useFakeTimers();
  (loadLocalState as jest.Mock).mockResolvedValue(initial);
  (serverLoad as jest.Mock).mockResolvedValue(initial);
  (saveState as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

test('polling detects user and notification changes without an order change', async () => {
  await act(async () => { render(<AppProvider><Probe /></AppProvider>); });
  (serverLoad as jest.Mock).mockResolvedValue({ ...initial, users: [{ ...initial.users[0], fullName: 'New name', updatedAt: '2099-01-01' }], notifications: [{ id: 'new', userId: 'user', createdAt: '2099-01-01', read: false }] });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId('name')).toHaveTextContent('New name');
  expect(screen.getByTestId('notifs')).toHaveTextContent('1');
});
test('a server sync batched after a local edit does not suppress saving that edit', async () => {
  await act(async () => { render(<AppProvider><Probe /></AppProvider>); });
  await act(async () => {
    dispatch({ type: 'ADD_ORDER_REQUEST', payload: { id: 'req', createdAt: '2099-01-01', updatedAt: '2099-01-01' } as any });
    dispatch({ type: 'SYNC_STATE', payload: initial });
  });
  expect(saveState).toHaveBeenCalledWith(expect.objectContaining({ orderRequests: [expect.objectContaining({ id: 'req' })] }));
});
test('deleting a request followed by stale sync keeps it hidden', async () => {
  const request = { id: 'req', createdAt: '2026-01-01', updatedAt: '2026-01-01', isOrderRequest: true } as any;
  (loadLocalState as jest.Mock).mockResolvedValue({ ...initial, orderRequests: [request] });
  await act(async () => { render(<AppProvider><Probe /></AppProvider>); });
  await act(async () => { dispatch({ type: 'DELETE_ORDER_REQUEST', payload: 'req' }); dispatch({ type: 'SYNC_STATE', payload: { ...initial, orderRequests: [request] } }); });
  expect(screen.getByTestId('requests')).toHaveTextContent('0');
});
