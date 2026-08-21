import React, { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Order } from '../../types';
import Header from '../layout/Header';
import DigitalPrintingOrderModal from '../modals/DigitalPrintingOrderModal';
import LargeFormatOrderModal from '../modals/LargeFormatOrderModal';
import OrderRequestViewModal from '../modals/OrderRequestViewModal';
import digitalPrintingImg from '../../assets/digital-printing.png';
import largeFormatImg from '../../assets/large-format-printing.png';

type PrintType = 'digital' | 'large-format';

const isDigitalRequest = (o: Order) =>
  !!o.digitalPrinting || (o.tags || []).some((t) => /digital|طباعة رقمية/i.test(t));

const isLargeFormatRequest = (o: Order) =>
  !!o.largeFormat || (o.tags || []).some((t) => /large\s*format|طباعة كبيرة|الطباعة الكبيرة/i.test(t));

const OrderRequestPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const orderRequests = useMemo(() => state.orderRequests || [], [state.orderRequests]);
  const [printType, setPrintType] = useState<PrintType | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const sortNewest = (list: Order[]) =>
    [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const digitalOrders = useMemo(
    () =>
      sortNewest(
        orderRequests.filter((o) => !o.deletedAt && isDigitalRequest(o)),
      ),
    [orderRequests],
  );

  const largeFormatOrders = useMemo(
    () =>
      sortNewest(
        orderRequests.filter(
          (o) => !o.deletedAt && isLargeFormatRequest(o) && !isDigitalRequest(o),
        ),
      ),
    [orderRequests],
  );

  const handleDelete = (o: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this order request?')) return;
    dispatch({ type: 'DELETE_ORDER_REQUEST', payload: o.id });
    if (selectedOrder?.id === o.id) setSelectedOrder(null);
  };

  const productTypeOf = (o: Order) =>
    o.digitalPrinting?.productType || o.largeFormat?.productType || '—';

  const quantityOf = (o: Order) =>
    o.digitalPrinting?.quantity || o.largeFormat?.quantity || '—';

  const renderTable = (
    list: Order[],
    emptyLabel: string,
    banner: { titleEn: string; titleAr: string; icon: string; color: string },
  ) => (
    <div className="table-card orq-split-card" style={{ ['--orq-color' as string]: banner.color }}>
      <div className="orders-table-wrap">
        <table className="orders-table full-table">
          <thead>
            <tr className="orq-banner-row">
              <th colSpan={5}>
                <div className="orq-banner-cell">
                  <span className="orq-banner-icon" style={{ background: banner.color }}>
                    <img src={banner.icon} alt="" />
                  </span>
                  <span className="orq-banner-names" style={{ color: banner.color }}>
                    <span className="orq-banner-en">{banner.titleEn}</span>
                    <span className="orq-banner-ar">{banner.titleAr}</span>
                  </span>
                </div>
              </th>
            </tr>
            <tr>
              <th>Client Name</th>
              <th>Order Number</th>
              <th>Product Type</th>
              <th>Quantity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 28, color: '#9ca3af' }}>
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              list.map((o) => (
                <tr
                  key={o.id}
                  className="table-row clickable orq-order-row"
                  onClick={() => setSelectedOrder(o)}
                >
                  <td>{o.clientName}</td>
                  <td>
                    <strong className="orq-order-link">{o.orderNumber}</strong>
                  </td>
                  <td>{productTypeOf(o)}</td>
                  <td>{quantityOf(o)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="orq-row-actions">
                      <button
                        type="button"
                        className="orq-action-btn view"
                        title="View"
                        aria-label="View"
                        onClick={() => setSelectedOrder(o)}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        className="orq-action-btn edit"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => setEditingOrder(o)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="orq-action-btn delete"
                        title="Delete"
                        aria-label="Delete"
                        onClick={(e) => handleDelete(o, e)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="page-content">
      <Header
        title="Order Request"
        subtitle="Digital & Large Format print tickets — separate from department boards"
      />

      <div className="orq-header-actions" style={{ marginBottom: 16 }}>
        <button type="button" className="orq-mini-btn" style={{ background: '#2563eb' }} onClick={() => setPrintType('digital')}>
          <img className="orq-mini-icon" src={digitalPrintingImg} alt="" />
          <span className="orq-mini-names">
            <span className="orq-mini-en">Digital Printing</span>
            <span className="orq-mini-ar">طباعة الديجيتال</span>
          </span>
          <Plus size={16} />
        </button>
        <button type="button" className="orq-mini-btn" style={{ background: '#7c3aed' }} onClick={() => setPrintType('large-format')}>
          <img className="orq-mini-icon" src={largeFormatImg} alt="" />
          <span className="orq-mini-names">
            <span className="orq-mini-en">Large Format</span>
            <span className="orq-mini-ar">الطباعة الكبيرة</span>
          </span>
          <Plus size={16} />
        </button>
      </div>

      <div className="orq-split-tables">
        {renderTable(digitalOrders, 'No digital print requests yet', {
          titleEn: 'Digital Printing',
          titleAr: 'طباعة الديجيتال',
          icon: digitalPrintingImg,
          color: '#2563eb',
        })}
        {renderTable(largeFormatOrders, 'No large format requests yet', {
          titleEn: 'Large Format',
          titleAr: 'الطباعة الكبيرة',
          icon: largeFormatImg,
          color: '#7c3aed',
        })}
      </div>

      {printType === 'digital' && !editingOrder && (
        <DigitalPrintingOrderModal onClose={() => setPrintType(null)} />
      )}
      {printType === 'large-format' && !editingOrder && (
        <LargeFormatOrderModal onClose={() => setPrintType(null)} />
      )}
      {editingOrder?.digitalPrinting && (
        <DigitalPrintingOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
      {editingOrder?.largeFormat && !editingOrder.digitalPrinting && (
        <LargeFormatOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
        />
      )}
      {selectedOrder && (
        <OrderRequestViewModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
};

export default OrderRequestPage;
