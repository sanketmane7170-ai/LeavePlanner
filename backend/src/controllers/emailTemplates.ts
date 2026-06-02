import type { Response } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/authenticate';
import { EMAIL_TEMPLATE_DEFAULTS } from '../data/emailTemplateDefaults';
import { clearTemplateCache } from '../services/emailService';

// ── GET /api/admin/settings/email-templates ────────────────────────────────────
export const listEmailTemplates = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true, key: true, name: true, description: true,
        category: true, subject: true, bodyHtml: true,
        variables: true, isActive: true, updatedAt: true,
      },
    });
    return res.json(templates);
  } catch (error) {
    console.error('listEmailTemplates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/admin/settings/email-templates/:key ───────────────────────────────
export const getEmailTemplate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const key = String(req.params['key']);
    const template = await prisma.emailTemplate.findUnique({ where: { key } });
    if (!template) return res.status(404).json({ message: 'Template not found' });
    return res.json(template);
  } catch (error) {
    console.error('getEmailTemplate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/admin/settings/email-templates/:key ───────────────────────────────
export const updateEmailTemplate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const key = String(req.params['key']);
    const { subject, bodyHtml, isActive } = req.body as {
      subject?: string;
      bodyHtml?: string;
      isActive?: boolean;
    };

    const existing = await prisma.emailTemplate.findUnique({ where: { key } });
    if (!existing) return res.status(404).json({ message: 'Template not found' });

    if (!subject?.trim()) return res.status(400).json({ message: 'Subject is required' });
    if (!bodyHtml?.trim()) return res.status(400).json({ message: 'Body HTML is required' });

    const updated = await prisma.emailTemplate.update({
      where: { key },
      data: {
        subject:  subject.trim(),
        bodyHtml: bodyHtml.trim(),
        ...(isActive !== undefined && { isActive }),
      },
    });

    clearTemplateCache(key);

    return res.json({ message: 'Template updated', template: updated });
  } catch (error) {
    console.error('updateEmailTemplate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/settings/email-templates/:key/reset ───────────────────────
export const resetEmailTemplate = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const key = String(req.params['key']);
    const def = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
    if (!def) return res.status(404).json({ message: 'No default found for this template key' });

    const updated = await prisma.emailTemplate.update({
      where: { key },
      data: { subject: def.subject, bodyHtml: def.bodyHtml, isActive: true },
    });

    clearTemplateCache(key);

    return res.json({ message: 'Template reset to default', template: updated });
  } catch (error) {
    console.error('resetEmailTemplate error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/settings/email-templates/reset-all ────────────────────────
export const resetAllEmailTemplates = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    for (const def of EMAIL_TEMPLATE_DEFAULTS) {
      await prisma.emailTemplate.updateMany({
        where: { key: def.key },
        data: { subject: def.subject, bodyHtml: def.bodyHtml, isActive: true },
      });
    }
    clearTemplateCache();
    return res.json({ message: 'All templates reset to defaults' });
  } catch (error) {
    console.error('resetAllEmailTemplates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/admin/settings/email-templates/seed ─────────────────────────────
// Idempotent — safe to call multiple times (upsert)
export const seedEmailTemplates = async (_req: AuthRequest, res: Response): Promise<any> => {
  try {
    let seeded = 0;
    for (const def of EMAIL_TEMPLATE_DEFAULTS) {
      await prisma.emailTemplate.upsert({
        where: { key: def.key },
        create: {
          key:         def.key,
          name:        def.name,
          description: def.description,
          category:    def.category,
          subject:     def.subject,
          bodyHtml:    def.bodyHtml,
          variables:   def.variables as any,
        },
        update: {},  // preserve admin edits — only insert if missing
      });
      seeded++;
    }
    clearTemplateCache();
    return res.json({ message: `${seeded} templates seeded`, total: seeded });
  } catch (error) {
    console.error('seedEmailTemplates error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
