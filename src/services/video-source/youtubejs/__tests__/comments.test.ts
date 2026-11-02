import { parseCount, toComment, type CommentViewLike } from '../comments';

const view: CommentViewLike = {
  comment_id: 'Ugx123',
  content: { toString: () => 'Toller Mix!' },
  published_time: 'vor 9 Monaten (bearbeitet)',
  like_count: '5713',
  reply_count: '137',
  is_pinned: false,
  is_hearted: true,
  author_is_channel_owner: false,
  author: {
    id: 'UC0',
    name: '@hikaru_hi',
    thumbnails: [{ url: 'https://yt3/a', width: 88, height: 88 }],
  },
};

describe('parseCount', () => {
  it.each([
    ['5713', 5713],
    ['1.234', 1234],
    ['0', 0],
  ])('%s → %d', (input, expected) => expect(parseCount(input)).toBe(expected));

  it.each(['1,2 Tsd.', '', undefined])('lässt %s offen', (input) =>
    expect(parseCount(input)).toBeUndefined(),
  );
});

describe('toComment', () => {
  it('wandelt einen Kommentar um', () => {
    const load = jest.fn();
    expect(toComment(view, load)).toEqual({
      id: 'Ugx123',
      author: {
        id: 'UC0',
        name: '@hikaru_hi',
        avatar: { url: 'https://yt3/a', width: 88, height: 88 },
        isUploader: false,
      },
      text: 'Toller Mix!',
      publishedText: 'vor 9 Monaten (bearbeitet)',
      likeCount: 5713,
      replyCount: 137,
      isPinned: false,
      isHearted: true,
      loadReplies: load,
    });
  });

  it('bietet ohne Antworten kein Nachladen an', () => {
    expect(toComment({ ...view, reply_count: '0' }, jest.fn())?.loadReplies).toBeUndefined();
    expect(toComment({ ...view, reply_count: undefined }, jest.fn())?.replyCount).toBe(0);
  });

  it('überspringt Einträge ohne ID', () => {
    expect(toComment({ ...view, comment_id: undefined })).toBeUndefined();
  });
});
