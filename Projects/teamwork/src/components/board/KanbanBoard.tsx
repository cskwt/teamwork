import React, { useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  closestCorners, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, Folder, Plus, GripVertical } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Department, Order, KanbanColumn as KanbanColumnType } from '../../types';
import KanbanColumn from './KanbanColumn';
import OrderCard from './OrderCard';
import OrderDetailModal from '../modals/OrderDetailModal';
import AddOrderModal from '../modals/AddOrderModal';
import Header from '../layout/Header';

interface KanbanBoardProps {
  department: Department;
  onBack?: () => void;
}

// Sortable wrapper for a column
const SortableColumn: React.FC<{
  col: KanbanColumnType;
  orders: Order[];
  onOrderClick: (o: Order) => void;
  department: Department;
}> = ({ col, orders, onOrderClick, department }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `col::${col.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="sortable-col-wrap">
      <div className="col-drag-handle" {...attributes} {...listeners} title="اسحب لتغيير الترتيب">
        <GripVertical size={14} />
      </div>
      <KanbanColumn
        column={col}
        orders={orders}
        onOrderClick={onOrderClick}
        department={department}
      />
    </div>
  );
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ department, onBack }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { orders, currentUser } = state;
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColColor, setNewColColor] = useState('#6366f1');

  const COL_COLORS = ['#6366f1','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6'];

  const handleAddColumn = () => {
    if (!newColTitle.trim()) return;
    const maxOrder = department.columns.reduce((m, c) => Math.max(m, c.order), 0);
    dispatch({
      type: 'ADD_COLUMN',
      payload: {
        departmentId: department.id,
        column: { id: `col-${Date.now()}`, title: newColTitle.trim(), color: newColColor, order: maxOrder + 1 },
      },
    });
    setNewColTitle('');
    setNewColColor('#6366f1');
    setShowAddCol(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const isDeliveryDept = department.name === 'قسم التسليم';

  // Fixed default column: "الطلبيات الجاهزة" for delivery, "الطلبيات الجديدة" for others
  const DEFAULT_COL: KanbanColumnType = isDeliveryDept
    ? { id: 'new', title: 'الطلبيات الجاهزة', color: '#10b981', order: 0 }
    : { id: 'new', title: 'الطلبيات الجديدة', color: '#6366f1', order: 0 };

  const deptOrders = orders.filter((o) => o.departmentId === department.id && !o.deletedAt);

  // Exclude 'new' column from user-managed columns (it's always rendered separately)
  const columns = [...department.columns]
    .filter((c) => c.id !== 'new')
    .sort((a, b) => b.order - a.order);
  const colSortableIds = columns.map((c) => `col::${c.id}`);

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (!id.startsWith('col::')) {
      const order = orders.find((o) => o.id === id);
      setActiveOrder(order || null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOrder(null);
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Column reorder
    if (activeId.startsWith('col::') && overId.startsWith('col::')) {
      const oldIndex = columns.findIndex((c) => `col::${c.id}` === activeId);
      const newIndex = columns.findIndex((c) => `col::${c.id}` === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(columns, oldIndex, newIndex);
      const updatedCols = reordered.map((c, i) => ({ ...c, order: reordered.length - i }));
      dispatch({
        type: 'UPDATE_DEPARTMENT',
        payload: { ...department, columns: updatedCols },
      });
      return;
    }

    // Block order moves for non-admin unless it's the manager's own department
    const userDeptIds = currentUser?.departmentIds?.length ? currentUser.departmentIds : (currentUser?.departmentId ? [currentUser.departmentId] : []);
    const isOwnDept = userDeptIds.includes(department.id);
    if (!activeId.startsWith('col::') && currentUser?.role !== 'admin' && !(currentUser?.role === 'manager' && isOwnDept)) return;

    if (!activeId.startsWith('col::')) {
      const orderId = activeId;
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;

      // إذا وقع على عمود مباشرة
      let targetColId = overId.startsWith('col::') ? overId.replace('col::', '') : null;

      // إذا وقع فوق طلبية موجودة → استخرج عمودها
      if (!targetColId) {
        const overOrder = deptOrders.find((o) => o.id === overId);
        if (overOrder) targetColId = overOrder.status;
      }

      if (!targetColId) return;
      const isCol = columns.some((c) => c.id === targetColId);
      if (!isCol) return;

      if (order.status !== targetColId) {
        const fromLabel = columns.find((c) => c.id === order.status)?.title || order.status;
        const toLabel = columns.find((c) => c.id === targetColId)?.title || targetColId;
        dispatch({ type: 'MOVE_ORDER', payload: { orderId, status: targetColId, triggerUserId: currentUser?.id } });
        addHistoryEntry(orderId, 'تغيير الحالة', fromLabel, toLabel);
      }
    }
  };

  return (
    <div className="board-page">
      <div className="board-breadcrumb">
        <button className="breadcrumb-back" onClick={onBack}>
          <ChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />
          <span>الأقسام</span>
        </button>
        <span className="breadcrumb-sep">/</span>
        <Folder size={15} color={department.color} fill={department.color + '33'} />
        <span className="breadcrumb-current" style={{ color: department.color }}>
          {department.name}
        </span>
      </div>
      <Header
        title={department.name}
        subtitle={department.description}
        onAddOrder={() => setShowAddModal(true)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={colSortableIds} strategy={horizontalListSortingStrategy}>
          <div className="kanban-board">
            {/* Add Column */}
            {showAddCol ? (
              <div className="kanban-col col-add-form">
                <div className="col-add-body">
                  <input
                    className="col-edit-input"
                    placeholder="اسم العمود..."
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowAddCol(false); }}
                    autoFocus
                  />
                  <div className="col-color-picker">
                    {COL_COLORS.map((c) => (
                      <button key={c} type="button"
                        className={`col-color-dot ${newColColor === c ? 'col-color-active' : ''}`}
                        style={{ background: c }} onClick={() => setNewColColor(c)}
                      />
                    ))}
                  </div>
                  <div className="col-add-footer">
                    <button className="btn-primary btn-sm" onClick={handleAddColumn}>إضافة</button>
                    <button className="btn-secondary btn-sm" onClick={() => setShowAddCol(false)}>إلغاء</button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="col-add-btn" onClick={() => setShowAddCol(true)}>
                <Plus size={20} />
                <span>إضافة عمود</span>
              </button>
            )}

            {columns.map((col) => (
              <SortableColumn
                key={col.id}
                col={col}
                orders={deptOrders.filter((o) => o.status === col.id)}
                onOrderClick={(o) => setSelectedOrder(o)}
                department={department}
              />
            ))}

            {/* Default fixed column – rightmost (first in Arabic). "الطلبيات الجاهزة" for delivery, "الطلبيات الجديدة" for others */}
            <KanbanColumn
              column={DEFAULT_COL}
              orders={deptOrders.filter((o) => o.status === 'new')}
              onOrderClick={(o) => setSelectedOrder(o)}
              department={department}
              isDefault
            />
          </div>
        </SortableContext>

        <DragOverlay>
          {activeOrder && (
            <OrderCard order={activeOrder} onClick={() => {}} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          department={department}
        />
      )}
      {showAddModal && (
        <AddOrderModal
          departmentId={department.id}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
