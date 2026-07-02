import React, { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { OrderStatus, OrderPriority } from '../../types';
import { priorityConfig, getColumnStatus, formatDate, isOverdue } from '../../utils/helpers';
import Header from '../layout/Header';
import AddOrderModal from '../modals/AddOrderModal';
import OrderDetailModal from '../modals/OrderDetailModal';

interface OrdersPageProps {
  archiveMode?: boolean;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ archiveMode = false }) => {
  const { state } = useApp();
  const { orders, departments, currentUser } = state;

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<OrderPriority | ''>('');
  const [filterDept, setFilterDept] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [addDeptId, setAddDeptId] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const activeOrders = orders.filter((o) => !o.deletedAt && (!archiveMode || o.status === 'done'));
  const baseOrders = isAdmin
    ? activeOrders
    : activeOrders.filter((o) => o.departmentId === currentUser?.departmentId || o.assignedUsers?.includes(currentUser?.id || ""));

  const filtered = baseOrders.filter((o) => {
    const matchSearch = !search || o.title.toLowerCase().includes(search.toLowerCase()) || o.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || o.status === filterStatus;
    const matchPriority = !filterPriority || o.priority === filterPriority;
    const matchDept = !filterDept || o.departmentId === filterDept;
    return matchSearch && matchStatus && matchPriority && matchDept;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleAddForDept = () => {
    const deptId = filterDept || (departments[0]?.id || '');
    setAddDeptId(deptId);
    setShowAddModal(true);
  };

  return (
    <div className="page">
      <Header
        title={archiveMode ? 'الأرشيف' : 'جميع الطلبيات'}
        subtitle={`${filtered.length} طلبية${archiveMode ? ' مُسلَّمة' : ''}`}
        onAddOrder={archiveMode ? undefined : handleAddForDept}
      />
      <div className="page-content">
        {/* Filters */}
        <div className="filters-bar">
          <div className="search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="بحث في الطلبيات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!archiveMode && (
            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
              <option value="">كل الحالات</option>
              <option value="new">جديد</option>
              <option value="in_progress">قيد التنفيذ</option>
              <option value="review">مراجعة</option>
              <option value="done">منجز</option>
              <option value="cancelled">ملغي</option>
            </select>
          )}
          <select className="filter-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as any)}>
            <option value="">كل الأولويات</option>
            <option value="low">منخفضة</option>
            <option value="medium">متوسطة</option>
            <option value="high">عالية</option>
            <option value="urgent">عاجل</option>
          </select>
          {isAdmin && (
            <select className="filter-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">كل الأقسام</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <div className="filter-icon"><Filter size={16} /></div>
        </div>

        {/* Table */}
        <div className="table-card">
          <table className="orders-table full-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>اسم العميل</th>
                <th>تاريخ استلام الطلب</th>
                <th>القسم المختص</th>
                <th>تاريخ التسليم</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const dept = departments.find((d) => d.id === o.departmentId);
                const overdue = isOverdue(o.dueDate) && o.status !== 'done';
                return (
                  <tr
                    key={o.id}
                    className={`table-row clickable ${overdue ? 'row-overdue' : ''}`}
                    onClick={() => setSelectedOrder(o)}
                  >
                    <td className="row-num">{o.orderNumber || '—'}</td>
                    <td>{o.clientName || <span className="muted">—</span>}</td>
                    <td className="time-cell">{formatDate(o.createdAt)}</td>
                    <td>
                      <span className="dept-chip" style={{ background: dept?.color + '22', color: dept?.color }}>
                        {dept?.name}
                      </span>
                    </td>
                    <td className={overdue ? 'overdue-text' : ''}>
                      {o.dueDate ? formatDate(o.dueDate) : <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="empty-row">لا توجد طلبيات مطابقة للبحث</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && addDeptId && (
        <AddOrderModal departmentId={addDeptId} onClose={() => setShowAddModal(false)} />
      )}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          department={departments.find((d) => d.id === selectedOrder.departmentId)!}
        />
      )}
    </div>
  );
};

export default OrdersPage;
