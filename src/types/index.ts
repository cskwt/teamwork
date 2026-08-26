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
  /** Soft-delete — keeps tombstone so sync won't resurrect the user */
  deletedAt?: string;
}

export type OrderStatus = 'new' | 'in_progress' | 'review' | 'done' | 'cancelled' | 'archived';
export type OrderPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Local-only preview (IndexedDB) — stripped from server JSON */
  dataUrl?: string;
  /** Shared public URL on Hostinger uploads/ — synced to all devices */
  url?: string;
}

export interface OrderComment {
  id: string;
  orderId: string;
  userId: string;
  text: string;
  createdAt: string;
}

/** Digital printing order-request form fields */
export interface DigitalPrintingDetails {
  filePrintLocation?: string;
  productType?: string;
  quantity?: string;
  paperType?: string;
  paperWeight?: string;
  paperSize?: string;
  paperSource?: string;
  sidesPrinting?: string;
  colorMode?: string;
  outputDelivery?: string;
  lamination?: string;
  cutting?: string[];
  fileCutLocation?: string;
}

/** Mimaki / large-format job ticket from أمر طلبية */
export interface LargeFormatDetails {
  filePrintLocation?: string;
  productType?: string;
  quantity?: string;
  /** Roll type */
  material?: string;
  rollWidth?: string;
  resolution?: string;
  lamination?: string;
  cutting?: string;
  fileCutLocation?: string;
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
  /** Soft-deleted attachment ids — prevents sync from resurrecting deleted files */
  deletedAttachmentIds?: string[];
  fileExtensions: string;
  tags: string[];
  comments: OrderComment[];
  history: OrderHistoryEntry[];
  notes?: string;
  /** Structured digital-printing job ticket from أمر طلبية */
  digitalPrinting?: DigitalPrintingDetails;
  /** Structured Mimaki / large-format job ticket from أمر طلبية */
  largeFormat?: LargeFormatDetails;
  progress?: number;
  progressQuantity?: number;
  progressCompleted?: number;
  sortOrder?: number;
  /** When sortOrder was last changed — merged independently so sync won't wipe column order */
  sortOrderAt?: string;
  deletedAt?: string;
  completedAt?: string;
  archivedAt?: string;
  /** Show NEW badge in "جديد" column until a dept manager/admin opens the card */
  isNew?: boolean;
  /**
   * Order Request records live in AppState.orderRequests only.
   * Never shown on department Kanban / department order lists.
   */
  isOrderRequest?: boolean;
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
  /** Department board to open when the user taps the notification */
  departmentId?: string;
  /** User who triggered the notification (add / edit / comment) */
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  message: string;
  commentText?: string;
  createdAt: string;
  read: boolean;
}

export interface OpsRow {
  id: string;
  date: string;
  customer: string;
  job: string;
  jobImage: string;
  qty: string;
  target: string;
  finishedQty: string;
  finish: string;
  workers: string;
  progress: string;
  updatedAt?: string;
}

export type MaterialKind = 'digital' | 'large-format' | 'acrylics';

/** Shared print material catalog (Order Request) */
export interface Material {
  id: string;
  kind?: MaterialKind;
  /** Digital */
  paperType?: string;
  paperWeight?: string;
  /**
   * قيمة الرزمة بالدينار (Digital).
   * سعر الصفحة = packCost ÷ sheetsPerPack، ثم تكلفة القطعة = سعر الصفحة ÷ الحبات.
   */
  packCost?: string;
  /** عدد الصفحات / الأوراق في الرزمة */
  sheetsPerPack?: string;
  /**
   * تكلفة ورقة المصنع 100×70 سم (محسوبة تلقائياً أو قديمة).
   * تكلفة القطعة = sheetCost ÷ عدد الحبات لكل قياس.
   */
  sheetCost?: string;
  /** Large Format */
  rollType?: string;
  rollWidth?: string;
  /** سعر الرول بالدينار */
  rollCost?: string;
  /** عدد الأمتار في الرول */
  rollMeters?: string;
  /**
   * سعر المتر بالدينار = rollCost ÷ rollMeters (محسوب تلقائياً).
   */
  meterCost?: string;
  /** Acrylics */
  acrylicType?: string;
  /** سماكة اللوح */
  acrylicThickness?: string;
  /** سعر لوح المصنع 144×244 بالدينار */
  acrylicBoardCost?: string;
  /**
   * سعر القطعة 120×80 = acrylicBoardCost ÷ 3
   */
  acrylicPieceCost?: string;
  /** Legacy single-name materials */
  name?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ManufacturingType = 'في المطبعة' | 'خارجي' | 'In House' | 'Out Source' | '';

/** Order Costs spreadsheet row (تكاليف الطلبيات) */
export interface OrderCostRow {
  id: string;
  client: string;
  invoiceNumber: string;
  /** قيمة الفاتورة */
  invoiceValue: string;
  /** مقدم الطلب (كان يُعرض كمبلغ مدفوع) */
  amount: string;
  manufacturing: ManufacturingType;
  costs: string;
  notes: string;
  /** تم الدفع */
  paid?: boolean;
  updatedAt?: string;
}

export interface AppState {
  users: User[];
  departments: Department[];
  /** Department Kanban / workflow orders only */
  orders: Order[];
  /**
   * Order Request (digital / large-format forms) — fully separate from department orders.
   * Notes and details here must never mix into Kanban order cards.
   */
  orderRequests: Order[];
  materials: Material[];
  orderCostRows: OrderCostRow[];
  /**
   * When the cost sheet was last replaced locally (add/edit/delete).
   * Used so deletes are not resurrected by server union-merge.
   */
  orderCostsUpdatedAt?: string;
  currentUser: User | null;
  notifications: AppNotification[];
  opsRows: OpsRow[];
  /** ISO timestamp of last intentional ops-screen edit — protects against stale overwrites */
  opsUpdatedAt?: string;
}
