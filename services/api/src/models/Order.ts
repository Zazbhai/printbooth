import mongoose, { Schema, Document } from 'mongoose'

export interface IOrder extends Document {
  orderId: string
  orderNumber: string
  kioskId: string
  fileName: string
  fileSize: number
  fileUrl?: string
  status:
    | 'CREATED'
    | 'UPLOADED'
    | 'PAYMENT_PENDING'
    | 'PAID'
    | 'PAYMENT_HELD_OFFLINE'
    | 'QUEUED'
    | 'PRINTING'
    | 'PRINTED'
    | 'COMPLETED'
    | 'PAYMENT_FAILED'
    | 'FAILED'
    | 'REJECTED'
    | 'EXPIRED'
  pageCount: number
  copies: number
  colourMode: 'BW' | 'COLOUR'
  duplex: 'SINGLE' | 'DOUBLE'
  paperSize: 'A4' | 'A3' | 'LETTER' | 'LEGAL' | string
  pageRange?: string
  scaling?: string
  pagesPerSheet?: number
  printSettings?: Record<string, any>
  pageColours?: any
  pageCopies?: any
  amount: number // in INR (₹)
  merchantCut: number // in INR (₹)
  currency: string
  customerPhone?: string
  customerEmail?: string
  customerIp?: string
  customerMac?: string
  heldReason?: string
  paymentConfirmation?: {
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
    confirmedAt?: Date
    confirmedBy?: string
  }
  pickupCode?: string
  releasePin?: string
  otp?: string
  isPinUsed?: boolean
  pinUsedAt?: Date
  usedPins?: string[]
  fileDeleted?: boolean
  fileDeletedAt?: Date
  fileExpiresAt?: Date
  paidAt?: Date
  printedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    kioskId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    fileUrl: { type: String, default: '' },
    heldReason: { type: String },
    status: {
      type: String,
      enum: [
        'CREATED',
        'UPLOADED',
        'PAYMENT_PENDING',
        'PAID',
        'PAYMENT_HELD_OFFLINE',
        'QUEUED',
        'PRINTING',
        'PRINTED',
        'COMPLETED',
        'PAYMENT_FAILED',
        'FAILED',
        'REJECTED',
        'EXPIRED',
      ],
      default: 'COMPLETED',
      index: true,
    },
    pageCount: { type: Number, required: true, default: 1 },
    copies: { type: Number, default: 1 },
    colourMode: { type: String, enum: ['BW', 'COLOUR'], default: 'BW' },
    duplex: { type: String, enum: ['SINGLE', 'DOUBLE'], default: 'SINGLE' },
    paperSize: { type: String, default: 'A4' },
    pageRange: { type: String, default: 'ALL' },
    scaling: { type: String, default: 'FIT' },
    pagesPerSheet: { type: Number, default: 1 },
    pageColours: { type: Schema.Types.Mixed },
    pageCopies: { type: Schema.Types.Mixed },
    printSettings: { type: Schema.Types.Mixed },
    amount: { type: Number, required: true },
    merchantCut: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    customerPhone: { type: String },
    customerEmail: { type: String },
    customerIp: { type: String, index: true },
    customerMac: { type: String, index: true },
    paymentConfirmation: {
      status: { type: String, enum: ['PENDING', 'CONFIRMED', 'REJECTED'], default: 'CONFIRMED' },
      confirmedAt: { type: Date },
      confirmedBy: { type: String },
    },
    pickupCode: { type: String, index: true },
    releasePin: { type: String, index: true },
    otp: { type: String, index: true },
    isPinUsed: { type: Boolean, default: false, index: true },
    pinUsedAt: { type: Date },
    usedPins: [{ type: String, index: true }],
    fileDeleted: { type: Boolean, default: false, index: true },
    fileDeletedAt: { type: Date },
    fileExpiresAt: { type: Date, index: true },
    paidAt: { type: Date },
    printedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

export const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)
