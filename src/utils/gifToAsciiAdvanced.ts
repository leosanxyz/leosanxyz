import { GifReader } from 'omggif';
import fs from 'fs';
import path from 'path';

// Character map with precise brightness values (inspired by gif-for-cli)
const CHAR_MAP: { char: string; brightness: number }[] = [
  { char: ' ', brightness: 0 },
  { char: '.', brightness: 0.1 },
  { char: ':', brightness: 0.15 },
  { char: '-', brightness: 0.2 },
  { char: '=', brightness: 0.3 },
  { char: '+', brightness: 0.4 },
  { char: '*', brightness: 0.5 },
  { char: '#', brightness: 0.65 },
  { char: '%', brightness: 0.8 },
  { char: '@', brightness: 1.0 },
];

// More detailed character set for high-res conversion
const DETAILED_CHARS = ' .`\'^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

// Get character that best matches brightness
function getCharForBrightness(brightness: number, detailed: boolean = false): string {
  if (detailed) {
    const index = Math.floor(brightness * (DETAILED_CHARS.length - 1));
    return DETAILED_CHARS[index];
  }
  
  // Find closest match in char map
  let closest = CHAR_MAP[0];
  let minDiff = Math.abs(brightness - closest.brightness);
  
  for (const entry of CHAR_MAP) {
    const diff = Math.abs(brightness - entry.brightness);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  
  return closest.char;
}

// Sample multiple pixels for better accuracy (supersampling)
function samplePixel(
  data: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  sampleSize: number = 2
): { r: number; g: number; b: number } {
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;
  
  const halfSample = Math.floor(sampleSize / 2);
  
  for (let dy = -halfSample; dy <= halfSample; dy++) {
    for (let dx = -halfSample; dx <= halfSample; dx++) {
      const sx = Math.max(0, Math.min(width - 1, x + dx));
      const sy = Math.max(0, Math.min(height - 1, y + dy));
      const idx = (sy * width + sx) * 4;
      
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
      count++;
    }
  }
  
  return {
    r: totalR / count,
    g: totalG / count,
    b: totalB / count
  };
}

// Convert with proper aspect ratio handling
export function frameToAsciiAdvanced(
  frameData: Uint8Array,
  width: number,
  height: number,
  options: {
    cols?: number;
    rows?: number;
    detailed?: boolean;
    contrast?: number;
    invert?: boolean;
  } = {}
): string {
  const {
    cols = 100,
    detailed = false,
    contrast = 1.2,
    invert = false
  } = options;
  
  // Calculate rows based on aspect ratio
  // Terminal characters are typically 2x taller than wide
  const charAspectRatio = 0.5;
  const imageAspectRatio = width / height;
  const rows = options.rows || Math.round(cols / imageAspectRatio * charAspectRatio);
  
  // Calculate step sizes
  const xStep = width / cols;
  const yStep = height / rows;
  
  let ascii = '';
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Sample pixel with supersampling
      const sourceX = Math.floor(x * xStep);
      const sourceY = Math.floor(y * yStep);
      const pixel = samplePixel(frameData, sourceX, sourceY, width, height);
      
      // Calculate brightness using proper luminance formula
      let brightness = (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b) / 255;
      
      // Apply contrast
      brightness = Math.pow(brightness, contrast);
      
      // Always invert brightness for proper mapping
      // This ensures dark pixels in GIF become light characters (spaces)
      // and light pixels become dark characters (@, #, etc)
      brightness = 1 - brightness;
      
      // Apply additional inversion if specified
      if (invert) {
        brightness = 1 - brightness;
      }
      
      // Get ASCII character
      ascii += getCharForBrightness(brightness, detailed);
    }
    ascii += '\n';
  }
  
  return ascii.trim();
}

