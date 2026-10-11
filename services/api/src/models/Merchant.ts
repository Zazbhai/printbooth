import mongoose, { Schema, Document } from 'mongoose'

export interface IMerchant extends Document {
  merchantId: string
  name: string
  storeName: string
  email: string
  phone: string
  whatsapp?: string
  supportHours?: string
  supportNote?: string
  kioskId: string
  kioskVariant?: 'pro' | 'lite'
  address?: string
  lat?: number
  lng?: number
  kioskPhotoUrl: string // REQUIRED kiosk photo
  qrCodeUrl?: string
  commissionRate: number // e.g., 0.18 (18%)
  pricing?: {
    bwSingle: number
    bwDouble: number
    colorSingle: number
    colorDouble: number
  }
  todayEarnings: number
  wtdEarnings: number
  mtdEarnings: number
  totalEarnings: number
  bankName: string
  bankAccountLast4: string
  autoPayoutEnabled: boolean
  payoutSchedule: string
  paymentGateway: 'upiexpress' | 'razorpay'
  upiExpressApiKey?: string
  upiExpressUpiId?: string
  razorpayKeyId?: string
  razorpayKeySecret?: string
  username?: string
  password?: string
  isBlocked?: boolean
  requirePasswordChange?: boolean
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'BLOCKED'
  createdAt: Date
  updatedAt: Date
}

const MerchantSchema = new Schema<IMerchant>(
  {
    merchantId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    storeName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    whatsapp: { type: String, default: '' },
    supportHours: { type: String, default: '8:30 AM - 9:30 PM' },
    supportNote: { type: String, default: '' },
    kioskId: { type: String, required: true, index: true },
    kioskVariant: { type: String, enum: ['pro', 'lite'], default: 'pro' },
    address: { type: String, default: '' },
    lat: { type: Number, default: 18.5204 },
    kioskPhotoUrl: { type: String, default: 'https://images.unsplash.com/photo-1588702547919-26089e690ecc' },
    qrCodeUrl: { type: String, default: '' },
    commissionRate: { type: Number, default: 0.18 },
    pricing: {
      bwSingle: { type: Number, default: 2.0 },
      bwDouble: { type: Number, default: 3.5 },
      colorSingle: { type: Number, default: 10.0 },
      colorDouble: { type: Number, default: 18.0 },
    },
    todayEarnings: { type: Number, default: 0 },
    wtdEarnings: { type: Number, default: 0 },
    mtdEarnings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    bankName: { type: String, default: 'HDFC Bank' },
    bankAccountLast4: { type: String, default: '4821' },
    autoPayoutEnabled: { type: Boolean, default: true },
    payoutSchedule: { type: String, default: 'Friday 11:00 AM' },
    paymentGateway: { type: String, enum: ['upiexpress', 'razorpay'], default: 'upiexpress' },
    upiExpressApiKey: { type: String, default: '' },
    upiExpressUpiId: { type: String, default: '' },
    razorpayKeyId: { type: String, default: '' },
    razorpayKeySecret: { type: String, default: '' },
    username: { type: String, default: '', index: true },
    password: { type: String, default: '' },
    isBlocked: { type: Boolean, default: false },
    requirePasswordChange: { type: Boolean, default: true },
    status: { type: String, enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'BLOCKED'], default: 'ACTIVE' },
  },
  { timestamps: true }
)

export const Merchant = mongoose.models.Merchant || mongoose.model<IMerchant>('Merchant', MerchantSchema)
