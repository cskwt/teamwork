import React, { useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { priorityConfig, getColumnStatus } from '../../utils/helpers';
import Header from '../layout/Header';

const TrashPage: React.FC = () => {
  const { state, dispatch } = useApp();
  const { orders, departments, currentUser } = state;
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const deletedOrders = orders
    .filter((o) => !!o.deletedAt)
    .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime());

  const getDaysLeft = (deletedAt: string) => {
    const diff = 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const handleRestore = (id: string) => {
    dispatch({ type: 'RESTORE_ORDER', payload: id });
  };

  const handlePermDelete = (id: string) => {
    dispatch({ type: 'PERMANENT_DELETE', payload: id });
    setConfirmId(null);
  };

  const handleEmptyTrash = () => {
    if (window.confirm(`حذف ${deletedOrders.length} طلبية نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`)) {
      deletedOrders.forEach((o) => dispatch({ type: 'PERMANENT_DELETE', payload: o.id }));
    }
  };

  return (
    <div className="page">
      <Header title="سلة المهملات" subtitle={`${deletedOrders.length} طلبية محذوفة`} />
      <div className="page-content">

        {deletedOrders.length === 0 ? (
          <div className="trash-empty">
            <Trash2 size={64} color="#d1d5db" />
            <h3>سلة المهملات فارغة</h3>
            <p>الطلبيات المحذوفة ستظهر هنا لمدة 30 يوماً قبل الحذف النهائي</p>
          </div>
        ) : (
          <>
            <div className="trash-toolbar">
              <div className="trash-info">
                <AlertTriangle size={15} color="#f59e0b" />
                <span>تُحذف الطلبيات نهائياً بعد <b>30 يوماً</b> من تاريخ الحذف</span>
              </div>
              {isAdmin && (
                <button className="btn-danger btn-sm" onClick={handleEmptyTrash}>
                  <Trash2 size={14} /> تفريغ سلة المهملات
                </button>
              )}
            </div>

            <div className="trash-list">
              {deletedOrders.map((order) => {
                const dept = departments.find((d) => d.id === order.departmentId);
                const pr = priorityConfig[order.priority];
                const st = getColumnStatus(order, departments);
                const daysLeft = getDaysLeft(order.deletedAt!);
                const deletedDate = new Date(order.deletedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

                return (
                  <div key={order.id} className={`trash-item ${daysLeft <= 3 ? 'trash-item-urgent' : ''}`}>
                    <div className="trash-item-info">
                      <div className="trash-item-header">
                        <span className="trash-order-num">#{order.orderNumber}</span>
                        <span className="trash-client">{order.clientName}</span>
                        <span className="badge" style={{ background: pr.bg, color: pr.color }}>{pr.label}</span>
                        <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        {dept && (
                          <span className="dept-chip" style={{ background: dept.color + '22', color: dept.color }}>
                            {dept.name}
                          </span>
                        )}
                      </div>
                      {order.description && (
                        <p className="trash-desc">{order.description}</p>
                      )}
                      <div className="trash-meta">
                        <span>حُذف في: {deletedDate}</span>
                        <span className={`trash-days-left ${daysLeft <= 7 ? 'days-warning' : ''}`}>
                          يُحذف نهائياً بعد <b>{daysLeft}</b> يوم
                        </span>
                      </div>
                    </div>
                    <div className="trash-item-actions">
                      <button className="btn-restore" onClick={() => handleRestore(order.id)} title="استعادة">
                        <RotateCcw size={15} />
                        <span>استعادة</span>
                      </button>
                      {isAdmin && (
                        confirmId === order.id ? (
                          <div className="trash-confirm">
                            <span>تأكيد الحذف النهائي؟</span>
                            <button className="btn-danger btn-sm" onClick={() => handlePermDelete(order.id)}>نعم</button>
                            <button className="btn-secondary btn-sm" onClick={() => setConfirmId(null)}>لا</button>
                          </div>
                        ) : (
                          <button className="btn-perm-delete" onClick={() => setConfirmId(order.id)} title="حذف نهائي">
                            <X size={15} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TrashPage;
