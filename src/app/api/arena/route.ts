export const revalidate = 3600; // cache external fetches for 1 hour
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch multiple pages in parallel (cap pages to avoid excessive requests)
    const perPage = 50;
    const totalPages = 3; // fetch first 3 pages for variety
    
    // Fetch multiple pages in parallel
    const pagePromises = [];
    for (let page = 1; page <= totalPages; page++) {
      pagePromises.push(
        fetch(`https://api.are.na/v2/channels/wow-wmoqvbzq_ys?per=${perPage}&page=${page}`, { next: { revalidate: 3600 } })
          .then(res => res.json())
      );
    }
    
    const allPagesData = await Promise.all(pagePromises);
    
    // Extract all image URLs from all pages
    const allImageUrls: string[] = [];
    allPagesData.forEach(pageData => {
      const pageImages = pageData.contents
        ?.filter((block: { image?: unknown }) => block.image)
        .map((block: { image?: { display?: { url: string }, original?: { url: string } } }) => {
          return block.image?.display?.url || block.image?.original?.url;
        })
        .filter(Boolean) || [];
      allImageUrls.push(...pageImages);
    });
    // Shuffle all images using Fisher-Yates algorithm
    const shuffledUrls = [...allImageUrls];
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
