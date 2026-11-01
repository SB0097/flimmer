import { parseVideoId } from '../youtube-url';

describe('parseVideoId', () => {
  const id = 'dQw4w9WgXcQ';

  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=RD`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `youtube.com/watch?v=${id}`,
    `  ${id}  `,
  ])('erkennt %s', (input) => {
    expect(parseVideoId(input)).toBe(id);
  });

  it.each(['', 'hallo welt', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/kurz'])(
    'lehnt %s ab',
    (input) => {
      expect(parseVideoId(input)).toBeUndefined();
    },
  );
});
