import { Order } from '../types';

const API_URL = 'https://www.csapp.io/teamwork-api/whatsapp-api.php';
const API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';

export const DEFAULT_WHATSAPP_FROM = 'whatsapp:+18387333651';

/** Keep digits and a leading + for E.164. */
export const normalizeWhatsAppNumber = (raw: string): string => {
  let digits = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (digits.startsWith('+')) {
    const rest = digits.slice(1).replace(/\D/g, '');
    return rest ? `+${rest}` : '';
  }
  digits = digits.replace(/\D/g, '');
  if (!digits) return '';
  // Local Kuwait mobiles are often stored as 8 digits (5/6/9…)
  if (digits.length === 8) return `+965${digits}`;
  if (digits.length === 11 && digits.startsWith('965')) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return '';
};

export const trackingCode = (): string => {
  const n = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CS-${n}`;
};

export const buildApprovalMessage = (order: Order, code: string): string => {
  const name = (order.clientName || 'عميلنا الكريم').trim();
  const num = (order.orderNumber || '').trim() || '—';
  return [
    `السلام عليكم ورحمة الله وبركاته`,
    `${name} المحترم/ة،`,
    '',
    'تحية طيبة من Creative Studio.',
    `نرسل لكم تصميم طلبية رقم ${num} للاطلاع والاعتماد قبل البدء بالتنفيذ.`,
    '',
    'التصميم مرفق في هذه الرسالة. بعد المراجعة يرجى الرد هنا بأحد الخيارين:',
    '',
    'موافق',
    'لاعتماد التصميم كما هو والبدء بالتنفيذ.',
    '',
    'تعديل',
    'ثم كتابة ملاحظات التعديل المطلوبة في نفس الرسالة.',
    '',
    `رمز المتابعة: ${code}`,
    '',
    'شاكرين ثقتكم وحسن تعاونكم.',
    'Creative Studio',
  ].join('\n');
};

export type WhatsAppConfigStatus = {
  configured: boolean;
  from?: string;
  accountSidMasked?: string;
};

export const loadWhatsAppConfig = async (): Promise<WhatsAppConfigStatus> => {
  try {
    const res = await fetch(`${API_URL}?action=config`, {
      headers: { 'X-API-Key': API_KEY },
      cache: 'no-store',
    });
    if (!res.ok) return { configured: false };
    const data = await res.json();
    return {
      configured: !!data?.configured,
      from: data?.from || DEFAULT_WHATSAPP_FROM,
      accountSidMasked: data?.accountSidMasked || '',
    };
  } catch {
    return { configured: false };
  }
};

export const saveWhatsAppConfig = async (payload: {
  accountSid: string;
  authToken: string;
  from?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        action: 'save-config',
        accountSid: payload.accountSid.trim(),
        authToken: payload.authToken.trim(),
        from: (payload.from || DEFAULT_WHATSAPP_FROM).trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network' };
  }
};

export const sendArtworkWhatsApp = async (payload: {
  to: string;
  body: string;
  mediaUrl: string;
  orderId: string;
  approvalId: string;
  trackingCode: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> => {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ action: 'send', ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || data?.twilioError || `HTTP ${res.status}` };
    }
    return { ok: true, sid: data.sid };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network' };
  }
};
