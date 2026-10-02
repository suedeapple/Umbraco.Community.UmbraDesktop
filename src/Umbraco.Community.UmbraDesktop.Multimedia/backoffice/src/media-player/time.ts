/**
 * A media time as a player's counter writes it: `m:ss`, or `h:mm:ss` from an hour up.
 *
 * Seconds are rounded down, so the counter turns over when a second has passed rather than halfway
 * through it, and reaches the duration only at the end.
 * @param seconds The time, as a media element reports it.
 * @returns The counter text. A time that is not yet known, or not finite, reads `0:00`.
 */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}
