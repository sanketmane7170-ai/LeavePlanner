import { Router } from 'express';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { authenticate, requireRole } from '../middleware/authenticate';
import type { AuthRequest } from '../middleware/authenticate';

const router = Router();

// Protect all admin support routes
router.use(authenticate);
router.use(requireRole('ADMIN'));

// GET /api/admin/support
router.get('/', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json(tickets);
  } catch (error) {
    logger.error('Fetch support tickets error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/admin/support/:id/resolve
router.patch('/:id/resolve', async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const updatedTicket = await prisma.supportTicket.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    return res.json({ message: 'Ticket resolved successfully', ticket: updatedTicket });
  } catch (error) {
    logger.error('Resolve support ticket error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
