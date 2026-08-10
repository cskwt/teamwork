import React, { useState, useMemo, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  closestCorners, pointerWithin, rectIntersection,
  PointerSensor, TouchSensor, useSensor, useSensors,
  CollisionDetection, getFirstCollision,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, Folder, Plus, GripVertical, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useViewMode } from '../../contexts/ViewModeContext';
import { useLang } from '../../contexts/LanguageContext';
import { Department, Order, KanbanColumn as KanbanColumnType } from '../../types';
import KanbanColumn from './KanbanColumn';
import OrderCard, { canAcknowledgeNew } from './OrderCard';
import OrderDetailModal from '../modals/OrderDetailModal';
import AddOrderModal from '../modals/AddOrderModal';
import Header from '../layout/Header';

interface KanbanBoardProps {
  department: Department;
  onBack?: () => void;
}

const SortableColumn: React.FC<{
  col: KanbanColumnType;
  orders: Order[];
  onOrderClick: (o: Order) => void;
  department: Department;
  disableColumnDrag?: boolean;
}> = ({ col, orders, onOrderClick, department, disableColumnDrag }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col::${col.id}`,
    disabled: !!disableColumnDrag,
    data: { type: 'column-shell', columnId: col.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="sortable-col-wrap">
      {!disableColumnDrag && (
        <div className="col-drag-handle" {...attributes} {...listeners} title="اسحب لتغيير الترتيب">
          <GripVertical size={14} />
        </div>
      )}
      <KanbanColumn
        column={col}
        orders={orders}
        onOrderClick={onOrderClick}
        department={department}
      />
    </div>
  );
};

const sortColOrders = (list: Order[]) =>
  [...list].sort((a, b) => {
    const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
    const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
    if (aHas && bHas) return (a.sortOrder as number) - (b.sortOrder as number);
    if (aHas) return -1;
    if (bHas) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

const resolveColumnId = (
  overId: string,
  overData: Record<string, unknown> | undefined,
  deptOrders: Order[],
): string | null => {
  const dataType = overData?.type as string | undefined;
  if (dataType === 'column' || dataType === 'column-shell') {
    return String(overData?.columnId || overId.replace(/^col::/, ''));
  }
  if (dataType === 'card' && overData?.columnId) {
    return String(overData.columnId);
  }
  if (overId.startsWith('col::')) return overId.replace(/^col::/, '');
  const overOrder = deptOrders.find((o) => o.id === overId);
  if (overOrder) return overOrder.status;
  // bare column id (useDroppable)
  return overId;
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ department, onBack }) => {
  const { state, dispatch, addHistoryEntry } = useApp();
  const { orders, currentUser } = state;
  const { isPhone } = useViewMode();
  const { tr } = useLang();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColColor, setNewColColor] = useState('#6366f1');
  const [phoneColId, setPhoneColId] = useState('new');
  const [moveOrder, setMoveOrder] = useState<Order | null>(null);

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

  const handleOrderClick = (o: Order) => {
    if (o.status === 'new' && o.isNew !== false && currentUser && canAcknowledgeNew(currentUser, o)) {
      dispatch({ type: 'ACKNOWLEDGE_NEW_ORDER', payload: { orderId: o.id, userId: currentUser.id } });
    }
    setSelectedOrder(o);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: isPhone ? 10 : 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const isDeliveryDept = department.name === 'قسم التسليم';

  const DEFAULT_COL: KanbanColumnType = isDeliveryDept
    ? { id: 'new', title: 'الطلبيات الجاهزة', color: '#10b981', order: 0 }
    : { id: 'new', title: 'الطلبيات الجديدة', color: '#6366f1', order: 0 };

  const deptOrders = orders.filter(
    (o) =>
      o.departmentId === department.id &&
      !o.deletedAt &&
      !o.archivedAt &&
      !o.isOrderRequest &&
      !o.digitalPrinting &&
      !o.largeFormat,
  );

  const columns = [...department.columns]
    .filter((c) => c.id !== 'new')
    .sort((a, b) => b.order - a.order);
  const colSortableIds = columns.map((c) => `col::${c.id}`);
  const allColumnIds = useMemo(
    () => new Set(['new', ...columns.map((c) => c.id)]),
    [columns],
  );

  /** Phone tabs: default column first, then the rest (stable reading order) */
  const phoneColumns = useMemo(
    () => [DEFAULT_COL, ...[...columns].sort((a, b) => a.order - b.order)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [DEFAULT_COL.id, DEFAULT_COL.title, department.columns],
  );

  const activePhoneCol = phoneColumns.find((c) => c.id === phoneColId) || DEFAULT_COL;
  const activePhoneOrders = deptOrders.filter((o) => o.status === activePhoneCol.id);

  const columnDroppableIds = useMemo(() => {
    return new Set<string>(['new', ...columns.map((c) => c.id), ...columns.map((c) => `col::${c.id}`)]);
  }, [columns]);

  /** Prefer cards over column shells so reorder + empty-column drops both work */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = String(args.active.id);
    if (activeId.startsWith('col::')) {
      return closestCorners(args);
    }

    const pointerHits = pointerWithin(args);
    const intersections = pointerHits.length > 0 ? pointerHits : rectIntersection(args);

    const cardHits = intersections.filter((c) => !columnDroppableIds.has(String(c.id)));
    if (cardHits.length > 0) return cardHits;

    // Empty column / column body
    const columnHits = intersections.filter((c) => columnDroppableIds.has(String(c.id)));
    if (columnHits.length > 0) return columnHits;

    const corners = closestCorners(args);
    const cardCorners = corners.filter((c) => !columnDroppableIds.has(String(c.id)));
    if (cardCorners.length > 0) return cardCorners;

    const first = getFirstCollision(intersections.length ? intersections : corners);
    return first ? [first] : corners;
  }, [columnDroppableIds]);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!id.startsWith('col::')) {
      setActiveOrder(orders.find((o) => o.id === id) || null);
    }
  };

  const applyColumnSort = (colOrders: Order[], oldIndex: number, newIndex: number) => {
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const reordered = arrayMove(colOrders, oldIndex, newIndex);
    const sortOrderAt = new Date().toISOString();
    dispatch({
      type: 'SET_ORDERS_SORT',
      payload: reordered.map((o, i) => ({ id: o.id, sortOrder: i, sortOrderAt })),
    });
  };

  const moveOrderToColumn = (order: Order, targetColId: string, insertIndex?: number) => {
    if (!currentUser) return;
    const allCols = [DEFAULT_COL, ...columns];
    const fromLabel = allCols.find((c) => c.id === order.status)?.title || order.status;
    const toLabel = allCols.find((c) => c.id === targetColId)?.title || targetColId;

    if (order.status !== targetColId) {
      dispatch({ type: 'MOVE_ORDER', payload: { orderId: order.id, status: targetColId, triggerUserId: currentUser.id } });
      addHistoryEntry(order.id, 'تغيير الحالة', fromLabel, toLabel);
    }

    const targetOrders = sortColOrders(
      deptOrders.filter((o) => o.status === targetColId && o.id !== order.id),
    );
    const moved: Order = { ...order, status: targetColId as Order['status'] };
    let next: Order[];
    if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= targetOrders.length) {
      next = [...targetOrders];
      next.splice(insertIndex, 0, moved);
    } else {
      next = [...targetOrders, moved];
    }
    const sortOrderAt = new Date().toISOString();
    dispatch({
      type: 'SET_ORDERS_SORT',
      payload: next.map((o, i) => ({ id: o.id, sortOrder: i, sortOrderAt })),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveOrder(null);
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const overData = over.data?.current as Record<string, unknown> | undefined;
    const activeData = active.data?.current as Record<string, unknown> | undefined;

    // Column reorder (desktop)
    if (activeId.startsWith('col::') && (overId.startsWith('col::') || overData?.type === 'column-shell')) {
      if (isPhone) return;
      const overColId = overId.startsWith('col::') ? overId : `col::${overData?.columnId}`;
      const oldIndex = columns.findIndex((c) => `col::${c.id}` === activeId);
      const newIndex = columns.findIndex((c) => `col::${c.id}` === overColId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(columns, oldIndex, newIndex);
      const updatedCols = reordered.map((c, i) => ({ ...c, order: reordered.length - i }));
      dispatch({
        type: 'UPDATE_DEPARTMENT',
        payload: { ...department, columns: updatedCols },
      });
      return;
    }

    if (activeId.startsWith('col::') || activeData?.type === 'column-shell') return;

    const order = orders.find((o) => o.id === activeId);
    if (!order) return;

    const targetColId = resolveColumnId(overId, overData, deptOrders);
    if (!targetColId || !allColumnIds.has(targetColId)) return;

    // Same-column reorder onto another card
    if (targetColId === order.status) {
      const colOrders = sortColOrders(deptOrders.filter((o) => o.status === order.status));
      const overOrder = deptOrders.find((o) => o.id === overId);
      if (overOrder && overOrder.status === order.status) {
        applyColumnSort(
          colOrders,
          colOrders.findIndex((o) => o.id === activeId),
          colOrders.findIndex((o) => o.id === overId),
        );
        return;
      }
      const overIndex = over.data?.current?.sortable?.index;
      if (typeof overIndex === 'number') {
        applyColumnSort(colOrders, colOrders.findIndex((o) => o.id === activeId), overIndex);
      }
      return;
    }

    // Cross-column move
    const overOrder = deptOrders.find((o) => o.id === overId);
    let insertIndex: number | undefined;
    if (overOrder && overOrder.status === targetColId) {
      const targetList = sortColOrders(deptOrders.filter((o) => o.status === targetColId));
      insertIndex = targetList.findIndex((o) => o.id === overId);
      if (insertIndex < 0) insertIndex = undefined;
    }
    moveOrderToColumn(order, targetColId, insertIndex);
  };

  return (
    <div className={`board-page ${isPhone ? 'board-page--phone' : ''}`}>
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

      {isPhone ? (
        <div className="phone-board">
          <div className="phone-col-tabs" role="tablist" aria-label="أعمدة القسم">
            {phoneColumns.map((col) => {
              const count = deptOrders.filter((o) => o.status === col.id).length;
              const active = col.id === activePhoneCol.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`phone-col-tab ${active ? 'phone-col-tab--active' : ''}`}
                  style={{
                    borderColor: active ? col.color : undefined,
                    background: active ? col.color + '18' : undefined,
                    color: active ? col.color : undefined,
                  }}
                  onClick={() => setPhoneColId(col.id)}
                >
                  <span className="phone-col-tab-dot" style={{ background: col.color }} />
                  <span className="phone-col-tab-title">{col.title}</span>
                  <span className="phone-col-tab-count" style={{ background: col.color }}>{count}</span>
                </button>
              );
            })}
          </div>

          <p className="phone-board-hint">اسحب لإعادة الترتيب داخل العمود · اضغط «نقل» لتغيير العمود</p>

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="phone-board-stage">
              <KanbanColumn
                column={activePhoneCol}
                orders={activePhoneOrders}
                onOrderClick={handleOrderClick}
                department={department}
                isDefault={activePhoneCol.id === 'new'}
                phoneMode
                onMoveClick={(o) => setMoveOrder(o)}
              />
            </div>
            <DragOverlay dropAnimation={null}>
              {activeOrder && <OrderCard order={activeOrder} onClick={() => {}} overlay />}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={colSortableIds} strategy={horizontalListSortingStrategy}>
            <div className="kanban-board">
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
                  onOrderClick={handleOrderClick}
                  department={department}
                  disableColumnDrag={isPhone}
                />
              ))}

              <KanbanColumn
                column={DEFAULT_COL}
                orders={deptOrders.filter((o) => o.status === 'new')}
                onOrderClick={handleOrderClick}
                department={department}
                isDefault
              />
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeOrder && (
              <OrderCard order={activeOrder} onClick={() => {}} overlay />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {isPhone && (
        <button
          type="button"
          className="phone-fab"
          onClick={() => setShowAddModal(true)}
          title={tr.newOrderFab}
        >
          <Plus size={22} />
          <span>{tr.newOrderFab}</span>
        </button>
      )}

      {moveOrder && (
        <div className="phone-sheet-overlay" onClick={() => setMoveOrder(null)}>
          <div className="phone-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="phone-sheet-handle" />
            <div className="phone-sheet-header">
              <div>
                <h3>نقل الطلبية</h3>
                <p>#{moveOrder.orderNumber} — {moveOrder.clientName}</p>
              </div>
              <button type="button" className="modal-close-corner" onClick={() => setMoveOrder(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="phone-sheet-list">
              {phoneColumns.filter((c) => c.id !== moveOrder.status).map((col) => (
                <button
                  key={col.id}
                  type="button"
                  className="phone-sheet-item"
                  onClick={() => {
                    moveOrderToColumn(moveOrder, col.id);
                    setPhoneColId(col.id);
                    setMoveOrder(null);
                  }}
                >
                  <span className="phone-col-tab-dot" style={{ background: col.color }} />
                  <span>{col.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
