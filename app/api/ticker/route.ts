import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Placeholder - ticker info not yet implemented
    return NextResponse.json({
        symbol,
        message: 'Ticker API not implemented',
        status: 'pending'
    });
}
