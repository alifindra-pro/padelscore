import { EventEmitter } from "events";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
type Payload = Record<string, unknown>;
class MatchEventBus extends EventEmitter {
  private static instance: MatchEventBus;
  private origin = randomUUID();
  private publisher: {
    publish: (channel: string, message: string) => Promise<unknown>;
  } | null = null;
  private starting: Promise<void> | null = null;
  private constructor() {
    super();
    this.setMaxListeners(1000);
  }
  static getInstance() {
    return (this.instance ??= new MatchEventBus());
  }
  private async connect() {
    if (!process.env.REDIS_URL) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const pub = createClient({ url: process.env.REDIS_URL });
      const sub = pub.duplicate();
      pub.on("error", () =>
        console.error("Redis penerbit skor tidak terhubung"),
      );
      sub.on("error", () =>
        console.error("Redis pelanggan skor tidak terhubung"),
      );
      await Promise.all([pub.connect(), sub.connect()]);
      this.publisher = pub;
      await sub.subscribe("padel:matches:v2", (raw) => {
        try {
          const message = JSON.parse(raw);
          if (message.origin !== this.origin)
            this.deliver(message.id, message.payload);
        } catch {
          console.error("Pesan skor Redis tidak valid");
        }
      });
    })().catch(() => {
      this.starting = null;
      console.error("Distribusi skor lintas server belum tersedia");
    });
    return this.starting;
  }
  private deliver(id: string, payload: Payload) {
    this.emit(`match:${id}`, payload);
    if (payload.tournamentId)
      this.emit(`tournament:${payload.tournamentId}`, payload);
  }
  publishMatchUpdate(id: string, payload: Payload) {
    this.deliver(id, payload);
    void this.connect()
      .then(() =>
        this.publisher?.publish(
          "padel:matches:v2",
          JSON.stringify({ origin: this.origin, id, payload }),
        ),
      )
      .catch(() => console.error("Gagal mengirim skor lintas server"));
  }
  subscribeToMatch(id: string, listener: (payload: Payload) => void) {
    void this.connect();
    const event = `match:${id}`;
    this.on(event, listener);
    return () => {
      this.off(event, listener);
    };
  }
  subscribeToTournament(id: string, listener: (payload: Payload) => void) {
    void this.connect();
    const event = `tournament:${id}`;
    this.on(event, listener);
    return () => {
      this.off(event, listener);
    };
  }
}
export const matchEventBus = MatchEventBus.getInstance();
