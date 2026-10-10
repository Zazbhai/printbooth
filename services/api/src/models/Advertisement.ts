import mongoose, { Document, Schema } from 'mongoose'

export interface IAdvertisement extends Document {
  campaignId: string
  title: string
  advertiser: string
  mediaType: 'IMAGE' | 'VIDEO' | 'TEXT_BANNER'
  mediaUrl: string
  headline?: string
  tagline?: string
  callToAction?: string
  qrCodeUrl?: string
  badgeText?: string
  accentColor?: string
  motionType: 'DRIFT' | 'FLOAT' | 'MARQUEE' | 'PULSE' | 'KEN_BURNS'
  motionSpeed: 'SLOW' | 'NORMAL' | 'FAST'
  opacity: number
  targetKiosks: string[]
  status: 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'COMPLETED'
  priority: number
  startDate?: Date
  endDate?: Date
  impressionsCount: number
  clicksCount: number
  createdAt: Date
  updatedAt: Date
}

const AdvertisementSchema = new Schema<IAdvertisement>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    advertiser: { type: String, required: true, trim: true },
    mediaType: {
      type: String,
      enum: ['IMAGE', 'VIDEO', 'TEXT_BANNER'],
      default: 'IMAGE',
    },
    mediaUrl: { type: String, required: true, trim: true },
    headline: { type: String, default: '' },
    tagline: { type: String, default: '' },
    callToAction: { type: String, default: 'Scan to Explore' },
    qrCodeUrl: { type: String, default: '' },
    badgeText: { type: String, default: 'SPONSORED' },
    accentColor: { type: String, default: '#dc2626' },
    motionType: {
      type: String,
      enum: ['DRIFT', 'FLOAT', 'MARQUEE', 'PULSE', 'KEN_BURNS'],
      default: 'DRIFT',
    },
    motionSpeed: {
      type: String,
      enum: ['SLOW', 'NORMAL', 'FAST'],
      default: 'SLOW',
    },
    opacity: { type: Number, default: 0.22, min: 0.05, max: 0.8 },
    targetKiosks: { type: [String], default: ['ALL'] },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'SCHEDULED', 'COMPLETED'],
      default: 'ACTIVE',
      index: true,
    },
    priority: { type: Number, default: 1 },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    impressionsCount: { type: Number, default: 0 },
    clicksCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
)

export const Advertisement =
  mongoose.models.Advertisement ||
  mongoose.model<IAdvertisement>('Advertisement', AdvertisementSchema)
