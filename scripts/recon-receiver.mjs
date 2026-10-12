// SPDX-License-Identifier: GPL-3.0-only

import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

/** Local, append-only recorder. No browser commands or arbitrary file paths. */
export function createReconReceiver({ token, logPath, onEvent = () => {} }) {
  let count = 0;
  let bytes = 0;
  let last = null;
  const server = createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(value));
    };
    const address = server.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.headers.host !== `127.0.0.1:${address.port}`
    ) {
      reply(403, { error: 'Invalid host' });
      return;
    }
    if (request.method === 'GET' && request.url === '/status') {
      reply(200, { count, bytes, last, logPath });
      return;
    }
    if (request.method !== 'POST' || request.url !== `/events/${token}`) {
      reply(404, { error: 'Unknown endpoint' });
      return;
    }
    // Web pages cannot read the token or use this as a CORS endpoint.
    if (request.headers.origin) {
      let extensionOrigin = false;
      try {
        const origin = new URL(request.headers.origin);
        extensionOrigin =
          origin.protocol === 'chrome-extension:' && !!origin.hostname && origin.pathname === '';
      } catch {
        /* Reject invalid origins. */
      }
      if (!extensionOrigin) {
        reply(403, { error: 'Extension events only' });
        return;
      }
    }
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 512 * 1024) {
          reply(413, { error: 'Event too large' });
          return;
        }
        chunks.push(chunk);
      }
      const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        !event ||
        typeof event !== 'object' ||
        typeof event.event !== 'string' ||
        !event.event ||
        event.event.length > 100 ||
        !('data' in event)
      ) {
        reply(400, { error: 'Invalid event' });
        return;
      }
      const record = { ...event, sequence: count + 1, savedAt: new Date().toISOString() };
      const line = `${JSON.stringify(record)}\n`;
      const size = Buffer.byteLength(line);
      if (bytes + size > 25 * 1024 * 1024) {
        reply(507, { error: 'Session reached 25 MiB; restart recon:dev for a fresh log' });
        return;
      }
      appendFileSync(logPath, line, 'utf8');
      count++;
      bytes += size;
      last = { sequence: count, event: event.event, at: record.savedAt };
      reply(200, { ok: true, sequence: count });
      onEvent(record);
    } catch (error) {
      reply(error instanceof SyntaxError ? 400 : 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return server;
}
