"use client";
import React, { useState, useEffect } from "react";

interface AsciiAnimationProps {
  darkMode: boolean;
  customFrames?: string[];
  postTitle?: string;
  frameDelay?: number;
}

const AsciiAnimation: React.FC<AsciiAnimationProps> = ({ darkMode, customFrames, postTitle, frameDelay = 100 }) => {
  const [frame, setFrame] = useState(0);
  const [textFrame, setTextFrame] = useState(0);
  
  // ASCII art frames for animation
  const defaultFrames = [
    `
         .-..-. 
        /  o o \\
       |   >   |
       |  ___  |
        \\_____/
         |   |
      ___| | |___
     /   | | |   \\
    /    |_|_|    \\
         d   b
    `,
    `
         .-..-. 
        /  - - \\
       |   >   |
       |  ___  |
        \\_____/
         |   |
      ___| | |___
     /   | | |   \\
    /    |_|_|    \\
         d   b
    `,
    `
         .-..-. 
        /  o o \\
       |   >   |
       |  ___  |
        \\_____/
         |   |
      ___| | |___
     /   | | |   \\
    /    |_|_|    \\
         d   b
    `,
    `
         .-..-. 
        /  ^ ^ \\
       |   >   |
       |  \\__/ |
        \\_____/
         |   |
      ___| | |___
     /   | | |   \\
    /    |_|_|    \\
         d   b
    `,
  ];

  const frames = customFrames || defaultFrames;

  // Matrix rain effect
  const [matrixChars, setMatrixChars] = useState<Array<{char: string, y: number, speed: number}>>([]);
  const matrixSymbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+-=[]{}|;:,.<>?";
  
  useEffect(() => {
    // Initialize matrix rain
    const chars = Array.from({ length: 20 }, (_, i) => ({
      char: matrixSymbols[Math.floor(Math.random() * matrixSymbols.length)],
      y: Math.random() * -100,
      speed: Math.random() * 2 + 1
    }));
    setMatrixChars(chars);
  }, []);

  // Separate effects for GIF animation and text animation
  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
      
      // Update matrix rain
      setMatrixChars(prev => prev.map(char => {
        const newY = char.y + char.speed;
        if (newY > 100) {
          return {
            char: matrixSymbols[Math.floor(Math.random() * matrixSymbols.length)],
            y: -10,
            speed: Math.random() * 2 + 1
          };
        }
        return { ...char, y: newY };
      }));
    }, frameDelay); // Use actual frame delay from GIF

    return () => clearInterval(interval);
  }, [frames.length, frameDelay]);

  // Separate interval for text animation (slower)
  useEffect(() => {
    const textInterval = setInterval(() => {
      setTextFrame((prev) => prev + 1);
    }, 2000); // Change text every 2 seconds

    return () => clearInterval(textInterval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      left: '10px',
      top: '50%',
      transform: 'translateY(-50%)',
      fontFamily: 'Courier New, Consolas, Monaco, monospace',
      fontSize: '5px',
      lineHeight: '5px',
      letterSpacing: '0px',
      color: darkMode ? '#ffffff' : '#000000',
      opacity: 1,
      pointerEvents: 'none',
      whiteSpace: 'pre',
      overflow: 'hidden',
      width: '650px',
      height: '400px',
    }}>
      {/* Matrix rain background - disabled for better ASCII visibility */}
      {false && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {matrixChars.map((char, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(i % 10) * 40}px`,
                top: `${char.y}%`,
                opacity: Math.max(0.3, 1 - char.y / 100),
                color: darkMode ? '#10b981' : '#059669',
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              {char.char}
            </span>
          ))}
        </div>
      )}
      
      {/* ASCII character */}
      <div style={{ 
        position: 'relative', 
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
      }}>
        <pre style={{ 
          margin: 0, 
          fontSize: 'inherit',
          fontWeight: 'normal',
          color: darkMode ? '#e5e7eb' : '#374151',
        }}>{frames[frame]}</pre>
      </div>
      
      {/* Decorative elements */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '10px', fontSize: '20px', fontWeight: 'bold' }}>
          {postTitle === '¿por qué corres?' 
            ? (textFrame % 2 === 0 ? '< running >' : '< breathing >') 
            : postTitle === 'tienes la paciencia de los ojos sobre las grietas'
            ? (textFrame % 2 === 0 ? '< watching >' : '< waiting >')
            : (textFrame % 2 === 0 ? '< coding >' : '< creating >')
          }
        </div>
        <div style={{ fontSize: '14px' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} style={{ opacity: i === frame % 5 ? 1 : 0.4 }}>● </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AsciiAnimation;