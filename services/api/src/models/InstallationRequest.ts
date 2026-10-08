import mongoose, { Schema, Document } from 'mongoose'

export type VenueType =
  | 'college'
  | 'xerox_shop'
  | 'library'
  | 'hospital'
  | 'corporate'
  | 'co_working'
  | 'transit_hub'
  | 'other'

export type InstallationStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_SURVEY'
  | 'COMMERCIAL_QUOTED'
  | 'SURVEY_SCHEDULED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'INSTALLED'
  | 'REJECTED'

export type InstallationPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export interface ISurveyNote {
  id: string
  author: string
  text: string
  timestamp: string
}

export interface IInstallationRequest extends Document {
  id: string
  venueType: VenueType
  orgName: string
  campusName?: string
  city: string
  state: string
  pincode: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  footfall: string
  timeline: string
  hasPower: boolean
  hasSecurity: boolean
  notes?: string
  status: InstallationStatus
  priority: InstallationPriority
  assignedLead?: string
  assignedKioskId?: string
  estimatedUnits: number
  surveyNotes: ISurveyNote[]
  createdAt: Date
  updatedAt: Date
}

const SurveyNoteSchema = new Schema<ISurveyNote>(
  {
    id: { type: String, required: true },
    author: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
)

const InstallationRequestSchema = new Schema<IInstallationRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    venueType: {
      type: String,
      enum: ['college', 'xerox_shop', 'library', 'hospital', 'corporate', 'co_working', 'transit_hub', 'other'],
      default: 'college',
    },
    orgName: { type: String, required: true, index: true },
    campusName: { type: String, default: 'Main Campus' },
    city: { type: String, default: 'Pune' },
    state: { type: String, default: 'Maharashtra' },
    pincode: { type: String, default: '411058' },
    contactName: { type: String, required: true },
    contactRole: { type: String, default: 'Owner / Representative' },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true },
    footfall: { type: String, default: '500-1500' },
    timeline: { type: String, default: 'immediate' },
    hasPower: { type: Boolean, default: true },
    hasSecurity: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['NEW', 'CONTACTED', 'SITE_SURVEY', 'COMMERCIAL_QUOTED', 'SURVEY_SCHEDULED', 'APPROVED', 'DISPATCHED', 'INSTALLED', 'REJECTED'],
      default: 'NEW',
      index: true,
    },
    priority: {
      type: String,
      enum: ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'],
      default: 'HIGH',
      index: true,
    },
    assignedLead: { type: String, default: 'Unassigned' },
    assignedKioskId: { type: String },
    estimatedUnits: { type: Number, default: 1 },
    surveyNotes: { type: [SurveyNoteSchema], default: [] },
  },
  { timestamps: true }
)

export const InstallationRequestModel =
  mongoose.models.InstallationRequest ||
  mongoose.model<IInstallationRequest>('InstallationRequest', InstallationRequestSchema)
