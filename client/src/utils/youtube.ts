const YOUTUBE_ID_PATTERN = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i;

export function getYoutubeVideoId(rawUrl: string | null | undefined): string | null {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  const match = value.match(YOUTUBE_ID_PATTERN);
  return match ? match[1] : null;
}

export function getYoutubeEmbedUrl(rawUrl: string | null | undefined): string | null {
  const id = getYoutubeVideoId(rawUrl);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
