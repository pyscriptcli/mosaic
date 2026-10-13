import { NextResponse } from 'next/server';
import { getNextMapboxToken } from '../../../../gis/mapbox';

export async function GET() {
  try {
    const token = getNextMapboxToken();
    return NextResponse.json({
      success: true,
      hasToken: Boolean(token),
      token: token || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve token' },
      { status: 500 }
    );
  }
}
