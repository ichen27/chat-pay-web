import { Prisma, VideoSignalType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_SERVER_KEY = "public";
const DEFAULT_SERVER_NAME = "Public Random";
const STALE_QUEUE_MS = 1000 * 30;

export type MatchState =
  | {
      status: "idle" | "waiting";
      sessionId: null;
      serverId: string | null;
      peerUserId: null;
      initiator: false;
    }
  | {
      status: "matched";
      sessionId: string;
      serverId: string;
      peerUserId: string;
      initiator: boolean;
    };

export async function ensureDefaultVideoServer(ownerUserId: string) {
  return prisma.videoServer.upsert({
    where: { key: DEFAULT_SERVER_KEY },
    create: {
      key: DEFAULT_SERVER_KEY,
      name: DEFAULT_SERVER_NAME,
      createdById: ownerUserId,
      isActive: true,
    },
    update: { isActive: true },
  });
}

async function getActiveSessionForUser(tx: Prisma.TransactionClient, userId: string) {
  return tx.videoSession.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
}

function matchedStateFromSession(session: { id: string; serverId: string; userAId: string; userBId: string }, userId: string): MatchState {
  const peerUserId = session.userAId === userId ? session.userBId : session.userAId;
  return {
    status: "matched",
    sessionId: session.id,
    serverId: session.serverId,
    peerUserId,
    initiator: userId < peerUserId,
  };
}

export async function getMatchState(userId: string): Promise<MatchState> {
  return prisma.$transaction(async (tx) => {
    const activeSession = await getActiveSessionForUser(tx, userId);
    if (activeSession) {
      return matchedStateFromSession(activeSession, userId);
    }

    const queueEntry = await tx.videoQueueEntry.findUnique({
      where: { userId },
      select: { serverId: true },
    });

    if (!queueEntry) {
      return {
        status: "idle",
        sessionId: null,
        serverId: null,
        peerUserId: null,
        initiator: false,
      };
    }

    return {
      status: "waiting",
      sessionId: null,
      serverId: queueEntry.serverId,
      peerUserId: null,
      initiator: false,
    };
  });
}

export async function leaveMatch(userId: string, reason = "left") {
  return prisma.$transaction(async (tx) => {
    await tx.videoQueueEntry.deleteMany({ where: { userId } });

    const session = await getActiveSessionForUser(tx, userId);
    if (!session) return;

    const peerUserId = session.userAId === userId ? session.userBId : session.userAId;

    await tx.videoSession.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
        endedReason: reason,
      },
    });

    await tx.videoSignal.create({
      data: {
        sessionId: session.id,
        fromUserId: userId,
        toUserId: peerUserId,
        type: "PEER_LEFT",
        payload: "{}",
      },
    });
  });
}

export async function findMatch(userId: string, serverId: string): Promise<MatchState> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.videoQueueEntry.deleteMany({
      where: {
        heartbeatAt: {
          lt: new Date(now.getTime() - STALE_QUEUE_MS),
        },
      },
    });

    const activeSession = await getActiveSessionForUser(tx, userId);
    if (activeSession) {
      return matchedStateFromSession(activeSession, userId);
    }

    await tx.videoQueueEntry.upsert({
      where: { userId },
      create: {
        userId,
        serverId,
      },
      update: {
        serverId,
        heartbeatAt: now,
      },
    });

    const peerQueue = await tx.videoQueueEntry.findFirst({
      where: {
        serverId,
        userId: { not: userId },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!peerQueue) {
      return {
        status: "waiting",
        sessionId: null,
        serverId,
        peerUserId: null,
        initiator: false,
      };
    }

    const peerActive = await getActiveSessionForUser(tx, peerQueue.userId);
    if (peerActive) {
      await tx.videoQueueEntry.deleteMany({ where: { userId: peerQueue.userId } });
      return {
        status: "waiting",
        sessionId: null,
        serverId,
        peerUserId: null,
        initiator: false,
      };
    }

    const claimedPeer = await tx.videoQueueEntry.deleteMany({
      where: { id: peerQueue.id, userId: peerQueue.userId, serverId },
    });

    if (claimedPeer.count === 0) {
      return {
        status: "waiting",
        sessionId: null,
        serverId,
        peerUserId: null,
        initiator: false,
      };
    }

    await tx.videoQueueEntry.deleteMany({ where: { userId } });

    const session = await tx.videoSession.create({
      data: {
        serverId,
        userAId: peerQueue.userId,
        userBId: userId,
        status: "ACTIVE",
      },
    });

    return matchedStateFromSession(session, userId);
  });
}

