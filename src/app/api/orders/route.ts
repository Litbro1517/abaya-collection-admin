import { db } from '@/lib/db';
import { Prisma, type Order } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders — List orders with robust cross-DB search
// ─────────────────────────────────────────────────────────────────────────────
// V4.1.5 — FX-SearchRobust
//
// ROOT CAUSE of V4.1.4 regression:
//   The previous fix used `mode: 'insensitive'` on Prisma's `contains` clauses.
//   That mode is PostgreSQL-only. On SQLite (the configured provider in
//   prisma/schema.prisma), Prisma throws PrismaClientValidationError:
//   "Unknown argument `mode`" at RUNTIME → HTTP 500 → search returns nothing.
//   The inline comment claiming "Prisma silently falls back to LIKE on SQLite"
//   was factually wrong — Prisma does NOT fall back, it hard-errors.
//
// FIX:
//   Use $queryRaw with LOWER() for case-insensitive matching. LOWER() works on
//   both SQLite (ASCII) and PostgreSQL (Unicode). Numeric and date fields are
//   CAST to TEXT so they become searchable too (fixes the "non-textual data"
//   limitation of V4.1.3). All user input is bound via Prisma.sql parameters
//   (SQL-injection safe). LIKE wildcards (%, _) in user input are escaped.
//
// SEARCHABLE FIELDS (11):
//   Text (8): customerName, customerPhone, customerCity, customerAddress,
//             productName, productColor, productSize, productPrice
//   Numeric (1): productQuantity  (Int → CAST AS TEXT)
//   Status (1): status
//   Date (1): createdAt           (DateTime → datetime()/1000 'unixepoch' on SQLite)
//   NOTE: Prisma stores DateTime as epoch-ms integer in SQLite, so CAST AS TEXT
//   yields "1784318910427" (not a date). datetime(x/1000,'unixepoch') converts
//   to "YYYY-MM-DD HH:MM:SS". On PostgreSQL, CAST(createdAt AS TEXT) gives ISO
//   directly — a switch to PostgreSQL would require adjusting this one line.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // TODO(DEBT-2): reinforce pagination guard — parseInt returns NaN on invalid
  // input (e.g. ?page=abc), which currently propagates as NaN into skip/take.
  // Add Number.isFinite() checks and explicit fallback to defaults.
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const status = searchParams.get('status') || '';
  // TODO(DEBT-3): add a 200-char length cap on `search` to prevent oversized
  // LIKE patterns (DoS mitigation). Currently unbounded — a 1MB search string
  // would still be processed. Enforce: search.slice(0, 200) before building q.
  const search = searchParams.get('search') || '';
  const view = searchParams.get('view') || 'active'; // 'active' | 'archived' | 'all'
  const skip = page * limit;

  try {
    // Build WHERE clause as a list of safe, parameterized SQL fragments.
    const conditions: Prisma.Sql[] = [];

    // Archive filter — boolean bound via Prisma parameter (cross-DB: SQLite 0/1,
    // PostgreSQL true/false; Prisma handles the conversion automatically).
    if (view === 'active') {
      conditions.push(Prisma.sql`"isDeleted" = ${false}`);
    } else if (view === 'archived') {
      conditions.push(Prisma.sql`"isDeleted" = ${true}`);
    }
    // view === 'all' → no isDeleted filter

    // Status filter
    if (status && status !== 'all') {
      conditions.push(Prisma.sql`"status" = ${status}`);
    }

    // Search filter — case-insensitive across ALL searchable fields.
    // LOWER() handles ASCII case on SQLite and Unicode on PostgreSQL.
    // CAST(... AS TEXT) makes numeric/date fields searchable.
    // LIKE wildcards in user input are escaped so they match literally.
    if (search.trim()) {
      const escaped = search.trim().replace(/[%_\\]/g, '\\$&');
      const q = `%${escaped}%`;
      // TODO(DEBT-1): the datetime("createdAt"/1000, 'unixepoch') call below
      // is SQLite-specific (SQLite stores DateTime as epoch-ms int). On
      // PostgreSQL, replace it with CAST("createdAt" AS TEXT) which yields
      // ISO 8601 directly. See PROJECT_MAP.md → Dette Technique à traiter.
      conditions.push(Prisma.sql`(
        LOWER("customerName")    LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("customerPhone")  LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("customerCity")   LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("customerAddress")LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("productName")    LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("productColor")   LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("productSize")    LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER("productPrice")   LIKE LOWER(${q}) ESCAPE '\\'
        OR CAST("productQuantity" AS TEXT) LIKE ${q} ESCAPE '\\'
        OR LOWER("status")         LIKE LOWER(${q}) ESCAPE '\\'
        OR LOWER(datetime("createdAt"/1000, 'unixepoch')) LIKE LOWER(${q}) ESCAPE '\\'
      )`);
    }

    // Assemble the WHERE clause (or empty if no conditions).
    const whereClause = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    // Execute parameterized queries — safe against SQL injection.
    const orders = await db.$queryRaw<Order[]>`
      SELECT * FROM "Order" ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const countRows = await db.$queryRaw<{ cnt: bigint | number }[]>`
      SELECT COUNT(*) as cnt FROM "Order" ${whereClause}
    `;
    const total = Number(countRows[0]?.cnt ?? 0);

    // Compute CA (total revenue for the current page).
    // productPrice = UNIT price → line total = unitPrice × productQuantity.
    const ca = orders.reduce((sum, o) => {
      const unitPrice = parseFloat(o.productPrice) || 0;
      return sum + (unitPrice * (o.productQuantity || 1));
    }, 0);

    return NextResponse.json({
      orders,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      ca,
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
