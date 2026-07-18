import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { Order, KanbanColumn as KCol, Department } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { useLang } from '../../contexts/LanguageContext';
import OrderCard from './OrderCard';

const COL_NAME_MAP: Record<string, string> = {
  'الطلبيات الجديدة': 'New Orders',
  'الطلبيات الجاهزة': 'Ready Orders',
  'قيد التنفيذ': 'In Progress',
  'مراجعة': 'Review',
  'منجز': 'Done',
  'ملغي': 'Cancelled',
  'جديد': 'New',
  'قيد الطباعة': 'Printing',
  'قيد التجميع': 'Assembly',
  'للتوصيل': 'For Delivery',
  'قيد التسليم': 'In Delivery',
  'للاستلام': 'For Pickup',
  'متعثرة': 'On Hold',
  'مطبوعات خارجية': 'Outsourced Print',
  'اللامنيشن': 'Lamination',
  'عينات مطلوبة': 'Samples Needed',
  'قص Graphtec': 'Graphtec Cut',
  'UV طباعة': 'UV Print',
  'قص ليزر': 'Laser Cut',
};

const translateColName = (name: string, lang: string): string => {
  if (lang === 'en') return COL_NAME_MAP[name] || name;
  return name;
};

const COLUMN_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981',
  '#f59e0b','#ef4444','#ec4899','#8b5cf6','#84cc16',
];

interface KanbanColumnProps {
  column: KCol;
  orders: Order[];
  onOrderClick: (order: Order) => void;
  department: Department;
  isDefault?: boolean;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ column, orders, onOrderClick, department, isDefault }) => {
  const { dispatch } = useApp();
  const { lang } = useLang();
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [color, setColor] = useState(column.color);

  const saveEdit = () => {
    if (!title.trim()) return;
    dispatch({ type: 'UPDATE_COLUMN', payload: { departmentId: department.id, column: { ...column, title: title.trim(), color } } });
    setEditing(false);
  };

  const cancelEdit = () => {
    setTitle(column.title);
    setColor(column.color);
    setEditing(false);
  };

  const handleDelete = () => {
    if (orders.length > 0) {
      if (!window.confirm(`العمود يحتوي على ${orders.length} طلبية. هل تريد حذفه؟`)) return;
    }
    dispatch({ type: 'DELETE_COLUMN', payload: { departmentId: department.id, columnId: column.id } });
  };

  return (
    <div className={`kanban-col ${isOver ? 'col-over' : ''}`} style={{ '--col-color': column.color } as any}>
      <div className="col-header">
        {editing ? (
          <div className="col-edit-form">
            <input
              className="col-edit-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
              autoFocus
            />
            <div className="col-color-picker">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`col-color-dot ${color === c ? 'col-color-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="col-edit-actions">
              <button className="col-edit-save" onClick={saveEdit}><Check size={14} /></button>
              <button className="col-edit-cancel" onClick={cancelEdit}><X size={14} /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="col-header-right">
              <span className="col-count" style={{ color: column.color }}>
                {orders.length}
              </span>
              {!isDefault && (
                <>
                  <button className="col-action-btn" onClick={() => setEditing(true)} title="تعديل">
                    <Pencil size={12} />
                  </button>
                  <button className="col-action-btn col-action-danger" onClick={handleDelete} title="حذف">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
            <div className="col-header-left">
              <span className="col-title">{translateColName(column.title, lang)}</span>
            </div>
          </>
        )}
      </div>

      <div ref={setNodeRef} className="col-body">
        {(() => {
          const sorted = [...orders].sort((a, b) => {
            const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
            const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
            if (aHas && bHas) return (a.sortOrder as number) - (b.sortOrder as number);
            if (aHas) return -1;
            if (bHas) return 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
          return (
            <SortableContext items={sorted.map((o) => o.id)} strategy={verticalListSortingStrategy}>
              {sorted.length === 0 ? (
                <div className="col-empty"><p>لا توجد طلبيات</p></div>
              ) : (
                sorted.map((order) => (
                  <OrderCard key={order.id} order={order} onClick={() => onOrderClick(order)} />
                ))
              )}
            </SortableContext>
          );
        })()}
      </div>
    </div>
  );
};

export default KanbanColumn;
