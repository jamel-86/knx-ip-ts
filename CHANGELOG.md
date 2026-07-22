# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0/).

## [Unreleased]

### Security

- **KNX/IP Secure anti-replay:** inbound `SECURE_WRAPPER` frames are now rejected
  unless their session sequence counter advances, so a captured frame cannot be
  replayed onto the bus.
- **Constant-time MAC verification:** the `SESSION_RESPONSE` and `SECURE_WRAPPER`
  authentication tags are compared with a length-guarded constant-time equality
  (`constantTimeEquals`) instead of a short-circuiting byte compare.

### Fixed

- **`SerialQueue`:** a rejected queued task no longer leaks an unhandled promise
  rejection — the previous `next.finally(...)` spawned an orphan promise that
  rejected with no handler and aborted the process under default Node, even when
  the caller had already caught its own promise.
- **`ConnectResponse`:** the HPAI + CRD are now parsed even when the response
  carries a non-zero status code, instead of being discarded.
- **DPT 16 (character string):** fixed silent ASCII truncation/corruption on
  encode.
- **`SessionAuthenticate`:** throws the correct error class on malformed input.

### Changed

- Internal correctness and robustness pass across the core, DPT, ETS, secure,
  and I/O layers, with regression tests added for each of the fixes above.

## [0.1.0]

- Initial release: KNX/IP UDP tunnelling (heartbeat, send mutex, auto-reconnect),
  KNX IP Secure tunnelling over TCP, gateway discovery, DPT codecs for the common
  types, and ETS `.knxproj` parsing (including password-protected projects).
