import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import { ManufacturingType, OrderCostRow } from '../../types';
import { generateId } from '../../utils/helpers';
import Header from '../layout/Header';

const normalizeManufacturing = (v: string): ManufacturingType => {
  if (v === 'In House' || v === 'في المطبعة') return 'في المطبعة';
  if (v === 'Out Source' || v === 'خارجي') return 'خارجي';
  return '';
};

const normalizeRow = (r: OrderCostRow): OrderCostRow => ({
  ...r,
  invoiceNumber: r.invoiceNumber || '',
  invoiceValue: r.invoiceValue || '',
  manufacturing: normalizeManufacturing(r.manufacturing || ''),
  paid: !!r.paid,
});

const rowHasData = (
  r: Pick<OrderCostRow, 'client' | 'invoiceNumber' | 'invoiceValue' | 'amount' | 'costs' | 'notes' | 'manufacturing'>,
) =>
  !!(
    r.client ||
    r.invoiceNumber ||
    r.invoiceValue ||
    r.amount ||
    r.costs ||
    r.notes ||
    r.manufacturing
  );

const onlyFilledRows = (rows: OrderCostRow[]) => rows.map(normalizeRow).filter(rowHasData);

const parseNum = (v: string) => {
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const formatNum = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

/** الصافي = قيمة الفاتورة − تكلفة التصنيع (مع توافق للصفوف القديمة بدون قيمة فاتورة) */
const rowNet = (r: Pick<OrderCostRow, 'invoiceValue' | 'amount' | 'costs'>) => {
  const base = r.invoiceValue?.trim() ? parseNum(r.invoiceValue) : parseNum(r.amount);
  return base - parseNum(r.costs);
};

type FormState = {
  client: string;
  invoiceNumber: string;
  invoiceValue: string;
  amount: string;
  costs: string;
  manufacturing: ManufacturingType;
  notes: string;
  paid: boolean;
};

const emptyForm = (): FormState => ({
  client: '',
  invoiceNumber: '',
  invoiceValue: '',
  amount: '',
  costs: '',
  manufacturing: '',
  notes: '',
  paid: false,
});

const formFromRow = (r: OrderCostRow): FormState => ({
  client: r.client || '',
  invoiceNumber: r.invoiceNumber || '',
  invoiceValue: r.invoiceValue || '',
  amount: r.amount || '',
  costs: r.costs || '',
  manufacturing: normalizeManufacturing(r.manufacturing || ''),
  notes: r.notes || '',
  paid: !!r.paid,
});

const OrderCostsPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { tr } = useLang();
  const stored = useMemo(() => state.orderCostRows || [], [state.orderCostRows]);
  const [rows, setRows] = useState<OrderCostRow[]>(() => onlyFilledRows(stored));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    const filled = onlyFilledRows(stored);
    setRows(filled);
    if (filled.length !== stored.length) {
      const now = new Date().toISOString();
      dispatch({
        type: 'SET_ORDER_COST_ROWS',
        payload: filled.map((r) => ({ ...r, updatedAt: r.updatedAt || now })),
      });
    }
  }, [stored, dispatch]);

  const persist = (next: OrderCostRow[]) => {
    const filled = onlyFilledRows(next);
    setRows(filled);
    const now = new Date().toISOString();
    // Always bump updatedAt on every persist so deletes win over stale server rows
    const stamped = filled.map((r) => ({ ...r, updatedAt: now }));
    dispatch({ type: 'SET_ORDER_COST_ROWS', payload: stamped });
  };

  const updateRow = (id: string, patch: Partial<OrderCostRow>) => {
    const now = new Date().toISOString();
    persist(rows.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: now } : r)));
  };

  const removeRow = (id: string) => {
    persist(rows.filter((r) => r.id !== id));
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEditModal = (r: OrderCostRow) => {
    setEditingId(r.id);
    setForm(formFromRow(r));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const saveForm = () => {
    const hasData = !!(
      form.client.trim() ||
      form.invoiceNumber.trim() ||
      form.invoiceValue.trim() ||
      form.amount.trim() ||
      form.costs.trim() ||
      form.notes.trim() ||
      form.manufacturing
    );
    if (!hasData) return;

    const now = new Date().toISOString();
    const payload = {
      client: form.client.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      invoiceValue: form.invoiceValue.trim(),
      amount: form.amount.trim(),
      costs: form.costs.trim(),
      manufacturing: form.manufacturing,
      notes: form.notes.trim(),
      paid: !!form.paid,
      updatedAt: now,
    };

    if (editingId) {
      persist(rows.map((r) => (r.id === editingId ? { ...r, ...payload } : r)));
    } else {
      persist([{ id: generateId(), ...payload }, ...rows]);
    }
    closeModal();
  };

  const formNet = rowNet(form);

  const totals = useMemo(() => {
    const invoiceValue = rows.reduce((s, r) => s + parseNum(r.invoiceValue), 0);
    const amount = rows.reduce((s, r) => s + parseNum(r.amount), 0);
    const costs = rows.reduce((s, r) => s + parseNum(r.costs), 0);
    const net = rows.reduce((s, r) => s + rowNet(r), 0);
    return { invoiceValue, amount, costs, net };
  }, [rows]);

  const mfgOptions: { value: ManufacturingType; label: string }[] = [
    { value: 'في المطبعة', label: tr.costMfgInHouse },
    { value: 'خارجي', label: tr.costMfgExternal },
  ];

  return (
    <div className="page">
      <Header
        title={tr.orderCosts}
        icon={<Calculator size={20} />}
        actions={
          <button type="button" className="orq-mini-btn" style={{ background: '#2563eb' }} onClick={openAddModal}>
            <Plus size={14} />
            <span>{tr.addOrderCost}</span>
          </button>
        }
      />
      <div className="page-content">
        <div className="table-card oc-card">
          <div className="orders-table-wrap">
            <table className="oc-table">
              <colgroup>
                <col className="oc-col-client" />
                <col className="oc-col-narrow" />
                <col className="oc-col-narrow" />
                <col className="oc-col-narrow" />
                <col className="oc-col-narrow" />
                <col className="oc-col-mfg" />
                <col className="oc-col-narrow" />
                <col className="oc-col-notes" />
                <col className="oc-col-paid-w" />
                <col className="oc-col-actions-w" />
              </colgroup>
              <thead>
                <tr>
                  <th>{tr.costClient}</th>
                  <th>{tr.costInvoice}</th>
                  <th>{tr.costInvoiceValue}</th>
                  <th>{tr.costAmount}</th>
                  <th>{tr.costCosts}</th>
                  <th>{tr.costManufacturing}</th>
                  <th>{tr.costNet}</th>
                  <th>{tr.costNotes}</th>
                  <th>{tr.costPaid}</th>
                  <th className="oc-col-actions" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: 28, color: '#9ca3af', textAlign: 'center' }}>
                      {tr.orderCostsEmpty}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const net = rowNet(r);
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            className="oc-input"
                            value={r.client}
                            onChange={(e) => updateRow(r.id, { client: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="oc-input"
                            value={r.invoiceNumber}
                            onChange={(e) => updateRow(r.id, { invoiceNumber: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="oc-input oc-num"
                            inputMode="decimal"
                            value={r.invoiceValue}
                            onChange={(e) => updateRow(r.id, { invoiceValue: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="oc-input oc-num"
                            inputMode="decimal"
                            value={r.amount}
                            onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="oc-input oc-num"
                            inputMode="decimal"
                            value={r.costs}
                            onChange={(e) => updateRow(r.id, { costs: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            className="oc-input oc-select"
                            value={normalizeManufacturing(r.manufacturing)}
                            onChange={(e) =>
                              updateRow(r.id, { manufacturing: e.target.value as ManufacturingType })
                            }
                          >
                            <option value="">—</option>
                            {mfgOptions.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className={`oc-net${net < 0 ? ' neg' : ''}`}>
                          {formatNum(net)}
                        </td>
                        <td>
                          <input
                            className="oc-input"
                            value={r.notes}
                            onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                          />
                        </td>
                        <td className="oc-col-paid">
                          <button
                            type="button"
                            className={`oc-paid-btn${r.paid ? ' paid' : ''}`}
                            title={tr.costPaid}
                            aria-pressed={!!r.paid}
                            onClick={() => updateRow(r.id, { paid: !r.paid })}
                          >
                            {r.paid ? <Check size={16} strokeWidth={3} /> : null}
                          </button>
                        </td>
                        <td className="oc-col-actions">
                          <div className="oc-row-actions">
                            <button
                              type="button"
                              className="oc-edit-btn"
                              title={tr.edit}
                              onClick={() => openEditModal(r)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="oc-del-btn"
                              title={tr.delete}
                              onClick={() => removeRow(r.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="oc-total-row">
                  <td>{tr.costTotal}</td>
                  <td />
                  <td>{formatNum(totals.invoiceValue)}</td>
                  <td>{formatNum(totals.amount)}</td>
                  <td>{formatNum(totals.costs)}</td>
                  <td />
                  <td>{formatNum(totals.net)}</td>
                  <td />
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-panel oc-modal" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="oc-modal-header">
              <h2>{editingId ? tr.editOrderCost : tr.addOrderCost}</h2>
              <button type="button" className="modal-close-corner" onClick={closeModal} aria-label={tr.cancelOrderCost}>
                <X size={16} />
              </button>
            </div>
            <div className="oc-modal-body">
              <label className="oc-field">
                <span>{tr.costClient}</span>
                <input
                  value={form.client}
                  onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                  autoFocus
                />
              </label>
              <label className="oc-field">
                <span>{tr.costInvoice}</span>
                <input
                  value={form.invoiceNumber}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                />
              </label>
              <label className="oc-field">
                <span>{tr.costInvoiceValue}</span>
                <input
                  className="oc-num"
                  inputMode="decimal"
                  value={form.invoiceValue}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceValue: e.target.value }))}
                />
              </label>
              <label className="oc-field">
                <span>{tr.costAmount}</span>
                <input
                  className="oc-num"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </label>
              <label className="oc-field">
                <span>{tr.costCosts}</span>
                <input
                  className="oc-num"
                  inputMode="decimal"
                  value={form.costs}
                  onChange={(e) => setForm((f) => ({ ...f, costs: e.target.value }))}
                />
              </label>
              <div className="oc-field">
                <span>{tr.costManufacturing}</span>
                <div className="oc-mfg-options">
                  {mfgOptions.map((m) => (
                    <label key={m.value} className={`oc-mfg-chip${form.manufacturing === m.value ? ' active' : ''}`}>
                      <input
                        type="radio"
                        name="manufacturing"
                        checked={form.manufacturing === m.value}
                        onChange={() => setForm((f) => ({ ...f, manufacturing: m.value }))}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="oc-field">
                <span>{tr.costNet}</span>
                <input className="oc-num" value={formatNum(formNet)} readOnly />
              </label>
              <label className="oc-field">
                <span>{tr.costNotes}</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <label className={`oc-paid-field${form.paid ? ' active' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
                />
                <span className="oc-paid-box">{form.paid ? <Check size={14} strokeWidth={3} /> : null}</span>
                <span>{tr.costPaid}</span>
              </label>
            </div>
            <div className="oc-modal-footer">
              <button type="button" className="oc-btn-secondary" onClick={closeModal}>
                {tr.cancelOrderCost}
              </button>
              <button type="button" className="oc-btn-primary" onClick={saveForm}>
                {tr.saveOrderCost}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderCostsPage;
