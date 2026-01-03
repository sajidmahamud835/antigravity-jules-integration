# Troubleshooting Guide

Common issues and how to resolve them.

## 1. "Failed to apply remote branch: Diff not available"

**Symptom**: You click "Apply Changes" immediately after a task completes, but get an error.
**Cause**: The Jules backend takes a few moments to generate the git diff after marking the session as `completed`.
**Fix**: Wait 10-15 seconds after the session turns green (✅) before clicking Apply.
*Tracking Issue: #4*

## 2. "Resource Exhausted (429)"

**Symptom**: You see 429 errors in the developer console.
**Cause**: You have exceeded the API quota (100 requests/minute).
**Fix**:
*   The extension v2.0.0+ automatically handles this with backoff.
*   If persistent, reduce the number of active sessions or wait a few minutes.

## 3. Session Status "Running" after Cancel

**Symptom**: You cancelled a session, but the UI still shows it potentially running.
**Cause**: UI synchronization delay.
**Fix**: Click the "Refresh" (↻) button in the panel header to force a sync.
*Tracking Issue: #5*

## 4. Extension not connecting

**Symptom**: The panel stays loading or completely blank.
**Fix**:
*   Check your API Key in `config.json`.
*   Ensure the MCP server path in `config.json` points to the correct location (see `README.md`).
