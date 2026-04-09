import { NextResponse } from 'next/server';
import path from 'path';

import { ensureJsonFile, writeJsonFile } from '@/lib/server/json-storage';

const DATA_FILE = path.join(process.cwd(), 'data', 'portfolios.json');

type PortfolioRecord = {
    id: string;
    userId?: string | null;
    [key: string]: unknown;
};

function readData(): PortfolioRecord[] {
    return ensureJsonFile<PortfolioRecord[]>(DATA_FILE, []);
}

function saveData(data: PortfolioRecord[]) {
    writeJsonFile(DATA_FILE, data);
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const portfolios = readData();
    const portfolio = portfolios.find((p) => p.id === id && (!userId || p.userId === userId));

    if (!portfolio) {
        return new NextResponse('Portfolio not found', { status: 404 });
    }

    return NextResponse.json(portfolio);
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    let portfolios = readData();
    const initialLength = portfolios.length;
    portfolios = portfolios.filter((p) => !(p.id === id && (!userId || p.userId === userId)));

    if (portfolios.length === initialLength) {
        return new NextResponse('Portfolio not found', { status: 404 });
    }

    saveData(portfolios);
    return new NextResponse(null, { status: 204 });
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const body = (await request.json()) as Record<string, unknown>;
    const portfolios = readData();
    const index = portfolios.findIndex((p) => p.id === id && (!userId || p.userId === userId));

    if (index === -1) {
        return new NextResponse('Portfolio not found', { status: 404 });
    }

    // Merge updates
    portfolios[index] = {
        ...portfolios[index],
        ...body,
        updated_at: new Date().toISOString()
    };

    saveData(portfolios);
    return NextResponse.json(portfolios[index]);
}
