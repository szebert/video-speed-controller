// SPDX-License-Identifier: GPL-3.0-only

export type OriginIdentity = {
  scheme: 'http' | 'https';
  hostname: string;
  effectivePort: number;
};

export type HostPattern = string;

export function isOpaqueOrigin(origin: string): boolean {
  return origin === 'null' || origin === '';
}

export function getOriginIdentity(pageUrl: string): OriginIdentity | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const scheme = url.protocol === 'https:' ? 'https' : 'http';
  const effectivePort = url.port ? Number(url.port) : scheme === 'https' ? 443 : 80;
  if (!Number.isFinite(effectivePort)) {
    return null;
  }
  return {
    scheme,
    hostname: url.hostname.toLowerCase(),
    effectivePort,
  };
}

export function getOriginPattern(pageUrl: string): HostPattern | null {
  const identity = getOriginIdentity(pageUrl);
  if (!identity) {
    return null;
  }
  return `${identity.scheme}://${identity.hostname}:${identity.effectivePort}/*`;
}

export function isHttpHttpsHostPattern(pattern: string): boolean {
  if (pattern === '<all_urls>') {
    return true;
  }
  return /^(https?|\*):\/\//i.test(pattern);
}

export function selectHttpHttpsHostPatterns(origins: readonly string[]): HostPattern[] {
  const unique = new Set<HostPattern>();
  for (const origin of origins) {
    if (isHttpHttpsHostPattern(origin)) {
      unique.add(origin);
    }
  }
  return [...unique].sort();
}

type ParsedHost =
  { kind: 'all' } | { kind: 'domain'; hostname: string; includeSubdomains: boolean };

type ParsedPattern = {
  scheme: 'http' | 'https' | '*';
  host: ParsedHost;
  port: number | 'scheme-default';
};

function defaultPort(scheme: 'http' | 'https'): number {
  return scheme === 'https' ? 443 : 80;
}

export function parseHostPattern(pattern: HostPattern): ParsedPattern | null {
  if (pattern === '<all_urls>') {
    return { scheme: '*', host: { kind: 'all' }, port: 'scheme-default' };
  }

  const match = /^(?<scheme>\*|https?):\/\/(?<rest>.+)$/i.exec(pattern);
  const schemeRaw = match?.groups?.scheme?.toLowerCase();
  const rest = match?.groups?.rest;
  if (!schemeRaw || !rest) {
    return null;
  }

  const scheme = schemeRaw === '*' ? '*' : schemeRaw === 'https' ? 'https' : 'http';
  const slash = rest.indexOf('/');
  if (slash < 0) {
    return null;
  }
  const hostPort = rest.slice(0, slash);
  if (!hostPort) {
    return null;
  }

  let hostToken = hostPort;
  let port: number | 'scheme-default' = 'scheme-default';
  const lastColon = hostPort.lastIndexOf(':');
  if (lastColon > 0 && !hostPort.includes(']')) {
    const maybePort = hostPort.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) {
      hostToken = hostPort.slice(0, lastColon);
      port = Number(maybePort);
    }
  }

  let host: ParsedHost;
  if (hostToken === '*') {
    host = { kind: 'all' };
  } else if (hostToken.startsWith('*.')) {
    const hostname = hostToken.slice(2).toLowerCase();
    if (!hostname) {
      return null;
    }
    host = { kind: 'domain', hostname, includeSubdomains: true };
  } else {
    host = { kind: 'domain', hostname: hostToken.toLowerCase(), includeSubdomains: false };
  }

  return { scheme, host, port };
}

function schemeMatches(identity: OriginIdentity, patternScheme: ParsedPattern['scheme']): boolean {
  return patternScheme === '*' || patternScheme === identity.scheme;
}

function hostMatches(identity: OriginIdentity, host: ParsedHost): boolean {
  if (host.kind === 'all') {
    return true;
  }
  if (identity.hostname === host.hostname) {
    return true;
  }
  if (host.includeSubdomains && identity.hostname.endsWith(`.${host.hostname}`)) {
    return true;
  }
  return false;
}

function portMatches(identity: OriginIdentity, parsed: ParsedPattern): boolean {
  if (parsed.port === 'scheme-default') {
    if (parsed.scheme === '*') {
      return identity.effectivePort === defaultPort(identity.scheme);
    }
    return identity.effectivePort === defaultPort(parsed.scheme);
  }
  return identity.effectivePort === parsed.port;
}

export function hostPatternCovers(identity: OriginIdentity, pattern: HostPattern): boolean {
  const parsed = parseHostPattern(pattern);
  if (!parsed) {
    return false;
  }
  return (
    schemeMatches(identity, parsed.scheme) &&
    hostMatches(identity, parsed.host) &&
    portMatches(identity, parsed)
  );
}

export function hostPatternsCover(
  identity: OriginIdentity,
  patterns: readonly HostPattern[],
): boolean {
  return patterns.some((pattern) => hostPatternCovers(identity, pattern));
}

export function requestExactOriginAccess(pageUrl: string): Promise<boolean> {
  const pattern = getOriginPattern(pageUrl);
  if (!pattern) {
    return Promise.resolve(false);
  }
  return chrome.permissions.request({ origins: [pattern] });
}

export function removeExactOriginAccess(pageUrl: string): Promise<boolean> {
  const pattern = getOriginPattern(pageUrl);
  if (!pattern) {
    return Promise.resolve(false);
  }
  return chrome.permissions.remove({ origins: [pattern] });
}

export function containsExactOriginAccess(pageUrl: string): Promise<boolean> {
  const pattern = getOriginPattern(pageUrl);
  if (!pattern) {
    return Promise.resolve(false);
  }
  return chrome.permissions.contains({ origins: [pattern] });
}

export async function disableExactOriginAccess(
  pageUrl: string,
): Promise<{ disabled: boolean; broaderGrant: boolean }> {
  await removeExactOriginAccess(pageUrl);
  const stillGranted = await containsExactOriginAccess(pageUrl);
  return {
    disabled: !stillGranted,
    broaderGrant: stillGranted,
  };
}
