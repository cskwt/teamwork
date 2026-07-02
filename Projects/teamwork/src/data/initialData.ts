import { User, Department, Order } from '../types';

export const DEFAULT_COLUMNS = [
  { id: 'new', title: 'جديد', color: '#6366f1', order: 0 },
  { id: 'in_progress', title: 'قيد التنفيذ', color: '#f59e0b', order: 1 },
  { id: 'review', title: 'مراجعة', color: '#8b5cf6', order: 2 },
  { id: 'done', title: 'منجز', color: '#10b981', order: 3 },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    username: 'admin',
    password: 'admin123',
    fullName: 'مدير النظام',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-1',
    username: 'ahmed',
    password: 'ahmed123',
    fullName: 'أحمد محمد',
    role: 'manager',
    departmentId: 'dept-1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-2',
    username: 'sara',
    password: 'sara123',
    fullName: 'سارة علي',
    role: 'member',
    departmentId: 'dept-1',
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept-1',
    name: 'قسم المبيعات',
    description: 'Sales Section',
    managerId: 'user-1',
    color: '#22c55e',
    icon: 'ShoppingCart',
    createdAt: new Date().toISOString(),
    columns: DEFAULT_COLUMNS,
  },
  {
    id: 'dept-2',
    name: 'قسم التصميم',
    description: 'Designing Section',
    color: '#f97316',
    icon: 'Palette',
    createdAt: new Date().toISOString(),
    columns: DEFAULT_COLUMNS,
  },
  {
    id: 'dept-3',
    name: 'قسم الليزر والUV',
    description: 'Laser and UV Printing Section',
    color: '#38bdf8',
    icon: 'Zap',
    createdAt: new Date().toISOString(),
    columns: DEFAULT_COLUMNS,
  },
  {
    id: 'dept-4',
    name: 'قسم الطباعة والعمليات',
    description: 'Printing & Operation Section',
    color: '#eab308',
    icon: 'Printer',
    createdAt: new Date().toISOString(),
    columns: DEFAULT_COLUMNS,
  },
  {
    id: 'dept-5',
    name: 'قسم التسليم',
    description: 'Delivery Section',
    color: '#8b5cf6',
    icon: 'Truck',
    createdAt: new Date().toISOString(),
    columns: [
      { id: 'new',         title: 'الطلبيات الجاهزة', color: '#6366f1', order: 0 },
      { id: 'in_progress', title: 'للتوصيل',           color: '#f59e0b', order: 1 },
      { id: 'review',      title: 'قيد التسليم',       color: '#8b5cf6', order: 2 },
      { id: 'done',        title: 'للاستلام',          color: '#10b981', order: 3 },
    ],
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'order-demo',
    orderNumber: '1001',
    clientName: 'عميل تجريبي',
    title: '#1001 - عميل تجريبي',
    description: 'هذه طلبية تجريبية لتوضيح طريقة عمل البرنامج',
    status: 'new',
    priority: 'medium',
    departmentId: 'dept-1',
    assignedUsers: ['user-1'],
    createdBy: 'user-admin',
    createdAt: new Date().toISOString(),
    orderDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    orderForms: [],
    fileExtensions: 'PDF, AI',
    tags: [],
    comments: [],
    history: [],
  },
];
