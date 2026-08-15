import React, { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { ArrowRight, PieChart as PieIcon } from 'lucide-react';
import { useLang } from '../../contexts/LanguageContext';
import Header from '../layout/Header';

const SPLIT = [
  { key: 'salaries', labelAr: 'رواتب', labelEn: 'Salaries', pct: 0.5, color: '#007aff' },
  { key: 'rent', labelAr: 'إيجار', labelEn: 'Rent', pct: 0.18, color: '#5856d6' },
  { key: 'marketing', labelAr: 'تسويق', labelEn: 'Marketing', pct: 0.16, color: '#ff9500' },
  { key: 'profit', labelAr: 'ربح', labelEn: 'Profit', pct: 0.16, color: '#34c759' },
] as const;

const MATERIALS_COLOR = '#8e8e93';

const parseAmount = (v: string) => {
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const formatMoney = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

interface RevenueSplitPageProps {
  onBack: () => void;
}

const RevenueSplitPage: React.FC<RevenueSplitPageProps> = ({ onBack }) => {
  const { lang, tr } = useLang();
  const isAr = lang === 'ar';
  const [invoice, setInvoice] = useState('');
  const [materials, setMaterials] = useState('');

  const invoiceVal = parseAmount(invoice);
  const materialsVal = Math.min(parseAmount(materials), invoiceVal);
  const net = Math.max(0, invoiceVal - materialsVal);

  const slices = useMemo(() => {
    const rows: { name: string; value: number; color: string; pctOfInvoice: number; note: string }[] = [];
    if (materialsVal > 0) {
      rows.push({
        name: isAr ? 'تكاليف مواد خام' : 'Raw materials',
        value: materialsVal,
        color: MATERIALS_COLOR,
        pctOfInvoice: invoiceVal > 0 ? (materialsVal / invoiceVal) * 100 : 0,
        note: isAr ? 'من قيمة الفاتورة' : 'of invoice',
      });
    }
    SPLIT.forEach((s) => {
      const value = net * s.pct;
      rows.push({
        name: isAr ? s.labelAr : s.labelEn,
        value,
        color: s.color,
        pctOfInvoice: invoiceVal > 0 ? (value / invoiceVal) * 100 : 0,
        note: `${Math.round(s.pct * 100)}% ${isAr ? 'من الصافي' : 'of net'}`,
      });
    });
    return rows.filter((r) => r.value > 0.0001);
  }, [invoiceVal, materialsVal, net, isAr]);

  const breakdown = useMemo(
    () =>
      SPLIT.map((s) => ({
        ...s,
        label: isAr ? s.labelAr : s.labelEn,
        amount: net * s.pct,
      })),
    [net, isAr],
  );

  return (
    <div className="page revenue-split-page">
      <Header
        title={tr.toolRevenueSplit}
        subtitle={tr.toolRevenueSplitDesc}
        icon={<PieIcon size={20} strokeWidth={1.75} />}
        actions={
          <button type="button" className="btn-secondary revenue-split-back" onClick={onBack}>
            <ArrowRight size={16} />
            <span>{tr.backToTools}</span>
          </button>
        }
      />

      <div className="page-content revenue-split-content">
        <div className="revenue-split-layout">
          <div className="revenue-split-inputs">
            <div className="revenue-split-card">
              <h3>{isAr ? 'بيانات الإيراد' : 'Revenue inputs'}</h3>
              <label className="form-label">{isAr ? 'قيمة الفاتورة' : 'Invoice value'}</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
              />
              <label className="form-label" style={{ marginTop: 14 }}>
                {isAr ? 'تكاليف مواد الخام (إن وجدت)' : 'Raw material costs (optional)'}
              </label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
              />

              <div className="revenue-split-summary">
                <div className="revenue-split-summary-row">
                  <span>{isAr ? 'قيمة الفاتورة' : 'Invoice'}</span>
                  <strong>{formatMoney(invoiceVal)}</strong>
                </div>
                <div className="revenue-split-summary-row">
                  <span>{isAr ? 'تكاليف مواد خام' : 'Materials'}</span>
                  <strong>− {formatMoney(materialsVal)}</strong>
                </div>
                <div className="revenue-split-summary-row revenue-split-summary-net">
                  <span>{isAr ? 'الصافي للتوزيع' : 'Net to allocate'}</span>
                  <strong>{formatMoney(net)}</strong>
                </div>
              </div>

              <p className="revenue-split-hint">
                {isAr
                  ? 'الصافي يُوزَّع: 50% رواتب · 18% إيجار · 16% تسويق · 16% ربح'
                  : 'Net split: 50% salaries · 18% rent · 16% marketing · 16% profit'}
              </p>
            </div>

            <div className="revenue-split-card">
              <h3>{isAr ? 'توزيع الصافي' : 'Net allocation'}</h3>
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
            </div>
          </div>

          <div className="revenue-split-card revenue-split-chart-card">
            <h3>{isAr ? 'المخطط الدائري' : 'Distribution chart'}</h3>
            {invoiceVal > 0 && slices.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={100}
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
                {isAr ? 'أدخل قيمة الفاتورة لعرض التوزيع' : 'Enter an invoice value to see the chart'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueSplitPage;
