import { boundedInteger } from "./bounds.js";

const DEFAULT_RETENTION = 256;
const DEFAULT_CLIENT_LIMIT = 32;
const DEFAULT_EVENT_BYTES = 256 * 1024;
const DEFAULT_CLIENT_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_BACKPRESSURE_MS = 10_000;
const DEFAULT_HEARTBEAT_MS = 15_000;

export class EventBroker {
  constructor({
    retention = DEFAULT_RETENTION,
    clientLimit = DEFAULT_CLIENT_LIMIT,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    eventByteLimit = DEFAULT_EVENT_BYTES,
    clientBufferBytes = DEFAULT_CLIENT_BUFFER_BYTES,
    backpressureTimeoutMs = DEFAULT_BACKPRESSURE_MS,
  } = {}) {
    this.retention = boundedInteger(retention, DEFAULT_RETENTION, 1, 4_096);
    this.clientLimit = boundedInteger(clientLimit, DEFAULT_CLIENT_LIMIT, 1, 256);
    this.eventByteLimit = boundedInteger(eventByteLimit, DEFAULT_EVENT_BYTES, 1024, 4 * 1024 * 1024);
    this.clientBufferLimit = Math.max(
      this.eventByteLimit,
      boundedInteger(clientBufferBytes, DEFAULT_CLIENT_BUFFER_BYTES, 1024, 8 * 1024 * 1024),
    );
    this.backpressureTimeoutMs = boundedInteger(backpressureTimeoutMs, DEFAULT_BACKPRESSURE_MS, 100, 120_000);
    this.events = [];
    this.clients = new Set();
    this.nextId = 1;
    this.closed = false;
    this.heartbeat = setInterval(() => this.#heartbeat(), boundedInteger(heartbeatMs, DEFAULT_HEARTBEAT_MS, 250, 300_000));
    this.heartbeat.unref?.();
  }

  publish(type, payload, createdAt = new Date().toISOString()) {
    if (this.closed) return null;
    const event = { id: this.nextId++, type, createdAt, payload };
    let encoded = encodeEvent(event);
    if (Buffer.byteLength(encoded) > this.eventByteLimit) {
      event.type = "bridge.error";
      event.payload = { message: "An update exceeded the bounded event size and was omitted." };
      encoded = encodeEvent(event);
    }
    this.events.push(event);
    if (this.events.length > this.retention) this.events.splice(0, this.events.length - this.retention);
    for (const client of [...this.clients]) this.#write(client, encoded);
    return event;
  }

  hasCapacity() {
    return !this.closed && this.clients.size < this.clientLimit;
  }

  connect(response, { lastEventId = null, snapshot = null } = {}) {
    if (this.closed) throw new Error("Event broker is closed");
    if (this.clients.size >= this.clientLimit) return false;
    const client = { response, closed: false, pendingBytes: 0, stallTimer: null };
    this.clients.add(client);

    const parsedLastId = Number.parseInt(String(lastEventId ?? ""), 10);
    if (Number.isFinite(parsedLastId) && parsedLastId >= 0) {
      const oldest = this.events[0]?.id ?? this.nextId;
      const newest = this.nextId - 1;
      if (parsedLastId < oldest - 1 || parsedLastId > newest) {
        this.#write(client, encodeEvent({
          id: this.nextId - 1,
          type: "stream.reset",
          createdAt: new Date().toISOString(),
          payload: snapshot,
        }));
      } else {
        this.#write(client, encodeEvent({
          id: parsedLastId,
          type: "fleet.snapshot",
          createdAt: new Date().toISOString(),
          payload: snapshot,
        }));
        for (const event of this.events) {
          if (event.id > parsedLastId && !this.#write(client, encodeEvent(event))) break;
        }
      }
    } else {
      this.#write(client, encodeEvent({
        id: this.nextId - 1,
        type: "fleet.snapshot",
        createdAt: new Date().toISOString(),
        payload: snapshot,
      }));
    }

    const remove = () => this.disconnect(client);
    response.once("close", remove);
    response.once("error", remove);
    return true;
  }

  disconnect(client) {
    if (!client || client.closed) return;
    client.closed = true;
    this.#clearStallTimer(client);
    this.clients.delete(client);
  }

  snapshotStats() {
    return {
      retained: this.events.length,
      retentionLimit: this.retention,
      clients: this.clients.size,
      clientLimit: this.clientLimit,
      lastEventId: this.nextId - 1,
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    for (const client of [...this.clients]) this.#drop(client);
    this.clients.clear();
  }

  #heartbeat() {
    if (this.closed) return;
    for (const client of [...this.clients]) this.#write(client, ": keepalive\n\n");
  }

  #write(client, encoded) {
    if (client.closed || client.response.destroyed || client.response.writableEnded) {
      this.disconnect(client);
      return false;
    }
    const bytes = Buffer.byteLength(encoded);
    if (client.pendingBytes + bytes > this.clientBufferLimit) {
      this.#drop(client);
      return false;
    }
    try {
      client.pendingBytes += bytes;
      const flushed = client.response.write(encoded, () => {
        client.pendingBytes = Math.max(0, client.pendingBytes - bytes);
        if (client.pendingBytes === 0) this.#clearStallTimer(client);
      });
      if (!flushed && client.pendingBytes > 0) this.#armStallTimer(client);
      return true;
    } catch {
      this.disconnect(client);
      return false;
    }
  }

  #armStallTimer(client) {
    if (client.stallTimer) return;
    client.stallTimer = setTimeout(() => {
      client.stallTimer = null;
      if (client.pendingBytes > 0) this.#drop(client);
    }, this.backpressureTimeoutMs);
    client.stallTimer.unref?.();
  }

  #clearStallTimer(client) {
    if (!client.stallTimer) return;
    clearTimeout(client.stallTimer);
    client.stallTimer = null;
  }

  #drop(client) {
    this.disconnect(client);
    try { client.response.end(); } catch {}
  }
}

function encodeEvent(event) {
  const id = Number.isFinite(event.id) && event.id >= 0 ? `id: ${event.id}\n` : "";
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}
