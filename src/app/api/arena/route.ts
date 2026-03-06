import { NextResponse } from 'next/server';

const ARENA_API_BASE_URL = 'https://api.are.na/v3';
const ARENA_ACCESS_TOKEN = process.env.ARENA_ACCESS_TOKEN;
const ARENA_CHANNEL_SLUG = 'wow-wmoqvbzq_ys';
const ARENA_CHANNEL_ID = 2752197;
const PREMIUM_PER_PAGE = 100;
const PREMIUM_TOTAL_PAGES = 3;
const FALLBACK_PER_PAGE = 50;
const FALLBACK_TOTAL_PAGES = 3;

type ArenaImageVariant = {
  src?: string;
};

type ArenaImage = {
  src?: string;
  small?: ArenaImageVariant;
  medium?: ArenaImageVariant;
  large?: ArenaImageVariant;
};

type ArenaBlock = {
  image?: ArenaImage | null;
};

type ArenaContentsResponse = {
  data?: ArenaBlock[];
};

function shuffleUrls(urls: string[]) {
  const shuffledUrls = [...urls];
  for (let i = shuffledUrls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledUrls[i], shuffledUrls[j]] = [shuffledUrls[j], shuffledUrls[i]];
  }
  return shuffledUrls;
}

function getArenaImageUrl(block: ArenaBlock): string | undefined {
  return (
    block.image?.large?.src ??
    block.image?.medium?.src ??
    block.image?.small?.src ??
    block.image?.src
  );
}

async function fetchArenaPage(page: number): Promise<ArenaContentsResponse> {
  const response = await fetch(
    `${ARENA_API_BASE_URL}/channels/${ARENA_CHANNEL_SLUG}/contents?per=${FALLBACK_PER_PAGE}&page=${page}&sort=position_desc`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error(`Are.na v3 request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchArenaRandomSearchPage(page: number, seed: number): Promise<ArenaContentsResponse> {
  if (!ARENA_ACCESS_TOKEN) {
    return { data: [] };
  }

  const response = await fetch(
    `${ARENA_API_BASE_URL}/search?query=*&channel_id=${ARENA_CHANNEL_ID}&type=Block&sort=random&seed=${seed}&per=${PREMIUM_PER_PAGE}&page=${page}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${ARENA_ACCESS_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Are.na premium search failed with status ${response.status}`);
  }

  return response.json();
}

function extractUniqueImageUrls(allPagesData: ArenaContentsResponse[]) {
  return Array.from(
    new Set(
      allPagesData.flatMap((pageData) =>
        (pageData.data ?? [])
          .map(getArenaImageUrl)
          .filter((url): url is string => Boolean(url))
      )
    )
  );
}

export async function GET() {
  try {
    if (ARENA_ACCESS_TOKEN) {
      const seed = Math.floor(Math.random() * 1_000_000_000);
      const premiumPagePromises = Array.from({ length: PREMIUM_TOTAL_PAGES }, (_, index) =>
        fetchArenaRandomSearchPage(index + 1, seed)
      );
      const premiumPagesData = await Promise.all(premiumPagePromises);
      const premiumImageUrls = extractUniqueImageUrls(premiumPagesData);

      return NextResponse.json({ images: shuffleUrls(premiumImageUrls) });
    }

    const fallbackPagePromises = Array.from({ length: FALLBACK_TOTAL_PAGES }, (_, index) =>
      fetchArenaPage(index + 1)
    );
    const fallbackPagesData = await Promise.all(fallbackPagePromises);
    const fallbackImageUrls = extractUniqueImageUrls(fallbackPagesData);

    const shuffledUrls = shuffleUrls(fallbackImageUrls);
    return NextResponse.json({ images: shuffledUrls });
  } catch (error) {
    console.error('Error fetching Are.na images:', error);
    return NextResponse.json({ images: [], error: 'Failed to fetch images' }, { status: 500 });
  }
}
