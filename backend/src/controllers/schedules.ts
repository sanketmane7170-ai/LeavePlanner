import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';

const VALID_SATURDAY_RULES = [
  'NONE', 'ALL', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIRST_THIRD', 'SECOND_FOURTH',
] as const;

const VALID_DAYS = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SUNDAY',
] as const;

export const getSchedule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['employeeId']);

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const schedule = await prisma.workingSchedule.findUnique({ where: { employeeId } });
    return res.json(schedule ?? null);
  } catch (error) {
    console.error('getSchedule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const upsertSchedule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const employeeId = String(req.params['employeeId']);
    const { workingDays, saturdayRule = 'NONE', monthlyTarget } = req.body as {
      workingDays: string[];
      saturdayRule?: string;
      monthlyTarget?: number;
    };

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    if (!Array.isArray(workingDays)) {
      return res.status(400).json({ message: 'workingDays must be an array' });
    }

    const invalidDays = workingDays.filter(
      (d) => !VALID_DAYS.includes(d as (typeof VALID_DAYS)[number])
    );
    if (invalidDays.length > 0) {
      return res.status(400).json({ message: `Invalid day(s): ${invalidDays.join(', ')}` });
    }

    if (!VALID_SATURDAY_RULES.includes(saturdayRule as (typeof VALID_SATURDAY_RULES)[number])) {
      return res.status(400).json({ message: 'Invalid saturdayRule' });
    }

    const schedule = await prisma.workingSchedule.upsert({
      where: { employeeId },
      update: {
        workingDays,
        saturdayRule: saturdayRule as any,
        monthlyTarget: monthlyTarget !== undefined ? Number(monthlyTarget) : null,
      },
      create: {
        employeeId,
        workingDays,
        saturdayRule: saturdayRule as any,
        monthlyTarget: monthlyTarget !== undefined ? Number(monthlyTarget) : null,
      },
    });

    return res.json({ message: 'Schedule saved', schedule });
  } catch (error) {
    console.error('upsertSchedule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
