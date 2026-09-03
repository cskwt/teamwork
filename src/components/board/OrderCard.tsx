import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare, Calendar, User, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { Order } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { getPriorityConfig, formatDateShort, isOverdue } from '../../utils/helpers';
import { useLang } from '../../contexts/LanguageContext';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  /** Visual-only card for DragOverlay — must NOT call useSortable */
  overlay?: boolean;
  /** Phone: open move-to-column sheet */
  onMoveClick?: (order: Order) => void;
}

const CircleProgress: React.FC<{ value: number }> = ({ value }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 100 ? '#10b981' : value >= 60 ? '#6366f1' : '#f59e0b';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>
        {value}%
      </text>
    </svg>
  );
};

export const canAcknowledgeNew = (
  user: { id: string; role: string; departmentId?: string; departmentIds?: string[]; deletedAt?: string } | null | undefined,
  order: Order,
): boolean => {
  if (!user || user.deletedAt) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'manager') return false;
  const deptIds = user.departmentIds?.length
    ? user.departmentIds
    : user.departmentId
      ? [user.departmentId]
      : [];
  if (deptIds.includes(order.departmentId)) return true;
  if (order.departmentId) return false;
  return (order.departmentIds || []).some((id) => deptIds.includes(id));
};

const useCardViewModel = (order: Order) => {
  const { state } = useApp();
  const { users } = state;
  const { lang } = useLang();
  const priorityConfig = getPriorityConfig(lang);
  return {
    assignedList: users.filter((u) => order.assignedUsers?.includes(u.id) && !u.deletedAt),
    priority: priorityConfig[order.priority],
    overdue: isOverdue(order.dueDate) && order.status !== 'done',
    showNew: order.status === 'new' && order.isNew !== false,
  };
};

const OrderCardBody: React.FC<{
  order: Order;
  assignedList: { id: string; fullName: string; avatar?: string }[];
  priority: { bg: string; color: string; label: string };
  overdue: boolean;
  showNew: boolean;
}> = ({ order, assignedList, priority, overdue, showNew }) => (
  <>
      {showNew && <span className="card-new-badge">NEW</span>}
    {(() => {
      const latest = [...(order.artworkApprovals || [])].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0];
      if (!latest || latest.status === 'approved') return null;
      if (latest.status === 'rejected') {
        return <span className="card-approval-badge card-approval-badge--edit">تعديل مطلوب</span>;
      }
      return <span className="card-approval-badge">بانتظار اعتماد</span>;
    })()}

    {overdue && (
      <div className="card-overdue-banner">
        <AlertTriangle size={12} />
        <span>متأخر</span>
      </div>
    )}

    <div className="card-header">
      <span className="card-priority" style={{ background: priority.bg, color: priority.color }}>
        {priority.label}
      </span>
      {order.tags.slice(0, 2).map((tag) => (
        <span key={tag} className="card-tag">
          {tag}
        </span>
      ))}
    </div>

    <div className="card-title-row-inner">
      <span className="card-order-num">رقم الطلبية: {order.orderNumber}</span>
      <p className="card-title">{order.clientName}</p>
    </div>

    {order.description && (
      <p className="card-desc">
        {order.description.slice(0, 70)}
        {order.description.length > 70 ? '...' : ''}
      </p>
    )}

    {(order.progress ?? 0) > 0 && (
      <div className="card-progress-row">
        <div className="card-progress-bar">
          <div className="card-progress-fill" style={{ width: `${order.progress}%` }} />
        </div>
        <div className="card-progress-circle-wrap">
          {order.progressQuantity ? (
            <span className="card-progress-label" style={{ direction: 'ltr', fontVariantNumeric: 'tabular-nums' }}>
              {order.progressCompleted ?? 0} / {order.progressQuantity}
            </span>
          ) : (
            <span className="card-progress-label">نسبة الإنجاز</span>
          )}
          <CircleProgress value={order.progress ?? 0} />
        </div>
      </div>
    )}

    <div className="card-footer">
      <div className="card-meta">
        {order.comments.length > 0 && (
          <span className="card-meta-item">
            <MessageSquare size={13} />
            {order.comments.length}
          </span>
        )}
        {order.dueDate && (
          <div className={`card-due-wrap ${overdue ? 'overdue-text' : ''}`}>
            <span className="card-due-label">موعد التسليم</span>
            <span className="card-meta-item">
              <Calendar size={13} />
              {formatDateShort(order.dueDate)}
            </span>
          </div>
        )}
      </div>
      <div className="card-assignees">
        {assignedList.length > 0 ? (
          assignedList.map((u) => (
            <div key={u.id} className="card-assignee" title={u.fullName}>
              {u.avatar ? (
                <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                u.fullName.charAt(0)
              )}
            </div>
          ))
        ) : (
          <div className="card-assignee card-unassigned" title="غير معين">
            <User size={13} />
          </div>
        )}
      </div>
    </div>
  </>
);

const OrderCardOverlay: React.FC<{ order: Order }> = ({ order }) => {
  const vm = useCardViewModel(order);
  return (
    <div className="order-card card-dragging" style={{ boxShadow: '0 12px 28px rgba(0,0,0,.18)', cursor: 'grabbing', width: 260 }}>
      <OrderCardBody order={order} {...vm} />
    </div>
  );
};

const OrderCardSortable: React.FC<{
  order: Order;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  onMoveClick?: (order: Order) => void;
}> = ({ order, onClick, isDragging, canDrag, onMoveClick }) => {
  const isDragAllowed = canDrag !== undefined ? canDrag : true;
  const vm = useCardViewModel(order);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sortDragging } = useSortable({
    id: order.id,
    disabled: !isDragAllowed,
    data: { type: 'card', columnId: order.status, orderId: order.id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: sortDragging ? 0.35 : 1,
      }}
      className={`order-card ${isDragging ? 'card-dragging' : ''} ${vm.overdue ? 'card-overdue' : ''} ${
        !isDragAllowed ? 'card-no-drag' : ''
      } ${vm.showNew ? 'card-is-new' : ''} ${onMoveClick ? 'order-card--with-move' : ''}`}
    >
      <div
        className="card-main-hit"
        {...(isDragAllowed ? attributes : {})}
        {...(isDragAllowed ? listeners : {})}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <OrderCardBody order={order} {...vm} />
      </div>
      {onMoveClick && (
        <button
          type="button"
          className="card-move-btn"
          onClick={(e) => {
            e.stopPropagation();
            onMoveClick(order);
          }}
          title="نقل إلى عمود آخر"
        >
          <ArrowLeftRight size={16} />
          <span>نقل</span>
        </button>
      )}
    </div>
  );
};

const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, isDragging, canDrag, overlay, onMoveClick }) => {
  if (overlay) {
    return <OrderCardOverlay order={order} />;
  }
  return (
    <OrderCardSortable
      order={order}
      onClick={onClick}
      isDragging={isDragging}
      canDrag={canDrag}
      onMoveClick={onMoveClick}
    />
  );
};

export default OrderCard;
