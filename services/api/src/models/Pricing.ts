import mongoose, { Schema, Document } from 'mongoose'

export interface IPricingRule extends Document {
  ruleId: string
  paperSize: 'A4' | 'A3' | 'LETTER'
  colourMode: 'BW' | 'COLOUR'
  duplex: 'SINGLE' | 'DOUBLE'
  pricePerPage: number
  currency: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

const PricingRuleSchema = new Schema<IPricingRule>(
  {
    ruleId: { type: String, required: true, unique: true },
    paperSize: { type: String, enum: ['A4', 'A3', 'LETTER'], default: 'A4' },
    colourMode: { type: String, enum: ['BW', 'COLOUR'], default: 'BW' },
    duplex: { type: String, enum: ['SINGLE', 'DOUBLE'], default: 'SINGLE' },
    pricePerPage: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const PricingRule =
  mongoose.models.PricingRule || mongoose.model<IPricingRule>('PricingRule', PricingRuleSchema)
