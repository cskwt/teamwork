export type UserRole = 'admin' | 'manager' | 'member';

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  departmentId?: string;
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
  assignedUsers: string[];
  createdBy: string;
  createdAt: string;
  orderDate: string;
  updatedAt: string;
  dueDate?: string;
  orderForms: FileAttachment[];
  invoice?: FileAttachment;
  fileExtensions: string;
  tags: string[];
  comments: OrderComment[];
  history: OrderHistoryEntry[];
  notes?: string;
  progress?: number;
  deletedAt?: string;
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
