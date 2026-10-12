// @vitest-environment node
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { createReconReceiver } from './recon-receiver.mjs';

describe('local diagnostic receiver', () => {
  let server, dir, logPath, origin;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'osvsc-recon-test-'));
    logPath = join(dir, 'events.ndjson');
    server = createReconReceiver({ token: 'test-token', logPath });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.close();
    await once(server, 'close');
    try {
      unlinkSync(logPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    rmdirSync(dir);
  });
  const post = (url, data, headers = {}) =>
    fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });

  it('saves concurrent events as complete, ordered lines before acknowledging', async () => {
    const results = await Promise.all(
      [1, 2].map((n) =>
        post(`${origin}/events/test-token`, { event: 'content.checkpoint', data: { n } }),
      ),
    );
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);
    expect(lines.map((line) => line.sequence)).toEqual([1, 2]);
    expect(lines.map((line) => line.data.n).sort()).toEqual([1, 2]);
    const status = await (await fetch(`${origin}/status`)).json();
    expect(status.count).toBe(2);
    expect(status.last.event).toBe('content.checkpoint');
  });

  it('rejects wrong tokens, web origins, invalid hosts, and malformed events', async () => {
    const data = { event: 'test', data: {} };
    expect((await post(`${origin}/events/wrong-token`, data)).status).toBe(404);
    expect(
      (await post(`${origin}/events/test-token`, data, { Origin: 'https://youtube.com' })).status,
    ).toBe(403);
    const invalidHostStatus = await new Promise((resolve, reject) => {
      const invalid = request(
        `${origin}/events/test-token`,
        { method: 'POST', headers: { Host: 'attacker.example' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      invalid.on('error', reject);
      invalid.end(JSON.stringify(data));
    });
    expect(invalidHostStatus).toBe(403);
    expect((await post(`${origin}/events/test-token`, {})).status).toBe(400);
    expect(
      (await post(`${origin}/events/test-token`, data, { Origin: 'chrome-extension://abc' }))
        .status,
    ).toBe(200);
    expect((await (await fetch(`${origin}/status`)).json()).count).toBe(1);
  });

  it('reports a failed disk write without acknowledging a saved event', async () => {
    server.close();
    await once(server, 'close');
    server = createReconReceiver({
      token: 'test-token',
      logPath: join(dir, 'missing', 'events.ndjson'),
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await post(`http://127.0.0.1:${server.address().port}/events/test-token`, {
      event: 'test',
      data: {},
    });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('ENOENT');
  });
});
