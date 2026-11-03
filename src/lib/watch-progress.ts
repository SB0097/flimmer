/** Zählt abgespielte Sekunden. Spulen und Sponsor-Sprünge gelten nicht als Sehzeit. */
export class WatchProgress {
  private previous?: { position: number; at: number };
  private pending = 0;

  sample(position: number, now: number, playing: boolean, playbackRate = 1): void {
    if (!Number.isFinite(position) || position < 0) return;
    const previous = this.previous;
    this.previous = { position, at: now };
    if (!previous || !playing) return;
    const delta = position - previous.position;
    const elapsed = Math.max(0, (now - previous.at) / 1000);
    if (delta > 0 && delta <= elapsed * playbackRate + 2) this.pending += delta;
  }

  take(): number {
    const seconds = this.pending;
    this.pending = 0;
    return seconds;
  }
}
