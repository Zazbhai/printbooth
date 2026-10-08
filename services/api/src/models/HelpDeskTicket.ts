import mongoose, { Schema, Document } from 'mongoose'

export type QuerySenderType = 'USER' | 'MERCHANT'

export type QueryCategory =
  | 'PAPER_JAM'
  | 'PAYMENT_REFUND'
  | 'HARDWARE_MAINTENANCE'
  | 'SUPPLIES_RESTOCK'
  | 'KIOSK_OFFLINE'
  | 'ACCOUNT_PAYOUT'
  | 'GENERAL_INQUIRY'

export type QueryPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
export type QueryStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'

export interface IQueryMessage {
  id: string
  sender: 'CUSTOMER' | 'MERCHANT' | 'ADMIN'
  senderName: string
  text: string
  timestamp: string
  isInternalNote?: boolean
}

export interface IHelpDeskTicket extends Document {
  id: string
  senderType: QuerySenderType
  title: string
  category: QueryCategory
  priority: QueryPriority
  status: QueryStatus
  requesterName: string
  requesterEmail: string
  requesterPhone: string
  kioskId?: string
  kioskLocation?: string
  orderId?: string
  merchantId?: string
  assignedTo?: string
  messages: IQueryMessage[]
  hardwareTelemetry?: {
    printerStatus: string
    paperLevel: number
    tonerLevel: number
  }
  createdAt: Date
  updatedAt: Date
}

const QueryMessageSchema = new Schema<IQueryMessage>(
  {
    id: { type: String, required: true },
    sender: { type: String, enum: ['CUSTOMER', 'MERCHANT', 'ADMIN'], required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: String, required: true },
    isInternalNote: { type: Boolean, default: false },
  },
  { _id: false }
)

const HelpDeskTicketSchema = new Schema<IHelpDeskTicket>(
  {
    id: { type: String, required: true, unique: true, index: true },
    senderType: { type: String, enum: ['USER', 'MERCHANT'], default: 'USER', index: true },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: [
        'PAPER_JAM',
        'PAYMENT_REFUND',
        'HARDWARE_MAINTENANCE',
        'SUPPLIES_RESTOCK',
        'KIOSK_OFFLINE',
        'ACCOUNT_PAYOUT',
        'GENERAL_INQUIRY',
      ],
      default: 'GENERAL_INQUIRY',
      index: true,
    },
    priority: { type: String, enum: ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'], default: 'HIGH', index: true },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], default: 'OPEN', index: true },
    requesterName: { type: String, required: true },
    requesterEmail: { type: String, required: true },
    requesterPhone: { type: String, required: true },
    kioskId: { type: String },
    kioskLocation: { type: String },
    orderId: { type: String },
    merchantId: { type: String },
    assignedTo: { type: String, default: 'Ops Support' },
    messages: { type: [QueryMessageSchema], default: [] },
    hardwareTelemetry: {
      printerStatus: { type: String, default: 'READY' },
      paperLevel: { type: Number, default: 100 },
      tonerLevel: { type: Number, default: 100 },
    },
  },
  { timestamps: true }
)

export const HelpDeskTicketModel =
  mongoose.models.HelpDeskTicket ||
  mongoose.model<IHelpDeskTicket>('HelpDeskTicket', HelpDeskTicketSchema)
