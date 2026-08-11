/**
 * RoomIndex — a single Durable Object that records when each room was last
 * used, so rooms untouched for 30 days can be cleaned up.
 *
 * It is deliberately write-only from the outside: there is no endpoint that
 * lists rooms. A public list would let anyone enumerate live rooms and join
 * (or reset) a group's timer, so "your rooms" is kept per-browser instead.
 *
 * The pruning alarm lives here rather than in TimerRoom because a Durable
 * Object has only one alarm, and TimerRoom's is already spoken for by the
 * countdown.
 */

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL = 24 * 60 * 60 * 1000;
const ROOM_ID_RE = /^[a-z0-9-]{3,48}$/;
const PRUNE_BATCH = 500;

export class RoomIndex {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/touch" && request.method === "POST") {
      const { id, at } = await request.json();
      if (typeof id === "string" && ROOM_ID_RE.test(id)) {
        await this.ctx.storage.put(`room:${id}`, typeof at === "number" ? at : Date.now());
        if ((await this.ctx.storage.getAlarm()) === null) {
          await this.ctx.storage.setAlarm(Date.now() + PRUNE_INTERVAL);
        }
      }
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }

  /** Daily sweep: wipe rooms whose last use is over 30 days old. */
  async alarm() {
    const cutoff = Date.now() - THIRTY_DAYS;
    const entries = await this.ctx.storage.list({ prefix: "room:", limit: PRUNE_BATCH });

    let remaining = 0;
    for (const [key, lastSeen] of entries) {
      if (typeof lastSeen === "number" && lastSeen >= cutoff) {
        remaining++;
        continue;
      }
      const id = key.slice("room:".length);
      try {
        const stub = this.env.ROOM.get(this.env.ROOM.idFromName(id));
        await stub.fetch("https://room/expire", { method: "POST" });
      } catch {
        // If the room can't be reached, drop the index entry anyway; a room
        // nobody has opened in 30 days holds nothing worth retrying for.
      }
      await this.ctx.storage.delete(key);
    }

    // A full batch may mean more to sweep — come back sooner.
    const next = entries.size >= PRUNE_BATCH ? 60_000 : PRUNE_INTERVAL;
    await this.ctx.storage.setAlarm(Date.now() + next);
    return remaining;
  }
}
