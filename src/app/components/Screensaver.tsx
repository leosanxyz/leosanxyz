"use client";
import { useEffect, useState, useRef, useCallback } from "react";
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

export default function Screensaver({ darkMode }: ScreensaverProps) {
   const [bouncingImages, setBouncingImages] = useState<BouncingImage[]>([]);
   const [loading, setLoading] = useState(true);
   const [velocity, setVelocity] = useState({ x: 3, y: 2 });
   const animationRef = useRef<number>(0);
   const positionHistory = useRef<{ x: number; y: number }[]>([]);
   const currentPosition = useRef({ x: 100, y: 100 });
   const allImages = useRef<string[]>([]);

   const windowSize = useWindowSize();
   const isMobile = windowSize.width < 768;

   const fetchArenaImages = useCallback(() => {
     return fetch('/api/arena')
       .then(res => res.json())
       .then(data => {
         if (data.images && data.images.length > 0) {
           allImages.current = data.images;
           
           // Create multiple bouncing images
           const bouncing: BouncingImage[] = [];
           const numImages = isMobile ? Math.min(5, data.images.length) : Math.min(15, data.images.length); // 5 for mobile, 15 for desktop
           const imageSize = isMobile ? 150 : 250; // Smaller size for mobile
           
           console.log('isMobile:', isMobile, 'numImages:', numImages, 'window width:', windowSize.width);
           
           // Initialize position history
           const initialX = Math.random() * (windowSize.width - imageSize);
           const initialY = Math.random() * (windowSize.height - imageSize);
           currentPosition.current = { x: initialX, y: initialY };
           
           // Create initial positions for all images
           for (let i = 0; i < numImages * 20; i++) {
             positionHistory.current.push({ x: initialX, y: initialY });
           }
           
           // Images are already shuffled by the API
           for (let i = 0; i < numImages; i++) {
             // Use images in order (already randomized), cycling through if needed
             const imageIndex = i % data.images.length;
             bouncing.push({
               id: i,
               imageUrl: data.images[imageIndex],
               position: positionHistory.current[i * 20] || { x: initialX, y: initialY }
             });
           }
           
           setBouncingImages(bouncing);
           
           // Random initial velocity - slower for mobile
           const speedMultiplier = isMobile ? 3 : 6;
           setVelocity({
             x: (Math.random() - 0.5) * speedMultiplier,
             y: (Math.random() - 0.5) * speedMultiplier
           });
         }
         setLoading(false);
         return data.images;
       })
       .catch(error => {
         console.error('Error:', error);
         setLoading(false);
         return [];
       });
   }, [isMobile, windowSize.width, windowSize.height]);

   useEffect(() => {
     fetchArenaImages();
   }, [fetchArenaImages]);


   useEffect(() => {
     if (bouncingImages.length === 0) return;

     // Animation loop
     const animate = () => {
       const prev = currentPosition.current;
       let newX = prev.x + velocity.x;
       let newY = prev.y + velocity.y;
       let newVelX = velocity.x;
       let newVelY = velocity.y;

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

      setVelocity({ x: newVelX, y: newVelY });
      
      // Update current position
      currentPosition.current = { x: newX, y: newY };
      
      // Update position history
      positionHistory.current.unshift({ x: newX, y: newY });
      if (positionHistory.current.length > bouncingImages.length * 20) {
        positionHistory.current.pop();
      }
      
      // Update all following images
      setBouncingImages(prevImages => 
        prevImages.map((img, index) => ({
          ...img,
          position: positionHistory.current[index * 20] || { x: newX, y: newY }
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
   }, [bouncingImages.length, velocity, isMobile, windowSize.width, windowSize.height]);

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
