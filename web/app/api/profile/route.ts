import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profile, type ProfileData } from "@/db/schema";

export const runtime = "nodejs";

// Ligne unique du profil (mémoire du skill).
const PROFILE_ID = "default";

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Le skill récupère le profil courant pour repartir de là et l'affiner.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  const [row] = await db.select().from(profile).limit(1);
  // Profil vide tant que le skill n'a rien écrit (premier passage).
  return NextResponse.json(row?.data ?? null, { headers: CORS });
}

// Le skill réécrit le profil affiné (upsert de la ligne unique).
export async function PUT(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }

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
    .values({ id: PROFILE_ID, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profile.id,
      set: { data, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json(row, { status: 200, headers: CORS });
}
