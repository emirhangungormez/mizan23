import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'portfolios.json');

// Helper to read data
function readData() {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
    try {
        return JSON.parse(fileContent);
    } catch (e) {
        return [];
    }
}

// Helper to save data
function saveData(data: any) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
    const data = readData();
    return NextResponse.json(data);
}

export async function POST(request: Request) {
    const body = await request.json();
    const portfolios = readData();

    const newPortfolio = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assets: [],
        ...body
    };

    portfolios.push(newPortfolio);
    saveData(portfolios);

    return NextResponse.json(newPortfolio);
}
