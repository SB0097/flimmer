import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlaylistNameForm } from '../playlist-name-dialog';

it('verhindert leere Namen und speichert den bereinigten Namen', async () => {
  const save = jest.fn(() => true);
  await render(<PlaylistNameForm onSave={save} onCancel={jest.fn()} />);
  await fireEvent.press(screen.getByText('Speichern'));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/Namen/);
  await fireEvent.changeText(screen.getByLabelText('Name der Playlist'), '  Musik   für später  ');
  await fireEvent.press(screen.getByText('Speichern'));
  expect(save).toHaveBeenCalledWith('Musik für später');
});

it('behält bei Speicherfehlern die Eingabe und lässt Abbrechen ohne Speichern zu', async () => {
  const save = jest.fn(() => false);
  const cancel = jest.fn();
  await render(<PlaylistNameForm initialName="Videos" onSave={save} onCancel={cancel} />);
  await fireEvent.press(screen.getByText('Speichern'));
  expect(screen.getByRole('alert')).toHaveTextContent(/Speichern fehlgeschlagen/);
  expect(screen.getByLabelText('Name der Playlist')).toHaveDisplayValue('Videos');
  await fireEvent.press(screen.getByText('Abbrechen'));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});
