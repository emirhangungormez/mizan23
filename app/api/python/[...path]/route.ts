import { NextRequest, NextResponse } from "next/server";

const PYTHON_API_URL = process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:3003/api";
const ADMIN_KEY = process.env.MIZAN23_ADMIN_KEY;
const RETRYABLE_GET_ATTEMPTS = 3;
const RETRYABLE_HYDRATE_POST_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

type RouteParams = {
  params: Promise<{ path: string[] }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleProxy(request: NextRequest, { params }: RouteParams) {
  const resolvedParams = await params;
  const path = Array.isArray(resolvedParams?.path) ? resolvedParams.path.join("/") : "";
  const search = request.nextUrl.searchParams.toString();
  const target = `${PYTHON_API_URL}/${path}${search ? `?${search}` : ""}`;
  const isHydrateRequest = request.method === "POST" && path === "market/bist/hydrate";

  try {
    const opts: RequestInit = {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(ADMIN_KEY ? { "x-mizan23-admin-key": ADMIN_KEY } : {}),
      },
    };

    if (!["GET", "HEAD"].includes(request.method)) {
      const body = await request.text();
      if (body) opts.body = body;
    }

    let res: Response | null = null;
    let lastError: unknown = null;
    const attempts =
      request.method === "GET"
        ? RETRYABLE_GET_ATTEMPTS
        : isHydrateRequest
          ? RETRYABLE_HYDRATE_POST_ATTEMPTS
          : 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        res = await fetch(target, opts);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    if (!res) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown proxy fetch error"));
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Engine Error: ${res.status}`, details: text }, { status: res.status });
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { "content-type": ct } });
  } catch (err) {
    console.error("[Proxy Error]", err);
    return NextResponse.json({ error: "Proxy Connection Failed", details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
