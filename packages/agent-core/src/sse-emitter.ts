import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export interface SSEEvent {
  type: string;
  agentId: string;
  payload: Record<string, unknown>;
}

export interface RunEventWriter {
  write(event: { runId: string; offsetMs: number; type: string; agentId: string; payload: unknown }): Promise<void>;
}

export class SSEHub {
  private clients = new Set<ServerResponse>();
  public runId: string;
  private runStart: number;
  private dbWriter?: RunEventWriter;

  constructor(opts?: { runId?: string; dbWriter?: RunEventWriter }) {
    this.runId = opts?.runId ?? randomUUID();
    this.runStart = Date.now();
    this.dbWriter = opts?.dbWriter;
  }

  /** Reset for a new run while keeping all connected SSE clients */
  newRun(runId?: string): void {
    this.runId = runId ?? randomUUID();
    this.runStart = Date.now();
  }

  addClient(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  removeClient(res: ServerResponse): void {
    this.clients.delete(res);
  }

  emit(event: SSEEvent): void {
    const offsetMs = Date.now() - this.runStart;
    const data = JSON.stringify({ ...event, runId: this.runId, offsetMs });
    const msg = `event: ${event.type}\ndata: ${data}\n\n`;

    for (const client of this.clients) {
      client.write(msg);
    }

    if (this.dbWriter) {
      this.dbWriter.write({
        runId: this.runId,
        offsetMs,
        type: event.type,
        agentId: event.agentId,
        payload: event.payload,
      }).catch(() => {});
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
