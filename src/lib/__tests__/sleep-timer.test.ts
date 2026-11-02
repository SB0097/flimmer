import { FADE_MS, remainingLabel, sleepStep } from '../sleep-timer';

describe('sleepStep', () => {
  it('macht nichts, solange genug Zeit bleibt', () => {
    expect(sleepStep(60_000)).toEqual({ action: 'none' });
  });

  it('blendet in den letzten Sekunden aus', () => {
    expect(sleepStep(FADE_MS / 2)).toEqual({ action: 'fade', volume: 0.5 });
  });

  it('wird nie ganz stumm, bevor pausiert wird', () => {
    const step = sleepStep(1);
    expect(step.action).toBe('fade');
    expect(step.action === 'fade' && step.volume).toBeGreaterThan(0);
  });

  it('stoppt, wenn die Zeit um ist', () => {
    expect(sleepStep(0)).toEqual({ action: 'stop' });
    expect(sleepStep(-500)).toEqual({ action: 'stop' });
  });
});

describe('remainingLabel', () => {
  it('zeigt Minuten (aufgerundet)', () => {
    expect(remainingLabel(14 * 60_000 + 1)).toBe('noch 15 Min.');
    expect(remainingLabel(30 * 60_000)).toBe('noch 30 Min.');
  });

  it('zeigt Sekunden unter einer Minute', () => {
    expect(remainingLabel(45_000)).toBe('noch 45 Sek.');
  });
});
