import path from "path";
import { NextResponse } from "next/server";

import { ensureJsonFile, writeJsonFile } from "@/lib/server/json-storage";

export type ApiUserRole = "admin" | "user" | "guest";

export interface ApiUser {
  id: string;
  name: string;
  avatar?: string;
  role: ApiUserRole;
  preferences: {
    theme: "light" | "dark" | "system";
  };
  createdAt: string;
  updatedAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "users.json");

const DEFAULT_USERS: ApiUser[] = [
  {
    id: "u1",
    name: "Yonetici",
    role: "admin",
    preferences: { theme: "dark" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "u2",
    name: "Yatirimci",
    role: "user",
    preferences: { theme: "system" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "u3",
    name: "Misafir",
    role: "guest",
    preferences: { theme: "light" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function readUsers() {
  return ensureJsonFile<ApiUser[]>(DATA_FILE, DEFAULT_USERS);
}

function saveUsers(users: ApiUser[]) {
  writeJsonFile(DATA_FILE, users);
}

export async function GET() {
  return NextResponse.json(readUsers());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const role = (body?.role === "admin" || body?.role === "guest" ? body.role : "user") as ApiUserRole;

  if (!name) {
    return NextResponse.json({ error: "Profil olusturmak icin isim gerekli." }, { status: 400 });
  }

  const users = readUsers();
  const exists = users.some(
    (user) => user.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
  );
  if (exists) {
    const found = users.find(
      (user) => user.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    return NextResponse.json(found, { status: 200 });
  }

  const now = new Date().toISOString();
  const nextUser: ApiUser = {
    id: `u_${Date.now()}`,
    name,
    role,
    preferences: { theme: "system" },
    createdAt: now,
    updatedAt: now,
  };

  users.push(nextUser);
  saveUsers(users);
  return NextResponse.json(nextUser, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("id");
  if (!userId) {
    return NextResponse.json({ error: "Silinecek profil belirtilmedi." }, { status: 400 });
  }

  const users = readUsers();
  if (users.length <= 1) {
    return NextResponse.json({ error: "Sistemde en az bir profil kalmali." }, { status: 400 });
  }

  const nextUsers = users.filter((user) => user.id !== userId);
  if (nextUsers.length === users.length) {
    return NextResponse.json({ error: "Profil bulunamadi." }, { status: 404 });
  }

  saveUsers(nextUsers);
  return NextResponse.json({ ok: true });
}
