import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString:      process.env.DATABASE_URL,
  max:                   parseInt(process.env.DB_POOL_MAX  ?? '10'),
  min:                   parseInt(process.env.DB_POOL_MIN  ?? '2'),
  idleTimeoutMillis:     parseInt(process.env.DB_IDLE_MS   ?? '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_MS ?? '5000'),
});

const adapter = new PrismaPg(pool);

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
