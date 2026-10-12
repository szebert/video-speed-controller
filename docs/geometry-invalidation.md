# Geometry invalidation

The registry measures the video border box and keeps the existing root portal
and 8px inset. One shared ResizeObserver watches videos. One shared
MutationObserver watches `class`, `style`, and `hidden` on up to six composed
ancestors per video, stopping before body and documentElement. Shared ancestors
have refcounts. Discovery and reparenting update the chain; layout does not walk
ancestors. Subscription changes coalesce in a microtask; attribute bursts do
not rebuild subscriptions. Each invalidation uses the existing coalesced RAF
and returns to idle.

This does not follow transitions or animations, sibling insertion/size changes,
stylesheet edits without a watched attribute mutation, body/root classes, or
slot redistribution without discovery. Stacking and site policies remain
separate work.

## Observer selection

A temporary Chromium 153.0.8010.12 benchmark compared one shared observer with
refcounted per-element observers on 20/50/100 videos, each with six distinct
ancestors. Both used the same attribute filter and RAF coalescing. Each burst
wrote ten class changes per chain. A watch-set change replaced one target per
chain in a batch. Timings below are single-run measurements, not guarantees.
The benchmark alternatives are not production code.

| Videos | Targets | Shared instances | Per-element instances | Shared burst callbacks | Per-element burst callbacks | Shared rebuild ms | Per-element replacement ms |
| ------ | ------- | ---------------- | --------------------- | ---------------------- | --------------------------- | ----------------- | -------------------------- |
| 20     | 120     | 1                | 120                   | 1                      | 20                          | 0.5               | 0.3                        |
| 50     | 300     | 1                | 300                   | 1                      | 50                          | 0.8               | 0.8                        |
| 100    | 600     | 1                | 600                   | 1                      | 100                         | 1.0               | 0.6                        |

For both strategies at every size: unrelated attribute changes delivered zero
callbacks; one relevant change delivered one callback and one RAF, then no
pending frame. Bursts used one RAF and zero subscription rebuilds. A batched
watch-set change rebuilt the shared observer once. Removed targets delivered
zero callbacks. Remove-all and destroy disconnected observations and canceled
pending RAF work. Two videos sharing a parent had one subscription and two
references; its class change delivered one callback. Removing the first video
retained one reference, and removing the second disconnected the subscription.

The shared strategy wins on instance count, callback volume, and implementation
size. Its measured batched rebuild cost is acceptable for these workloads.
Runtime unit tests enforce bounded subscriptions, batching, refcounts, moves
across open shadow roots, and cleanup at these same video counts.

## Browser regression

`e2e/overlay-geometry.spec.ts` uses only the local fixture. A watched player's
class change applies video margins of 120px and 70px without changing video
size or sending pointer, scroll, or window resize signals. Before the runtime
change, its final assertion failed with host offsets `[-112, -62]` instead of
`[8, 8]`: the video moved and the host stayed at its old coordinates.
The acceptance assertion checks the host against the new video border box plus
the inset.

The implemented runtime passes this regression and the existing overlay
placement and fullscreen browser cases using the local extension project.
