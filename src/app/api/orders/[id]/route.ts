import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Only allow updating these fields
  const allowedFields = [
    'customerName',
    'customerPhone',
    'customerCity',
    'customerAddress',
    'productName',
    'productColor',
    'productSize',
    'productImage',
    'productPrice',
    'productQuantity',
    'status',
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      data[key] = body[key];
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  }

  try {
    const order = await db.order.update({
      where: { id },
      data,
    });
    return NextResponse.json(order);
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}