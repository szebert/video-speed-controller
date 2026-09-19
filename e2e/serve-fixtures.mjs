#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, startText, endText] = match;
  if (startText === '' && endText === '') {
    return null;
  }
  if (startText === '') {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return null;
    }
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = Number(startText);
  const end = endText === '' ? size - 1 : Number(endText);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendFile(response, file, type, rangeHeader) {
  const { size } = statSync(file);
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, size);
    if (!range) {
      response.writeHead(416, {
        'content-range': `bytes */${size}`,
        'accept-ranges': 'bytes',
      });
      response.end();
      return;
    }
    const length = range.end - range.start + 1;
    response.writeHead(206, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
      'content-length': String(length),
    });
    createReadStream(file, { start: range.start, end: range.end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    'content-type': type,
    'accept-ranges': 'bytes',
    'content-length': String(size),
  });
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const relative = normalize(url.pathname).replace(/^\/+/, '') || 'multi-video.html';
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  sendFile(
    response,
    file,
    types[extname(file)] ?? 'application/octet-stream',
    request.headers.range,
  );
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Fixture server on http://127.0.0.1:4173');
});
