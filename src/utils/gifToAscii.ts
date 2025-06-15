import { GifReader } from 'omggif';
import fs from 'fs';
import path from 'path';

// Extended ASCII characters from dark to light for better detail
// Using characters that match the style of the provided example
const ASCII_CHARS = ' .:-=+*#%@';
// const DETAILED_CHARS = ' .::-==+++***###%%%@@@';
const BLOCK_CHARS = ' ░▒▓█';
// const SIMPLE_CHARS = ' .,:;i1tfLCG08@';

// Convert a pixel's brightness to an ASCII character with better contrast
function pixelToAscii(r: number, g: number, b: number, useBlocks: boolean = false): string {
  // Calculate brightness using luminance formula for better accuracy
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
  
  // Apply gamma correction for better contrast
  const normalizedBrightness = Math.pow(brightness / 255, 0.6);
  
  const chars = useBlocks ? BLOCK_CHARS : ASCII_CHARS;
  // Map brightness to ASCII character index with better distribution
  const index = Math.floor(normalizedBrightness * (chars.length - 1));
  return chars[chars.length - 1 - index]; // Invert for dark background
}

// Convert a frame buffer to ASCII art
function frameToAscii(
  frameData: Uint8Array,
  width: number,
  height: number,
  targetWidth: number = 40,  // Doubled from 20
  targetHeight: number = 30  // Doubled from 15
): string {
  const aspectRatio = width / height;
  const charAspectRatio = 0.5; // ASCII characters are typically twice as tall as wide
  
  // Calculate actual dimensions maintaining aspect ratio
  const effectiveAspectRatio = aspectRatio * charAspectRatio;
  
  if (width > height) {
    // Landscape: fix width, calculate height
    targetHeight = Math.round(targetWidth / effectiveAspectRatio);
  } else {
    // Portrait: fix height, calculate width
    targetWidth = Math.round(targetHeight * effectiveAspectRatio);
  }
  
  // Calculate sampling intervals
  const xInterval = Math.floor(width / targetWidth);
  const yInterval = Math.floor(height / targetHeight);
  
  let ascii = '';
  
  for (let y = 0; y < height; y += yInterval) {
    let line = '';
    for (let x = 0; x < width; x += xInterval) {
      const idx = (y * width + x) * 4;
      const r = frameData[idx];
      const g = frameData[idx + 1];
      const b = frameData[idx + 2];
      
      line += pixelToAscii(r, g, b, false);
    }
    if (line.length > 0) {
      ascii += line + '\n';
    }
  }
  
  return ascii.trim();
}

// Convert GIF file to ASCII frames
export async function gifToAsciiFrames(gifPath: string): Promise<string[]> {
  try {
    // Read GIF file
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    const frames: string[] = [];
    const frameCount = reader.numFrames();
    
    // Process each frame
    for (let i = 0; i < frameCount; i++) {
      // const frameInfo = reader.frameInfo(i);
      const frameData = new Uint8Array(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(i, frameData);
      
      // Convert frame to ASCII
      const asciiFrame = frameToAscii(frameData, reader.width, reader.height);
      frames.push(asciiFrame);
    }
    
    return frames;
  } catch (error) {
    console.error('Error converting GIF to ASCII:', error);
    return [];
  }
}

// Configuration for ASCII conversion quality
export interface AsciiConfig {
  width?: number;
  height?: number;
  useBlocks?: boolean;
}

// Convert GIF with custom configuration
export async function gifToAsciiFramesWithConfig(
  gifPath: string, 
  config: AsciiConfig = {}
): Promise<string[]> {
  try {
    const { width = 50, height = 35 } = config;
    
    // Read GIF file
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    const frames: string[] = [];
    const frameCount = reader.numFrames();
    
    // Process each frame
    for (let i = 0; i < frameCount; i++) {
      // const frameInfo = reader.frameInfo(i);
      const frameData = new Uint8Array(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(i, frameData);
      
      // Convert frame to ASCII with custom dimensions
      const asciiFrame = frameToAscii(frameData, reader.width, reader.height, width, height);
      frames.push(asciiFrame);
    }
    
    return frames;
  } catch (error) {
    console.error('Error converting GIF to ASCII:', error);
    return [];
  }
}

// Get ASCII frames for a post slug
export async function getAsciiFramesForPost(slug: string): Promise<string[] | null> {
  const gifsDir = path.join(process.cwd(), 'content/gifs');
  const gifPath = path.join(gifsDir, `${slug}.gif`);
  
  // Check if GIF exists for this post
  if (!fs.existsSync(gifPath)) {
    return null;
  }
  
  // Convert with very high resolution for real-life videos
  return await gifToAsciiFramesWithConfig(gifPath, {
    width: 100,   // Very high resolution to match example
    height: 35,   // Will be adjusted based on aspect ratio
    useBlocks: false
  });
}

// Cache for converted ASCII frames to avoid reprocessing
const asciiCache = new Map<string, { frames: string[], frameDelay?: number }>();

// Get frame timing information from GIF
export async function getGifInfo(gifPath: string): Promise<{ frames: string[], frameDelay: number }> {
  try {
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    // Get average frame delay (in centiseconds)
    let totalDelay = 0;
    for (let i = 0; i < reader.numFrames(); i++) {
      // const frameInfo = reader.frameInfo(i);
      totalDelay += frameInfo.delay || 10; // Default to 10cs (100ms) if no delay specified
    }
    const avgDelay = totalDelay / reader.numFrames();
    
    // Convert to milliseconds
    const frameDelayMs = avgDelay * 10;
    
    // Get frames with very high resolution to match the example
    const frames = await gifToAsciiFramesWithConfig(gifPath, {
      width: 100,
      height: 35,
      useBlocks: false
    });
    
    return { frames, frameDelay: frameDelayMs };
  } catch (error) {
    console.error('Error getting GIF info:', error);
    return { frames: [], frameDelay: 100 };
  }
}

export async function getCachedAsciiFrames(slug: string): Promise<string[] | null> {
  // Check cache first
  if (asciiCache.has(slug)) {
    return asciiCache.get(slug)!.frames;
  }
  
  // Convert GIF if not cached
  const frames = await getAsciiFramesForPost(slug);
  if (frames && frames.length > 0) {
    asciiCache.set(slug, { frames });
  }
  
  return frames;
}