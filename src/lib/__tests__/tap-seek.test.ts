import { clampSeekTarget, handleTap, sideOf, type TapState } from '../tap-seek';

describe('sideOf', () => {
  it('teilt in Drittel', () => {
    expect(sideOf(10, 300)).toBe('left');
    expect(sideOf(150, 300)).toBe('center');
    expect(sideOf(290, 300)).toBe('right');
    expect(sideOf(10, 0)).toBe('center');
  });
});

describe('handleTap', () => {
  it('merkt einen Einzeltipp nur vor', () => {
    const { action, state } = handleTap({}, 1000, 'right');
    expect(action).toEqual({ type: 'single-pending' });
    expect(state).toEqual({ lastTapAt: 1000, lastSide: 'right' });
  });

  it('spult bei Doppeltipp rechts 10 s vor', () => {
    const first = handleTap({}, 1000, 'right');
    const second = handleTap(first.state, 1200, 'right');
    expect(second.action).toEqual({ type: 'seek', side: 'right', seconds: 10, total: 10 });
  });

  it('spult bei Doppeltipp links 10 s zurück', () => {
    const first = handleTap({}, 1000, 'left');
    expect(handleTap(first.state, 1100, 'left').action).toMatchObject({ seconds: -10 });
  });

  it('addiert weitere Einzeltipps im Spul-Modus', () => {
    let state: TapState = handleTap({}, 1000, 'right').state;
    state = handleTap(state, 1200, 'right').state; // Doppeltipp → 10
    const third = handleTap(state, 1600, 'right'); // + 10
    expect(third.action).toEqual({ type: 'seek', side: 'right', seconds: 10, total: 20 });
    const fourth = handleTap(third.state, 2300, 'right'); // + 10 (innerhalb 800 ms)
    expect(fourth.action).toMatchObject({ total: 30 });
  });

  it('beendet den Spul-Modus nach Ablauf der Zeit', () => {
    let state: TapState = handleTap({}, 1000, 'right').state;
    state = handleTap(state, 1200, 'right').state;
    expect(handleTap(state, 3000, 'right').action).toEqual({ type: 'single-pending' });
  });

  it('spult nicht bei zu langsamen Tipps, auf der anderen Seite oder in der Mitte', () => {
    const slow = handleTap(handleTap({}, 1000, 'right').state, 1500, 'right');
    expect(slow.action.type).toBe('single-pending');
    const other = handleTap(handleTap({}, 1000, 'right').state, 1100, 'left');
    expect(other.action.type).toBe('single-pending');
    const center = handleTap(handleTap({}, 1000, 'center').state, 1100, 'center');
    expect(center.action.type).toBe('single-pending');
  });
});

describe('clampSeekTarget', () => {
  it('begrenzt auf Anfang und Ende', () => {
    expect(clampSeekTarget(5, -10, 100)).toBe(0);
    expect(clampSeekTarget(95, 10, 100)).toBe(100);
    expect(clampSeekTarget(50, 10, 100)).toBe(60);
  });

  it('kommt ohne bekannte Dauer aus', () => {
    expect(clampSeekTarget(50, 10, Number.NaN)).toBe(60);
    expect(clampSeekTarget(5, -10, 0)).toBe(0);
  });
});
