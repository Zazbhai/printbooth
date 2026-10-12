import mongoose, { Schema, Document } from 'mongoose'

export interface IKiosk extends Document {
  kioskId: string
  kioskVariant?: 'pro' | 'lite'
  name: string
  location: string
  address: string
  lat: number
  lng: number
  status: 'ONLINE' | 'OFFLINE' | 'WARNING' | 'MAINTENANCE'
  printerStatus: 'READY' | 'PRINTING' | 'PAUSED' | 'OFFLINE' | 'ERROR' | 'PAPER_JAM' | 'PAPER_EMPTY' | 'TONER_LOW'
  printerModel: string
  paperLevel: number // 0-100%
  tonerLevel: number // 0-100%
  paperTrayCapacity?: number // maximum sheets tray holds (default 150)
  remainingPages?: number // physical sheets currently in tray
  paperHistory?: {
    id: string
    action: 'SET' | 'ADD' | 'REDUCE' | 'PRINT_CONSUMED' | 'REFILL'
    amount: number
    remainingAfter: number
    note: string
    orderId?: string
    createdAt: Date
  }[]
  usbConnected?: boolean
  usbDevice?: string
  queueCount: number
  todayPages: number
  todayRevenue: number
  totalRevenue: number
  merchantId?: string
  kioskPhotoUrl?: string
  qrCodeUrl?: string
  paymentGateway?: 'upiexpress' | 'razorpay'
  upiExpressApiKey?: string
  upiExpressUpiId?: string
  razorpayKeyId?: string
  razorpayKeySecret?: string
  pricing?: {
    bwSingle: number
    bwDouble: number
    colorSingle: number
    colorDouble: number
  }
  deviceSecret?: string
  lastIp?: string
  merchantError?: string | null
  merchantRecommendation?: string | null
  merchantErrorAt?: Date | null
  lastSeenAt: Date
  createdAt: Date
  updatedAt: Date
}

const KioskSchema = new Schema<IKiosk>(
  {
    kioskId: { type: String, required: true, unique: true, index: true },
    kioskVariant: { type: String, enum: ['pro', 'lite'], default: 'pro' },
    name: { type: String, required: true },
    location: { type: String, required: true },
    address: { type: String, default: '' },
    lat: { type: Number, default: 18.5204 },
    lng: { type: Number, default: 73.8567 },
    status: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'WARNING', 'MAINTENANCE'],
      default: 'ONLINE',
      index: true,
    },
    printerStatus: {
      type: String,
      enum: ['READY', 'PRINTING', 'PAUSED', 'OFFLINE', 'ERROR', 'PAPER_JAM', 'PAPER_EMPTY', 'TONER_LOW'],
      default: 'READY',
    },
    printerModel: { type: String, default: 'Brother DCP-T420W Printer USB' },
    paperLevel: { type: Number, default: 100, min: 0, max: 100 },
    tonerLevel: { type: Number, default: 100, min: 0, max: 100 },
    paperTrayCapacity: { type: Number, default: 150, min: 1 },
    remainingPages: { type: Number, default: 125, min: 0 },
    paperHistory: [
      {
        id: { type: String, required: true },
        action: {
          type: String,
          enum: ['SET', 'ADD', 'REDUCE', 'PRINT_CONSUMED', 'REFILL'],
          default: 'SET',
        },
        amount: { type: Number, required: true },
        remainingAfter: { type: Number, required: true },
        note: { type: String, default: '' },
        orderId: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    usbConnected: { type: Boolean, default: true },
    usbDevice: { type: String, default: '' },
    queueCount: { type: Number, default: 0 },
    todayPages: { type: Number, default: 0 },
    todayRevenue: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    merchantId: { type: String, default: null, index: true },
    deviceSecret: { type: String, default: null, index: true },
    lastIp: { type: String, default: '' },
    kioskPhotoUrl: { type: String, default: '' },
    qrCodeUrl: { type: String, default: '' },
    paymentGateway: { type: String, enum: ['upiexpress', 'razorpay'], default: 'upiexpress' },
    upiExpressApiKey: { type: String, default: '' },
    upiExpressUpiId: { type: String, default: '' },
    razorpayKeyId: { type: String, default: '' },
    razorpayKeySecret: { type: String, default: '' },
    pricing: {
      bwSingle: { type: Number, default: 2.0 },
      bwDouble: { type: Number, default: 3.5 },
      colorSingle: { type: Number, default: 10.0 },
      colorDouble: { type: Number, default: 18.0 },
    },
    lastSeenAt: { type: Date, default: Date.now },
    merchantError: { type: String, default: null },
    merchantRecommendation: { type: String, default: null },
    merchantErrorAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export const Kiosk = mongoose.models.Kiosk || mongoose.model<IKiosk>('Kiosk', KioskSchema)
