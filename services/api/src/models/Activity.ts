import mongoose, { Schema, Document } from 'mongoose'

export interface IActivity extends Document {
  activityId: number
  title: string
  description: string
  iconType: 'message' | 'award' | 'calendar' | 'tag' | 'task' | 'alert' | 'payout'
  iconBg: string
  timeAgo: string
  read: boolean
  createdAt: Date
}

const ActivitySchema = new Schema<IActivity>(
  {
    activityId: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    iconType: {
      type: String,
      enum: ['message', 'award', 'calendar', 'tag', 'task', 'alert', 'payout'],
      default: 'task',
    },
    iconBg: { type: String, default: 'bg-neutral-700' },
    timeAgo: { type: String, default: 'Just Now' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const Activity =
  mongoose.models.Activity || mongoose.model<IActivity>('Activity', ActivitySchema)
