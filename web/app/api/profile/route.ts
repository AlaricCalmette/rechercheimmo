import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { profile, type ProfileData, type Kind } from "@/db/schema";

export const runtime = "nodejs";

// Deux profils persistants, un par type de projet : id = "achat" | "location".
// L'ancien id "default" (historique, avant la séparation achat/location) est
// lu comme repli du profil achat.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function authorized(req: NextRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === secret;
}

function toKind(v: unknown): Kind {
  return v === "location" ? "location" : "achat";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Le skill récupère le profil courant (?kind=achat|location, défaut achat)
// pour repartir de là et l'affiner.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const kind = toKind(req.nextUrl.searchParams.get("kind"));
  const ids = kind === "achat" ? ["achat", "default"] : ["location"];
  const rows = await db.select().from(profile).where(inArray(profile.id, ids));
  // Pour l'achat : la ligne "achat" prime sur l'ancienne ligne "default".
  const row = rows.find((r) => r.id === kind) ?? rows.find((r) => r.id === "default");
  return NextResponse.json(row?.data ?? null, { headers: CORS });
}

// Le skill (ou le site) réécrit le profil affiné (upsert de la ligne du kind).
export async function PUT(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const kind = toKind(req.nextUrl.searchParams.get("kind"));

  let data: ProfileData;
  try {
    data = (await req.json()) as ProfileData;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "profile must be an object" }, { status: 400, headers: CORS });
  }

  const [row] = await db
    .insert(profile)
    .values({ id: kind, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profile.id,
      set: { data, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json(row, { status: 200, headers: CORS });
}
