import mongoose, { Schema, Document } from 'mongoose'

export interface IAlert extends Document {
  alertId: string
  kioskId: string
  kioskLocation?: string
  type:
    | 'KIOSK_OFFLINE'
    | 'PRINTER_OFFLINE'
    | 'PAPER_LOW'
    | 'PAPER_EMPTY'
    | 'TONER_LOW'
    | 'TONER_EMPTY'
    | 'PRINTER_ERROR'
    | 'PAPER_JAM'
    | 'PAYMENT_GATEWAY_ERROR'
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  message: string
  acknowledged: boolean
  acknowledgedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const AlertSchema = new Schema<IAlert>(
  {
    alertId: { type: String, required: true, unique: true, index: true },
    kioskId: { type: String, required: true, index: true },
    kioskLocation: { type: String },
    type: {
      type: String,
      enum: [
        'KIOSK_OFFLINE',
        'PRINTER_OFFLINE',
        'PAPER_LOW',
        'PAPER_EMPTY',
        'TONER_LOW',
        'TONER_EMPTY',
        'PRINTER_ERROR',
        'PAPER_JAM',
        'PAYMENT_GATEWAY_ERROR',
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'WARNING',
    },
    message: { type: String, required: true },
    acknowledged: { type: Boolean, default: false, index: true },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true }
)

export const Alert = mongoose.models.Alert || mongoose.model<IAlert>('Alert', AlertSchema)
