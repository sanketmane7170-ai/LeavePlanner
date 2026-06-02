import type { Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';

async function verifyAdminPassword(userId: string, password?: string): Promise<boolean> {
  if (!password) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}

// ─── Leave Policies ──────────────────────────────────────────────────────────

export const getLeavePolicies = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policies = await prisma.leavePolicy.findMany({
      include: {
        employees: { select: { id: true, fullName: true, employeeId: true } },
        exceptions: {
          include: {
            employee: { select: { id: true, fullName: true, employeeId: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        rules: { orderBy: { minDays: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(policies);
  } catch (error) {
    console.error('getLeavePolicies error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createLeavePolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      name,
      leaveType,
      daysAllowed,
      approvalRequired = true,
      noticeRequired = false,
      minNoticeDays = 0,
      halfDayAllowed = true,
      carryForward = false,
      probationRule = 'NONE',
    } = req.body as {
      name: string;
      leaveType: string;
      daysAllowed: number;
      approvalRequired?: boolean;
      noticeRequired?: boolean;
      minNoticeDays?: number;
      halfDayAllowed?: boolean;
      carryForward?: boolean;
      probationRule?: string;
    };

    if (!name || daysAllowed === undefined) {
      return res.status(400).json({ message: 'name and daysAllowed are required' });
    }

    const validTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL', 'GENERAL'];
    if (leaveType && !validTypes.includes(leaveType)) {
      return res.status(400).json({ message: 'Invalid leaveType' });
    }

    const policy = await prisma.leavePolicy.create({
      data: {
        name,
        leaveType: (leaveType ?? 'GENERAL') as any,
        daysAllowed: Number(daysAllowed),
        approvalRequired: Boolean(approvalRequired),
        noticeRequired: Boolean(noticeRequired),
        minNoticeDays: Number(minNoticeDays),
        halfDayAllowed: Boolean(halfDayAllowed),
        carryForward: Boolean(carryForward),
        probationRule: probationRule as any,
      },
      include: { employees: { select: { id: true } }, exceptions: true },
    });

    return res.status(201).json(policy);
  } catch (error) {
    console.error('createLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateLeavePolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const {
      name,
      leaveType,
      daysAllowed,
      approvalRequired,
      noticeRequired,
      minNoticeDays,
      halfDayAllowed,
      carryForward,
      probationRule,
      confirmPassword,
    } = req.body as Record<string, any>;

    if (!(await verifyAdminPassword(req.user!.userId, confirmPassword))) {
      return res.status(401).json({ message: 'Invalid password. Action unauthorized.' });
    }

    const existing = await prisma.leavePolicy.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const updated = await prisma.leavePolicy.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(leaveType !== undefined && { leaveType: leaveType as any }),
        ...(daysAllowed !== undefined && { daysAllowed: Number(daysAllowed) }),
        ...(approvalRequired !== undefined && { approvalRequired: Boolean(approvalRequired) }),
        ...(noticeRequired !== undefined && { noticeRequired: Boolean(noticeRequired) }),
        ...(minNoticeDays !== undefined && { minNoticeDays: Number(minNoticeDays) }),
        ...(halfDayAllowed !== undefined && { halfDayAllowed: Boolean(halfDayAllowed) }),
        ...(carryForward !== undefined && { carryForward: Boolean(carryForward) }),
        ...(probationRule !== undefined && { probationRule: probationRule as any }),
      },
      include: {
        employees: { select: { id: true, fullName: true, employeeId: true } },
        exceptions: {
          include: { employee: { select: { id: true, fullName: true, employeeId: true } } },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('updateLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteLeavePolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { confirmPassword } = req.body as { confirmPassword?: string };

    if (!(await verifyAdminPassword(req.user!.userId, confirmPassword))) {
      return res.status(401).json({ message: 'Invalid password. Action unauthorized.' });
    }

    const assignedCount = await prisma.employee.count({ where: { leavePolicyId: id } });
    if (assignedCount > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${assignedCount} employee(s) assigned to this policy. Unassign them first.`,
      });
    }

    await prisma.leavePolicy.delete({ where: { id } });
    return res.json({ message: 'Leave policy deleted' });
  } catch (error) {
    console.error('deleteLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const addPolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { employeeId, overrideDays, blackoutFrom, blackoutTo } = req.body as {
      employeeId: string;
      overrideDays: number;
      blackoutFrom: string;
      blackoutTo: string;
    };

    if (!employeeId || overrideDays === undefined || !blackoutFrom || !blackoutTo) {
      return res.status(400).json({ message: 'employeeId, overrideDays, blackoutFrom, blackoutTo are required' });
    }

    const policy = await prisma.leavePolicy.findUnique({ where: { id: policyId } });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const exception = await prisma.policyException.create({
      data: {
        policyId,
        employeeId,
        overrideDays: Number(overrideDays),
        blackoutFrom: new Date(blackoutFrom),
        blackoutTo: new Date(blackoutTo),
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeId: true } },
      },
    });

    return res.status(201).json(exception);
  } catch (error) {
    console.error('addPolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deletePolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.policyException.delete({ where: { id } });
    return res.json({ message: 'Exception removed' });
  } catch (error) {
    console.error('deletePolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── Policy Rules ─────────────────────────────────────────────────────────────

const VALID_OPERATORS = ['GTE', 'GT', 'LTE', 'LT', 'EQ'];

export const addPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { minDays, operator = 'GTE', approvalRequired = true, noticeRequired = false, minNoticeDays = 0, exception } =
      req.body as Record<string, any>;

    if (minDays === undefined) {
      return res.status(400).json({ message: 'minDays is required' });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ message: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` });
    }

    const policy = await prisma.leavePolicy.findUnique({ where: { id: policyId } });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const rule = await prisma.policyRule.create({
      data: {
        policyId,
        operator: String(operator),
        minDays: Number(minDays),
        approvalRequired: Boolean(approvalRequired),
        noticeRequired: Boolean(noticeRequired),
        minNoticeDays: Number(minNoticeDays),
        exception: exception || null,
      },
    });

    return res.status(201).json(rule);
  } catch (error) {
    console.error('addPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updatePolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    const { minDays, operator, approvalRequired, noticeRequired, minNoticeDays, exception } =
      req.body as Record<string, any>;

    if (operator !== undefined && !VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ message: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` });
    }

    const existing = await prisma.policyRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Rule not found' });

    const updated = await prisma.policyRule.update({
      where: { id },
      data: {
        ...(operator !== undefined && { operator: String(operator) }),
        ...(minDays !== undefined && { minDays: Number(minDays) }),
        ...(approvalRequired !== undefined && { approvalRequired: Boolean(approvalRequired) }),
        ...(noticeRequired !== undefined && { noticeRequired: Boolean(noticeRequired) }),
        ...(minNoticeDays !== undefined && { minNoticeDays: Number(minNoticeDays) }),
        ...(exception !== undefined && { exception: exception || null }),
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('updatePolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deletePolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    await prisma.policyRule.delete({ where: { id } });
    return res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error('deletePolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── WFH Policies ────────────────────────────────────────────────────────────

export const getWfhPolicies = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policies = await prisma.wfhPolicy.findMany({
      include: {
        employees: { select: { id: true, fullName: true, employeeId: true } },
        exceptions: {
          include: {
            employee: { select: { id: true, fullName: true, employeeId: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        rules: { orderBy: { minDays: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(policies);
  } catch (error) {
    console.error('getWfhPolicies error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createWfhPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const {
      name,
      daysAllowed,
      approvalRequired = true,
      noticeRequired = false,
      minNoticeDays = 0,
      halfDayAllowed = true,
      probationRule = 'NONE',
    } = req.body as {
      name: string;
      daysAllowed: number;
      approvalRequired?: boolean;
      noticeRequired?: boolean;
      minNoticeDays?: number;
      halfDayAllowed?: boolean;
      probationRule?: string;
    };

    if (!name || daysAllowed === undefined) {
      return res.status(400).json({ message: 'name and daysAllowed are required' });
    }

    const policy = await prisma.wfhPolicy.create({
      data: {
        name,
        daysAllowed: Number(daysAllowed),
        approvalRequired: Boolean(approvalRequired),
        noticeRequired: Boolean(noticeRequired),
        minNoticeDays: Number(minNoticeDays),
        halfDayAllowed: Boolean(halfDayAllowed),
        probationRule: probationRule as any,
      },
      include: {
        employees: { select: { id: true } },
        exceptions: true,
        rules: true,
      },
    });

    return res.status(201).json(policy);
  } catch (error) {
    console.error('createWfhPolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateWfhPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { name, daysAllowed, approvalRequired, noticeRequired, minNoticeDays, halfDayAllowed, probationRule, confirmPassword } =
      req.body as Record<string, any>;

    if (!(await verifyAdminPassword(req.user!.userId, confirmPassword))) {
      return res.status(401).json({ message: 'Invalid password. Action unauthorized.' });
    }

    const existing = await prisma.wfhPolicy.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'WFH Policy not found' });

    const updated = await prisma.wfhPolicy.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(daysAllowed !== undefined && { daysAllowed: Number(daysAllowed) }),
        ...(approvalRequired !== undefined && { approvalRequired: Boolean(approvalRequired) }),
        ...(noticeRequired !== undefined && { noticeRequired: Boolean(noticeRequired) }),
        ...(minNoticeDays !== undefined && { minNoticeDays: Number(minNoticeDays) }),
        ...(halfDayAllowed !== undefined && { halfDayAllowed: Boolean(halfDayAllowed) }),
        ...(probationRule !== undefined && { probationRule: probationRule as any }),
      },
      include: {
        employees: { select: { id: true, fullName: true, employeeId: true } },
        exceptions: {
          include: { employee: { select: { id: true, fullName: true, employeeId: true } } },
        },
        rules: { orderBy: { minDays: 'asc' } },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('updateWfhPolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { confirmPassword } = req.body as { confirmPassword?: string };

    if (!(await verifyAdminPassword(req.user!.userId, confirmPassword))) {
      return res.status(401).json({ message: 'Invalid password. Action unauthorized.' });
    }

    const assignedCount = await prisma.employee.count({ where: { wfhPolicyId: id } });
    if (assignedCount > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${assignedCount} employee(s) assigned to this policy. Unassign them first.`,
      });
    }

    await prisma.wfhPolicy.delete({ where: { id } });
    return res.json({ message: 'WFH policy deleted' });
  } catch (error) {
    console.error('deleteWfhPolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── WFH Policy Exceptions ───────────────────────────────────────────────────

export const addWfhPolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { employeeId, overrideDays, blackoutFrom, blackoutTo } = req.body as {
      employeeId: string;
      overrideDays: number;
      blackoutFrom: string;
      blackoutTo: string;
    };

    if (!employeeId || overrideDays === undefined || !blackoutFrom || !blackoutTo) {
      return res.status(400).json({ message: 'employeeId, overrideDays, blackoutFrom, blackoutTo are required' });
    }

    const policy = await prisma.wfhPolicy.findUnique({ where: { id: policyId } });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const exception = await prisma.wfhPolicyException.create({
      data: {
        policyId,
        employeeId,
        overrideDays: Number(overrideDays),
        blackoutFrom: new Date(blackoutFrom),
        blackoutTo: new Date(blackoutTo),
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeId: true } },
      },
    });

    return res.status(201).json(exception);
  } catch (error) {
    console.error('addWfhPolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.wfhPolicyException.delete({ where: { id } });
    return res.json({ message: 'Exception removed' });
  } catch (error) {
    console.error('deleteWfhPolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── WFH Policy Rules ────────────────────────────────────────────────────────

export const addWfhPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { minDays, operator = 'GTE', approvalRequired = true, noticeRequired = false, minNoticeDays = 0, exception } =
      req.body as Record<string, any>;

    if (minDays === undefined) {
      return res.status(400).json({ message: 'minDays is required' });
    }
    const VALID_OPERATORS = ['GTE', 'GT', 'LTE', 'LT', 'EQ'];
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ message: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` });
    }

    const policy = await prisma.wfhPolicy.findUnique({ where: { id: policyId } });
    if (!policy) return res.status(404).json({ message: 'Policy not found' });

    const rule = await prisma.wfhPolicyRule.create({
      data: {
        policyId,
        operator: String(operator),
        minDays: Number(minDays),
        approvalRequired: Boolean(approvalRequired),
        noticeRequired: Boolean(noticeRequired),
        minNoticeDays: Number(minNoticeDays),
        exception: exception || null,
      },
    });

    return res.status(201).json(rule);
  } catch (error) {
    console.error('addWfhPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateWfhPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    const { minDays, operator, approvalRequired, noticeRequired, minNoticeDays, exception } =
      req.body as Record<string, any>;

    const VALID_OPERATORS = ['GTE', 'GT', 'LTE', 'LT', 'EQ'];
    if (operator !== undefined && !VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ message: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` });
    }

    const existing = await prisma.wfhPolicyRule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Rule not found' });

    const updated = await prisma.wfhPolicyRule.update({
      where: { id },
      data: {
        ...(operator !== undefined && { operator: String(operator) }),
        ...(minDays !== undefined && { minDays: Number(minDays) }),
        ...(approvalRequired !== undefined && { approvalRequired: Boolean(approvalRequired) }),
        ...(noticeRequired !== undefined && { noticeRequired: Boolean(noticeRequired) }),
        ...(minNoticeDays !== undefined && { minNoticeDays: Number(minNoticeDays) }),
        ...(exception !== undefined && { exception: exception || null }),
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('updateWfhPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    await prisma.wfhPolicyRule.delete({ where: { id } });
    return res.json({ message: 'Rule deleted' });
  } catch (error) {
    console.error('deleteWfhPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
