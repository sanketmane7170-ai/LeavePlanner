import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';
import { logger } from '../lib/logger';

// ── ADMIN CONTROLLERS ────────────────────────────────────────────────────────

export const getAdminAnnouncements = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json(announcements);
  } catch (error) {
    logger.error('getAdminAnnouncements error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createAnnouncement = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { title, content, priority, scheduledAt, expiresAt, isActive } = req.body as {
      title: string;
      content: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      scheduledAt?: string;
      expiresAt?: string;
      isActive?: boolean;
    };

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        priority: priority || 'MEDIUM',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    return res.status(201).json({
      message: 'Announcement created successfully',
      announcement,
    });
  } catch (error) {
    logger.error('createAnnouncement error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateAnnouncement = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { title, content, priority, scheduledAt, expiresAt, isActive } = req.body as {
      title?: string;
      content?: string;
      priority?: 'HIGH' | 'MEDIUM' | 'LOW';
      scheduledAt?: string;
      expiresAt?: string;
      isActive?: boolean;
    };

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(priority !== undefined && { priority }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.json({
      message: 'Announcement updated successfully',
      announcement,
    });
  } catch (error) {
    logger.error('updateAnnouncement error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteAnnouncement = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await prisma.announcement.delete({ where: { id } });

    return res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    logger.error('deleteAnnouncement error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── EMPLOYEE CONTROLLERS ─────────────────────────────────────────────────────

export const getEmployeeAnnouncements = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const now = new Date();
    const activeAnnouncements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [
              { scheduledAt: null },
              { scheduledAt: { lte: now } },
            ],
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: now } },
            ],
          },
        ],
        dismissals: {
          none: {
            employeeId: employee.id,
          },
        },
      },
      orderBy: [
        { priority: 'asc' }, // HIGH, then MEDIUM, then LOW (order based on schema definition)
        { createdAt: 'desc' },
      ],
    });

    return res.json(activeAnnouncements);
  } catch (error) {
    logger.error('getEmployeeAnnouncements error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const dismissAnnouncement = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user!.userId;
    const announcementId = String(req.params['id']);

    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await prisma.announcementDismissal.upsert({
      where: {
        announcementId_employeeId: {
          announcementId,
          employeeId: employee.id,
        },
      },
      update: {},
      create: {
        announcementId,
        employeeId: employee.id,
      },
    });

    return res.json({ message: 'Announcement dismissed successfully' });
  } catch (error) {
    logger.error('dismissAnnouncement error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
