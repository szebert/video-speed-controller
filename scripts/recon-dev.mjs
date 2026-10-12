#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createReconReceiver } from './recon-receiver.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(root, 'test-results', 'recon');
mkdirSync(dir, { recursive: true });
const logPath = join(dir, `session-${Date.now()}.ndjson`);
writeFileSync(logPath, '', { flag: 'wx' });
const token = randomBytes(24).toString('hex');
const server = createReconReceiver({
  token,
  logPath,
  onEvent(event) {
    if (
      /^(background\.ready|permission\.(request|result)|activation\.|content\.checkpoint)/.test(
        event.event,
      )
    ) {
      console.log(`[recon #${event.sequence}] ${event.event}`);
    }
  },
});
server.on('error', (error) => {
  console.error(`Cannot start local recorder: ${error.message}`);
  process.exitCode = 1;
});
server.listen(4174, '127.0.0.1', () => {
  writeFileSync(
    join(dir, 'latest.json'),
    JSON.stringify({ logPath, statusUrl: 'http://127.0.0.1:4174/status' }, null, 2),
  );
  console.log(`Local diagnostic log: ${logPath}`);
  console.log('Receiver status: http://127.0.0.1:4174/status');
  console.log(`Load unpacked: ${join(root, '.output', 'chrome-mv3-dev')}`);
  const child = spawn(process.execPath, [join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      OSVSC_RECON: '1',
      OSVSC_RECON_ENDPOINT: `http://127.0.0.1:4174/events/${token}`,
    },
  });
  child.on('error', (error) => {
    console.error(`Cannot start WXT: ${error.message}`);
    server.close();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    server.close();
    process.exitCode = code ?? 0;
  });
  const stop = () => {
    child.kill();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
