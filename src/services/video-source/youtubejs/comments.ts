import type { Comment, Thumbnail } from '../types';

/** Minimal benötigte Struktur eines `CommentView`-Knotens (lose typisiert für Tests) */
export interface CommentViewLike {
  comment_id?: string;
  content?: { toString(): string } | null;
  published_time?: string;
  like_count?: string;
  reply_count?: string;
  is_pinned?: boolean;
  is_hearted?: boolean;
  author_is_channel_owner?: boolean;
  author?: { id?: string; name?: string; thumbnails?: Thumbnail[] } | null;
}

/** "5713" → 5713, "1.234" → 1234; Kurzformen wie "1,2 Tsd." → undefined */
export function parseCount(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const digits = text.replace(/[.\s]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

export function toComment(
  view: CommentViewLike,
  loadReplies?: Comment['loadReplies'],
): Comment | undefined {
  if (!view.comment_id) return undefined;
  const replyCount = parseCount(view.reply_count) ?? 0;
  return {
    id: view.comment_id,
    author: {
      id: view.author?.id,
      name: view.author?.name ?? '',
      avatar: view.author?.thumbnails?.[0],
      isUploader: Boolean(view.author_is_channel_owner),
    },
    text: view.content?.toString() ?? '',
    publishedText: view.published_time,
    likeCount: parseCount(view.like_count),
    replyCount,
    isPinned: Boolean(view.is_pinned),
    isHearted: Boolean(view.is_hearted),
    loadReplies: replyCount > 0 ? loadReplies : undefined,
  };
}
