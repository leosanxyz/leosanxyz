"use client";

type ArenaImagesResponse = {
  images?: string[];
};

const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedImages: string[] | null = null;
let cachedAt = 0;
let inflightRequest: Promise<string[]> | null = null;

function hasFreshCache() {
  return cachedImages !== null && Date.now() - cachedAt < CLIENT_CACHE_TTL_MS;
}

async function fetchArenaImagesFromApi() {
  const response = await fetch('/api/arena', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to fetch arena images: ${response.status}`);
  }

  const data: ArenaImagesResponse = await response.json();
  const images = Array.isArray(data.images) ? data.images : [];

  cachedImages = images;
  cachedAt = Date.now();

  return images;
}

export function prefetchArenaImages() {
  void getArenaImages().catch(() => undefined);
}

export function getCachedArenaImages() {
  return hasFreshCache() ? cachedImages : null;
}

export async function getArenaImages() {
  if (hasFreshCache()) {
    return cachedImages ?? [];
  }

  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = fetchArenaImagesFromApi().finally(() => {
    inflightRequest = null;
  });

  return inflightRequest;
}
