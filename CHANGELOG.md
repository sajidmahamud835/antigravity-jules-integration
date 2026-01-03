# Changelog

All notable changes to the "antigravity-jules-integration" extension will be documented in this file.

## [2.0.0] - 2026-01-03

### Fixed
- **Critical Fix:** Resolved `429 RESOURCE_EXHAUSTED` errors caused by aggressive polling of thought signatures.
- **Critical Fix:** Fixed UI unresponsiveness ("New Session" and "Retry" buttons freezing).
- **Bug Fix:** Handled invalid JSON in `config.json` path handling.

### Added
- **Feature:** Lazy Loading for Session Logs. Thought signatures are now fetched only when a session card is expanded.
- **Feature:** Exponential Backoff & Retry Logic. API calls now automatically retry with jitter on `429` and `503` errors.
- **UI:** Added loading spinners and visual feedback for on-demand data fetching.
- **UI:** New sessions appear instantly in the list without waiting for a full refresh.

### Changed
- **Optimization:** Refactored `getActiveSessions` to only fetch session metadata, significantly reducing API quota usage.
- **Optimization:** Improved message handling between Webview and Extension backend.
