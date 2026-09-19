// SPDX-License-Identifier: GPL-3.0-only

const ACT_WARNING = 'not wrapped in act';

function messageFromArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return arg.message;
      }
      return String(arg);
    })
    .join(' ');
}

function wrapConsole(method: 'error' | 'warn'): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    original(...args);
    if (messageFromArgs(args).includes(ACT_WARNING)) {
      throw new Error(`React ${ACT_WARNING}(...)`);
    }
  };
}

wrapConsole('error');
wrapConsole('warn');
