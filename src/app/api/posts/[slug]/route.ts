import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// import { getCachedAsciiFrames } from '@/utils/gifToAscii';
// import { getEnhancedAsciiFrames } from '@/utils/gifToAsciiImproved';
import { getOptimizedAsciiFrames } from '@/utils/gifToAsciiAdvanced';

// ASCII animations for different posts
const postAnimations: Record<string, string[]> = {
  '¿por qué corres?': [
    `
           ___
          /o o\\
         (  <  )
         |\\___/|
         ||   ||
       __||   ||__
      /  ||   ||  \\
     /   ||___||   \\
    /   / |   | \\   \\
   ____/  |___|  \\____
          /   \\
         /     \\
        /       \\
    `,
    `
           ___
          /- -\\
         (  <  )
         |\\___/|
         ||   ||
       __||   ||__
      /  ||   ||  \\
     /   /|   |\\   \\
    /  _/ |___| \\_  \\
   ___/   /   \\   \\___
         /     \\
        /       \\
       /         \\
    `,
    `
           ___
          /o o\\
         (  <  )
         |\\___/|
         ||   ||
       __||   ||__
      /  ||   ||  \\
     /   ||   ||   \\
    /   / |___| \\   \\
   ____/  /   \\  \\____
         /     \\
        /       \\
       /         \\
    `,
    `
           ___
          /^ ^\\
         (  <  )
         |\\___/|
         ||   ||
       __||   ||__
      /  ||   ||  \\
     /  / |   | \\  \\
    / _/  |___|  \\_ \\
   __/    /   \\    \\__
        _/     \\_
       /         \\
      /           \\
    `,
  ],
  'tienes la paciencia de los ojos sobre las grietas': [
    `
        _.-"""-._
       /  o   o  \\
      |     <     |
      |   \\___/   |
      |  /|||||\\  |
       \\  |||||  /
        '-.._..-'
          |||||
         /|||||\\
        / ||||| \\
       /__\\\\///__\\
    `,
    `
        _.-"""-._
       /  -   -  \\
      |     <     |
      |   \\___/   |
      | _/|||||\\_ |
       \\ \\|||||/ /
        '-.._..-'
          |||||
         /|||||\\
        / ||||| \\
       /__//\\\\__\\
    `,
    `
        _.-"""-._
       /  o   o  \\
      |     <     |
      |   \\___/   |
      |  /\\\\//\\  |
       \\  \\\\//  /
        '-.._..-'
          |||||
         /|||||\\
        / ||||| \\
       /__\\\\///__\\
    `,
    `
        _.-"""-._
       /  ^   ^  \\
      |     <     |
      |   \\___/   |
      |  /|||||\\  |
       \\  |||||  /
        '-.._..-'
          //|\\\\
         //|||\\\\
        // ||| \\\\
       //__\\|/__\\\\
    `,
  ],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    // Decode the slug in case it contains URL-encoded characters (like spaces %20)
    const decodedSlug = decodeURIComponent(slug);
    const postsDirectory = path.join(process.cwd(), 'content/blog');
    // Use the decoded slug to construct the file path
    const filePath = path.join(postsDirectory, `${decodedSlug}.md`);

    console.log(`Attempting to read file: ${filePath}`); // Log path for debugging

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Post not found at path: ${filePath}`);
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Read the file content
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    console.log(`Successfully read content for slug: ${decodedSlug}`);

    // First try to get optimized ASCII frames from GIF file
    const gifResult = await getOptimizedAsciiFrames(decodedSlug);
    let animationFrames = null;
    let frameDelay = 100; // Default frame delay
    
    if (gifResult) {
      animationFrames = gifResult.frames;
      frameDelay = gifResult.frameDelay;
    }
    
    // If no GIF exists, fall back to hardcoded animations
    if (!animationFrames || animationFrames.length === 0) {
      animationFrames = postAnimations[decodedSlug] || null;
    }

    // Return the content and animation with frame delay
    return NextResponse.json({ 
      content: fileContent,
      asciiFrames: animationFrames,
      frameDelay: frameDelay 
    });

  } catch (error) {
    console.error(`Error reading post ${slug}:`, error);
    return NextResponse.json({ error: 'Failed to load post content' }, { status: 500 });
  }
} 