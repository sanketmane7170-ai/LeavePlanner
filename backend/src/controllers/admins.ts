import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { audit } from '../services/auditService';

// ── GET /api/admin/admins ──────────────────────────────────────────────────
export const getAdmins = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
            department: true,
            designation: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(admins);
  } catch (error) {
    logger.error('getAdmins error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/admins/candidates ───────────────────────────────────────
export const getCandidates = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    // Candidates are users who are currently EMPLOYEE and have an active employee record
    const candidates = await prisma.user.findMany({
      where: {
        role: 'EMPLOYEE',
        employee: {
          isActive: true
        }
      },
      select: {
        id: true,
        email: true,
        role: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
          }
        }
      },
      orderBy: {
        employee: { fullName: 'asc' }
      }
    });

    return res.json(candidates);
  } catch (error) {
    logger.error('getCandidates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/admins/promote ────────────────────────────────────────
export const promoteAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'ADMIN') return res.status(400).json({ message: 'User is already an Admin' });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
      include: {
        employee: {
          select: {
            fullName: true,
          }
        }
      }
    });

    audit(req, 'ADMIN_CREATED', 'ADMIN', userId, { fullName: updatedUser.employee?.fullName ?? updatedUser.email, email: updatedUser.email });
    return res.json({
      message: `${updatedUser.employee?.fullName || updatedUser.email} has been promoted to Admin.`
    });
  } catch (error) {
    logger.error('promoteAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/admins/demote ─────────────────────────────────────────
export const demoteAdmin = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const currentUserId = req.user?.userId;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'User ID is required' });

    // Prevent demoting yourself
    if (currentUserId === userId) {
      return res.status(400).json({ message: 'You cannot revoke your own Admin access.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'ADMIN') return res.status(400).json({ message: 'User is not an Admin' });

    // Verify there is at least one other admin left
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return res.status(400).json({ message: 'Cannot demote the last remaining Admin.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: 'EMPLOYEE' },
      include: {
        employee: {
          select: {
            fullName: true,
          }
        }
      }
    });

    audit(req, 'ADMIN_STATUS_CHANGED', 'ADMIN', userId, { fullName: updatedUser.employee?.fullName ?? updatedUser.email, isActive: false });
    return res.json({
      message: `${updatedUser.employee?.fullName || updatedUser.email} has been demoted to Employee.`
    });
  } catch (error) {
    logger.error('demoteAdmin error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
