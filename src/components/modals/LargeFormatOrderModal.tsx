import React, { useState } from 'react';
import { X, Printer } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { LargeFormatDetails, Order } from '../../types';
import { generateId } from '../../utils/helpers';
import { materialLabel, materialsOfKind } from '../../utils/materials';

interface LargeFormatOrderModalProps {
  onClose: () => void;
  /** When set, modal edits this existing Order Request */
  order?: Order;
  /** @deprecated Order Request is not tied to departments */
  departmentId?: string;
}

const LAMINATIONS = ['No', 'Matte', 'Glossy'] as const;
const CUTTINGS = ['Cutter', 'Flatbed Graphtec', 'Roll Graphtec'] as const;

const ChipGroup: React.FC<{
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="dp2-chips">
    {options.map((opt) => {
      const active = value === opt;
      return (
        <button
          key={opt}
          type="button"
          className={`dp2-chip${active ? ' active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const LargeFormatOrderModal: React.FC<LargeFormatOrderModalProps> = ({
  onClose,
  order,
}) => {
  const { state, dispatch } = useApp();
  const { currentUser, materials } = state;
  const materialOptions = materialsOfKind(materials, 'large-format');
  const editing = !!order;
  const lf = order?.largeFormat;

  const matchedMaterialId = (() => {
    if (!lf) return '';
    const hit = materialOptions.find(
      (m) =>
        (m.rollType || m.name || '') === (lf.material || '') &&
        (m.rollWidth || '') === (lf.rollWidth || ''),
    );
    return hit?.id || '';
  })();

  const [orderNumber, setOrderNumber] = useState(order?.orderNumber || '');
  const [customer, setCustomer] = useState(order?.clientName || '');
  const [filePrintLocation, setFilePrintLocation] = useState(lf?.filePrintLocation || '');
  const [productType, setProductType] = useState(lf?.productType || '');
  const [quantity, setQuantity] = useState(lf?.quantity || '');
  const [materialId, setMaterialId] = useState(matchedMaterialId);
  const [material, setMaterial] = useState(lf?.material || '');
  const [rollWidth, setRollWidth] = useState(lf?.rollWidth || '');
  const [resolution, setResolution] = useState(lf?.resolution || '');
  const [lamination, setLamination] = useState(lf?.lamination || 'No');
  const [cutting, setCutting] = useState(lf?.cutting || '');
  const [fileCutLocation, setFileCutLocation] = useState(lf?.fileCutLocation || '');
  const [notes, setNotes] = useState(order?.notes || '');

  const buildDetails = (): LargeFormatDetails => ({
    filePrintLocation: filePrintLocation.trim(),
    productType: productType.trim(),
    quantity: quantity.trim(),
    material: material.trim(),
    rollWidth: rollWidth.trim(),
    resolution: resolution.trim(),
    lamination,
    cutting,
    fileCutLocation: fileCutLocation.trim(),
  });

  const detailsSummary = (d: LargeFormatDetails) =>
    [
      d.productType && `Product: ${d.productType}`,
      d.quantity && `Qty: ${d.quantity}`,
      d.material && `Roll: ${d.material}`,
      d.rollWidth && `Width: ${d.rollWidth}`,
      d.resolution && `Resolution: ${d.resolution}`,
      d.lamination && `Lamination: ${d.lamination}`,
      d.cutting && `Cutting: ${d.cutting}`,
    ]
      .filter(Boolean)
      .join(' · ');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !customer.trim() || !currentUser) {
      alert('أدخل رقم الطلبية واسم العميل');
      return;
    }
    const details = buildDetails();
    const now = new Date().toISOString();

    if (editing && order) {
      const updated: Order = {
        ...order,
        orderNumber: orderNumber.trim(),
        clientName: customer.trim(),
        title: `#${orderNumber.trim()} - ${customer.trim()}`,
        description: detailsSummary(details),
        notes: notes.trim(),
        largeFormat: details,
        isOrderRequest: true,
        updatedAt: now,
      };
      dispatch({ type: 'UPDATE_ORDER_REQUEST', payload: updated });
      onClose();
      return;
    }

    const newOrder: Order = {
      id: generateId(),
      orderNumber: orderNumber.trim(),
      clientName: customer.trim(),
      title: `#${orderNumber.trim()} - ${customer.trim()}`,
      description: detailsSummary(details),
      status: 'new',
      priority: 'medium',
      departmentId: '',
      departmentIds: [],
      assignedUsers: [],
      createdBy: currentUser.id,
      createdAt: now,
      orderDate: now,
      updatedAt: now,
      orderForms: [],
      fileExtensions: '',
      tags: ['Large Format · الطباعة الكبيرة'],
      comments: [],
      history: [],
      notes: notes.trim(),
      largeFormat: details,
      isOrderRequest: true,
    };
    dispatch({ type: 'ADD_ORDER_REQUEST', payload: newOrder });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box dp2-modal lf2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dp2-header">
          <div className="dp2-header-title">
            <span className="dp2-header-icon"><Printer size={18} /></span>
            <div>
              <h2>Large Format</h2>
              <p>{editing ? 'Edit order · تعديل الطلبية' : 'Printing details · تفاصيل الطباعة الكبيرة'}</p>
            </div>
          </div>
          <button type="button" className="dp2-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="dp2-form" onSubmit={handleSubmit}>
          <section className="dp2-card">
            <h3 className="dp2-card-title">General</h3>
            <div className="dp2-grid-2">
              <label className="dp2-field">
                <span>Order No.</span>
                <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. 4521" required />
              </label>
              <label className="dp2-field">
                <span>Customer</span>
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Customer name" required />
              </label>
            </div>
            <label className="dp2-field">
              <span>File Print Location</span>
              <input
                value={filePrintLocation}
                onChange={(e) => setFilePrintLocation(e.target.value)}
                placeholder="/Volumes/CS Drive/CS Clients/..."
              />
            </label>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Job Info</h3>
            <div className="dp2-grid-2">
              <label className="dp2-field">
                <span>Product type</span>
                <input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="Roll up" />
              </label>
              <label className="dp2-field">
                <span>Quantity</span>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1 piece" />
              </label>
              <label className="dp2-field">
                <span>Resolution</span>
                <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="10 Pass" />
              </label>
            </div>
            <label className="dp2-field">
              <span>Select material</span>
              <select
                value={materialId}
                onChange={(e) => {
                  const id = e.target.value;
                  setMaterialId(id);
                  const mat = materialOptions.find((m) => m.id === id);
                  setMaterial(mat?.rollType || mat?.name || '');
                  setRollWidth(mat?.rollWidth || '');
                }}
              >
                <option value="">Select material</option>
                {materialOptions.map((m) => (
                  <option key={m.id} value={m.id}>{materialLabel(m)}</option>
                ))}
              </select>
              {materialOptions.length === 0 && (
                <small className="dp2-field-hint">No materials yet — add them via the Material button</small>
              )}
            </label>
            <div className="dp2-grid-2">
              <label className="dp2-field">
                <span>Roll type</span>
                <input value={material} readOnly placeholder="Greyback roll up" />
              </label>
              <label className="dp2-field">
                <span>Roll width</span>
                <input value={rollWidth} readOnly placeholder="120 cm" />
              </label>
            </div>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Finish</h3>
            <div className="dp2-field">
              <span>Lamination</span>
              <ChipGroup
                options={LAMINATIONS}
                value={lamination}
                onChange={setLamination}
              />
            </div>
            <div className="dp2-field">
              <span>Cutting</span>
              <ChipGroup
                options={CUTTINGS}
                value={cutting}
                onChange={setCutting}
              />
            </div>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Cut File</h3>
            <label className="dp2-field">
              <span>File Cut Location</span>
              <textarea
                value={fileCutLocation}
                onChange={(e) => setFileCutLocation(e.target.value)}
                rows={3}
                placeholder="Path to cut file..."
              />
            </label>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Notes</h3>
            <label className="dp2-field">
              <span>Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Extra notes..."
              />
            </label>
          </section>

          <div className="dp2-actions">
            <button type="button" className="dp2-btn-cancel" onClick={onClose}>Close</button>
            <button type="submit" className="dp2-btn-save">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LargeFormatOrderModal;
