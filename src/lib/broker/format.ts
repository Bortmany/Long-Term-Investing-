// Date helpers for the broker card. Same short-date shape the app uses
// everywhere ("Oct 3, 2026"), with the time and "UTC" added for sync times.
// Fixed to UTC so the server and the browser always print the same text.

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Oct 3, 2026". */
export function formatUtcDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** "Oct 3, 2026, 10:05 UTC". */
export function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DATE.format(d)}, ${TIME.format(d)} UTC`;
}
