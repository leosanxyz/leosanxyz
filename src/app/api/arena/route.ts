export const revalidate = 3600; // cache external fetches for 1 hour

import { NextResponse } from 'next/server';

const ARENA_API_BASE_URL = 'https://api.are.na/v3';
const ARENA_CHANNEL_SLUG = 'wow-wmoqvbzq_ys';
const PER_PAGE = 50;
const TOTAL_PAGES = 3;

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
    `${ARENA_API_BASE_URL}/channels/${ARENA_CHANNEL_SLUG}/contents?per=${PER_PAGE}&page=${page}&sort=position_desc`,
    { next: { revalidate } }
  );

  if (!response.ok) {
    throw new Error(`Are.na v3 request failed with status ${response.status}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const pagePromises = Array.from({ length: TOTAL_PAGES }, (_, index) =>
      fetchArenaPage(index + 1)
    );
    const allPagesData = await Promise.all(pagePromises);

    const uniqueImageUrls = Array.from(
      new Set(
        allPagesData.flatMap((pageData) =>
          (pageData.data ?? [])
            .map(getArenaImageUrl)
            .filter((url): url is string => Boolean(url))
        )
      )
    );

    // Shuffle all images using Fisher-Yates algorithm
    const shuffledUrls = [...uniqueImageUrls];
    for (let i = shuffledUrls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledUrls[i], shuffledUrls[j]] = [shuffledUrls[j], shuffledUrls[i]];
    }

    return NextResponse.json({ images: shuffledUrls });
  } catch (error) {
    console.error('Error fetching Are.na images:', error);
    return NextResponse.json({ images: [], error: 'Failed to fetch images' }, { status: 500 });
  }
}
