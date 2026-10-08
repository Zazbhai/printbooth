import { Router, Request, Response } from 'express'
import {
  getAllTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
} from '../modules/helpdeskStore.js'

export const helpdeskRouter = Router()

// GET /api/helpdesk (or /api/admin/helpdesk)
helpdeskRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await getAllTickets()
    res.json({
      success: true,
      data: list,
      total: list.length,
    })
  } catch (err: any) {
    console.error('[API] Error fetching helpdesk tickets:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch tickets' })
  }
})

// GET /api/helpdesk/:id
helpdeskRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await getTicketById(req.params.id)
    if (!item) {
      return res.status(404).json({ success: false, error: 'Ticket not found' })
    }
    res.json({ success: true, data: item })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/helpdesk (Public customer/merchant ticket submission)
helpdeskRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    if (!body.title || !body.requesterName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title and requesterName are required.',
      })
    }

    const created = await createTicket(body)
    console.log(`[HelpDesk] New ticket logged: ${created.id} - ${created.title} (${created.requesterName})`)
    res.status(201).json({
      success: true,
      data: created,
      message: 'Support ticket successfully registered.',
    })
  } catch (err: any) {
    console.error('[API] Error creating helpdesk ticket:', err)
    res.status(500).json({ success: false, error: err.message || 'Failed to create ticket' })
  }
})

// PATCH /api/helpdesk/:id (Admin replies, status updates, assignments)
helpdeskRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await updateTicket(req.params.id, req.body || {})
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ticket not found' })
    }
    res.json({
      success: true,
      data: updated,
      message: 'Ticket updated successfully',
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/helpdesk/:id
helpdeskRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await deleteTicket(req.params.id)
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Ticket not found' })
    }
    res.json({ success: true, message: 'Ticket deleted successfully' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
