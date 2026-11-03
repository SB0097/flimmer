import { abortable } from '../abortable';

it('beendet nicht abbrechbare Metadaten-Anfragen sofort und ignoriert späte Ergebnisse', async () => {
  const controller = new AbortController();
  let finish!: (value: string) => void;
  const result = abortable(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
    controller.signal,
  );
  controller.abort();
  await expect(result).rejects.toThrow(/abgebrochen/);
  finish('zu spät');
});

it('begrenzt hängende Verbindungen zeitlich', async () => {
  jest.useFakeTimers();
  try {
    const result = abortable(new Promise(() => {}), new AbortController().signal, 1000);
    const checked = expect(result).rejects.toThrow(/antwortet nicht/);
    jest.advanceTimersByTime(1000);
    await checked;
  } finally {
    jest.useRealTimers();
  }
});
