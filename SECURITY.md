# Security

Report suspected vulnerabilities privately by opening a GitHub security advisory on [szebert/video-speed-controller](https://github.com/szebert/video-speed-controller), or by contacting the maintainer through GitHub.

Please do not file a public issue for unreleased security problems.

## Scope

This extension:

- Requests host access only after an explicit popup gesture
- Injects only into granted http(s) frames
- Does not execute remote code
- Does not open network connections from the extension

## Supported versions

Security fixes land on the current development branch and the latest tagged release.
