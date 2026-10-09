import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from root or current directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/printbooth'

mongoose.set('bufferCommands', false)

export async function connectDB(): Promise<typeof mongoose | null> {
  try {
    if (mongoose.connection.readyState >= 1) {
      return mongoose
    }

    console.log(`[MongoDB] Connecting to database...`)
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
    })

    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`)
    return conn
  } catch (error: any) {
    console.error(`[MongoDB] Connection error:`, error.message)
    console.warn(`[MongoDB] Please ensure MongoDB service is running (e.g. 'sudo systemctl status mongod' or local service) and MONGODB_URI in your .env is accessible.`)
    return null
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1
}
