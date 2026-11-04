import { act, renderHook } from '@testing-library/react-native';
import { Animated, PanResponder, type PanResponderCallbacks } from 'react-native';

import { useMinimizeGesture } from '../use-minimize-gesture';

let handlers: PanResponderCallbacks;
let finish: ((result: { finished: boolean }) => void) | undefined;

beforeEach(() => {
  finish = undefined;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    handlers = config;
    return { panHandlers: {} } as ReturnType<typeof PanResponder.create>;
  });
  jest.spyOn(Animated, 'timing').mockImplementation(
    () =>
      ({
        start: (callback: typeof finish) => {
          finish = callback;
        },
        stop: jest.fn(),
        reset: jest.fn(),
      }) as ReturnType<typeof Animated.timing>,
  );
});

afterEach(() => jest.restoreAllMocks());

it.each([
  { isFullscreen: false, dy: -20, vy: -2, action: 'enter' },
  { isFullscreen: true, dy: 20, vy: 2, action: 'exit' },
])('dreht bei einem schnellen $action-Flick erst nach der Animation', async (gesture) => {
  const enter = jest.fn();
  const exit = jest.fn();
  await renderHook(() =>
    useMinimizeGesture({
      isFullscreen: gesture.isFullscreen,
      getFrames: () => ({ target: { x: 0, y: 600, width: 100, height: 56 } }),
      onMinimize: jest.fn(),
      onEnterFullscreen: enter,
      onExitFullscreen: exit,
    }),
  );
  await act(() => {
    handlers.onPanResponderRelease?.({} as never, gesture as never);
    handlers.onPanResponderRelease?.({} as never, gesture as never);
  });
  expect(enter).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  expect(Animated.timing).toHaveBeenCalledTimes(1);
  await act(() => finish?.({ finished: true }));
  expect(gesture.isFullscreen ? exit : enter).toHaveBeenCalledTimes(1);
});

it('dreht nach einer unterbrochenen Animation nicht mehr', async () => {
  const enter = jest.fn();
  const { unmount } = await renderHook(() =>
    useMinimizeGesture({
      isFullscreen: false,
      getFrames: () => ({ target: { x: 0, y: 600, width: 100, height: 56 } }),
      onMinimize: jest.fn(),
      onEnterFullscreen: enter,
      onExitFullscreen: jest.fn(),
    }),
  );
  await act(() => handlers.onPanResponderRelease?.({} as never, { dy: -100, vy: -2 } as never));
  await unmount();
  await act(() => finish?.({ finished: true }));
  expect(enter).not.toHaveBeenCalled();
});
