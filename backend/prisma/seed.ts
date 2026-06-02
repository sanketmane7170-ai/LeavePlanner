import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { EMAIL_TEMPLATE_DEFAULTS } from '../src/data/emailTemplateDefaults';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@innovizia.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin user ${adminEmail} already exists. Skipping seed.`);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // Create admin user and employee record
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      password: hashedPassword,
      role: 'ADMIN',
      isFirstLogin: false, // Don't require password change for seed admin
      employee: {
        create: {
          employeeId: 'INV-ADMIN',
          fullName: adminName,
          personalEmail: adminEmail,
        },
      },
    },
  });

  console.log(`Admin user created successfully: ${adminUser.email}`);

  // Seed email templates (idempotent — only inserts missing ones)
  for (const def of EMAIL_TEMPLATE_DEFAULTS) {
    await prisma.emailTemplate.upsert({
      where: { key: def.key },
      create: {
        key: def.key, name: def.name, description: def.description,
        category: def.category, subject: def.subject,
        bodyHtml: def.bodyHtml, variables: def.variables as any, isActive: true,
      },
      update: {},
    });
  }
  console.log(`Email templates seeded (${EMAIL_TEMPLATE_DEFAULTS.length} templates).`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
