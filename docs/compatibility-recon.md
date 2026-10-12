# Compatibility reconnaissance

Date: 2026-10-11 (America/Los_Angeles).
Runtime: commit `91d027e`, unchanged during this pass.
Browser: Chromium 153.0.8010.12, fresh anonymous context, 1280 × 900 viewport.

This pass identified public URLs and attempted extension activation. It did
**not** complete the generic-runtime checklist. YouTube and Twitch evaluations
remain pending; Max was skipped. These access observations do not establish
compatibility success or justify a site policy.

The ordinary WXT development server was started through its `createServer`
entry point, with automatic browser opening disabled, and the unpacked
`.output/chrome-mv3-dev` extension was loaded into an exploratory browser
session. The popup's visible enable control was clicked for each site.
The Playwright E2E build, manifest permissions, runtime, and default test
projects were not changed. This was an ad hoc access probe, not an automated
external smoke test or a completed manual compatibility pass.

## Observed access

| Site    | URL                                           | Observation                                                                                                                                                             | Checklist status                                   |
| ------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| YouTube | <https://www.youtube.com/watch?v=aqz-KE-bpKQ> | Watch page and video element loaded; player displayed “Something went wrong. Refresh or try again later.” Site access remained ungranted and no OSVSC overlay appeared. | Pending: playback and extension activation blocked |
| Twitch  | <https://www.twitch.tv/caseoh_>               | Public live playback reached `readyState: 4`, `paused: false`, and advancing `currentTime`. Site access remained ungranted and no OSVSC overlay appeared.               | Pending: extension activation blocked              |
| Max     | No title opened                               | No existing authenticated, entitled browser session was available to this run.                                                                                          | Skipped                                            |

Initial sandbox navigation to both public sites failed with
`net::ERR_NETWORK_CHANGED`. An access probe outside the sandbox loaded both
pages with HTTP 200. The development browser also encountered this error on
its first YouTube navigation; a retry loaded the watch page. The YouTube
player error was then observed independently of extension activation, with
`readyState: 0` and `currentTime: 0`.

After clicking the popup enable control, and again in a later observation,
`chrome.permissions.contains` returned false for both
`https://www.youtube.com/*` and `https://www.twitch.tv/*`. The popup remained
disabled, and both pages contained zero `osvsc-overlay` hosts. The reason the
grant did not complete was not established. This is an activation blocker in
the available browser session, not evidence of a site-specific overlay failure.

An earlier probe of <https://www.twitch.tv/monstercat> found the channel offline;
it was not selected as the live fixture. No Max login, entitlement, cookies,
or account details were inspected or saved.

## Compatibility evidence still required

| Check                                                                       | YouTube | Twitch                                  | Max     |
| --------------------------------------------------------------------------- | ------- | --------------------------------------- | ------- |
| Overlay on the playing video                                                | Pending | Pending                                 | Skipped |
| Overlay survives in-page navigation to a second video                       | Pending | Not required by the chosen Twitch scope | Skipped |
| Speed and seek or volume affect the intended video                          | Pending | Pending                                 | Skipped |
| Overlay follows a layout change without video resizing                      | Pending | Pending                                 | Skipped |
| Fullscreen entry and exit restore the correct surface                       | Pending | Pending                                 | Skipped |
| Page/player chrome covers the overlay, including after scroll               | Pending | Pending                                 | Skipped |
| Overlay covers chrome that should remain accessible, including after scroll | Pending | Pending                                 | Skipped |
| Actual and intended visual priority recorded for each overlap               | Pending | Pending                                 | Skipped |
| Actual and intended pointer-event priority recorded separately              | Pending | Pending                                 | Skipped |

No overlap was evaluated with an active extension overlay. Do not interpret an
untested row as a pass. Once activation is available, classify each reproduced
finding as media, anchor, stacking, lifecycle, fullscreen, or presentation;
record its URL, trigger, observed behavior, intended behavior, and reproducibility.

For stacking, record both directions of overlap and distinguish the visual
winner from the element that receives the pointer. For geometry, record whether
the video actually moved without resizing and which DOM or layout signal
preceded the move. Transitions, sibling changes, body/root attributes, or
video-element attributes may explain a miss; a documented generic limitation
does not dismiss a reproducible, product-relevant incompatibility.

## Catalog bookkeeping

Only YouTube and Twitch have `fixtureIdentified: true`, based on the specific
URLs actually visited above. For both, `genericEvaluated` remains false because
the checklist was not completed. `externalSmoke` remains false because no
automated external browser smoke test was run. `builtinPolicyRequired` remains
false because no product-relevant site-specific incompatibility was reproduced;
this does not establish that a policy is unnecessary. Their active `policy`
stays `generic`.

Max and all other entries retain their previous checks. No other site's
compatibility was evaluated.

## Resume conditions

Continue YouTube and Twitch in a browser session where the popup can complete
each site's permission grant and the generic runtime is active. YouTube also
needs playable media; retain this URL if playback succeeds, or record the
replacement public watch URL. Test Max only if an authenticated, entitled
session is already available.

No decision about a site-policy interface follows from this partial pass.
Review actual structural failures before starting a policy field or the
presentation contract. Overlay mounting, z-order, geometry, Custom CSS, and
advanced overrides remain unchanged. The local geometry lifecycle control was
not rerun because no real-site ancestor-class regression was demonstrated.
