import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  ensureDefaultVideoServer,
  findMatch,
  getMatchState,
  leaveMatch,
} from "@/lib/videoCoordinator";

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

  const state = await getMatchState(userId);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action as "find" | "next" | "leave" | undefined;

    if (action === "leave") {
      await leaveMatch(userId);
      return NextResponse.json({ ok: true });
    }

    const serverIdRaw = body?.serverId as string | undefined;
    let serverId = serverIdRaw;
    if (!serverId) {
      const fallbackServer = await ensureDefaultVideoServer(userId);
      serverId = fallbackServer.id;
    }

    if (action === "next") {
      await leaveMatch(userId, "next");
    }

    const state = await findMatch(userId, serverId);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
