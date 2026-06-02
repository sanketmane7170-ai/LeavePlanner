import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// POST /api/support (Public endpoint to submit a support ticket)
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, mobile, reason } = req.body;
    
    if (!name || !email || !reason) {
      return res.status(400).json({ message: 'Name, email, and reason are required' });
    }

    await prisma.supportTicket.create({
      data: { name, email, mobile, reason, status: 'OPEN' },
    });

    return res.status(201).json({ message: 'Your message has been sent to the Admin successfully.' });
  } catch (error) {
    console.error('Submit support ticket error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
