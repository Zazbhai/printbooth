import mongoose, { Schema, Document } from 'mongoose'

export interface IAdminUser extends Document {
  adminId: string
  name: string
  email: string
  username: string
  password?: string
  role: 'SUPERADMIN' | 'OPERATIONS' | 'SUPPORT'
  status: 'ACTIVE' | 'BLOCKED'
  phone?: string
  notes?: string
  isRoot?: boolean
  lastLogin?: Date
  createdAt: Date
  updatedAt: Date
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    adminId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true, default: 'admin' },
    role: { type: String, enum: ['SUPERADMIN', 'OPERATIONS', 'SUPPORT'], default: 'OPERATIONS' },
    status: { type: String, enum: ['ACTIVE', 'BLOCKED'], default: 'ACTIVE', index: true },
    phone: { type: String, default: '' },
    notes: { type: String, default: '' },
    isRoot: { type: Boolean, default: false },
    lastLogin: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

export const AdminUser = mongoose.model<IAdminUser>('AdminUser', AdminUserSchema)
