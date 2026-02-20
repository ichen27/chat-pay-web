"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

type Overview = {
  totals: {
    servers: number;
    activeSessions: number;
    queuedUsers: number;
  };
  servers: Array<{
    id: string;
    key: string;
    name: string;
    queueCount: number;
    activeSessionCount: number;
    createdBy: { id: string; username: string; displayName: string };
    updatedAt: string;
  }>;
  recentSessions: Array<{
    id: string;
    status: string;
    userAId: string;
    userBId: string;
    endedReason: string | null;
    createdAt: string;
    updatedAt: string;
    endedAt: string | null;
    server: { id: string; key: string; name: string };
  }>;
};

export default function AdminVideoPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = localStorage.getItem("token");
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
  }, []);

  const load = useCallback(async () => {
    const res = await authFetch("/api/admin/video/overview");
    if (!res.ok) {
      if (res.status === 403) {
        setError("Forbidden: admin access required");
      } else {
        setError("Failed to load dashboard");
      }
      return;
    }
    setError(null);
    const payload = (await res.json()) as Overview;
    setData(payload);
  }, [authFetch]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    const initialTimer = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load, user]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Video Management Dashboard</h1>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
            onClick={() => router.push("/video")}
          >
            Back to Video
          </button>
        </div>

        {error ? <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

        {data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <p className="text-xs text-zinc-400">Servers</p>
                <p className="text-2xl font-semibold">{data.totals.servers}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <p className="text-xs text-zinc-400">Active Sessions</p>
                <p className="text-2xl font-semibold">{data.totals.activeSessions}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <p className="text-xs text-zinc-400">Queued Users</p>
                <p className="text-2xl font-semibold">{data.totals.queuedUsers}</p>
              </div>
            </div>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <h2 className="mb-2 text-sm font-medium">Server Health</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="px-2 py-2">Server</th>
                      <th className="px-2 py-2">Key</th>
                      <th className="px-2 py-2">Queue</th>
                      <th className="px-2 py-2">Active</th>
                      <th className="px-2 py-2">Owner</th>
                      <th className="px-2 py-2">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.servers.map((server) => (
                      <tr key={server.id} className="border-t border-zinc-800">
                        <td className="px-2 py-2">{server.name}</td>
                        <td className="px-2 py-2 text-zinc-400">{server.key}</td>
                        <td className="px-2 py-2">{server.queueCount}</td>
                        <td className="px-2 py-2">{server.activeSessionCount}</td>
                        <td className="px-2 py-2">{server.createdBy.displayName}</td>
                        <td className="px-2 py-2 text-zinc-400">{new Date(server.updatedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <h2 className="mb-2 text-sm font-medium">Recent Sessions</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="px-2 py-2">Session</th>
                      <th className="px-2 py-2">Server</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Users</th>
                      <th className="px-2 py-2">Ended Reason</th>
                      <th className="px-2 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSessions.map((session) => (
                      <tr key={session.id} className="border-t border-zinc-800">
                        <td className="px-2 py-2 text-zinc-300">{session.id.slice(0, 8)}</td>
                        <td className="px-2 py-2">{session.server.name}</td>
                        <td className="px-2 py-2">{session.status}</td>
                        <td className="px-2 py-2 text-zinc-400">
                          {session.userAId.slice(0, 6)} / {session.userBId.slice(0, 6)}
                        </td>
                        <td className="px-2 py-2 text-zinc-400">{session.endedReason ?? "-"}</td>
                        <td className="px-2 py-2 text-zinc-400">{new Date(session.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
