import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listings, candidates, blacklist } from "@/db/schema";

export const runtime = "nodejs";

// URLs déjà connues, pour l'extension Chrome : elle surligne sur les portails
// les annonces déjà en favori, déjà proposées en candidat, ou exclues.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
  const [ls, cs, bl] = await Promise.all([
    db.select({ url: listings.url, status: listings.status }).from(listings),
    db.select({ url: candidates.url, score: candidates.score }).from(candidates),
    db.select({ url: blacklist.url }).from(blacklist),
  ]);
  return NextResponse.json(
    {
      favoris: ls.map((r) => r.url),
      candidats: cs.map((r) => ({ url: r.url, score: r.score })),
      exclus: bl.map((r) => r.url),
    },
    { headers: CORS }
  );
}
