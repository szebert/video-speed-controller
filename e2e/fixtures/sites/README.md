# Compatibility catalog

This is a reconnaissance inventory, not a list of verified supported sites.
Content scripts do not import it. Auth, region, stability, and notes describe the
intended playback fixture; verify them when identifying an actual fixture.
All initial entries use the generic runtime and have no completed checks.

`policy` records the active implementation. `checks.builtinPolicyRequired`
records a verified need, including a fix still pending:

| Active policy | Required | Meaning                                |
| ------------- | -------- | -------------------------------------- |
| `generic`     | `false`  | No verified need for a built-in policy |
| `generic`     | `true`   | Verified need; implementation pending  |
| `builtin`     | `true`   | Built-in policy implemented            |
| `builtin`     | `false`  | Invalid                                |

`fixtureIdentified` means a representative fixture has been selected;
`externalSmoke` means the external browser check has run; `genericEvaluated`
means generic behavior was assessed. None of these checks implies a policy.
Classify failures as media, anchor, stacking, lifecycle, fullscreen, or
presentation before proposing a policy field. A catalog row does not justify
adding site-specific runtime code.

Synthetic unit tests validate this file and the legal policy states on every
commit. Default extension Playwright tests use the local fixture server only.
Public external smoke tests will run outside default `pnpm e2e` and PR CI.
Authenticated smoke tests will use gitignored Playwright `storageState` files.
Add external projects, session files, and their gitignore entries only when the
first real smoke test exists. No credentials or live sites are needed by
`pnpm test` or default `pnpm e2e`.
