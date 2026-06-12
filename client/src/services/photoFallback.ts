import type { SyntheticEvent } from 'react';

const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];

function nextExtensionUrl(currentUrl: string) {
  const match = currentUrl.match(/^(.*)\.(jpg|jpeg|png)(\?.*)?$/i);
  if (!match) return null;

  const base = match[1];
  const currentExt = match[2].toLowerCase();
  const suffix = match[3] || '';
  const index = PHOTO_EXTENSIONS.indexOf(currentExt);
  if (index < 0 || index >= PHOTO_EXTENSIONS.length - 1) return null;

  const nextExt = PHOTO_EXTENSIONS[index + 1];
  return `${base}.${nextExt}${suffix}`;
}

export function handlePhotoFallback(
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallbackUrl: string
) {
  const img = event.currentTarget;
  const nextUrl = nextExtensionUrl(img.src);

  if (nextUrl && nextUrl !== img.src) {
    img.src = nextUrl;
    return;
  }

  img.onerror = null;
  img.src = fallbackUrl;
}

