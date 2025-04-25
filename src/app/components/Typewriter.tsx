"use client";
import React, { useState, useEffect, useRef } from "react";

interface TypewriterProps {
  text: string;
  speed?: number;           // milliseconds per character
  initialDelay?: number;    // delay before starting typing
  onComplete?: () => void;  // optional callback when typing finishes
  className?: string;       // wrapper CSS classes
  cursorChar?: string;      // character to use as cursor
}

const Typewriter: React.FC<TypewriterProps> = ({
  text,
  speed = 50,
  initialDelay = 0,
  onComplete,
  className,
  cursorChar = "|",
}) => {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const startTyping = () => {
      if (indexRef.current < text.length) {
        timeoutRef.current = window.setTimeout(() => {
          setDisplayed((prev) => prev + text[indexRef.current]);
          indexRef.current += 1;
          startTyping();
        }, speed);
      } else {
        onComplete?.();
      }
    };

    // start after initial delay
    const initTimer = window.setTimeout(startTyping, initialDelay);

    return () => {
      clearTimeout(initTimer);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      indexRef.current = 0;
      setDisplayed("");
    };
  }, [text]);

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {displayed}
      <span style={{ marginLeft: '2px' }}>{cursorChar}</span>
    </span>
  );
};

export default Typewriter; 