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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const data = readData();
    return NextResponse.json(userId ? data.filter((item) => item.userId === userId) : data);
}

export async function POST(request: Request) {
    const body = await request.json();
    const portfolios = readData();

    const newPortfolio = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assets: [],
        userId: body?.userId || null,
        ...body
    };

    portfolios.push(newPortfolio);
    saveData(portfolios);

    return NextResponse.json(newPortfolio);
}
