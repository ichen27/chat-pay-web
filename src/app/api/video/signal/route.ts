import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getSignals, sendSignal } from "@/lib/videoCoordinator";

function getUserId(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(header.slice(7)).userId;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("sessionId");
  const after = parseInt(searchParams.get("after") ?? "0", 10);

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const signals = await getSignals(userId, sessionId, Number.isFinite(after) ? after : 0);
    return NextResponse.json({ signals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const sessionId = body?.sessionId as string | undefined;
    const type = body?.type as "offer" | "answer" | "ice" | undefined;
    const payload = body?.payload;

    if (!sessionId || !type) {
      return NextResponse.json(
        { error: "sessionId and type are required" },
        { status: 400 }
      );
    }

    if (!["offer", "answer", "ice"].includes(type)) {
      return NextResponse.json({ error: "Invalid signal type" }, { status: 400 });
    }

    await sendSignal(userId, sessionId, type, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
