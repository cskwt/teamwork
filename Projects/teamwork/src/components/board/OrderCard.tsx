import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare, Calendar, User, AlertTriangle } from 'lucide-react';
import { Order } from '../../types';
import { useApp } from '../../contexts/AppContext';
import { getPriorityConfig, formatDateShort, isOverdue } from '../../utils/helpers';
import { useLang } from '../../contexts/LanguageContext';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
}

const CircleProgress: React.FC<{ value: number }> = ({ value }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 100 ? '#10b981' : value >= 60 ? '#6366f1' : '#f59e0b';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{value}%</text>
    </svg>
  );
};

const OrderCard: React.FC<OrderCardProps> = ({ order, onClick, isDragging, canDrag }) => {
  const { state } = useApp();
  const { lang } = useLang();
  const priorityConfig = getPriorityConfig(lang);
  const { currentUser } = state;
  const userDeptIds = currentUser?.departmentIds?.length ? currentUser.departmentIds : (currentUser?.departmentId ? [currentUser.departmentId] : []);
  const isOwnDept = userDeptIds.includes(order.departmentId);
  const isDragAllowed = canDrag !== undefined ? canDrag : true; // all users can drag (permission enforced in handleDragEnd)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sortDragging } = useSortable({ id: order.id, disabled: !isDragAllowed });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: sortDragging ? 0.4 : 1,
  };

  const assignedList = state.users.filter((u) => order.assignedUsers?.includes(u.id));

  const priority = priorityConfig[order.priority];
  const overdue = isOverdue(order.dueDate) && order.status !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragAllowed ? attributes : {})}
      {...(isDragAllowed ? listeners : {})}
      className={`order-card ${isDragging ? 'card-dragging' : ''} ${overdue ? 'card-overdue' : ''} ${!isDragAllowed ? 'card-no-drag' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {overdue && (
        <div className="card-overdue-banner">
          <AlertTriangle size={12} />
          <span>متأخر</span>
        </div>
      )}

      <div className="card-header">
        <span
          className="card-priority"
          style={{ background: priority.bg, color: priority.color }}
        >
          {priority.label}
        </span>
        {order.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="card-tag">{tag}</span>
        ))}
      </div>

      <div className="card-title-row-inner">
        <span className="card-order-num">رقم الطلبية: {order.orderNumber}</span>
        <p className="card-title">{order.clientName}</p>
      </div>

      {order.description && (
        <p className="card-desc">{order.description.slice(0, 70)}{order.description.length > 70 ? '...' : ''}</p>
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
          {assignedList.length > 0 ? assignedList.map((u) => (
            <div key={u.id} className="card-assignee" title={u.fullName}>
              {u.avatar
                ? <img src={u.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : u.fullName.charAt(0)}
            </div>
          )) : (
            <div className="card-assignee card-unassigned" title="غير معين">
              <User size={13} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderCard;
