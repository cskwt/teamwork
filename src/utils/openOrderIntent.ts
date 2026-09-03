export type OrderModalTab = 'details' | 'approval' | 'files' | 'chat' | 'history';

export type OpenOrderIntent = {
  orderId: string;
  departmentId?: string;
  tab?: OrderModalTab;
};

const KEY = 'tw_open_order';

export const setOpenOrderIntent = (intent: OpenOrderIntent) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tw-open-order'));
  }
};

export const peekOpenOrderIntent = (): OpenOrderIntent | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.orderId) return null;
    return parsed as OpenOrderIntent;
  } catch {
    return null;
  }
};

export const consumeOpenOrderIntent = (): OpenOrderIntent | null => {
  const parsed = peekOpenOrderIntent();
  if (!parsed) return null;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  return parsed;
};
