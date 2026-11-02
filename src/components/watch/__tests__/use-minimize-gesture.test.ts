import { minimizeTransform } from '../use-minimize-gesture';

jest.mock('react-native', () => ({ Animated: {}, PanResponder: {} }));

describe('minimizeTransform', () => {
  // Video oben über die volle Breite (400 × 225), Mini-Player-Bild unten links (114 × 64)
  const video = { x: 0, y: 40, width: 400, height: 225 };
  const target = { x: 0, y: 700, width: 114, height: 64 };

  it('verschiebt die Mitte des Videos auf die Mitte des Mini-Player-Bilds', () => {
    const t = minimizeTransform(video, target);
    expect(t.dx).toBeCloseTo(57 - 200);
    expect(t.dy).toBeCloseTo(732 - 152.5);
  });

  it('verkleinert auf die Breite des Mini-Player-Bilds', () => {
    expect(minimizeTransform(video, target).scale).toBeCloseTo(114 / 400);
  });

  it('landet nach Verschieben und Skalieren genau auf dem Ziel', () => {
    const t = minimizeTransform(video, target);
    const cx = video.x + video.width / 2 + t.dx;
    const cy = video.y + video.height / 2 + t.dy;
    const w = video.width * t.scale;
    const h = video.height * t.scale;
    expect(cx - w / 2).toBeCloseTo(target.x, 0);
    expect(cy - h / 2).toBeCloseTo(target.y, 0);
  });
});
