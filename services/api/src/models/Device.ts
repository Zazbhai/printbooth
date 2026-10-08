import mongoose, { Schema, Document } from 'mongoose'

export interface IDevice extends Document {
  kioskId: string
  name: string
  publicKey: string
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'PROVISIONING'
  agentVersion: string
  lastSeenAt: Date
  registeredAt: Date
  printer: {
    name: string
    status: string
    isOnline: boolean
    paperLevel: number
    tonerLevel: number
  }
  vitals: {
    cpuTempC?: number
    memUsedPct?: number
    diskFreeGb?: number
    platform?: string
  }
  provisioningCode?: string
  provisioningExpiresAt?: Date
}

const DeviceSchema = new Schema<IDevice>(
  {
    kioskId: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    name: { type: String, default: 'PrintBooth Kiosk Station' },
    publicKey: { type: String, required: true },
    status: { type: String, enum: ['ONLINE', 'OFFLINE', 'MAINTENANCE', 'PROVISIONING'], default: 'OFFLINE' },
    agentVersion: { type: String, default: '1.0.0' },
    lastSeenAt: { type: Date, default: Date.now },
    registeredAt: { type: Date, default: Date.now },
    printer: {
      name: { type: String, default: 'auto' },
      status: { type: String, default: 'UNKNOWN' },
      isOnline: { type: Boolean, default: false },
      paperLevel: { type: Number, default: 100 },
      tonerLevel: { type: Number, default: 100 },
    },
    vitals: {
      cpuTempC: { type: Number },
      memUsedPct: { type: Number },
      diskFreeGb: { type: Number },
      platform: { type: String },
    },
    provisioningCode: { type: String, select: false },
    provisioningExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
)

export const Device = mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema)