export async function sendSignal(
  userId: string,
  sessionId: string,
  type: "offer" | "answer" | "ice",
  payload: unknown
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.videoSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== "ACTIVE") {
      throw new Error("Session not active");
    }

    if (session.userAId !== userId && session.userBId !== userId) {
      throw new Error("Not a member of this session");
    }

    const toUserId = session.userAId === userId ? session.userBId : session.userAId;

    const mappedType: Record<"offer" | "answer" | "ice", VideoSignalType> = {
      offer: "OFFER",
      answer: "ANSWER",
      ice: "ICE",
    };

    await tx.videoSignal.create({
      data: {
        sessionId,
        fromUserId: userId,
        toUserId,
        type: mappedType[type],
        payload: JSON.stringify(payload ?? {}),
      },
    });

    await tx.videoSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  });
}

type SignalResponse = {
  id: number;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  type: "offer" | "answer" | "ice" | "peer-left";
  payload: unknown;
  createdAt: string;
};

export async function getSignals(userId: string, sessionId: string, afterId = 0): Promise<SignalResponse[]> {
  const session = await prisma.videoSession.findUnique({
    where: { id: sessionId },
    select: { userAId: true, userBId: true },
  });

  if (!session || (session.userAId !== userId && session.userBId !== userId)) {
    throw new Error("Session not found");
  }

  const rows = await prisma.videoSignal.findMany({
    where: {
      sessionId,
      toUserId: userId,
      id: { gt: afterId },
    },
    orderBy: { id: "asc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    type:
      row.type === "OFFER"
        ? "offer"
        : row.type === "ANSWER"
          ? "answer"
          : row.type === "ICE"
            ? "ice"
            : "peer-left",
    payload: (() => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return {};
      }
    })(),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listVideoServers() {
  const servers = await prisma.videoServer.findMany({
    where: { isActive: true },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const [queueCounts, activeSessionCounts] = await Promise.all([
    prisma.videoQueueEntry.groupBy({
      by: ["serverId"],
      _count: { _all: true },
    }),
    prisma.videoSession.groupBy({
      by: ["serverId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);

  const queueByServer = new Map(queueCounts.map((item) => [item.serverId, item._count._all]));
  const sessionByServer = new Map(activeSessionCounts.map((item) => [item.serverId, item._count._all]));

  return servers.map((server) => ({
    id: server.id,
    key: server.key,
    name: server.name,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
    createdBy: server.createdBy,
    queueCount: queueByServer.get(server.id) ?? 0,
    activeSessionCount: sessionByServer.get(server.id) ?? 0,
  }));
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createVideoServer(userId: string, name: string, requestedKey?: string) {
  const keyBase = normalizeKey(requestedKey && requestedKey.length > 0 ? requestedKey : name);
  if (!keyBase) {
    throw new Error("Invalid server key");
  }

  let key = keyBase;
  let suffix = 1;
  while (await prisma.videoServer.findUnique({ where: { key }, select: { id: true } })) {
    suffix += 1;
    key = `${keyBase}-${suffix}`;
  }

  return prisma.videoServer.create({
    data: {
      key,
      name: name.trim(),
      createdById: userId,
      isActive: true,
    },
    select: {
      id: true,
      key: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
