"use client";
import React, { useEffect, useRef, useState } from "react";

interface ScrambleInProps {
  text: string;
  scrambleSpeed?: number;
  scrambledLetterCount?: number;
  autoStart?: boolean;
  className?: string;
  scrambledClassName?: string;
  characters?: string;
  onStart?: () => void;
  onComplete?: () => void;
}

const defaultCharacters =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:',.<>/?";

const ScrambleIn: React.FC<ScrambleInProps> = ({
  text,
  scrambleSpeed = 50,
  scrambledLetterCount = 8,
  autoStart = true,
  className,
  scrambledClassName,
  characters = defaultCharacters,
  onStart,
  onComplete,
}) => {
  const [display, setDisplay] = useState<string[]>(() =>
    Array(text.length).fill("")
  );
  const frameRef = useRef<number | null>(null);
  const idxRef = useRef<number>(0);

  const start = () => {
    onStart?.();
    idxRef.current = 0;
    const total = text.length;

    const scramble = () => {
      const currentIdx = idxRef.current;
      const revealed = text.slice(0, currentIdx).split("");
      const scrambleCount = Math.min(
        scrambledLetterCount,
        total - currentIdx
      );
      const scrambled = Array.from({ length: scrambleCount }, () =>
        characters.charAt(Math.floor(Math.random() * characters.length))
      );
      const rest = Array(total - currentIdx - scrambleCount).fill("");
      setDisplay([...revealed, ...scrambled, ...rest]);

      if (currentIdx < total) {
        idxRef.current = currentIdx + 1;
        frameRef.current = window.setTimeout(scramble, scrambleSpeed);
      } else {
        onComplete?.();
      }
    };
    scramble();
  };

  useEffect(() => {
    if (autoStart) {
      start();
    }
    return () => {
      if (frameRef.current) {
        clearTimeout(frameRef.current);
      }
    };
  }, [text]);

  return (
    <span className={className}>
      {display.map((char, i) => {
        const isScrambled = char !== text[i];
        return (
          <span
            key={i}
            className={isScrambled ? scrambledClassName : undefined}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
};

export default ScrambleIn; 