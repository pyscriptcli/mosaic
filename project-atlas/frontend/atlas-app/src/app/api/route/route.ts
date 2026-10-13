import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { coordinates, profile = 'driving' } = await req.json();
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return NextResponse.json({ error: 'Valid coordinates array required' }, { status: 400 });
    }

    const coordStr = coordinates.map((p: [number, number]) => `${p[0]},${p[1]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
