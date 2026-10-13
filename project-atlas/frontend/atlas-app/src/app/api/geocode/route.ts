import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // never cache this route

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q || q.trim().length < 2) {
      return NextResponse.json([]);
    }

    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '8', 10)), 20);
    const polygonGeojson = searchParams.get('polygon_geojson') === '1' ? '1' : '0';
    const addressdetails = searchParams.get('addressdetails') !== '0' ? '1' : '0';
    const extratags = searchParams.get('extratags') === '1' ? '1' : '0';
    const viewbox = searchParams.get('viewbox');

    let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&addressdetails=${addressdetails}&polygon_geojson=${polygonGeojson}&extratags=${extratags}&q=${encodeURIComponent(
      q.trim()
    )}`;

    if (viewbox) {
      nominatimUrl += `&viewbox=${encodeURIComponent(viewbox)}&bounded=0`;
    }

    const res = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'ProjectAtlas/1.0 (https://github.com/pyscriptcli/project-atlas; contact@projectatlas.io)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Geocoding service returned HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Geocoding request failed' },
      { status: 500 }
    );
  }
}

