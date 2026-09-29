'use strict';
const fs = require('node:fs');

// Resumable, stall-aware download for large installers. A slow connection is
// fine; a silent one is not. There is deliberately no total time limit: a
// 1.5 GB download on a 3 Mbps line takes over an hour and must still finish.
// Instead, a transfer that delivers no bytes for `stallMs` is aborted and
// resumed from the partial file with an HTTP Range request.
class DownloadError extends Error {
  constructor(message, reason) { super(message); this.reason = reason; }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const backoff = attempt => Math.min(30000, 2000 * 2 ** (attempt - 1));
// Aborts `signal` once `alive()` has not been called for `ms`. A single
// interval checks a timestamp, so reporting progress per chunk costs nothing.
// Always call `stop()`.
function watchdog(ms) {
  const controller = new AbortController();
  let last = Date.now();
  const timer = setInterval(() => { if (Date.now() - last >= ms) controller.abort(); }, Math.max(5, Math.min(ms / 4, 1000)));
  return { signal: controller.signal, alive: () => { last = Date.now(); }, stop: () => clearInterval(timer), get stalled() { return controller.signal.aborted; } };
}

function totalFrom(response, offset) {
  const range = /\/(\d+)\s*$/.exec(response.headers.get('content-range') || '');
  if (range) return Number(range[1]);
  const length = Number(response.headers.get('content-length'));
  return Number.isFinite(length) && length > 0 ? offset + length : null;
}

async function download({ url, target, fetchImpl = fetch, onProgress = () => {}, stallMs = 60000, attempts = 5, maxBytes = Infinity, now = Date.now, wait = sleep }) {
  const partial = target + '.part';
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let offset = 0;
    try { offset = fs.statSync(partial).size; } catch { /* no partial yet */ }
    const dog = watchdog(stallMs);
    try {
      // Ask for the raw bytes: sizes and Range offsets only line up with the file
      // itself, not with a compressed stream (GitHub gzips text files by default).
      const response = await fetchImpl(url, { signal: dog.signal, headers: { 'accept-encoding': 'identity', ...(offset ? { range: `bytes=${offset}-` } : {}) } });
      if (response.status === 416) {
        // The saved partial no longer matches the server file. Start clean.
        fs.rmSync(partial, { force: true });
        throw new DownloadError('The saved partial download no longer matches the server file.', 'restart');
      }
      if (!response.ok || !response.body) throw new DownloadError('The download server returned HTTP ' + response.status + '.', response.status >= 500 || response.status === 429 ? 'server' : 'http');
      // A server that ignores Range sends the whole file (200), and one that
      // compresses anyway reports a compressed size. Start over, unmeasured,
      // rather than append a second copy or compare against the wrong size.
      const encoded = !/^(identity)?$/i.test(response.headers.get('content-encoding') || '');
      if (offset && (response.status !== 206 || encoded)) offset = 0;
      const total = encoded ? null : totalFrom(response, offset);
      if (total && total > maxBytes) throw new DownloadError('The download is larger than expected.', 'size');
      const handle = await fs.promises.open(partial, offset ? 'a' : 'w');
      let completed = offset, last = -Infinity;
      try {
        for await (const chunk of response.body) {
          dog.alive();
          await handle.write(chunk);
          completed += chunk.length;
          if (completed > maxBytes) throw new DownloadError('The download is larger than expected.', 'size');
          if (now() - last > 200) { onProgress({ completed, total, attempt }); last = now(); }
        }
      } finally { await handle.close(); }
      if (total && completed !== total) throw new DownloadError('The download ended early.', 'incomplete');
      onProgress({ completed, total, attempt });
      fs.rmSync(target, { force: true });
      fs.renameSync(partial, target);
      return { bytes: completed, attempts: attempt };
    } catch (error) {
      lastError = dog.stalled ? new DownloadError('The download stopped receiving data.', 'stalled') : error instanceof DownloadError ? error : new DownloadError('The connection was interrupted.', 'network');
      // Size and plain HTTP errors (404, 403) will not fix themselves on retry.
      if (['size', 'http'].includes(lastError.reason)) break;
      if (attempt < attempts) {
        onProgress({ completed: offset, total: null, attempt, retrying: true, reason: lastError.reason });
        await wait(backoff(attempt));
      }
    } finally { dog.stop(); }
  }
  throw lastError;
}

module.exports = { download, DownloadError, watchdog, backoff, sleep };
