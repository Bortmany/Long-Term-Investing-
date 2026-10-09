// The plain-English sentences shown in toasts when a stock is watched,
// un-watched, put back with Undo, or added from the Track a Stock dialog.
// Pure (no React, no server code) so a unit test can read every sentence.
//
// Only the ticker the person typed or clicked is ever used here — never a
// stored company name, so another account's typed-in name cannot leak.

export const TOO_MANY_REQUESTS_TOAST = "Too many requests. Wait a moment, then try again.";

/** True when a failed watchlist action was refused by the write limit. */
export function isRateLimitedError(error: string): boolean {
  return error.includes("Too many");
}

/** Un-watch (or watch) failed: the limit sentence, or the general one. */
export function watchFailureMessage(error: string): string {
  return isRateLimitedError(error)
    ? TOO_MANY_REQUESTS_TOAST
    : "Couldn't update your watchlist. Please try again.";
}

export function removedToastMessage(ticker: string): string {
  return `${ticker} removed from your watchlist`;
}

export function backOnWatchlistMessage(ticker: string): string {
  return `${ticker} is back on your watchlist`;
}

/** Undo failed: the limit sentence when the limiter refused, else the way out. */
export function undoFailureMessage(ticker: string, error: string): string {
  return isRateLimitedError(error)
    ? TOO_MANY_REQUESTS_TOAST
    : `Couldn't put ${ticker} back. Try Track a Stock to add it again.`;
}

/** After Track a Stock: the same wording whether the stock was new or already known. */
export function trackedToastMessage(ticker: string, alreadyWatching: boolean): string {
  return alreadyWatching
    ? `${ticker} is already on your watchlist.`
    : `${ticker} added to your watchlist.`;
}
