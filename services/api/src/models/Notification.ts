import mongoose, { Schema, Document } from 'mongoose'

export interface INotification extends Document {
  notificationId: string
  title: string
  message: string
  type: 'INFO' | 'WARNING' | 'ALERT' | 'MAINTENANCE' | 'SYSTEM'
  target: 'ALL' | string
  targetMerchantId?: string
  targetMerchantName?: string
  targetKioskId?: string
  createdBy: string
  readBy: string[]
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    notificationId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['INFO', 'WARNING', 'ALERT', 'MAINTENANCE', 'SYSTEM'],
      default: 'INFO',
    },
    target: { type: String, default: 'ALL', index: true },
    targetMerchantId: { type: String, index: true },
    targetMerchantName: { type: String },
    targetKioskId: { type: String, index: true },
    createdBy: { type: String, default: 'Platform Administrator' },
    readBy: { type: [String], default: [] },
  },
  { timestamps: true }
)

export const Notification =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema)
