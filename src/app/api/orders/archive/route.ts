import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { orderIds, archive = true } = await req.json();

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json(
      { error: 'orderIds must be a non-empty array' },
      { status: 400 }
    );
  }

  try {
    // Business rule (Point 2): Only 'delivered' and 'cancelled' can be archived
    // Previously was 'delivered' + 'confirmed' — changed per audit V4.1.3
    const eligibleOrders = await db.order.findMany({
      where: {
        id: { in: orderIds },
        status: { in: ['delivered', 'cancelled'] },
        isDeleted: !archive,
      },
      select: { id: true },
    });

    const eligibleIds = eligibleOrders.map(o => o.id);

    if (eligibleIds.length === 0) {
      return NextResponse.json(
        { error: 'No eligible orders found. Only delivered or cancelled orders can be archived.' },
        { status: 400 }
      );
    }

    await db.order.updateMany({
      where: { id: { in: eligibleIds } },
      data: { isDeleted: archive },
    });

    const skipped = orderIds.length - eligibleIds.length;

    return NextResponse.json({
      success: true,
      archived: eligibleIds.length,
      skipped,
      message: skipped > 0
        ? `${eligibleIds.length} order(s) archived, ${skipped} skipped (not eligible)`
        : `${eligibleIds.length} order(s) archived`,
    });
  } catch (error) {
    console.error('Archive error:', error);
    return NextResponse.json(
      { error: 'Failed to archive orders' },
      { status: 500 }
    );
  }
}