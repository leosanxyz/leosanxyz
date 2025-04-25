import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  context: { params: { slug: string } }
) {
  const { params } = context; // Destructure params inside the function
  try {
    const slug = params.slug;
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

    // Return the content
    return NextResponse.json({ content: fileContent });

  } catch (error) {
    console.error(`Error reading post ${params.slug}:`, error);
    return NextResponse.json({ error: 'Failed to load post content' }, { status: 500 });
  }
} 