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

export const priorityColors: Record<OrderPriority, { color: string; bg: string }> = {
  low:    { color: '#64748b', bg: '#f1f5f9' },
  medium: { color: '#f59e0b', bg: '#fffbeb' },
  high:   { color: '#ef4444', bg: '#fef2f2' },
  urgent: { color: '#dc2626', bg: '#fee2e2' },
};

export const priorityLabelsAr: Record<OrderPriority, string> = {
  low: 'عادية', medium: 'متوسطة', high: 'عالية', urgent: 'عاجل',
};

export const priorityLabelsEn: Record<OrderPriority, string> = {
  low: 'Normal', medium: 'Medium', high: 'High', urgent: 'Urgent',
};

export const getPriorityConfig = (lang: string): Record<OrderPriority, { label: string; color: string; bg: string }> => {
  const labels = lang === 'en' ? priorityLabelsEn : priorityLabelsAr;
  return {
    low:    { label: labels.low,    ...priorityColors.low },
    medium: { label: labels.medium, ...priorityColors.medium },
    high:   { label: labels.high,   ...priorityColors.high },
    urgent: { label: labels.urgent, ...priorityColors.urgent },
  };
};

// Keep static export for backward compatibility (defaults to Arabic)
export const priorityConfig: Record<OrderPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'عادية', color: '#64748b', bg: '#f1f5f9' },
  medium: { label: 'متوسطة', color: '#f59e0b', bg: '#fffbeb' },
  high: { label: 'عالية', color: '#ef4444', bg: '#fef2f2' },
  urgent: { label: 'عاجل', color: '#dc2626', bg: '#fee2e2' },
};

export const statusColors: Record<OrderStatus, { color: string; bg: string }> = {
  new:         { color: '#6366f1', bg: '#eef2ff' },
  in_progress: { color: '#f59e0b', bg: '#fffbeb' },
  review:      { color: '#8b5cf6', bg: '#f5f3ff' },
  done:        { color: '#10b981', bg: '#ecfdf5' },
  cancelled:   { color: '#ef4444', bg: '#fef2f2' },
  archived:    { color: '#64748b', bg: '#f1f5f9' },
};

export const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'جديد', color: '#6366f1', bg: '#eef2ff' },
  in_progress: { label: 'قيد التنفيذ', color: '#f59e0b', bg: '#fffbeb' },
  review: { label: 'مراجعة', color: '#8b5cf6', bg: '#f5f3ff' },
  done: { label: 'منجز', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: 'ملغي', color: '#ef4444', bg: '#fef2f2' },
  archived: { label: 'مؤرشف', color: '#64748b', bg: '#f1f5f9' },
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
