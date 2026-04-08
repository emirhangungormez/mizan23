import { NextRequest, NextResponse } from 'next/server';

const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:3003';

/**
 * GET /api/assets/search
 * Search all available assets from borsapy
 * Query params:
 * - query: search term (symbol or name)
 * - type: asset type (stocks, forex, crypto, commodities, all)
 * - limit: max results (default: 20)
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('query') || '';
        const type = searchParams.get('type') || 'all';
        const limit = parseInt(searchParams.get('limit') || '20');

        // Forward to Python engine
        const response = await fetch(
            `${PYTHON_ENGINE_URL}/api/assets/search?query=${encodeURIComponent(query)}&type=${type}&limit=${limit}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.error('[API] Asset search upstream error:', response.status, errorText);
            return NextResponse.json({
                success: false,
                query,
                type,
                count: 0,
                results: [],
                error: `Python engine returned ${response.status}`
            });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('[API] Asset search error:', error);
        return NextResponse.json(
            {
                success: false,
                query: request.nextUrl.searchParams.get('query') || '',
                type: request.nextUrl.searchParams.get('type') || 'all',
                count: 0,
                results: [],
                error: 'Failed to search assets'
            }
        );
    }
}
