// ─────────────────────────────────────────────
// PrintBooth Shared Types
// ─────────────────────────────────────────────

// ──────── Kiosk ────────
export type KioskStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'MAINTENANCE'
  | 'ERROR';

export type PrinterStatus =
  | 'READY'
  | 'PRINTING'
  | 'PAUSED'
  | 'OFFLINE'
  | 'ERROR'
  | 'PAPER_JAM'
  | 'PAPER_EMPTY'
  | 'TONER_LOW'
  | 'TONER_EMPTY';

export interface KioskHeartbeat {
  kioskId: string;
  status: KioskStatus;
  printer: PrinterStatus;
  paper: {
    tray1: number; // percentage 0-100
    tray2?: number;
  };
  toner: number; // percentage 0-100
  queue: number;
  temperature?: number; // celsius
  networkStrength?: number; // percentage
  diskFree?: number; // MB
  uptime?: number; // seconds
  timestamp: string;
}

export interface Kiosk {
  id: string;
  name: string;
  location: string;
  address?: string;
  lat?: number;
  lng?: number;
  deviceToken?: string;
  status: KioskStatus;
  printerStatus: PrinterStatus;
  paperTray1: number;
  paperTray2?: number;
  toner: number;
  lastSeenAt?: string;
  todayPages: number;
  todayRevenue: number;
  queueCount: number;
  createdAt: string;
  updatedAt: string;
}

// ──────── Order ────────
export type OrderStatus =
  | 'CREATED'
  | 'UPLOADED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'QUEUED'
  | 'ASSIGNED'
  | 'DOWNLOADING'
  | 'PRINTING'
  | 'PRINTED'
  | 'READY_FOR_COLLECTION'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PRINT_FAILED'
  | 'PRINTER_ERROR';

export type ColourMode = 'BW' | 'COLOUR';
export type PaperSize = 'A4' | 'A3' | 'LETTER';
export type DuplexMode = 'SINGLE' | 'DOUBLE';

export interface PrintSettings {
  pages: 'ALL' | string; // 'ALL' or '1-5' etc.
  copies: number;
  colourMode: ColourMode;
  duplex: DuplexMode;
  paperSize: PaperSize;
}

export interface Order {
  id: string;
  orderNumber: string;
  kioskId?: string;
  kiosk?: Kiosk;
  fileId: string;
  fileName: string;
  status: OrderStatus;
  settings: PrintSettings;
  pageCount: number;
  amount: number;
  currency: string;
  sessionId: string;
  createdAt: string;
  paidAt?: string;
  printedAt?: string;
  completedAt?: string;
  errorCode?: string;
}

// ──────── File ────────
export interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
  uploadedAt: string;
  expiresAt?: string;
}

// ──────── Payment ────────
export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: string;
  createdAt: string;
}

// ──────── Pricing ────────
export interface PricingRule {
  id: string;
  kioskId?: string; // null = global
  paperSize: PaperSize;
  colourMode: ColourMode;
  duplex: DuplexMode;
  pricePerPage: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ──────── Print Job ────────
export type PrintJobStatus =
  | 'PENDING'
  | 'DOWNLOADING'
  | 'PRINTING'
  | 'PRINTED'
  | 'FAILED'
  | 'CANCELLED';

export interface PrintJob {
  id: string;
  orderId: string;
  kioskId: string;
  cupsJobId?: number;
  status: PrintJobStatus;
  attempts: number;
  errorCode?: string;
  progress?: number; // 0-100
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ──────── Alerts ────────
export type AlertType =
  | 'KIOSK_OFFLINE'
  | 'PRINTER_OFFLINE'
  | 'PAPER_LOW'
  | 'PAPER_EMPTY'
  | 'TONER_LOW'
  | 'TONER_EMPTY'
  | 'PRINTER_ERROR'
  | 'PAPER_JAM'
  | 'QUEUE_STUCK'
  | 'DISK_LOW'
  | 'HIGH_TEMPERATURE'
  | 'NETWORK_FAILURE';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  kioskId: string;
  kiosk?: Kiosk;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
}

// ──────── Print Session ────────
export interface PrintSession {
  id: string;
  token: string;
  expiresAt: string;
  kioskId?: string;
  fileId?: string;
  orderId?: string;
  createdAt: string;
}

// ──────── WebSocket Events ────────
export type WSEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'print.started'
  | 'print.progress'
  | 'print.completed'
  | 'print.failed'
  | 'printer.error'
  | 'kiosk.offline'
  | 'kiosk.online'
  | 'kiosk.status'
  | 'job.queued'
  | 'alert.created';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: string;
}

// ──────── API Responses ────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  code?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

// ──────── Admin ────────
export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR' | 'TECHNICIAN';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  createdAt: string;
}

export interface DashboardStats {
  activeKiosks: number;
  onlineKiosks: number;
  offlineKiosks: number;
  todayPrints: number;
  todayRevenue: number;
  pendingAlerts: number;
  activeOrders: number;
}
