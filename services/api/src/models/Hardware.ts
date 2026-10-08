import mongoose, { Document, Schema } from 'mongoose'

export interface ICupsJob {
  jobId: number
  title: string
  user: string
  pages: number
  copies: number
  format: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'HELD'
  progress: number
  createdAt: Date
  completedAt?: Date
}

export interface IScannedWifiNetwork {
  ssid: string
  signalStrength: number
  signalDbm: number
  security: string
  channel: number
  isCurrent: boolean
}

export interface IKioskHardware extends Document {
  kioskId: string
  printer: {
    name: string
    make: string
    model: string
    connectionType: 'USB' | 'IPP_NETWORK' | 'RAW_SOCKET'
    deviceUri: string
    cupsServerVersion: string
    status: 'IDLE' | 'READY' | 'PRINTING' | 'PAUSED' | 'STOPPED' | 'OFFLINE'
    firmwareVersion: string
    serialNumber: string
    ipAddress: string
    port: number
    paperLevel: number
    paperTray1Capacity: number
    paperTray1Remaining: number
    tonerBlack: number
    tonerCyan: number
    tonerMagenta: number
    tonerYellow: number
    odometerTotalPages: number
    colorSupported: boolean
    duplexSupported: boolean
    lastHeartbeat: Date
    jobs: ICupsJob[]
  }
  wifi: {
    connected: boolean
    ssid: string
    ipAddress: string
    signalStrength: number
    signalDbm: number
    frequency: string
    macAddress: string
    gateway: string
    dns: string
    security: string
    lastScan: IScannedWifiNetwork[]
  }
}

const CupsJobSchema = new Schema<ICupsJob>(
  {
    jobId: { type: Number, required: true },
    title: { type: String, required: true },
    user: { type: String, default: 'kiosk-user' },
    pages: { type: Number, default: 1 },
    copies: { type: Number, default: 1 },
    format: { type: String, default: 'PDF/A4' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'HELD'],
      default: 'PENDING',
    },
    progress: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false }
)

const ScannedWifiNetworkSchema = new Schema<IScannedWifiNetwork>(
  {
    ssid: { type: String, required: true },
    signalStrength: { type: Number, required: true },
    signalDbm: { type: Number, required: true },
    security: { type: String, default: 'WPA2-PSK' },
    channel: { type: Number, default: 6 },
    isCurrent: { type: Boolean, default: false },
  },
  { _id: false }
)

const KioskHardwareSchema = new Schema<IKioskHardware>(
  {
    kioskId: { type: String, required: true, unique: true, index: true },
    printer: {
      name: { type: String, default: 'Brother DCP-T420W' },
      make: { type: String, default: 'Brother' },
      model: { type: String, default: 'Brother DCP-T420W' },
      connectionType: {
        type: String,
        enum: ['USB', 'IPP_NETWORK', 'RAW_SOCKET'],
        default: 'USB',
      },
      deviceUri: {
        type: String,
        default: 'usb://Brother/DCP-T420W',
      },
      cupsServerVersion: {
        type: String,
        default: 'CUPS 2.4.2 (Raspberry Pi Linux / pycups)',
      },
      status: {
        type: String,
        enum: ['IDLE', 'READY', 'PRINTING', 'PAUSED', 'STOPPED', 'OFFLINE'],
        default: 'IDLE',
      },
      firmwareVersion: { type: String, default: '1.0' },
      serialNumber: { type: String, default: 'BROTHER_DCP_T420W' },
      ipAddress: { type: String, default: '192.168.1.145' },
      port: { type: Number, default: 631 },
      paperLevel: { type: Number, default: 100 },
      paperTray1Capacity: { type: Number, default: 150 },
      paperTray1Remaining: { type: Number, default: 150 },
      tonerBlack: { type: Number, default: 100 },
      tonerCyan: { type: Number, default: 100 },
      tonerMagenta: { type: Number, default: 100 },
      tonerYellow: { type: Number, default: 100 },
      odometerTotalPages: { type: Number, default: 0 },
      colorSupported: { type: Boolean, default: true },
      duplexSupported: { type: Boolean, default: true },
      lastHeartbeat: { type: Date, default: Date.now },
      jobs: [CupsJobSchema],
    },
    wifi: {
      connected: { type: Boolean, default: false },
      ssid: { type: String, default: 'PrintBooth_Wifi' },
      ipAddress: { type: String, default: '192.168.1.145' },
      signalStrength: { type: Number, default: 85 },
      signalDbm: { type: Number, default: -58 },
      frequency: { type: String, default: '5 GHz (Channel 36)' },
      macAddress: { type: String, default: 'b8:27:eb:d7:fb:2f' },
      gateway: { type: String, default: '192.168.1.1' },
      dns: { type: String, default: '1.1.1.1' },
      security: { type: String, default: 'WPA2-Personal' },
      lastScan: [ScannedWifiNetworkSchema],
    },
  },
  {
    timestamps: true,
  }
)

export const KioskHardware = mongoose.model<IKioskHardware>('KioskHardware', KioskHardwareSchema)
