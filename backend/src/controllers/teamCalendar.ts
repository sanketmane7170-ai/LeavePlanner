import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';

export const getTeamCalendarLeaves = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Verify permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'ADMIN' && !user.employee?.canViewTeamCalendar) {
      return res.status(403).json({ message: 'You do not have permission to view the team calendar' });
    }

    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required' });
    }

    // Create start and end dates for the given month
    const targetDate = new Date(Number(year), Number(month) - 1, 1);
    const startDate = startOfMonth(targetDate);
    const endDate = endOfMonth(targetDate);

    // Fetch approved leaves that overlap with this month
    const leaves = await prisma.leaveApplication.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          {
            fromDate: { lte: endDate },
            toDate: { gte: startDate },
          }
        ]
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
            department: true,
          }
        }
      },
      orderBy: {
        fromDate: 'asc'
      }
    });

    // Strip out sensitive info like reason
    const sanitizedLeaves = leaves.map(leave => ({
      id: leave.id,
      employee: leave.employee,
      leaveType: leave.leaveType,
      fromDate: leave.fromDate,
      toDate: leave.toDate,
      isHalfDay: leave.isHalfDay,
      halfDaySlot: leave.halfDaySlot,
      totalDays: leave.totalDays,
    }));

    return res.json(sanitizedLeaves);
  } catch (error) {
    console.error('getTeamCalendarLeaves error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
