import { WatchProgress } from '../watch-progress';

it('zählt normale Wiedergabe, aber weder Vor-/Zurückspulen noch Sponsor-Sprünge', () => {
  const progress = new WatchProgress();
  progress.sample(0, 0, true);
  progress.sample(1, 1000, true);
  progress.sample(90, 1500, true);
  progress.sample(91, 2500, true);
  progress.sample(10, 3000, true);
  progress.sample(11, 4000, true);
  expect(progress.take()).toBe(3);
  expect(progress.take()).toBe(0);
});

it('zählt keine Pausen und berücksichtigt die Abspielgeschwindigkeit', () => {
  const progress = new WatchProgress();
  progress.sample(5, 0, false);
  progress.sample(5, 30_000, false);
  progress.sample(7, 31_000, true, 2);
  expect(progress.take()).toBe(2);
});

it('verarbeitet größere Event-Abstände im Hintergrund und ignoriert ungültige Positionen', () => {
  const progress = new WatchProgress();
  progress.sample(0, 0, true);
  progress.sample(60, 60_000, true);
  progress.sample(NaN, 60_001, true);
  expect(progress.take()).toBe(60);
});
