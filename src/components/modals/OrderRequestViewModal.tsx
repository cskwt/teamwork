import React from 'react';
import { X, Printer } from 'lucide-react';
import { Order } from '../../types';

interface OrderRequestViewModalProps {
  order: Order;
  onClose: () => void;
}

const Section: React.FC<{ title: string; rows: [string, string | undefined][] }> = ({ title, rows }) => {
  const visible = rows.filter(([, v]) => !!v && String(v).trim());
  if (!visible.length) return null;
  return (
    <section className="orqv-card">
      <h3 className="orqv-card-title">{title}</h3>
      <dl className="orqv-grid">
        {visible.map(([label, value]) => (
          <div key={label} className="orqv-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const OrderRequestViewModal: React.FC<OrderRequestViewModalProps> = ({ order, onClose }) => {
  const isDigital = !!order.digitalPrinting;
  const isLarge = !!order.largeFormat;
  const theme = isDigital ? 'digital' : isLarge ? 'large' : 'neutral';
  const d = order.digitalPrinting;
  const lf = order.largeFormat;

  const title = isDigital
    ? 'Digital Printing Details'
    : isLarge
      ? 'Large Format Details'
      : 'Order Request';

  const subtitle = isDigital
    ? 'Digital · Order request'
    : isLarge
      ? 'Large Format · Order request'
      : 'Order request';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-box dp2-modal orqv-modal orqv-${theme}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dp2-header">
          <div className="dp2-header-title">
            <span className="dp2-header-icon"><Printer size={18} /></span>
            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>
          <button type="button" className="dp2-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="dp2-form orqv-body">
          <Section
            title="General"
            rows={[
              ['Order No.', order.orderNumber],
              ['Customer', order.clientName],
              ['File Print Location', d?.filePrintLocation || lf?.filePrintLocation],
            ]}
          />

          {d && (
            <>
              <Section
                title="Job Info"
                rows={[
                  ['Product type', d.productType],
                  ['Quantity', d.quantity],
                ]}
              />
              <Section
                title="Media"
                rows={[
                  ['Paper type', d.paperType],
                  ['Paper Weight', d.paperWeight],
                  ['Paper Size', d.paperSize],
                  [
                    'Paper source',
                    Array.isArray(d.paperSource) ? d.paperSource.join(', ') : d.paperSource,
                  ],
                ]}
              />
              <Section
                title="Layout"
                rows={[
                  ['Sides Printing', d.sidesPrinting],
                  ['Color Mode', d.colorMode],
                ]}
              />
              <Section
                title="Finish"
                rows={[
                  ['Output Delivery', d.outputDelivery],
                  ['Lamination', d.lamination],
                  ['Cutting', d.cutting?.join(', ')],
                ]}
              />
              <Section
                title="Cut File"
                rows={[['File Cut Location', d.fileCutLocation]]}
              />
              <Section
                title="Notes"
                rows={[['Notes', order.notes]]}
              />
            </>
          )}

          {lf && (
            <>
              <Section
                title="Job Info"
                rows={[
                  ['Product type', lf.productType],
                  ['Quantity', lf.quantity],
                  ['Resolution', lf.resolution],
                ]}
              />
              <Section
                title="Material"
                rows={[
                  ['Roll type', lf.material],
                  ['Roll width', lf.rollWidth],
                ]}
              />
              <Section
                title="Finish"
                rows={[
                  ['Lamination', lf.lamination],
                  ['Cutting', lf.cutting],
                ]}
              />
              <Section
                title="Cut File"
                rows={[['File Cut Location', lf.fileCutLocation]]}
              />
              <Section
                title="Notes"
                rows={[['Notes', order.notes]]}
              />
            </>
          )}

          {!d && !lf && (
            <section className="orqv-card">
              <p className="orqv-empty">No registered orders yet</p>
            </section>
          )}

          <div className="dp2-actions">
            <button type="button" className="dp2-btn-cancel" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderRequestViewModal;
