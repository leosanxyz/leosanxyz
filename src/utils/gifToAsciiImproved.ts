import { GifReader } from 'omggif';
import fs from 'fs';
import path from 'path';

// ASCII characters optimized for the style shown in the example
// Ordered from darkest to lightest for proper mapping
const ASCII_CHARS = ' .:=-+*#%@';
const DENSE_CHARS = ' :-=+*#%@'; // Without dots for denser look

// Edge detection kernel (Sobel operator)
const SOBEL_X = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 0, 1]
];

const SOBEL_Y = [
  [-1, -2, -1],
  [0, 0, 0],
  [1, 2, 1]
];

// Apply edge detection to enhance details
function detectEdges(imageData: Uint8Array, width: number, height: number): Float32Array {
  const edges = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      // Apply Sobel operator
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const brightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
          
          gx += brightness * SOBEL_X[ky + 1][kx + 1];
          gy += brightness * SOBEL_Y[ky + 1][kx + 1];
        }
      }
      
      const edgeStrength = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = Math.min(edgeStrength / 255, 1);
    }
  }
  
  return edges;
}

// Enhanced pixel to ASCII conversion
function pixelToAsciiEnhanced(
  r: number, 
  g: number, 
  b: number, 
  edgeStrength: number = 0,
  useDense: boolean = true
): string {
  // Calculate brightness with better luminance weights
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Apply stronger contrast for the dense style
  const enhanced = Math.pow(brightness, 1.2);
  
  // Weight edges more heavily for sharper details
  const combined = enhanced * 0.6 + edgeStrength * 0.4;
  
  // Use dense character set for this style
  const chars = useDense ? DENSE_CHARS : ASCII_CHARS;
  
  // Map to ASCII character - note the order is now light to dark
  const index = Math.floor(combined * (chars.length - 1));
  return chars[index];
}

// Apply Floyd-Steinberg dithering for better gradients
function applyDithering(imageData: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(imageData);
  
  for (let y = 0; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Get current pixel
      const oldR = result[idx];
      const oldG = result[idx + 1];
      const oldB = result[idx + 2];
      
      // Quantize to limited palette
      const levels = 8;
      const newR = Math.round(oldR / 255 * levels) * (255 / levels);
      const newG = Math.round(oldG / 255 * levels) * (255 / levels);
      const newB = Math.round(oldB / 255 * levels) * (255 / levels);
      
      result[idx] = newR;
      result[idx + 1] = newG;
      result[idx + 2] = newB;
      
      // Calculate error
      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;
      
      // Distribute error to neighbors
      // Right pixel (7/16)
      if (x < width - 1) {
        const rightIdx = idx + 4;
        result[rightIdx] = Math.max(0, Math.min(255, result[rightIdx] + errR * 7 / 16));
        result[rightIdx + 1] = Math.max(0, Math.min(255, result[rightIdx + 1] + errG * 7 / 16));
        result[rightIdx + 2] = Math.max(0, Math.min(255, result[rightIdx + 2] + errB * 7 / 16));
      }
      
      // Bottom-left pixel (3/16)
      if (y < height - 1 && x > 0) {
        const blIdx = ((y + 1) * width + (x - 1)) * 4;
        result[blIdx] = Math.max(0, Math.min(255, result[blIdx] + errR * 3 / 16));
        result[blIdx + 1] = Math.max(0, Math.min(255, result[blIdx + 1] + errG * 3 / 16));
        result[blIdx + 2] = Math.max(0, Math.min(255, result[blIdx + 2] + errB * 3 / 16));
      }
      
      // Bottom pixel (5/16)
      if (y < height - 1) {
        const bIdx = ((y + 1) * width + x) * 4;
        result[bIdx] = Math.max(0, Math.min(255, result[bIdx] + errR * 5 / 16));
        result[bIdx + 1] = Math.max(0, Math.min(255, result[bIdx + 1] + errG * 5 / 16));
        result[bIdx + 2] = Math.max(0, Math.min(255, result[bIdx + 2] + errB * 5 / 16));
      }
      
      // Bottom-right pixel (1/16)
      if (y < height - 1 && x < width - 1) {
        const brIdx = ((y + 1) * width + (x + 1)) * 4;
        result[brIdx] = Math.max(0, Math.min(255, result[brIdx] + errR * 1 / 16));
        result[brIdx + 1] = Math.max(0, Math.min(255, result[brIdx + 1] + errG * 1 / 16));
        result[brIdx + 2] = Math.max(0, Math.min(255, result[brIdx + 2] + errB * 1 / 16));
      }
    }
  }
  
  return result;
}

