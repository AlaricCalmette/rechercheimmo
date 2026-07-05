import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blacklist } from "@/db/schema";

export const runtime = "nodejs";

// Liste des annonces exclues définitivement. Le skill la lit pour ne jamais
// reproposer ces URLs ; le site y ajoute via le bouton « Exclure ».
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
  const rows = await db.select().from(blacklist).orderBy(desc(blacklist.createdAt));
  return NextResponse.json(
    { count: rows.length, urls: rows.map((r) => r.url), entries: rows },
    { headers: CORS }
  );
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
  const url = typeof body.url === "string" && body.url.length > 0 ? body.url : null;
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400, headers: CORS });
  }
  const toStr = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  await db
    .insert(blacklist)
    .values({
      url,
      title: toStr(body.title),
      source: toStr(body.source),
      reason: toStr(body.reason),
    })
    .onConflictDoNothing({ target: blacklist.url });
  return NextResponse.json({ ok: true, url }, { status: 201, headers: CORS });
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }
  const url = typeof body.url === "string" && body.url.length > 0 ? body.url : null;
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400, headers: CORS });
  }
  await db.delete(blacklist).where(eq(blacklist.url, url));
  return NextResponse.json({ ok: true }, { headers: CORS });
}
