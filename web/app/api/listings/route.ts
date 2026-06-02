import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { listings, type NewListing } from "@/db/schema";

export const runtime = "nodejs";

// L'extension Chrome appelle cette API depuis une origine chrome-extension://,
// d'où les en-têtes CORS. L'accès reste protégé par le secret Bearer.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function authorized(req: NextRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === secret;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const rows = await db.select().from(listings).orderBy(desc(listings.createdAt));
  return NextResponse.json(rows, { headers: CORS });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }

  const url = typeof body.url === "string" ? body.url : null;
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400, headers: CORS });
  }

  const photos = Array.isArray(body.photos)
    ? (body.photos.filter((p) => typeof p === "string") as string[])
    : [];

  const toStr = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const toInt = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const record: NewListing = {
    source: toStr(body.source) ?? "generic",
    url,
    title: toStr(body.title),
    price: toInt(body.price),
    location: toStr(body.location),
    surface: toStr(body.surface),
    rooms: toStr(body.rooms),
    description: toStr(body.description),
    photos,
    notes: toStr(body.notes),
    raw: (body.raw as unknown) ?? null,
  };

  const [inserted] = await db.insert(listings).values(record).returning();
  return NextResponse.json(inserted, { status: 201, headers: CORS });
}
