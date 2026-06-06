import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, type NewCandidate } from "@/db/schema";

export const runtime = "nodejs";

// Le skill Claude (routine) appelle cette API depuis un environnement externe :
// CORS large, accès protégé par le secret Bearer.
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

// Renvoie les candidats du dernier passage (runId le plus récent).
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const latest = await db
    .select({ runId: candidates.runId })
    .from(candidates)
    .orderBy(desc(candidates.createdAt))
    .limit(1);

  if (latest.length === 0) {
    return NextResponse.json({ runId: null, candidates: [] }, { headers: CORS });
  }

  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.runId, latest[0].runId))
    .orderBy(desc(candidates.score));

  return NextResponse.json({ runId: latest[0].runId, candidates: rows }, { headers: CORS });
}

// Le skill envoie un lot de candidats (un passage = un runId).
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }

  let body: { runId?: string; candidates?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }

  const runId =
    typeof body.runId === "string" && body.runId.length > 0
      ? body.runId
      : crypto.randomUUID();

  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return NextResponse.json({ error: "candidates array required" }, { status: 400, headers: CORS });
  }

  const toStr = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const toInt = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseInt(v.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const rows: NewCandidate[] = (body.candidates as Record<string, unknown>[])
    .filter((c) => typeof c.url === "string" && c.url.length > 0)
    .map((c) => ({
      runId,
      source: toStr(c.source) ?? "generic",
      url: c.url as string,
      title: toStr(c.title),
      price: toInt(c.price),
      location: toStr(c.location),
      surface: toStr(c.surface),
      rooms: toStr(c.rooms),
      photos: Array.isArray(c.photos)
        ? (c.photos.filter((p) => typeof p === "string") as string[])
        : [],
      score: toInt(c.score),
      reasons: toStr(c.reasons),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "no valid candidates" }, { status: 400, headers: CORS });
  }

  await db.insert(candidates).values(rows);
  return NextResponse.json({ runId, inserted: rows.length }, { status: 201, headers: CORS });
}
