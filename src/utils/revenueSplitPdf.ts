import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export type RevenueSplitPdfRow = {
  label: string;
  note: string;
  amount: number;
  color: string;
  pct: number;
};

export type RevenueSplitPdfOrder = {
  clientName: string;
  invoice: number;
  materials: number;
  net: number;
  salaries: number;
  rent: number;
  marketing: number;
  profit: number;
};

export type RevenueSplitPdfData = {
  isAr: boolean;
  orders: RevenueSplitPdfOrder[];
  invoice: number;
  materials: number;
  net: number;
  breakdown: RevenueSplitPdfRow[];
  slices: RevenueSplitPdfRow[];
};

const formatMoney = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildPieSvg = (slices: RevenueSplitPdfRow[], size = 200) => {
  const total = slices.reduce((s, r) => s + r.amount, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const ir = size * 0.22;
  let angle = -Math.PI / 2;
  const parts: string[] = [];

  slices.forEach((slice) => {
    const sweep = (slice.amount / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const xi0 = cx + ir * Math.cos(a1);
    const yi0 = cy + ir * Math.sin(a1);
    const xi1 = cx + ir * Math.cos(a0);
    const yi1 = cy + ir * Math.sin(a0);
    parts.push(
      `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${slice.color}"/>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${parts.join('')}
    <circle cx="${cx}" cy="${cy}" r="${ir - 2}" fill="#fff"/>
  </svg>`;
};

const ensureCairoFont = async () => {
  const id = 'rs-pdf-cairo-font';
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap';
    document.head.appendChild(link);
  }
  try {
    await Promise.all([
      document.fonts.load('400 14px Cairo'),
      document.fonts.load('600 14px Cairo'),
      document.fonts.load('700 16px Cairo'),
      document.fonts.load('800 28px Cairo'),
    ]);
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 120));
};

const buildReportHtml = (data: RevenueSplitPdfData) => {
  const { isAr, orders, invoice, materials, net, breakdown, slices } = data;
  const dir = isAr ? 'rtl' : 'ltr';
  const align = isAr ? 'right' : 'left';
  const alignOpp = isAr ? 'left' : 'right';
  const stamp = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const t = isAr
    ? {
        title: 'حاسبة توزيع الإيراد',
        subtitle: 'تقرير مجموعة طلبيات — توزيع بعد التكاليف',
        date: 'التاريخ',
        ordersCount: 'عدد الطلبيات',
        summary: 'الملخص الإجمالي',
        invoice: 'إجمالي الفواتير',
        materials: 'إجمالي مواد خام',
        net: 'الصافي للتوزيع',
        allocation: 'توزيع الصافي',
        chart: 'المخطط الدائري',
        ordersTable: 'جدول الطلبيات',
        client: 'اسم العميل',
        invVal: 'قيمة الفاتورة',
        mats: 'مواد خام',
        netCol: 'الصافي',
        salaries: 'رواتب',
        rent: 'إيجار',
        marketing: 'تسويق',
        profit: 'ربح',
        total: 'المجموع',
        hint: 'الصافي يُوزَّع: 50% رواتب · 25% إيجار · 10% تسويق · 15% ربح',
        footer: 'Teamwork — تقرير توزيع الإيراد',
      }
    : {
        title: 'Revenue Split Calculator',
        subtitle: 'Batch orders report — allocation after costs',
        date: 'Date',
        ordersCount: 'Orders',
        summary: 'Totals summary',
        invoice: 'Total invoices',
        materials: 'Total materials',
        net: 'Net to allocate',
        allocation: 'Net allocation',
        chart: 'Distribution chart',
        ordersTable: 'Orders table',
        client: 'Client',
        invVal: 'Invoice',
        mats: 'Materials',
        netCol: 'Net',
        salaries: 'Salaries',
        rent: 'Rent',
        marketing: 'Marketing',
        profit: 'Profit',
        total: 'Total',
        hint: 'Net split: 50% salaries · 25% rent · 10% marketing · 15% profit',
        footer: 'Teamwork — Revenue split report',
      };

  const summaryRow = (label: string, value: string, opts?: { strong?: boolean; color?: string }) => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6;">
      <span style="font-size:14px;color:${opts?.strong ? '#111827' : '#6b7280'};font-weight:${opts?.strong ? 700 : 400};">${escapeHtml(label)}</span>
      <strong style="font-size:${opts?.strong ? 20 : 15}px;font-weight:800;color:${opts?.color || '#111827'};">${value}</strong>
    </div>`;

  const orderRowsHtml = orders
    .map(
      (o, i) => `<tr>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:center;color:#94a3b8;">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${align};font-weight:600;">${escapeHtml(o.clientName || '—')}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};">${formatMoney(o.invoice)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};">${formatMoney(o.materials)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};font-weight:700;color:#007aff;">${formatMoney(o.net)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};color:#007aff;">${formatMoney(o.salaries)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};color:#5856d6;">${formatMoney(o.rent)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};color:#ff9500;">${formatMoney(o.marketing)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:${alignOpp};color:#34c759;">${formatMoney(o.profit)}</td>
      </tr>`,
    )
    .join('');

  return `
    <div id="rs-pdf-root" dir="${dir}" lang="${isAr ? 'ar' : 'en'}" style="
      width:980px;box-sizing:border-box;padding:28px 32px 24px;
      font-family:Cairo,Tahoma,Arial,sans-serif;
      direction:${dir};text-align:${align};
      color:#1f2937;background:#f4f6fb;
      -webkit-font-smoothing:antialiased;
    ">
      <div style="
        background:linear-gradient(135deg,#0b1f3a 0%,#1e3a5f 55%,#007aff 100%);
        border-radius:18px;padding:24px 26px;color:#fff;margin-bottom:18px;
      ">
        <div style="font-size:13px;opacity:.85;margin-bottom:8px;">Teamwork</div>
        <div style="font-size:26px;font-weight:800;line-height:1.4;margin-bottom:6px;">${escapeHtml(t.title)}</div>
        <div style="font-size:13px;opacity:.9;line-height:1.55;">${escapeHtml(t.subtitle)}</div>
        <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">
          <div style="background:rgba(255,255,255,.14);border-radius:999px;padding:6px 14px;font-size:12px;">
            <span>${escapeHtml(t.date)}</span>
            <strong style="margin-inline-start:8px;">${escapeHtml(stamp)}</strong>
          </div>
          <div style="background:rgba(255,255,255,.14);border-radius:999px;padding:6px 14px;font-size:12px;">
            <span>${escapeHtml(t.ordersCount)}</span>
            <strong style="margin-inline-start:8px;">${orders.length}</strong>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:14px;margin-bottom:14px;">
        <div style="flex:1.15;background:#fff;border-radius:14px;padding:18px 20px;border:1px solid #e5e7eb;">
          <div style="font-size:15px;font-weight:800;margin-bottom:8px;color:#111827;">${escapeHtml(t.summary)}</div>
          ${summaryRow(t.invoice, formatMoney(invoice))}
          ${summaryRow(t.materials, `− ${formatMoney(materials)}`, { color: '#b45309' })}
          ${summaryRow(t.net, formatMoney(net), { strong: true, color: '#007aff' })}
          <div style="margin-top:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:9px 11px;font-size:11px;color:#1e40af;line-height:1.55;">
            ${escapeHtml(t.hint)}
          </div>
          <div style="margin-top:14px;">
            ${breakdown
              .map(
                (row) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
                <span>
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${row.color};margin-inline-end:8px;"></span>
                  ${escapeHtml(row.label)}
                  <span style="color:#94a3b8;font-size:11px;margin-inline-start:6px;">${Math.round(row.pct * 100)}%</span>
                </span>
                <strong>${formatMoney(row.amount)}</strong>
              </div>`,
              )
              .join('')}
          </div>
        </div>
        <div style="flex:0.85;background:#fff;border-radius:14px;padding:16px;border:1px solid #e5e7eb;text-align:center;">
          <div style="font-size:15px;font-weight:800;margin-bottom:6px;color:#111827;text-align:${align};">${escapeHtml(t.chart)}</div>
          <div style="display:flex;justify-content:center;">${buildPieSvg(slices.length ? slices : breakdown)}</div>
        </div>
      </div>

      <div style="background:#fff;border-radius:14px;padding:16px 18px;border:1px solid #e5e7eb;margin-bottom:14px;">
        <div style="font-size:15px;font-weight:800;margin-bottom:10px;color:#111827;">${escapeHtml(t.ordersTable)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;direction:${dir};">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;">#</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${align};">${escapeHtml(t.client)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.invVal)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.mats)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.netCol)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.salaries)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.rent)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.marketing)}</th>
              <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;color:#64748b;text-align:${alignOpp};">${escapeHtml(t.profit)}</th>
            </tr>
          </thead>
          <tbody>
            ${orderRowsHtml}
            <tr style="background:#f8fafc;font-weight:800;">
              <td style="padding:9px 6px;"></td>
              <td style="padding:9px 6px;text-align:${align};">${escapeHtml(t.total)}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};">${formatMoney(invoice)}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};">${formatMoney(materials)}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};color:#007aff;">${formatMoney(net)}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};color:#007aff;">${formatMoney(orders.reduce((s, o) => s + o.salaries, 0))}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};color:#5856d6;">${formatMoney(orders.reduce((s, o) => s + o.rent, 0))}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};color:#ff9500;">${formatMoney(orders.reduce((s, o) => s + o.marketing, 0))}</td>
              <td style="padding:9px 6px;text-align:${alignOpp};color:#34c759;">${formatMoney(orders.reduce((s, o) => s + o.profit, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="text-align:center;font-size:11px;color:#94a3b8;padding-top:2px;">
        ${escapeHtml(t.footer)}
      </div>
    </div>
  `;
};

const savePngAsPdf = (img: string, fileStamp: string, imgWidthPx: number, imgHeightPx: number) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (imgHeightPx * imgW) / imgWidthPx;

  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(img, 'PNG', 0, position, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft > 2) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(img, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  pdf.save(`revenue-split-${fileStamp}.pdf`);
};

const openPrintFallback = (html: string, isAr: boolean) => {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=1200');
  if (!w) {
    throw new Error(isAr ? 'اسمح بالنوافذ المنبثقة لحفظ PDF' : 'Allow popups to save PDF');
  }
  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Revenue Split</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 10mm; }
    html, body { margin: 0; padding: 0; background: #f4f6fb; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>${html}
<script>
  window.onload = function () {
    setTimeout(function () { window.focus(); window.print(); }, 400);
  };
</script>
</body>
</html>`);
  w.document.close();
};

export const downloadRevenueSplitPdf = async (data: RevenueSplitPdfData) => {
  const fileStamp = new Date().toISOString().slice(0, 10);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  await ensureCairoFont();
  const html = buildReportHtml(data);

  if (isMobile) {
    openPrintFallback(html, data.isAr);
    return;
  }

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:980px',
    'opacity:0.01',
    'pointer-events:none',
    'z-index:2147483646',
    'background:#f4f6fb',
  ].join(';');
  host.innerHTML = html;
  document.body.appendChild(host);

  const root = host.querySelector('#rs-pdf-root') as HTMLElement;

  try {
    root.getBoundingClientRect();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const img = await toPng(root, {
      pixelRatio: 2,
      cacheBust: true,
      preferredFontFormat: 'woff2',
      style: { fontFamily: 'Cairo, Tahoma, Arial, sans-serif' },
    });

    const probe = new Image();
    await new Promise<void>((resolve, reject) => {
      probe.onload = () => resolve();
      probe.onerror = () => reject(new Error('image'));
      probe.src = img;
    });

    savePngAsPdf(img, fileStamp, probe.naturalWidth, probe.naturalHeight);
  } catch {
    openPrintFallback(html, data.isAr);
  } finally {
    document.body.removeChild(host);
  }
};
