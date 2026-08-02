const DEFAULT_RETENTION = 256;
const DEFAULT_CLIENT_LIMIT = 32;
const DEFAULT_EVENT_BYTES = 256 * 1024;

export class EventBroker {
  constructor({ retention = DEFAULT_RETENTION, clientLimit = DEFAULT_CLIENT_LIMIT, heartbeatMs = 15_000, eventByteLimit = DEFAULT_EVENT_BYTES } = {}) {
    this.retention = positiveInteger(retention, DEFAULT_RETENTION);
    this.clientLimit = positiveInteger(clientLimit, DEFAULT_CLIENT_LIMIT);
    this.eventByteLimit = positiveInteger(eventByteLimit, DEFAULT_EVENT_BYTES);
    this.events = [];
    this.clients = new Set();
    this.nextId = 1;
    this.closed = false;
    this.heartbeat = setInterval(() => this.#heartbeat(), positiveInteger(heartbeatMs, 15_000));
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

  connect(response, { lastEventId = null, snapshot = null } = {}) {
    if (this.closed) throw new Error("Event broker is closed");
    if (this.clients.size >= this.clientLimit) return false;
    const client = { response, closed: false };
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
    this.clients.delete(client);
  }

  replayAfter(lastEventId) {
    const id = Number.parseInt(String(lastEventId), 10);
    if (!Number.isFinite(id)) return [];
    return this.events.filter((event) => event.id > id);
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
    for (const client of [...this.clients]) {
      client.closed = true;
      try { client.response.end(); } catch {}
    }
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
    try {
      const writable = client.response.write(encoded);
      if (!writable) {
        this.disconnect(client);
        client.response.end();
        return false;
      }
      return true;
    } catch {
      this.disconnect(client);
      return false;
    }
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function encodeEvent(event) {
  const id = Number.isFinite(event.id) && event.id >= 0 ? `id: ${event.id}\n` : "";
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}
