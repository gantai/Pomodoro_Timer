import { TimerRoom } from "./room.js";

export { TimerRoom };

const ROOM_ID_RE = /^[a-z0-9-]{3,48}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket sync endpoint: /api/room/<roomId>
    const match = url.pathname.match(/^\/api\/room\/([^/]+)$/);
    if (match) {
      const roomId = decodeURIComponent(match[1]).toLowerCase();
      if (!ROOM_ID_RE.test(roomId)) {
        return new Response("Invalid room id", { status: 400 });
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    // Everything else is a static asset. The assets config handles the SPA
    // fallback for /r/<room>; this only runs if a request slips past it.
    return env.ASSETS.fetch(request);
  },
};
