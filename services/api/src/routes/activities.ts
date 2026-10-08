import { Router, Request, Response } from 'express'
import { Activity } from '../models/Activity.js'
import { isDbConnected } from '../db.js'
import { fallbackActivities } from '../fallbackData.js'

export const activitiesRouter = Router()

// GET /api/activities
activitiesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    if (!isDbConnected()) {
      return res.json({ success: true, data: fallbackActivities })
    }
    const activities = await Activity.find().sort({ activityId: 1 }).limit(10)
    res.json({ success: true, data: activities })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
})

