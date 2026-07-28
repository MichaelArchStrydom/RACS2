import { PrismaClient } from '@prisma/client'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prisma: PrismaClient

const connectionString = process.env.DATABASE_URL

// Neon's own pooler already multiplexes underneath us, so a small local pool
// plus a short connect timeout means a connection spike fails fast instead of
// piling up hung requests.
const poolConfig = { connectionString, max: 3, connectionTimeoutMillis: 10_000 }

if (process.env.NODE_ENV === 'production') {
  const pool = new pg.Pool(poolConfig)
  const adapter = new PrismaPg(pool)
  prisma = new PrismaClient({ adapter })
} else {
  if (!globalForPrisma.prisma) {
    const pool = new pg.Pool(poolConfig)
    const adapter = new PrismaPg(pool)
    globalForPrisma.prisma = new PrismaClient({ adapter })
  }
  prisma = globalForPrisma.prisma
}

export const db = prisma
