import { friendlyStreamError } from '../friendly-error';

const attempts = (...messages: string[]) => messages.map((message) => ({ message }));

describe('friendlyStreamError', () => {
  it('erkennt fehlende Internetverbindung', () => {
    expect(friendlyStreamError(new TypeError('Network request failed')).title).toBe(
      'Keine Verbindung',
    );
  });

  it('erkennt den Bot-Schutz', () => {
    const e = friendlyStreamError(
      new Error('x'),
      attempts('LOGIN_REQUIRED: Melde dich an, damit wir sehen, dass du kein Bot bist'),
    );
    expect(e).toMatchObject({ title: 'YouTube blockiert gerade', retryable: true });
  });

  it('erkennt private, Mitglieder- und altersbeschränkte Videos', () => {
    expect(
      friendlyStreamError(null, attempts('LOGIN_REQUIRED: Dieses Video ist privat')).title,
    ).toBe('Dieses Video ist privat');
    expect(friendlyStreamError(null, attempts('UNPLAYABLE: Nur für Mitglieder')).title).toBe(
      'Nur für Kanalmitglieder',
    );
    expect(
      friendlyStreamError(null, attempts('This video may be inappropriate for some users'))
        .retryable,
    ).toBe(false);
  });

  it('erkennt Ländersperren', () => {
    expect(
      friendlyStreamError(
        null,
        attempts('UNPLAYABLE: The uploader has not made this video available in your country'),
      ).title,
    ).toBe('In deinem Land nicht verfügbar');
  });

  it('erkennt abgelaufene Stream-Adressen', () => {
    expect(friendlyStreamError(new Error('Source error Response code: 403')).title).toBe(
      'Wiedergabe unterbrochen',
    );
  });

  it('fällt auf eine allgemeine Meldung zurück', () => {
    expect(friendlyStreamError(new Error('irgendwas'))).toEqual({
      title: 'Video kann gerade nicht abgespielt werden',
      retryable: true,
    });
  });
});
