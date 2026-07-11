export type UserRole = 'admin' | 'manager' | 'member';

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  departmentId?: string;   // legacy - kept for backward compat
  departmentIds?: string[]; // new multi-department support
  avatar?: string;
  createdAt: string;
}

export type OrderStatus = 'new' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type OrderPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface OrderComment {
  id: string;
  orderId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  title: string;
  description: string;
  status: OrderStatus;
  priority: OrderPriority;
  departmentId: string;
  departmentIds?: string[];
  groupId?: string;
  originDepartmentId?: string;
  assignedUsers: string[];
  createdBy: string;
  createdAt: string;
  orderDate: string;
  updatedAt: string;
  dueDate?: string;
  orderForms: FileAttachment[];
  invoice?: FileAttachment;
  invoices?: FileAttachment[];
  fileExtensions: string;
  tags: string[];
  comments: OrderComment[];
  history: OrderHistoryEntry[];
  notes?: string;
  progress?: number;
  progressQuantity?: number;
  progressCompleted?: number;
  sortOrder?: number;
  deletedAt?: string;
  completedAt?: string;
}

export interface OrderHistoryEntry {
  id: string;
  orderId: string;
  userId: string;
  action: string;
  fromValue?: string;
  toValue?: string;
  timestamp: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  managerId?: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt?: string;
  columns: KanbanColumn[];
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  order: number;
}

export type AppNotificationType = 'new_order' | 'assigned' | 'chat' | 'updated';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  userId: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  message: string;
  commentText?: string;
  createdAt: string;
  read: boolean;
}

export interface AppState {
  users: User[];
  departments: Department[];
  orders: Order[];
  currentUser: User | null;
  notifications: AppNotification[];
}
