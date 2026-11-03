import { advanceChrome, boundedScrollY, settledChrome } from '../scroll-chrome';

describe('Scroll-Leisten', () => {
  it('folgt dem Finger und blendet nach einem Kopfbereich beide Leisten ganz aus', () => {
    let progress = 0;
    let previous = 0;
    for (const y of [12, 36, 70, 100, 130, 250]) {
      progress = advanceChrome(progress, y - previous, y, 100);
      previous = y;
    }
    expect(progress).toBe(1);
    expect(advanceChrome(progress, -40, 210, 100)).toBeCloseTo(0.6);
    expect(advanceChrome(0.6, -100, 110, 100)).toBe(0);
  });

  it('zeigt bei Richtungswechsel nach oben die Leisten auch mitten in einer langen Liste', () => {
    expect(settledChrome(-2, 5000, 120)).toBe(0);
    expect(settledChrome(2, 5000, 120)).toBe(1);
  });

  it('lässt am Listenanfang keinen leeren Platz unter dem ausfahrenden Kopf', () => {
    expect(advanceChrome(0.8, -15, 5, 100)).toBe(0.05);
    expect(advanceChrome(1, -1, 0, 100)).toBe(0);
    expect(settledChrome(1, 20, 100)).toBe(0.2);
  });

  it('ignoriert Überziehen oben, unten und bei nicht scrollbaren Listen', () => {
    expect(boundedScrollY(-60, 2000, 800)).toBe(0);
    expect(boundedScrollY(1400, 2000, 800)).toBe(1200);
    expect(boundedScrollY(30, 300, 800)).toBe(0);
    const bottom = boundedScrollY(1400, 2000, 800);
    const rebound = boundedScrollY(1200, 2000, 800);
    expect(advanceChrome(1, rebound - bottom, rebound, 120)).toBe(1);
    expect(advanceChrome(0, 0, 0, 120)).toBe(0);
  });
});
