import type { Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/authenticate';
import { audit } from '../services/auditService';

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
    logger.error('getLeavePolicies error:', error);
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

    audit(req, 'LEAVE_POLICY_CREATED', 'POLICY', policy.id, { name: policy.name, leaveType: policy.leaveType, daysAllowed: policy.daysAllowed });
    return res.status(201).json(policy);
  } catch (error) {
    logger.error('createLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateLeavePolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const {
      name,
      daysAllowed,
      approvalRequired,
      noticeRequired,
      minNoticeDays,
      halfDayAllowed,
      carryForward,
      probationRule,
    } = req.body as Record<string, any>;

    const existing = await prisma.leavePolicy.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    const updated = await prisma.leavePolicy.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
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

    audit(req, 'LEAVE_POLICY_UPDATED', 'POLICY', id, { name: updated.name });
    return res.json(updated);
  } catch (error) {
    logger.error('updateLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteLeavePolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const assignedCount = await prisma.employee.count({ where: { leavePolicyId: id } });
    if (assignedCount > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${assignedCount} employee(s) assigned to this policy. Unassign them first.`,
      });
    }

    const deleted = await prisma.leavePolicy.findUnique({ where: { id }, select: { name: true } });
    await prisma.leavePolicy.delete({ where: { id } });
    audit(req, 'LEAVE_POLICY_DELETED', 'POLICY', id, { name: deleted?.name ?? id });
    return res.json({ message: 'Leave policy deleted' });
  } catch (error) {
    logger.error('deleteLeavePolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const addPolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { employeeId, overrideDays, blackoutFrom, blackoutTo, allowedLeaveTypes } = req.body as {
      employeeId: string;
      overrideDays: number;
      blackoutFrom: string;
      blackoutTo: string;
      allowedLeaveTypes?: string[];
    };

    if (!employeeId || overrideDays === undefined || !blackoutFrom || !blackoutTo) {
      return res.status(400).json({ message: 'employeeId, overrideDays, blackoutFrom, blackoutTo are required' });
    }

    const validLeaveTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL'];
    const sanitizedLeaveTypes = (allowedLeaveTypes ?? []).filter((t) => validLeaveTypes.includes(t));

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
        allowedLeaveTypes: sanitizedLeaveTypes as any[],
      },
      include: {
        employee: { select: { id: true, fullName: true, employeeId: true } },
      },
    });

    audit(req, 'POLICY_EXCEPTION_ADDED', 'POLICY', policyId, { policyName: policy.name, employeeName: employee.fullName, overrideDays });
    return res.status(201).json(exception);
  } catch (error) {
    logger.error('addPolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deletePolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.policyException.delete({ where: { id } });
    return res.json({ message: 'Exception removed' });
  } catch (error) {
    logger.error('deletePolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ─── Policy Rules ─────────────────────────────────────────────────────────────

const VALID_OPERATORS = ['GTE', 'GT', 'LTE', 'LT', 'EQ'];

export const addPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const policyId = String(req.params['id']);
    const { minDays, operator = 'GTE', approvalRequired = true, noticeRequired = false, minNoticeDays = 0, exception, applicableLeaveTypes } =
      req.body as Record<string, any>;

    if (minDays === undefined) {
      return res.status(400).json({ message: 'minDays is required' });
    }
    if (!VALID_OPERATORS.includes(operator)) {
      return res.status(400).json({ message: `Invalid operator. Must be one of: ${VALID_OPERATORS.join(', ')}` });
    }

    const validLeaveTypes = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL'];
    const sanitizedLeaveTypes = Array.isArray(applicableLeaveTypes)
      ? applicableLeaveTypes.filter((t: string) => validLeaveTypes.includes(t))
      : [];

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
        applicableLeaveTypes: sanitizedLeaveTypes as any[],
      },
    });

    audit(req, 'POLICY_RULE_ADDED', 'POLICY', policyId, { policyName: policy.name, operator: String(operator), minDays: Number(minDays) });
    return res.status(201).json(rule);
  } catch (error) {
    logger.error('addPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updatePolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    const { minDays, operator, approvalRequired, noticeRequired, minNoticeDays, exception, applicableLeaveTypes } =
      req.body as Record<string, any>;

    const validLeaveTypesUpd = ['SICK', 'TRANSPORT_WEATHER', 'PERSONAL'];
    const sanitizedLeaveTypesUpd = Array.isArray(applicableLeaveTypes)
      ? applicableLeaveTypes.filter((t: string) => validLeaveTypesUpd.includes(t))
      : undefined;

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
        ...(sanitizedLeaveTypesUpd !== undefined && { applicableLeaveTypes: sanitizedLeaveTypesUpd as any[] }),
      },
    });

    audit(req, 'POLICY_RULE_UPDATED', 'POLICY', id, { policyName: existing.policyId });
    return res.json(updated);
  } catch (error) {
    logger.error('updatePolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deletePolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    await prisma.policyRule.delete({ where: { id } });
    return res.json({ message: 'Rule deleted' });
  } catch (error) {
    logger.error('deletePolicyRule error:', error);
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
    logger.error('getWfhPolicies error:', error);
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

    audit(req, 'WFH_POLICY_CREATED', 'POLICY', policy.id, { name: policy.name, daysAllowed: policy.daysAllowed });
    return res.status(201).json(policy);
  } catch (error) {
    logger.error('createWfhPolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateWfhPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    const { name, daysAllowed, approvalRequired, noticeRequired, minNoticeDays, halfDayAllowed, probationRule } =
      req.body as Record<string, any>;

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

    audit(req, 'WFH_POLICY_UPDATED', 'POLICY', id, { name: updated.name });
    return res.json(updated);
  } catch (error) {
    logger.error('updateWfhPolicy error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicy = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);

    const assignedCount = await prisma.employee.count({ where: { wfhPolicyId: id } });
    if (assignedCount > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${assignedCount} employee(s) assigned to this policy. Unassign them first.`,
      });
    }

    const deletedWfh = await prisma.wfhPolicy.findUnique({ where: { id }, select: { name: true } });
    await prisma.wfhPolicy.delete({ where: { id } });
    audit(req, 'WFH_POLICY_DELETED', 'POLICY', id, { name: deletedWfh?.name ?? id });
    return res.json({ message: 'WFH policy deleted' });
  } catch (error) {
    logger.error('deleteWfhPolicy error:', error);
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
    logger.error('addWfhPolicyException error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicyException = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['id']);
    await prisma.wfhPolicyException.delete({ where: { id } });
    return res.json({ message: 'Exception removed' });
  } catch (error) {
    logger.error('deleteWfhPolicyException error:', error);
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
    logger.error('addWfhPolicyRule error:', error);
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
    logger.error('updateWfhPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteWfhPolicyRule = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const id = String(req.params['ruleId']);
    await prisma.wfhPolicyRule.delete({ where: { id } });
    return res.json({ message: 'Rule deleted' });
  } catch (error) {
    logger.error('deleteWfhPolicyRule error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
