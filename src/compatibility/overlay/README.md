# Overlay policies

Each site module declares exact hostnames, host-wide navigation events, and a
mount resolver. `registry.ts` indexes the modules by hostname once. The shared
entry point in `src/core/site-overlay-policy.ts` parses and validates the page
URL, looks up that hostname, and returns the first applicable mount. No matching
policy or mount means the generic portal.

Policies only identify a player mount and stacking level. The shared runtime
owns measurement, placement validation, fullscreen, event guards, observers, and
cleanup. Resolvers do not mount elements, install listeners, or schedule work.

To add a verified exception:

1. Record the failure and successful candidate with the operator using
   [`recon:dev`](../../../docs/compatibility-recording.md), and document the
   evidence in [`compatibility-recon.md`](../../../docs/compatibility-recon.md).
2. Add a module implementing `SiteOverlayPolicy` with narrow host and player
   boundaries. Reuse the shared placement code.
3. Import and register it in `registry.ts`. Registration order determines
   precedence if multiple policies share a hostname.
4. Add site-specific tests under `src/tests/overlay-policies/`, including layouts
   and hosts that must stay generic.

Navigation events apply to the whole host, even when the current route has no
mount. For example, YouTube must listen on Shorts and the home page so navigation
to `/watch` can activate the watch-page mount. The media registry owns these
subscriptions and the generic `popstate` listener.
