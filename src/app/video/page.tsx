"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

type MatchResponse = {
  status: "idle" | "waiting" | "matched";
  sessionId: string | null;
  serverId: string | null;
  peerUserId: string | null;
  initiator: boolean;
};

type IncomingSignal = {
  id: number;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  type: "offer" | "answer" | "ice" | "peer-left";
  payload: unknown;
  createdAt: string;
};

type VideoServerSummary = {
  id: string;
  key: string;
  name: string;
  queueCount: number;
  activeSessionCount: number;
};

type ConnectionState = "idle" | "waiting" | "connecting" | "connected" | "error";

export default function VideoPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<ConnectionState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<VideoServerSummary[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [newServerName, setNewServerName] = useState("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pollMatchTimerRef = useRef<number | null>(null);
  const pollSignalTimerRef = useRef<number | null>(null);
  const lastSignalIdRef = useRef(0);
  const activeSessionRef = useRef<string | null>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = localStorage.getItem("token");
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
  }, []);

  const fetchServers = useCallback(async () => {
    const res = await authFetch("/api/video/servers");
    if (!res.ok) return;
    const data = (await res.json()) as { servers: VideoServerSummary[] };
    setServers(data.servers);
    setSelectedServerId((prev) => {
      if (prev && data.servers.some((server) => server.id === prev)) {
        return prev;
      }
      return data.servers[0]?.id ?? "";
    });
  }, [authFetch]);

  const clearTimers = useCallback(() => {
    if (pollMatchTimerRef.current !== null) {
      window.clearInterval(pollMatchTimerRef.current);
      pollMatchTimerRef.current = null;
    }
    if (pollSignalTimerRef.current !== null) {
      window.clearInterval(pollSignalTimerRef.current);
      pollSignalTimerRef.current = null;
    }
  }, []);

  const resetPeerConnection = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    peerConnectionRef.current = null;

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const ensureCamera = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  const sendSignal = useCallback(
    async (type: "offer" | "answer" | "ice", payload: unknown) => {
      const currentSession = activeSessionRef.current;
      if (!currentSession) return;
      await authFetch("/api/video/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSession,
          type,
          payload,
        }),
      });
    },
    [authFetch]
  );

  const attachPeerConnection = useCallback(
    async (currentSessionId: string, initiator: boolean) => {
      const localStream = await ensureCamera();

      resetPeerConnection();
      clearTimers();
      setStatus("connecting");
      setError(null);

      activeSessionRef.current = currentSessionId;
      lastSignalIdRef.current = 0;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal("ice", event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setStatus("connected");
        }
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setStatus("waiting");
        }
      };

      pollSignalTimerRef.current = window.setInterval(async () => {
        const activeSession = activeSessionRef.current;
        if (!activeSession) return;
        const res = await authFetch(
          `/api/video/signal?sessionId=${encodeURIComponent(activeSession)}&after=${lastSignalIdRef.current}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { signals: IncomingSignal[] };
        for (const signal of data.signals) {
          lastSignalIdRef.current = Math.max(lastSignalIdRef.current, signal.id);
          if (signal.type === "peer-left") {
            resetPeerConnection();
            setStatus("waiting");
            continue;
          }
          if (signal.type === "offer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal("answer", answer);
            continue;
          }
          if (signal.type === "answer") {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
            continue;
          }
          if (signal.type === "ice" && signal.payload) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
          }
        }
      }, 1000);

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", offer);
      }
    },
    [authFetch, clearTimers, ensureCamera, resetPeerConnection, sendSignal]
  );

  const beginMatchmaking = useCallback(
    async (action: "find" | "next") => {
      if (!selectedServerId) {
        setError("Select a server module first");
        return;
      }

      setError(null);
      const localStream = await ensureCamera();
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      const res = await authFetch("/api/video/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, serverId: selectedServerId }),
      });

      if (!res.ok) {
        setStatus("error");
        setError("Unable to start matchmaking");
        return;
      }

      const data = (await res.json()) as MatchResponse;

      if (data.status === "matched" && data.sessionId) {
        setSessionId(data.sessionId);
        await attachPeerConnection(data.sessionId, data.initiator);
        return;
      }

      setStatus("waiting");
      setSessionId(null);
      activeSessionRef.current = null;
      resetPeerConnection();

      clearTimers();
      pollMatchTimerRef.current = window.setInterval(async () => {
        const stateRes = await authFetch("/api/video/match");
        if (!stateRes.ok) return;
        const state = (await stateRes.json()) as MatchResponse;
        if (state.status === "matched" && state.sessionId) {
          setSessionId(state.sessionId);
          clearTimers();
          await attachPeerConnection(state.sessionId, state.initiator);
        }
      }, 2000);
    },
    [attachPeerConnection, authFetch, clearTimers, ensureCamera, resetPeerConnection, selectedServerId]
  );

  const handleLeave = useCallback(async () => {
    await authFetch("/api/video/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave" }),
    });
    activeSessionRef.current = null;
    setSessionId(null);
    clearTimers();
    resetPeerConnection();
    setStatus("idle");
  }, [authFetch, clearTimers, resetPeerConnection]);

  const createServer = useCallback(async () => {
    const name = newServerName.trim();
    if (!name) return;

    const res = await authFetch("/api/video/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      setError("Unable to create server module");
      return;
    }

    setNewServerName("");
    await fetchServers();
  }, [authFetch, fetchServers, newServerName]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void fetchServers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchServers, user]);

  useEffect(() => {
    return () => {
      clearTimers();
      resetPeerConnection();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      void authFetch("/api/video/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
    };
  }, [authFetch, clearTimers, resetPeerConnection]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        Loading...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Random Video Chat</h1>
          <div className="flex items-center gap-2">
            {user.role === "ADMIN" ? (
              <button
                type="button"
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
                onClick={() => router.push("/admin/video")}
              >
                Dashboard
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
              onClick={() => router.push("/")}
            >
              Back to Chat
            </button>
          </div>
        </div>

        <p className="text-sm text-zinc-400">
          Status: <span className="font-medium text-zinc-200">{status}</span>
          {sessionId ? ` | Session: ${sessionId.slice(0, 8)}` : ""}
        </p>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <p className="mb-2 text-sm font-medium">Server Module</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedServerId}
              onChange={(event) => setSelectedServerId(event.target.value)}
              className="min-w-[260px] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.key}) | queue {server.queueCount} | active {server.activeSessionCount}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void fetchServers()}
              className="rounded-md bg-zinc-700 px-3 py-2 text-sm"
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={newServerName}
              onChange={(event) => setNewServerName(event.target.value)}
              placeholder="Create new server module"
              className="min-w-[260px] rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createServer()}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
            >
              Create
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
            <p className="px-3 py-2 text-xs text-zinc-400">You</p>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="h-[320px] w-full bg-black object-cover md:h-[420px]"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
            <p className="px-3 py-2 text-xs text-zinc-400">Stranger</p>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-[320px] w-full bg-black object-cover md:h-[420px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void beginMatchmaking("find")}
            disabled={status === "waiting" || status === "connecting" || status === "connected"}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => void beginMatchmaking("next")}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => void handleLeave()}
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white"
          >
            Leave
          </button>
        </div>
      </div>
    </main>
  );
}
