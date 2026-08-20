import React, { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { ArrowRight, Download, PieChart as PieIcon, Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import Header from '../layout/Header';
import { downloadRevenueSplitPdf } from '../../utils/revenueSplitPdf';
import { generateId, normalizeAmountInput, toWesternDigits } from '../../utils/helpers';

const SPLIT = [
  { key: 'salaries', labelAr: 'رواتب', labelEn: 'Salaries', pct: 0.5, color: '#007aff' },
  { key: 'rent', labelAr: 'إيجار', labelEn: 'Rent', pct: 0.25, color: '#5856d6' },
  { key: 'marketing', labelAr: 'تسويق', labelEn: 'Marketing', pct: 0.1, color: '#ff9500' },
  { key: 'profit', labelAr: 'ربح', labelEn: 'Profit', pct: 0.15, color: '#34c759' },
] as const;

const MATERIALS_COLOR = '#8e8e93';

type OrderDraft = {
  id: string;
  clientName: string;
  invoice: string;
  materials: string;
};

const emptyRow = (): OrderDraft => ({
  id: generateId(),
  clientName: '',
  invoice: '',
  materials: '',
});

const parseAmount = (v: string) => {
  const n = parseFloat(toWesternDigits(String(v)).trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const formatMoney = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const calcRow = (row: OrderDraft) => {
  const invoice = parseAmount(row.invoice);
  const materials = Math.min(parseAmount(row.materials), invoice);
  const net = Math.max(0, invoice - materials);
  return {
    invoice,
    materials,
    net,
    salaries: net * 0.5,
    rent: net * 0.25,
    marketing: net * 0.1,
    profit: net * 0.15,
  };
};

interface RevenueSplitPageProps {
  onBack: () => void;
}

const RevenueSplitPage: React.FC<RevenueSplitPageProps> = ({ onBack }) => {
  const { lang, tr } = useLang();
  const isAr = lang === 'ar';
  const [rows, setRows] = useState<OrderDraft[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [downloading, setDownloading] = useState(false);

  const computed = useMemo(() => rows.map((row) => ({ row, ...calcRow(row) })), [rows]);

  const totals = useMemo(
    () =>
      computed.reduce(
        (acc, r) => ({
          invoice: acc.invoice + r.invoice,
          materials: acc.materials + r.materials,
          net: acc.net + r.net,
          salaries: acc.salaries + r.salaries,
          rent: acc.rent + r.rent,
          marketing: acc.marketing + r.marketing,
          profit: acc.profit + r.profit,
          count: acc.count + (r.invoice > 0 ? 1 : 0),
        }),
        { invoice: 0, materials: 0, net: 0, salaries: 0, rent: 0, marketing: 0, profit: 0, count: 0 },
      ),
    [computed],
  );

  const slices = useMemo(() => {
    const list: { name: string; value: number; color: string; note: string }[] = [];
    if (totals.materials > 0) {
      list.push({
        name: isAr ? 'تكاليف مواد خام' : 'Raw materials',
        value: totals.materials,
        color: MATERIALS_COLOR,
        note: isAr ? 'من إجمالي الفواتير' : 'of total invoices',
      });
    }
    SPLIT.forEach((s) => {
      const value = totals.net * s.pct;
      if (value > 0.0001) {
        list.push({
          name: isAr ? s.labelAr : s.labelEn,
          value,
          color: s.color,
          note: `${Math.round(s.pct * 100)}% ${isAr ? 'من الصافي' : 'of net'}`,
        });
      }
    });
    return list;
  }, [totals, isAr]);

  const breakdown = useMemo(
    () =>
      SPLIT.map((s) => ({
        ...s,
        label: isAr ? s.labelAr : s.labelEn,
        amount: totals.net * s.pct,
      })),
    [totals.net, isAr],
  );

  const updateRow = (id: string, patch: Partial<OrderDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? [emptyRow()] : prev.filter((r) => r.id !== id)));
  };

  const handleDownload = async () => {
    if (totals.invoice <= 0 || downloading) return;
    setDownloading(true);
    try {
      const orderRows = computed
        .filter((c) => c.invoice > 0)
        .map((c) => ({
          clientName: c.row.clientName.trim(),
          invoice: c.invoice,
          materials: c.materials,
          net: c.net,
          salaries: c.salaries,
          rent: c.rent,
          marketing: c.marketing,
          profit: c.profit,
        }));

      await downloadRevenueSplitPdf({
        isAr,
        orders: orderRows,
        invoice: totals.invoice,
        materials: totals.materials,
        net: totals.net,
        breakdown: breakdown.map((row) => ({
          label: row.label,
          note: `${Math.round(row.pct * 100)}% ${isAr ? 'من الصافي' : 'of net'}`,
          amount: row.amount,
          color: row.color,
          pct: row.pct,
        })),
        slices: slices.map((s) => ({
          label: s.name,
          note: s.note,
          amount: s.value,
          color: s.color,
          pct: totals.invoice > 0 ? s.value / totals.invoice : 0,
        })),
      });
    } catch (err) {
      console.error(err);
      alert(isAr ? 'تعذّر إنشاء ملف PDF' : 'Could not create PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page revenue-split-page">
      <Header
        title={tr.toolRevenueSplit}
        subtitle={tr.toolRevenueSplitDesc}
        icon={<PieIcon size={20} strokeWidth={1.75} />}
        actions={
          <div className="revenue-split-header-actions">
            <button
              type="button"
              className="btn-primary revenue-split-download"
              onClick={handleDownload}
              disabled={totals.invoice <= 0 || downloading}
            >
              <Download size={16} />
              <span>
                {downloading
                  ? isAr
                    ? 'جاري إنشاء PDF...'
                    : 'Creating PDF...'
                  : isAr
                    ? 'تحميل PDF'
                    : 'Download PDF'}
              </span>
            </button>
            <button type="button" className="btn-secondary revenue-split-back" onClick={onBack}>
              <ArrowRight size={16} />
              <span>{tr.backToTools}</span>
            </button>
          </div>
        }
      />

      <div className="page-content revenue-split-content">
        <div className="revenue-split-toolbar">
          <p className="revenue-split-hint revenue-split-hint-inline">
            {isAr
              ? 'أضف عدة طلبيات في الجدول — الصافي يُوزَّع: 50% رواتب · 25% إيجار · 10% تسويق · 15% ربح'
              : 'Add multiple orders in the table — net split: 50% salaries · 25% rent · 10% marketing · 15% profit'}
          </p>
          <button type="button" className="btn-secondary" onClick={addRow}>
            <Plus size={16} />
            <span>{isAr ? 'إضافة طلبية' : 'Add order'}</span>
          </button>
        </div>

        <div className="revenue-split-card revenue-split-orders-card">
          <div className="revenue-split-orders-scroll">
            <table className="rs-orders-table" dir={isAr ? 'rtl' : 'ltr'}>
              <thead>
                <tr>
                  <th className="rs-col-idx">#</th>
                  <th className="rs-col-client">{tr.costClient}</th>
                  <th className="rs-col-num">{tr.costInvoiceValue}</th>
                  <th className="rs-col-num">{isAr ? 'مواد خام' : 'Materials'}</th>
                  <th className="rs-col-num">{isAr ? 'الصافي' : 'Net'}</th>
                  <th className="rs-col-num rs-col-salaries">{isAr ? 'رواتب 50%' : 'Salaries 50%'}</th>
                  <th className="rs-col-num rs-col-rent">{isAr ? 'إيجار 25%' : 'Rent 25%'}</th>
                  <th className="rs-col-num rs-col-mkt">{isAr ? 'تسويق 10%' : 'Marketing 10%'}</th>
                  <th className="rs-col-num rs-col-profit">{isAr ? 'ربح 15%' : 'Profit 15%'}</th>
                  <th className="rs-col-actions" />
                </tr>
              </thead>
              <tbody>
                {computed.map((c, idx) => (
                  <tr key={c.row.id}>
                    <td className="rs-col-idx">{idx + 1}</td>
                    <td>
                      <input
                        className="rs-input"
                        type="text"
                        placeholder={isAr ? 'اسم العميل' : 'Client'}
                        value={c.row.clientName}
                        onChange={(e) => updateRow(c.row.id, { clientName: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="rs-input rs-num"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={c.row.invoice}
                        onChange={(e) =>
                          updateRow(c.row.id, { invoice: normalizeAmountInput(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="rs-input rs-num"
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={c.row.materials}
                        onChange={(e) =>
                          updateRow(c.row.id, { materials: normalizeAmountInput(e.target.value) })
                        }
                      />
                    </td>
                    <td className="rs-calc rs-net">{formatMoney(c.net)}</td>
                    <td className="rs-calc" style={{ color: '#007aff' }}>{formatMoney(c.salaries)}</td>
                    <td className="rs-calc" style={{ color: '#5856d6' }}>{formatMoney(c.rent)}</td>
                    <td className="rs-calc" style={{ color: '#ff9500' }}>{formatMoney(c.marketing)}</td>
                    <td className="rs-calc" style={{ color: '#34c759' }}>{formatMoney(c.profit)}</td>
                    <td className="rs-col-actions">
                      <button
                        type="button"
                        className="rs-del-btn"
                        title={isAr ? 'حذف' : 'Delete'}
                        onClick={() => removeRow(c.row.id)}
                        disabled={rows.length <= 1}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rs-total-row">
                  <td />
                  <td>
                    {isAr ? `المجموع (${totals.count} طلبية)` : `Total (${totals.count} orders)`}
                  </td>
                  <td className="rs-calc">{formatMoney(totals.invoice)}</td>
                  <td className="rs-calc">{formatMoney(totals.materials)}</td>
                  <td className="rs-calc rs-net">{formatMoney(totals.net)}</td>
                  <td className="rs-calc" style={{ color: '#007aff' }}>{formatMoney(totals.salaries)}</td>
                  <td className="rs-calc" style={{ color: '#5856d6' }}>{formatMoney(totals.rent)}</td>
                  <td className="rs-calc" style={{ color: '#ff9500' }}>{formatMoney(totals.marketing)}</td>
                  <td className="rs-calc" style={{ color: '#34c759' }}>{formatMoney(totals.profit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="revenue-split-layout revenue-split-layout-bottom">
          <div className="revenue-split-card">
            <h3>{isAr ? 'توزيع الصافي الإجمالي' : 'Total net allocation'}</h3>
            <div className="revenue-split-table">
              {breakdown.map((row) => (
                <div key={row.key} className="revenue-split-table-row">
                  <span className="revenue-split-dot" style={{ background: row.color }} />
                  <span className="revenue-split-table-name">
                    {row.label}
                    <small>{Math.round(row.pct * 100)}%</small>
                  </span>
                  <strong>{formatMoney(row.amount)}</strong>
                </div>
              ))}
            </div>
            <div className="revenue-split-summary" style={{ marginTop: 16 }}>
              <div className="revenue-split-summary-row">
                <span>{isAr ? 'إجمالي الفواتير' : 'Total invoices'}</span>
                <strong>{formatMoney(totals.invoice)}</strong>
              </div>
              <div className="revenue-split-summary-row">
                <span>{isAr ? 'إجمالي المواد' : 'Total materials'}</span>
                <strong>− {formatMoney(totals.materials)}</strong>
              </div>
              <div className="revenue-split-summary-row revenue-split-summary-net">
                <span>{isAr ? 'الصافي للتوزيع' : 'Net to allocate'}</span>
                <strong>{formatMoney(totals.net)}</strong>
              </div>
            </div>
          </div>

          <div className="revenue-split-card revenue-split-chart-card">
            <h3>{isAr ? 'المخطط الدائري (الإجمالي)' : 'Distribution chart (totals)'}</h3>
            {totals.invoice > 0 && slices.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={92}
                      paddingAngle={2}
                      label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [formatMoney(Number(value ?? 0)), String(name ?? '')]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={10}
                      formatter={(v) => <span style={{ fontSize: 12, color: '#374151' }}>{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="revenue-split-legend-detail">
                  {slices.map((s) => (
                    <div key={s.name} className="revenue-split-legend-row">
                      <span className="revenue-split-dot" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <span className="muted">{s.note}</span>
                      <strong>{formatMoney(s.value)}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="revenue-split-empty">
                {isAr
                  ? 'أدخل قيم الفواتير في الجدول لعرض التوزيع'
                  : 'Enter invoice values in the table to see the chart'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueSplitPage;
