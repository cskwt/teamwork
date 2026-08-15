const isLocalHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** باقي أدوات الإنتاج على المحاسب الذكي (أو السيرفر المحلي) */
export const TOOLS_BASE = (
  process.env.REACT_APP_TOOLS_URL ||
  (isLocalHost ? 'http://127.0.0.1:8765' : 'https://acc.csapp.io')
).replace(/\/$/, '');

/** رابط الحضور الخاص بـ Teamwork */
export const ATTENDANCE_URL = isLocalHost
  ? `${TOOLS_BASE}/attendance`
  : 'https://teamwork.csapp.io/attendance';

/** رابط حاسبة التكاليف على نطاق Teamwork */
export const COST_CALCULATOR_URL = isLocalHost
  ? `${TOOLS_BASE}/cost-calculator`
  : 'https://teamwork.csapp.io/cost-calculator';

/** رابط صانع القوالب على نطاق Teamwork */
export const TEMPLATE_MAKER_URL = isLocalHost
  ? `${TOOLS_BASE}/template-maker`
  : 'https://teamwork.csapp.io/template-maker';
