import { Router, Request, Response } from 'express'
import {
  getAllInstallations,
  getInstallationById,
  createInstallation,
  updateInstallation,
  deleteInstallation,
} from '../modules/installationsStore.js'

export const installationsRouter = Router()

// GET /api/installations (or /api/admin/installations)
installationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await getAllInstallations()
    res.json({
      success: true,
      data: list,
      total: list.length,
    })
  } catch (err: any) {
    console.error('[API] Error fetching installation requests:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch installations' })
  }
})

// GET /api/installations/:id
installationsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await getInstallationById(req.params.id)
    if (!item) {
      return res.status(404).json({ success: false, error: 'Installation request not found' })
    }
    res.json({ success: true, data: item })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/installations (Public or Admin submission)
installationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    if (!body.orgName || !body.contactName || !body.contactPhone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orgName, contactName, contactPhone are required.',
      })
    }

    const created = await createInstallation(body)
    console.log(`[Installations] New deployment lead created: ${created.id} (${created.orgName})`)
    res.status(201).json({
      success: true,
      data: created,
      message: 'Installation request successfully registered.',
    })
  } catch (err: any) {
    console.error('[API] Error creating installation request:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to create installation request' })
  }
})

// PATCH /api/installations/:id (Status updates, survey notes, assignments)
installationsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updateInstallation(req.params.id, req.body || {})
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Installation request not found' })
    }
    res.json({
      success: true,
      data: updated,
      message: 'Installation request updated successfully',
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/installations/:id
installationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteInstallation(req.params.id)
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Installation request not found' })
    }
    res.json({ success: true, message: 'Installation request deleted successfully' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
