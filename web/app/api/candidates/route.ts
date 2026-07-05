import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, blacklist, type NewCandidate, type Kind } from "@/db/schema";

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

function toKind(v: unknown): Kind | null {
  return v === "achat" || v === "location" ? v : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Renvoie les candidats accumulés (classés par score puis date).
// Filtre optionnel : ?kind=achat|location
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const kind = toKind(req.nextUrl.searchParams.get("kind"));
  const query = db
    .select()
    .from(candidates)
    .orderBy(desc(candidates.score), desc(candidates.createdAt));
  const rows = kind ? await query.where(eq(candidates.kind, kind)) : await query;

  return NextResponse.json({ count: rows.length, candidates: rows }, { headers: CORS });
}

// Le skill envoie un lot de candidats (un passage = un runId). Le `kind` peut
// être donné au niveau du lot (s'applique à tous) ou par candidat.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }

  let body: { runId?: string; kind?: string; candidates?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }

  const runId =
    typeof body.runId === "string" && body.runId.length > 0
      ? body.runId
      : crypto.randomUUID();
  const batchKind = toKind(body.kind);

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
      kind: toKind(c.kind) ?? batchKind ?? "achat",
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "no valid candidates" }, { status: 400, headers: CORS });
  }

  const urls = rows.map((r) => r.url);

  // Les annonces exclues (blacklist) ne reviennent jamais, même si le skill
  // les repropose.
  const banned = await db
    .select({ url: blacklist.url })
    .from(blacklist)
    .where(inArray(blacklist.url, urls));
  const bannedSet = new Set(banned.map((b) => b.url));

  // Déduplication : on n'ajoute que les annonces dont l'URL n'est pas déjà
  // présente. La routine ne fait donc qu'ajouter des candidats (jamais de
  // doublon, jamais de remplacement) ; la suppression est manuelle côté site.
  const existing = await db
    .select({ url: candidates.url })
    .from(candidates)
    .where(inArray(candidates.url, urls));
  const seen = new Set(existing.map((e) => e.url));

  // dédoublonne aussi à l'intérieur du lot reçu
  const newRows: NewCandidate[] = [];
  let blacklisted = 0;
  for (const r of rows) {
    if (bannedSet.has(r.url)) {
      blacklisted++;
      continue;
    }
    if (!seen.has(r.url)) {
      seen.add(r.url);
      newRows.push(r);
    }
  }

  if (newRows.length > 0) {
    await db.insert(candidates).values(newRows);
  }
  return NextResponse.json(
    {
      runId,
      inserted: newRows.length,
      skipped: rows.length - newRows.length - blacklisted,
      blacklisted,
    },
    { status: 201, headers: CORS }
  );
}
