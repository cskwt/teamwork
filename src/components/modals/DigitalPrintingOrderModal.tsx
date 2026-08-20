import React, { useState } from 'react';
import { X, Printer } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { DigitalPrintingDetails, Order } from '../../types';
import { generateId } from '../../utils/helpers';
import { materialLabel, materialsOfKind } from '../../utils/materials';

interface DigitalPrintingOrderModalProps {
  onClose: () => void;
  /** When set, modal edits this existing Order Request */
  order?: Order;
  /** @deprecated Order Request is not tied to departments */
  departmentId?: string;
}

const PAPER_SOURCES = ['Drawer 1', 'Multipurpose', 'Paper Deck'] as const;
const SIDES = ['1 Side ( OFF )', '2 Sided ( Long )', '2 Sided ( Short )'] as const;
const COLOR_MODES = ['CMYK', 'Grayscale'] as const;
const OUTPUT_DELIVERIES = [
  'Face down - Normal order',
  'Face up - Normal order',
  'Face down - reversed order',
  'Face up - reversed order',
] as const;
const LAMINATIONS = ['No', 'Matte', 'Glossy'] as const;
const CUTTINGS = ['Cutter', 'Flatbed Graphtec', 'Roll Graphtec'] as const;

const toggleInList = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const ChipGroup: React.FC<{
  options: readonly string[];
  value: string | string[];
  multi?: boolean;
  onChange: (next: string | string[]) => void;
}> = ({ options, value, multi, onChange }) => (
  <div className="dp2-chips">
    {options.map((opt) => {
      const active = multi ? (value as string[]).includes(opt) : value === opt;
      return (
        <button
          key={opt}
          type="button"
          className={`dp2-chip${active ? ' active' : ''}`}
          onClick={() => {
            if (multi) onChange(toggleInList(value as string[], opt));
            else onChange(opt);
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const DigitalPrintingOrderModal: React.FC<DigitalPrintingOrderModalProps> = ({
  onClose,
  order,
}) => {
  const { state, dispatch } = useApp();
  const { currentUser, materials } = state;
  const materialOptions = materialsOfKind(materials, 'digital');
  const editing = !!order;
  const d = order?.digitalPrinting;

  const matchedMaterialId = (() => {
    if (!d) return '';
    const hit = materialOptions.find(
      (m) =>
        (m.paperType || m.name || '') === (d.paperType || '') &&
        (m.paperWeight || '') === (d.paperWeight || ''),
    );
    return hit?.id || '';
  })();

  const [orderNumber, setOrderNumber] = useState(order?.orderNumber || '');
  const [customer, setCustomer] = useState(order?.clientName || '');
  const [filePrintLocation, setFilePrintLocation] = useState(d?.filePrintLocation || '');
  const [productType, setProductType] = useState(d?.productType || '');
  const [quantity, setQuantity] = useState(d?.quantity || '');
  const [materialId, setMaterialId] = useState(matchedMaterialId);
  const [paperType, setPaperType] = useState(d?.paperType || '');
  const [paperWeight, setPaperWeight] = useState(d?.paperWeight || '');
  const [paperSize, setPaperSize] = useState(d?.paperSize || '');
  const [paperSource, setPaperSource] = useState(
    Array.isArray(d?.paperSource) ? d?.paperSource[0] || '' : d?.paperSource || '',
  );
  const [sidesPrinting, setSidesPrinting] = useState(d?.sidesPrinting || '');
  const [colorMode, setColorMode] = useState(d?.colorMode || '');
  const [outputDelivery, setOutputDelivery] = useState(d?.outputDelivery || '');
  const [lamination, setLamination] = useState(d?.lamination || 'No');
  const [cutting, setCutting] = useState<string[]>(d?.cutting ? [...d.cutting] : []);
  const [fileCutLocation, setFileCutLocation] = useState(d?.fileCutLocation || '');
  const [notes, setNotes] = useState(order?.notes || '');

  const buildDetails = (): DigitalPrintingDetails => ({
    filePrintLocation: filePrintLocation.trim(),
    productType: productType.trim(),
    quantity: quantity.trim(),
    paperType: paperType.trim(),
    paperWeight: paperWeight.trim(),
    paperSize: paperSize.trim(),
    paperSource,
    sidesPrinting,
    colorMode,
    outputDelivery: outputDelivery.trim(),
    lamination,
    cutting: [...cutting],
    fileCutLocation: fileCutLocation.trim(),
  });

  const detailsSummary = (d: DigitalPrintingDetails) =>
    [
      d.productType && `Product: ${d.productType}`,
      d.quantity && `Qty: ${d.quantity}`,
      d.paperType && `Paper: ${d.paperType}`,
      d.paperWeight && `Weight: ${d.paperWeight}`,
      d.paperSize && `Size: ${d.paperSize}`,
      d.paperSource && `Source: ${d.paperSource}`,
      d.sidesPrinting && `Sides: ${d.sidesPrinting}`,
      d.colorMode && `Color: ${d.colorMode}`,
      d.outputDelivery && `Output: ${d.outputDelivery}`,
      d.lamination && `Lamination: ${d.lamination}`,
      d.cutting?.length && `Cutting: ${d.cutting.join(', ')}`,
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
        digitalPrinting: details,
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
      tags: ['Digital Printing · طباعة رقمية'],
      comments: [],
      history: [],
      notes: notes.trim(),
      digitalPrinting: details,
      isOrderRequest: true,
    };
    dispatch({ type: 'ADD_ORDER_REQUEST', payload: newOrder });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box dp2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dp2-header">
          <div className="dp2-header-title">
            <span className="dp2-header-icon"><Printer size={18} /></span>
            <div>
              <h2>Digital Printing</h2>
              <p>{editing ? 'Edit order · تعديل الطلبية' : 'Order details · تفاصيل الطباعة الرقمية'}</p>
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
                <input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="A4 Envelope" />
              </label>
              <label className="dp2-field">
                <span>Quantity</span>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="100 pcs" />
              </label>
            </div>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Media</h3>
            <label className="dp2-field">
              <span>Select material</span>
              <select
                value={materialId}
                onChange={(e) => {
                  const id = e.target.value;
                  setMaterialId(id);
                  const mat = materialOptions.find((m) => m.id === id);
                  setPaperType(mat?.paperType || mat?.name || '');
                  setPaperWeight(mat?.paperWeight || '');
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
            <div className="dp2-grid-3">
              <label className="dp2-field">
                <span>Paper type</span>
                <input value={paperType} readOnly placeholder="Ready made Envelope" />
              </label>
              <label className="dp2-field">
                <span>Paper weight</span>
                <input value={paperWeight} readOnly placeholder="100 GSM" />
              </label>
              <label className="dp2-field">
                <span>Paper Size</span>
                <input value={paperSize} onChange={(e) => setPaperSize(e.target.value)} placeholder="30.5 x 25.5 cm" />
              </label>
            </div>
            <div className="dp2-field">
              <span>Paper source</span>
              <ChipGroup
                options={PAPER_SOURCES}
                value={paperSource}
                onChange={(v) => setPaperSource(v as string)}
              />
            </div>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Layout</h3>
            <div className="dp2-field">
              <span>Sides Printing</span>
              <ChipGroup
                options={SIDES}
                value={sidesPrinting}
                onChange={(v) => setSidesPrinting(v as string)}
              />
            </div>
            <div className="dp2-field">
              <span>Color Mode</span>
              <ChipGroup
                options={COLOR_MODES}
                value={colorMode}
                onChange={(v) => setColorMode(v as string)}
              />
            </div>
          </section>

          <section className="dp2-card">
            <h3 className="dp2-card-title">Finish</h3>
            <div className="dp2-field">
              <span>Output Delivery</span>
              <ChipGroup
                options={OUTPUT_DELIVERIES}
                value={outputDelivery}
                onChange={(v) => setOutputDelivery(v as string)}
              />
            </div>
            <div className="dp2-field">
              <span>Lamination</span>
              <ChipGroup
                options={LAMINATIONS}
                value={lamination}
                onChange={(v) => setLamination(v as string)}
              />
            </div>
            <div className="dp2-field">
              <span>Cutting</span>
              <ChipGroup
                multi
                options={CUTTINGS}
                value={cutting}
                onChange={(v) => setCutting(v as string[])}
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

export default DigitalPrintingOrderModal;
