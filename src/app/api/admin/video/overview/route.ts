import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listVideoServers } from "@/lib/videoCoordinator";
import { getRequestUser } from "@/lib/requestAuth";
import { isAdminEmail } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "ADMIN" && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [servers, totalActiveSessions, totalQueuedUsers, recentSessions] = await Promise.all([
    listVideoServers(),
    prisma.videoSession.count({ where: { status: "ACTIVE" } }),
    prisma.videoQueueEntry.count(),
    prisma.videoSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        server: { select: { id: true, key: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    totals: {
      servers: servers.length,
      activeSessions: totalActiveSessions,
      queuedUsers: totalQueuedUsers,
    },
    servers,
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      server: session.server,
      userAId: session.userAId,
      userBId: session.userBId,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      endedReason: session.endedReason,
      updatedAt: session.updatedAt.toISOString(),
    })),
  });
}
