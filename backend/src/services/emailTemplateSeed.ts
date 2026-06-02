import { prisma } from '../lib/prisma';
import { EMAIL_TEMPLATE_DEFAULTS } from '../data/emailTemplateDefaults';

export async function seedEmailTemplates(): Promise<void> {
  let created = 0;

  for (const def of EMAIL_TEMPLATE_DEFAULTS) {
    const existing = await prisma.emailTemplate.findUnique({ where: { key: def.key } });
    if (!existing) {
      await prisma.emailTemplate.create({
        data: {
          key:         def.key,
          name:        def.name,
          description: def.description,
          category:    def.category,
          subject:     def.subject,
          bodyHtml:    def.bodyHtml,
          variables:   def.variables as any,
          isActive:    true,
        },
      });
      created++;
    }
  }

  if (created > 0) {
    console.log(`[emailTemplateSeed] Created ${created} email template(s).`);
  }
}
