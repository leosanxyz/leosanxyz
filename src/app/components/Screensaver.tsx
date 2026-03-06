"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useWindowSize } from '@/hooks';

interface ScreensaverProps {
  darkMode: boolean;
}

interface BouncingImage {
  id: number;
  imageUrl: string;
  position: { x: number; y: number };
}

const TRAIL_STEP = 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function Screensaver({ darkMode }: ScreensaverProps) {
   const [bouncingImages, setBouncingImages] = useState<BouncingImage[]>([]);
   const [loading, setLoading] = useState(true);
   const animationRef = useRef<number>(0);
   const velocityRef = useRef({ x: 3, y: 2 });
   const positionHistory = useRef<{ x: number; y: number }[]>([]);
   const currentPosition = useRef({ x: 100, y: 100 });
   const allImages = useRef<string[]>([]);

   const windowSize = useWindowSize();
   const isMobile = windowSize.width < 768;

   useEffect(() => {
     const controller = new AbortController();
     let isActive = true;

     const initializeScreensaver = async () => {
       try {
         const viewportWidth = window.innerWidth;
         const viewportHeight = window.innerHeight;
         const mobileLayout = viewportWidth < 768;

         const response = await fetch('/api/arena', { signal: controller.signal });
         const data = await response.json();

         if (!isActive || !data.images || data.images.length === 0) {
           return;
         }

         allImages.current = data.images;

         const bouncing: BouncingImage[] = [];
         const numImages = mobileLayout ? Math.min(5, data.images.length) : Math.min(15, data.images.length);
         const imageSize = mobileLayout ? 150 : 250;
         const maxX = Math.max(0, viewportWidth - imageSize);
         const maxY = Math.max(0, viewportHeight - imageSize);
         const initialX = Math.random() * maxX;
         const initialY = Math.random() * maxY;
         const speedMultiplier = mobileLayout ? 3 : 6;
         const nextVelocity = {
           x: (Math.random() - 0.5) * speedMultiplier || 1.5,
           y: (Math.random() - 0.5) * speedMultiplier || 1,
         };

         currentPosition.current = { x: initialX, y: initialY };
         velocityRef.current = nextVelocity;
         positionHistory.current = Array.from({ length: numImages * TRAIL_STEP }, (_, index) => ({
           x: clamp(initialX - nextVelocity.x * index, 0, maxX),
           y: clamp(initialY - nextVelocity.y * index, 0, maxY),
         }));

         for (let i = 0; i < numImages; i++) {
           const imageIndex = i % data.images.length;
           bouncing.push({
             id: i,
             imageUrl: data.images[imageIndex],
             position: positionHistory.current[i * TRAIL_STEP] || { x: initialX, y: initialY }
           });
         }

         setBouncingImages(bouncing);
       } catch (error) {
         if (error instanceof DOMException && error.name === 'AbortError') {
           return;
         }
         console.error('Error:', error);
       } finally {
         if (isActive) {
           setLoading(false);
         }
       }
     };

     initializeScreensaver();

     return () => {
       isActive = false;
       controller.abort();
     };
   }, []);


   useEffect(() => {
     if (bouncingImages.length === 0) return;

     // Animation loop
     const animate = () => {
       const prev = currentPosition.current;
       const currentVelocity = velocityRef.current;
       let newX = prev.x + currentVelocity.x;
       let newY = prev.y + currentVelocity.y;
       let newVelX = currentVelocity.x;
       let newVelY = currentVelocity.y;

         // Bounce off walls (adjusted for image size)
         const imageSize = isMobile ? 150 : 250;
         let bounced = false;
         if (newX <= 0 || newX >= windowSize.width - imageSize) {
           newVelX = -newVelX;
           newX = Math.max(0, Math.min(newX, windowSize.width - imageSize));
           bounced = true;
         }
         if (newY <= 0 || newY >= windowSize.height - imageSize) {
           newVelY = -newVelY;
           newY = Math.max(0, Math.min(newY, windowSize.height - imageSize));
           bounced = true;
         }
        
        // Rotate images when bouncing
        if (bounced && allImages.current.length > 0) {
          setBouncingImages(prevImages => {
            if (prevImages.length < 2) return prevImages;
            
            // Move first image to the back with a new random image
            const rotatedImages = [...prevImages];
            const firstImage = rotatedImages.shift();
            if (firstImage) {
              // Select a random image that's not currently in the snake
              const currentUrls = new Set(rotatedImages.map(img => img.imageUrl));
              const availableImages = allImages.current.filter(url => !currentUrls.has(url));
              
              // If all images are in use, just use any random image
              const imagePool = availableImages.length > 0 ? availableImages : allImages.current;
              const randomIndex = Math.floor(Math.random() * imagePool.length);
              
              rotatedImages.push({
                ...firstImage,
                imageUrl: imagePool[randomIndex]
              });
            }
            
            return rotatedImages;
          });
        }

      velocityRef.current = { x: newVelX, y: newVelY };
      
      // Update current position
      currentPosition.current = { x: newX, y: newY };
      
      // Update position history
      positionHistory.current.unshift({ x: newX, y: newY });
      if (positionHistory.current.length > bouncingImages.length * TRAIL_STEP) {
        positionHistory.current.pop();
      }
      
      // Update all following images
      setBouncingImages(prevImages => 
        prevImages.map((img, index) => ({
          ...img,
          position: positionHistory.current[index * TRAIL_STEP] || { x: newX, y: newY }
        }))
      );

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

     return () => {
       if (animationRef.current) {
         cancelAnimationFrame(animationRef.current);
       }
     };
   }, [bouncingImages.length, isMobile, windowSize.width, windowSize.height]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: darkMode ? '#000' : '#fff',
        zIndex: 9999
      }}>
        <p style={{ color: darkMode ? '#ccc' : '#555', fontSize: '2rem' }}>
          Cargando...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: darkMode ? '#000' : '#fff',
      zIndex: 9999,
      overflow: 'hidden',
      cursor: 'pointer'
    }}>
      {/* Fixed text in center */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 10000,
        pointerEvents: 'none'
      }}>
        <h1 style={{ 
          fontSize: '3rem', 
          marginBottom: '1rem',
          color: darkMode ? '#fff' : '#000',
          fontFamily: 'monospace',
          textShadow: darkMode 
            ? '0 0 30px rgba(255, 255, 255, 0.8), 0 0 60px rgba(255, 255, 255, 0.4)' 
            : '0 0 30px rgba(0, 0, 0, 0.4)',
          letterSpacing: '0.05em'
        }}>
          sitio aún en construcción :)
        </h1>
        
        <p style={{ 
          color: darkMode ? '#888' : '#666',
          fontSize: '1rem',
          fontStyle: 'italic',
          opacity: 0.8
        }}>
          Haz clic para cerrar
        </p>
      </div>

      {/* Train of images */}
      {bouncingImages.map((img, index) => (
        <div
          key={img.id}
           style={{
             position: 'absolute',
             transform: `translate(${img.position.x}px, ${img.position.y}px)`,
             width: isMobile ? '150px' : '250px',
             height: isMobile ? '150px' : '250px',
             transition: 'none',
             zIndex: 9998 - index,
             willChange: 'transform'
           }}
        >
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '20px',
            boxShadow: darkMode 
              ? '0 15px 40px rgba(255, 255, 255, 0.3)' 
              : '0 15px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <Image
              src={img.imageUrl}
              alt={`Arena image ${img.id}`}
              fill
              sizes="(max-width: 768px) 150px, 250px"
              style={{ objectFit: 'cover' }}
              onError={() => console.error('Failed to load:', img.imageUrl)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
