import mongoose, { Schema, Document } from 'mongoose'

export interface IPayment extends Document {
  paymentId: string          // Internal ID
  razorpayOrderId?: string   // Razorpay order ID (order_xxx) or UPI Express synthetic ID
  razorpayPaymentId?: string // Razorpay payment ID after capture (pay_xxx)
  razorpaySignature?: string // HMAC signature for verification
  orderId: string            // PrintBooth order ID
  merchantId?: string        // Associated merchant
  amount: number             // Amount in INR (₹)
  currency: string
  status:
    | 'CREATED'
    | 'PENDING'
    | 'CAPTURED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'FAILED'
  refundId?: string          // Razorpay refund ID (rfnd_xxx)
  refundAmount?: number
  refundReason?: string
  refundedAt?: Date
  payoutId?: string          // Razorpay payout / transfer ID
  payoutAmount?: number
  payoutStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  payoutAt?: Date
  method?: string            // upi / card / netbanking / wallet
  description?: string
  notes?: Record<string, string>
  capturedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const PaymentSchema = new Schema<IPayment>(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => 'PAY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
    },
    razorpayOrderId: { type: String, sparse: true, index: true },
    razorpayPaymentId: { type: String, sparse: true, index: true },
    razorpaySignature: { type: String },
    orderId: { type: String, required: true, index: true },
    merchantId: { type: String, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['CREATED', 'PENDING', 'CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED'],
      default: 'CREATED',
      index: true,
    },
    refundId: { type: String },
    refundAmount: { type: Number },
    refundReason: { type: String },
    refundedAt: { type: Date },
    payoutId: { type: String },
    payoutAmount: { type: Number },
    payoutStatus: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
    payoutAt: { type: Date },
    method: { type: String },
    description: { type: String },
    notes: { type: Map, of: String },
    capturedAt: { type: Date },
  },
  { timestamps: true }
)

export const Payment = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema)
