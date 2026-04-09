import { NextResponse } from 'next/server';
import path from 'path';

import { ensureJsonFile, writeJsonFile } from '@/lib/server/json-storage';

const DATA_FILE = path.join(process.cwd(), 'data', 'portfolios.json');

function readData() {
    return ensureJsonFile<any[]>(DATA_FILE, []);
}

function saveData(data: any) {
    writeJsonFile(DATA_FILE, data);
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const portfolios = readData();
    const portfolio = portfolios.find((p: any) => p.id === id);

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
    let portfolios = readData();
    const initialLength = portfolios.length;
    portfolios = portfolios.filter((p: any) => p.id !== id);

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
    const body = await request.json();
    const portfolios = readData();
    const index = portfolios.findIndex((p: any) => p.id === id);

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
