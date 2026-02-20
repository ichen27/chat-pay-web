import { NextRequest, NextResponse } from "next/server";
import {
  createVideoServer,
  ensureDefaultVideoServer,
  listVideoServers,
} from "@/lib/videoCoordinator";
import { getRequestUser } from "@/lib/requestAuth";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultVideoServer(user.id);
  const servers = await listVideoServers();
  return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const key = typeof body?.key === "string" ? body.key : undefined;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const server = await createVideoServer(user.id, name, key);
    return NextResponse.json({ server }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
