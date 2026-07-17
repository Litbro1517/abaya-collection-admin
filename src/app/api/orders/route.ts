import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const status = searchParams.get('status') || '';
  const search = searchParams.get('search') || '';
  const view = searchParams.get('view') || 'active'; // 'active' | 'archived' | 'all'
  const archived = view === 'archived';

  const where: Record<string, unknown> = {};

  // Archive filter — cross-DB compatible (boolean, not 0/1)
  if (view === 'active') {
    where.isDeleted = false;
  } else if (view === 'archived') {
    where.isDeleted = true;
  }
  // view === 'all' → no filter on isDeleted

  // Status filter
  if (status && status !== 'all') {
    where.status = status;
  }

  // Search filter — searches across 7 fields (including customerAddress + productPrice)
  if (search.trim()) {
    const q = search.trim();
    where.OR = [
      { customerName: { contains: q } },
      { customerPhone: { contains: q } },
      { customerCity: { contains: q } },
      { customerAddress: { contains: q } },
      { productName: { contains: q } },
      { productColor: { contains: q } },
      { productSize: { contains: q } },
      { productPrice: { contains: q } },
    ];
  }

  const skip = page * limit;

  try {
    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.order.count({ where }),
    ]);

    // Compute CA (total revenue) — productPrice is total price (unit×qty), NOT multiplied again
    const ca = orders.reduce((sum, o) => {
      const num = parseFloat(o.productPrice) || 0;
      return sum + num; // FX30 fix: NO multiplication by productQuantity
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