// Convert frame to ASCII with edge detection
export function frameToAsciiEnhanced(
  frameData: Uint8Array,
  width: number,
  height: number,
  targetWidth: number = 100,
  targetHeight: number = 35,
  useDithering: boolean = true
): string {
  // Calculate aspect ratio correctly
  const aspectRatio = width / height;
  const charAspectRatio = 0.5;
  
  // Maintain aspect ratio
  if (aspectRatio > targetWidth / targetHeight * charAspectRatio) {
    targetHeight = Math.round(targetWidth / (aspectRatio * charAspectRatio));
  } else {
    targetWidth = Math.round(targetHeight * aspectRatio * charAspectRatio);
  }
  
  // Apply dithering if enabled
  const processedData = useDithering ? applyDithering(frameData, width, height) : frameData;
  
  // Detect edges for enhanced detail
  const edges = detectEdges(processedData, width, height);
  
  // Calculate sampling intervals
  const xInterval = width / targetWidth;
  const yInterval = height / targetHeight;
  
  let ascii = '';
  
  for (let y = 0; y < targetHeight; y++) {
    let line = '';
    for (let x = 0; x < targetWidth; x++) {
      // Sample position
      const sampleX = Math.floor(x * xInterval);
      const sampleY = Math.floor(y * yInterval);
      
      // Get pixel data from processed image
      const idx = (sampleY * width + sampleX) * 4;
      const r = processedData[idx] || 0;
      const g = processedData[idx + 1] || 0;
      const b = processedData[idx + 2] || 0;
      
      // Get edge strength
      const edgeIdx = sampleY * width + sampleX;
      const edgeStrength = edges[edgeIdx] || 0;
      
      // Convert to ASCII with dense characters
      line += pixelToAsciiEnhanced(r, g, b, edgeStrength, true);
    }
    ascii += line + '\n';
  }
  
  return ascii.trim();
}

// Convert GIF to ASCII frames with enhanced algorithm
export async function gifToAsciiFramesEnhanced(gifPath: string): Promise<string[]> {
  try {
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    const frames: string[] = [];
    const frameCount = reader.numFrames();
    
    for (let i = 0; i < frameCount; i++) {
      const frameData = new Uint8Array(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(i, frameData);
      
      // Convert with enhanced algorithm
      const asciiFrame = frameToAsciiEnhanced(
        frameData, 
        reader.width, 
        reader.height,
        100,  // Match the example width
        35    // Reasonable height
      );
      
      frames.push(asciiFrame);
    }
    
    return frames;
  } catch (error) {
    console.error('Error converting GIF to ASCII:', error);
    return [];
  }
}

// Analyze GIF to determine best conversion settings
function analyzeGif(frameData: Uint8Array): { 
  targetWidth: number; 
  targetHeight: number;
  style: 'dense' | 'detailed';
} {
  // Calculate average brightness
  let totalBrightness = 0;
  const sampleSize = Math.min(1000, frameData.length / 4);
  
  for (let i = 0; i < sampleSize; i++) {
    const idx = i * 4;
    const brightness = (frameData[idx] + frameData[idx + 1] + frameData[idx + 2]) / 3;
    totalBrightness += brightness;
  }
  
  const avgBrightness = totalBrightness / sampleSize / 255;
  
  // Determine style based on content
  // Dark images with high contrast work better with dense style
  const style = avgBrightness < 0.5 ? 'dense' : 'detailed';
  
  // Different dimensions for different styles
  if (style === 'dense') {
    return { targetWidth: 100, targetHeight: 30, style };
  } else {
    return { targetWidth: 100, targetHeight: 35, style };
  }
}

// Convert GIF with automatic style detection
export async function gifToAsciiFramesAuto(gifPath: string): Promise<string[]> {
  try {
    const gifData = fs.readFileSync(gifPath);
    const reader = new GifReader(new Uint8Array(gifData));
    
    // Analyze first frame to determine style
    const firstFrame = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(0, firstFrame);
    const settings = analyzeGif(firstFrame);
    
    const frames: string[] = [];
    const frameCount = reader.numFrames();
    
    for (let i = 0; i < frameCount; i++) {
      const frameData = new Uint8Array(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(i, frameData);
      
      // Convert with detected settings
      const asciiFrame = frameToAsciiEnhanced(
        frameData, 
        reader.width, 
        reader.height,
        settings.targetWidth,
        settings.targetHeight
      );
      
      frames.push(asciiFrame);
    }
    
    return frames;
  } catch (error) {
    console.error('Error converting GIF to ASCII:', error);
    return [];
  }
}

// Export enhanced version with auto-detection
export async function getEnhancedAsciiFrames(slug: string): Promise<string[] | null> {
  const gifsDir = path.join(process.cwd(), 'content/gifs');
  const gifPath = path.join(gifsDir, `${slug}.gif`);
  
  if (!fs.existsSync(gifPath)) {
    return null;
  }
  
  return await gifToAsciiFramesAuto(gifPath);
}