// Process GIF with optimizations
export async function gifToAsciiOptimized(
  gifPath: string,
  options: {
    cols?: number;
    detailed?: boolean;
    maxFrames?: number;
    invert?: boolean;
  } = {}
): Promise<{ frames: string[]; frameDelay: number }> {
  try {
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    const totalFrames = reader.numFrames();
    const frameCount = Math.min(totalFrames, options.maxFrames || 100);
    const frames: string[] = [];
    
    console.log(`Processing GIF: ${totalFrames} total frames, converting ${frameCount} frames`);
    
    // Calculate average frame delay
    let totalDelay = 0;
    for (let i = 0; i < frameCount; i++) {
      const frameInfo = reader.frameInfo(i);
      totalDelay += frameInfo.delay || 10;
    }
    const avgDelay = (totalDelay / frameCount) * 10; // Convert to ms
    
    // Process frames with smart sampling for large GIFs
    if (totalFrames > (options.maxFrames || 100)) {
      // Sample frames evenly across the GIF
      const step = totalFrames / frameCount;
      console.log(`Sampling every ${step.toFixed(1)} frames`);
      
      for (let i = 0; i < frameCount; i++) {
        const frameIndex = Math.floor(i * step);
        const frameData = new Uint8Array(reader.width * reader.height * 4);
        reader.decodeAndBlitFrameRGBA(frameIndex, frameData);
        
        const asciiFrame = frameToAsciiAdvanced(frameData, reader.width, reader.height, {
          cols: options.cols || 100,
          detailed: options.detailed || false,
          contrast: 1.5,
          invert: options.invert || false
        });
        
        frames.push(asciiFrame);
      }
    } else {
      // Process all frames if under the limit
      for (let i = 0; i < frameCount; i++) {
        const frameData = new Uint8Array(reader.width * reader.height * 4);
        reader.decodeAndBlitFrameRGBA(i, frameData);
        
        const asciiFrame = frameToAsciiAdvanced(frameData, reader.width, reader.height, {
          cols: options.cols || 100,
          detailed: options.detailed || false,
          contrast: 1.5,
          invert: options.invert || false
        });
        
        frames.push(asciiFrame);
      }
    }
    
    return { frames, frameDelay: avgDelay };
  } catch (error) {
    console.error('Error processing GIF:', error);
    return { frames: [], frameDelay: 100 };
  }
}

// Cache with size limit
class FrameCache {
  private cache = new Map<string, { frames: string[]; frameDelay: number; timestamp: number }>();
  private maxSize = 5; // Reduced max cached GIFs to save memory
  
  get(key: string): { frames: string[]; frameDelay: number } | null {
    const entry = this.cache.get(key);
    if (entry) {
      // Update timestamp
      entry.timestamp = Date.now();
      return { frames: entry.frames, frameDelay: entry.frameDelay };
    }
    return null;
  }
  
  set(key: string, data: { frames: string[]; frameDelay: number }): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      let oldestKey = '';
      let oldestTime = Infinity;
      
      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, { ...data, timestamp: Date.now() });
  }
}

const frameCache = new FrameCache();

// Analyze GIF to determine if it needs color inversion
async function shouldInvertGif(gifPath: string): Promise<boolean> {
  try {
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    // Analyze first frame
    const frameData = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(0, frameData);
    
    // Calculate average brightness of edges vs center
    let edgeBrightness = 0;
    let centerBrightness = 0;
    let edgeCount = 0;
    let centerCount = 0;
    
    const edgeThreshold = Math.min(reader.width, reader.height) * 0.1;
    
    for (let y = 0; y < reader.height; y++) {
      for (let x = 0; x < reader.width; x++) {
        const idx = (y * reader.width + x) * 4;
        const brightness = (frameData[idx] + frameData[idx + 1] + frameData[idx + 2]) / 3 / 255;
        
        // Check if pixel is on edge
        if (x < edgeThreshold || x > reader.width - edgeThreshold ||
            y < edgeThreshold || y > reader.height - edgeThreshold) {
          edgeBrightness += brightness;
          edgeCount++;
        } else {
          centerBrightness += brightness;
          centerCount++;
        }
      }
    }
    
    const avgEdgeBrightness = edgeBrightness / edgeCount;
    const avgCenterBrightness = centerBrightness / centerCount;
    
    // Since we now always invert in the conversion, we need to detect
    // when we should NOT apply the additional inversion
    // If the image has light background (edges bright), don't double-invert
    const needsInversion = avgEdgeBrightness > 0.7;
    
    console.log(`GIF analysis for ${path.basename(gifPath)}:
      Edge brightness: ${avgEdgeBrightness.toFixed(2)}
      Center brightness: ${avgCenterBrightness.toFixed(2)}
      Needs inversion: ${needsInversion}`);
    
    return needsInversion;
  } catch (error) {
    console.error('Error analyzing GIF:', error);
    return false;
  }
}

// Export function with caching
export async function getOptimizedAsciiFrames(slug: string): Promise<{ frames: string[]; frameDelay: number } | null> {
  const gifsDir = path.join(process.cwd(), 'content/gifs');
  const gifPath = path.join(gifsDir, `${slug}.gif`);
  
  if (!fs.existsSync(gifPath)) {
    return null;
  }
  
  // Check cache
  const cached = frameCache.get(slug);
  if (cached) {
    return cached;
  }
  
  // Analyze first frame to determine if inversion is needed
  const needsInversion = await shouldInvertGif(gifPath);
  
  // Process and cache
  const result = await gifToAsciiOptimized(gifPath, {
    cols: 100,
    detailed: false,
    maxFrames: 200, // Increased limit to capture full GIF
    invert: needsInversion
  });
  
  if (result.frames.length > 0) {
    frameCache.set(slug, result);
  }
  
  return result;
}