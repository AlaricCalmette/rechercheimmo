import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listings } from "@/db/schema";
import { applyCheck, type CheckResult } from "@/lib/watch";

export const runtime = "nodejs";

// Veille des annonces sauvegardées, alimentée par la routine (skill) :
// POST { checks: [{ id? | url, state: "ok" | "gone", price? }] }
// - state "gone"  : annonce vendue / retirée du portail
// - state "ok"    : annonce toujours en ligne ; `price` = prix actuel constaté
// Un changement de prix pousse l'ancien prix dans priceHistory.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  }
  let body: { checks?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS });
  }
  if (!Array.isArray(body.checks)) {
    return NextResponse.json({ error: "checks array required" }, { status: 400, headers: CORS });
  }

  const all = await db.select().from(listings);
  const byId = new Map(all.map((r) => [r.id, r]));
  const byUrl = new Map(all.map((r) => [r.url, r]));

  const report: {
    id: string;
    url: string;
    priceChanged: boolean;
    goneChanged: boolean;
  }[] = [];
  let unmatched = 0;

  for (const raw of body.checks as Record<string, unknown>[]) {
    const row =
      (typeof raw.id === "string" && byId.get(raw.id)) ||
      (typeof raw.url === "string" && byUrl.get(raw.url)) ||
      null;
    if (!row) {
      unmatched++;
      continue;
    }
    const state = raw.state === "gone" ? "gone" : raw.state === "ok" ? "ok" : null;
    if (!state) continue;
    const price =
      typeof raw.price === "number" && Number.isFinite(raw.price)
        ? Math.round(raw.price)
        : typeof raw.price === "string"
          ? parseInt(raw.price.replace(/[^\d]/g, ""), 10) || null
          : null;
    const result: CheckResult = { state, price };
    const r = await applyCheck(row, result);
    report.push({ id: row.id, url: row.url, ...r });
  }

  return NextResponse.json(
    {
      checked: report.length,
      unmatched,
      priceChanges: report.filter((r) => r.priceChanged).length,
      goneChanges: report.filter((r) => r.goneChanged).length,
      report,
    },
    { headers: CORS }
  );
}
