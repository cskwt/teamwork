import { OrderPriority, OrderStatus, Order, Department } from '../types';

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateShort = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const priorityConfig: Record<OrderPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'عادية', color: '#64748b', bg: '#f1f5f9' },
  medium: { label: 'متوسطة', color: '#f59e0b', bg: '#fffbeb' },
  high: { label: 'عالية', color: '#ef4444', bg: '#fef2f2' },
  urgent: { label: 'عاجل', color: '#dc2626', bg: '#fee2e2' },
};

export const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'جديد', color: '#6366f1', bg: '#eef2ff' },
  in_progress: { label: 'قيد التنفيذ', color: '#f59e0b', bg: '#fffbeb' },
  review: { label: 'مراجعة', color: '#8b5cf6', bg: '#f5f3ff' },
  done: { label: 'منجز', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: 'ملغي', color: '#ef4444', bg: '#fef2f2' },
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

export const isOverdue = (dueDate?: string): boolean => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

// يعيد اسم ولون العمود الذي تنتمي إليه الطلبية
export const getColumnStatus = (
  order: Order,
  departments: Department[]
): { label: string; color: string; bg: string } => {
  const dept = departments.find((d) => d.id === order.departmentId);
  const col = dept?.columns.find((c) => c.id === order.status);
  if (col) {
    return {
      label: col.title,
      color: col.color,
      bg: col.color + '22',
    };
  }
  return { label: order.status, color: '#6366f1', bg: '#eef2ff' };
};
