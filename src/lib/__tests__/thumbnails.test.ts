import { thumbnailCandidates } from '../thumbnails';

describe('thumbnailCandidates', () => {
  it('nimmt zuerst das HD-Bild (WebP), dann die gelieferten, zuletzt hqdefault', () => {
    const urls = thumbnailCandidates('abc', [
      { url: 'https://i.ytimg.com/vi/abc/small.jpg', width: 168, height: 94 },
      { url: 'https://i.ytimg.com/vi/abc/big.jpg', width: 336, height: 188 },
    ]);
    expect(urls).toEqual([
      'https://i.ytimg.com/vi_webp/abc/hq720.webp',
      'https://i.ytimg.com/vi/abc/big.jpg',
      'https://i.ytimg.com/vi/abc/small.jpg',
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    ]);
  });

  it('kommt ohne gelieferte Bilder aus und enthält keine Dubletten', () => {
    expect(
      thumbnailCandidates('abc', [
        { url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg', width: 480, height: 360 },
      ]),
    ).toEqual([
      'https://i.ytimg.com/vi_webp/abc/hq720.webp',
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    ]);
  });
});
