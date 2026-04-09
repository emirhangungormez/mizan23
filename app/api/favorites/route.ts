import path from "path";
import { NextResponse } from "next/server";

import { ensureJsonFile, writeJsonFile } from "@/lib/server/json-storage";

export type FavoriteMarket = "bist" | "us" | "crypto" | "commodities" | "funds" | "fx";

export interface FavoriteListItem {
  symbol: string;
  name?: string;
  market: FavoriteMarket;
  addedAt: string;
}

export interface FavoriteList {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: FavoriteListItem[];
}

const DATA_FILE = path.join(process.cwd(), "data", "favorites.json");

function readLists() {
  return ensureJsonFile<FavoriteList[]>(DATA_FILE, []);
}

function saveLists(lists: FavoriteList[]) {
  writeJsonFile(DATA_FILE, lists);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const lists = readLists();
  return NextResponse.json(userId ? lists.filter((list) => list.userId === userId) : lists);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode = typeof body?.mode === "string" ? body.mode : "create";
  const lists = readLists();

  if (mode === "create") {
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

    if (!userId || !name) {
      return NextResponse.json({ error: "Liste icin kullanici ve isim gerekli." }, { status: 400 });
    }

    const existing = lists.find(
      (list) =>
        list.userId === userId &&
        list.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const now = new Date().toISOString();
    const nextList: FavoriteList = {
      id: `fav_${Date.now()}`,
      userId,
      name,
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    lists.push(nextList);
    saveLists(lists);
    return NextResponse.json(nextList, { status: 201 });
  }

  if (mode === "toggle") {
    const listId = typeof body?.listId === "string" ? body.listId : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol : "";
    const market = body?.market as FavoriteMarket | undefined;
    const name = typeof body?.name === "string" ? body.name : undefined;

    const index = lists.findIndex((list) => list.id === listId);
    if (index === -1 || !symbol || !market) {
      return NextResponse.json({ error: "Liste veya varlik bilgisi eksik." }, { status: 400 });
    }

    const list = lists[index];
    const exists = list.items.some((item) => item.symbol === symbol);
    const updatedAt = new Date().toISOString();

    lists[index] = {
      ...list,
      updatedAt,
      items: exists
        ? list.items.filter((item) => item.symbol !== symbol)
        : [...list.items, { symbol, market, name, addedAt: updatedAt }],
    };

    saveLists(lists);
    return NextResponse.json({ added: !exists, list: lists[index] });
  }

  if (mode === "remove-item") {
    const listId = typeof body?.listId === "string" ? body.listId : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol : "";
    const index = lists.findIndex((list) => list.id === listId);
    if (index === -1 || !symbol) {
      return NextResponse.json({ error: "Liste veya sembol eksik." }, { status: 400 });
    }

    lists[index] = {
      ...lists[index],
      updatedAt: new Date().toISOString(),
      items: lists[index].items.filter((item) => item.symbol !== symbol),
    };
    saveLists(lists);
    return NextResponse.json(lists[index]);
  }

  return NextResponse.json({ error: "Gecersiz favori islemi." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("id");
  if (!listId) {
    return NextResponse.json({ error: "Silinecek liste belirtilmedi." }, { status: 400 });
  }

  const lists = readLists();
  const nextLists = lists.filter((list) => list.id !== listId);
  if (nextLists.length === lists.length) {
    return NextResponse.json({ error: "Liste bulunamadi." }, { status: 404 });
  }

  saveLists(nextLists);
  return NextResponse.json({ ok: true });
}
