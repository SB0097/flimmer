import type { VideoPlayer } from 'expo-video';
import { AppState } from 'react-native';

import { pauseIfPipDismissed, resumablePosition } from '../player-actions';

jest.mock('react-native', () => ({ AppState: { currentState: 'active' } }));

const appState = AppState as { currentState: string };

describe('resumablePosition', () => {
  it('merkt sich Positionen mitten im Video', () => {
    expect(resumablePosition(120, 600)).toBe(120);
  });

  it('ignoriert den Anfang', () => {
    expect(resumablePosition(3, 600)).toBeUndefined();
  });

  it('ignoriert das Ende – das Video beginnt dann wieder von vorn', () => {
    expect(resumablePosition(595, 600)).toBeUndefined();
  });

  it('funktioniert ohne bekannte Dauer (z. B. Livestream)', () => {
    expect(resumablePosition(120, 0)).toBe(120);
  });
});

describe('pauseIfPipDismissed', () => {
  function fakePlayer() {
    const listeners: (() => void)[] = [];
    const player = {
      pause: jest.fn(),
      addListener: jest.fn((_event: string, fn: () => void) => {
        listeners.push(fn);
        return { remove: () => listeners.splice(listeners.indexOf(fn), 1) };
      }),
    };
    const tick = () => [...listeners].forEach((fn) => fn());
    return { player: player as unknown as VideoPlayer, raw: player, tick, listeners };
  }

  afterEach(() => {
    jest.useRealTimers();
    appState.currentState = 'active';
  });

  it('pausiert nicht, wenn die App zurück im Vordergrund ist (Fenster vergrößert)', () => {
    appState.currentState = 'active';
    const { player, raw } = fakePlayer();
    pauseIfPipDismissed(player);
    expect(raw.pause).not.toHaveBeenCalled();
    expect(raw.addListener).not.toHaveBeenCalled();
  });

  it('pausiert, wenn die App im Hintergrund bleibt (Fenster geschlossen)', () => {
    jest.useFakeTimers({ now: 0 });
    appState.currentState = 'background';
    const { player, raw, tick, listeners } = fakePlayer();
    pauseIfPipDismissed(player, 800);

    jest.setSystemTime(400);
    tick();
    expect(raw.pause).not.toHaveBeenCalled();

    jest.setSystemTime(1000);
    tick();
    expect(raw.pause).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });

  it('pausiert nicht, wenn die App kurz danach wieder aktiv wird', () => {
    jest.useFakeTimers({ now: 0 });
    appState.currentState = 'background';
    const { player, raw, tick, listeners } = fakePlayer();
    pauseIfPipDismissed(player, 800);

    appState.currentState = 'active';
    jest.setSystemTime(1000);
    tick();
    expect(raw.pause).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });
});
