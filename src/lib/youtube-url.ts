const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Liest die Video-ID aus einem YouTube-Link oder einer nackten ID.
 * Unterstützt watch?v=, youtu.be/, /shorts/, /live/, /embed/ und m./music.-Varianten.
 */
export function parseVideoId(input: string): string | undefined {
  const text = input.trim();
  if (ID_PATTERN.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }

  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let candidate: string | undefined | null;

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    candidate = url.searchParams.get('v');
    if (!candidate) {
      const [, kind, id] = url.pathname.split('/');
      if (['shorts', 'live', 'embed', 'v'].includes(kind)) candidate = id;
    }
  }

  return candidate && ID_PATTERN.test(candidate) ? candidate : undefined;
}
