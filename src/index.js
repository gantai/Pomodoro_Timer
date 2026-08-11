import { TimerRoom } from "./room.js";
import { RoomIndex } from "./roomIndex.js";

export { TimerRoom, RoomIndex };

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
      // The room needs its own name to register itself in the index; a
      // Durable Object cannot read the name it was looked up by.
      const forwarded = new Request(request);
      forwarded.headers.set("X-Room-Id", roomId);
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(forwarded);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    // Everything else is a static asset. The assets config handles the SPA
    // fallback for /r/<room>; this only runs if a request slips past it.
    return env.ASSETS.fetch(request);
  },
};
