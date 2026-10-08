import mongoose, { Schema, Document } from 'mongoose'

export interface IBlockedUser extends Document {
  kioskId: string
  ip?: string
  mac?: string
  reason?: string
  blockedBy?: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

const BlockedUserSchema = new Schema<IBlockedUser>(
  {
    kioskId: { type: String, required: true, index: true },
    ip: { type: String, index: true },
    mac: { type: String, index: true },
    reason: { type: String, default: 'Blocked by merchant partner' },
    blockedBy: { type: String, default: 'merchant' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
)

// Ensure compound index for fast kiosk + IP lookups
BlockedUserSchema.index({ kioskId: 1, ip: 1, active: 1 })
BlockedUserSchema.index({ kioskId: 1, mac: 1, active: 1 })

export const BlockedUser = mongoose.model<IBlockedUser>('BlockedUser', BlockedUserSchema)
