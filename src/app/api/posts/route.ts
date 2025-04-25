import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Define the path to the blog content directory
    const postsDirectory = path.join(process.cwd(), 'content/blog');

    // Check if the directory exists
    if (!fs.existsSync(postsDirectory)) {
      // If not, create it
      fs.mkdirSync(postsDirectory, { recursive: true });
      console.log(`Created directory: ${postsDirectory}`);
      // Return an empty list as there are no posts yet
      return NextResponse.json({ posts: [] });
    }

    // Read the directory contents
    const filenames = fs.readdirSync(postsDirectory);

    // Filter for markdown files and extract slugs (remove .md extension)
    const posts = filenames
      .filter(filename => filename.endsWith('.md'))
      .map(filename => ({
        slug: filename.replace(/\.md$/, ''),
        title: filename.replace(/\.md$/, '').replace(/-/g, ' '), // Simple title generation
      }));

    return NextResponse.json({ posts });

  } catch (error) {
    console.error("Error reading blog posts:", error);
    // Return an error response
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
  }
} 