"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import type { Book } from '@/data/books';

interface BookDetailProps {
  book: Book;
  darkMode: boolean;
  quotes: string[];
  isLoadingQuotes: boolean;
  startRect: DOMRect | null;
  isExiting?: boolean;
  onExitComplete?: () => void;
  getExitTargetRect?: () => DOMRect | null;
  exitCoverPosition?: { 
    top: number; left: number; width: number; height: number;
    viewportTop: number; viewportLeft: number;
  } | null;
  onCoverRef?: (el: HTMLDivElement | null) => void;
}

const BookDetail: React.FC<BookDetailProps> = ({ 
  book, 
  darkMode, 
  quotes, 
  isLoadingQuotes, 
  startRect,
  isExiting = false,
  onExitComplete,
  getExitTargetRect,
  exitCoverPosition,
  onCoverRef,
}) => {
  const textColor = darkMode ? '#eee' : '#111';
  const subTextColor = darkMode ? '#bbb' : '#555';
  const coverRef = useRef<HTMLDivElement>(null);
  const quotesListRef = useRef<HTMLDivElement>(null);
  
  const setCoverRef = useCallback((el: HTMLDivElement | null) => {
    (coverRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    onCoverRef?.(el);
  }, [onCoverRef]);

  const [isAnimating, setIsAnimating] = useState(!!startRect);
  const [isReady, setIsReady] = useState(!startRect);
  const [animationStyle, setAnimationStyle] = useState<React.CSSProperties>({});
  const targetRectRef = useRef<{ scaleX: number; scaleY: number; translateX: number; translateY: number } | null>(null);

  const calculateExitTransform = useCallback(() => {
    if (!startRect || !coverRef.current) return null;
    
    const targetRect = coverRef.current.getBoundingClientRect();
    const scaleX = startRect.width / targetRect.width;
    const scaleY = startRect.height / targetRect.height;
    const translateX = startRect.left - targetRect.left;
    const translateY = startRect.top - targetRect.top;
    
    return { scaleX, scaleY, translateX, translateY };
  }, [startRect]);

  // Entry animation
  useEffect(() => {
    if (!startRect || !coverRef.current) {
      setIsAnimating(false);
      setIsReady(true);
      return;
    }

    const transforms = calculateExitTransform();
    if (!transforms) return;
    
    targetRectRef.current = transforms;
    const { scaleX, scaleY, translateX, translateY } = transforms;

    setAnimationStyle({
      transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
      transition: 'none',
    });

    requestAnimationFrame(() => {
      setIsReady(true);
      
      requestAnimationFrame(() => {
        setAnimationStyle({
          transform: 'translate(0, 0) scale(1)',
          transition: 'transform 450ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        });
        setTimeout(() => setIsAnimating(false), 450);
      });
    });
  }, [startRect, calculateExitTransform]);

  // Exit animation
  useEffect(() => {
    if (!isExiting) return;

    if (!coverRef.current) return;
    
    const startAnimation = () => {
      const targetGalleryRect = getExitTargetRect?.();
      if (!targetGalleryRect || !coverRef.current) {
        onExitComplete?.();
        return;
      }

      // Capture current viewport position BEFORE applying target transform
      const currentRect = coverRef.current.getBoundingClientRect();
      
      // Calculate exactly how much we need to move in viewport pixels
      const scaleX = targetGalleryRect.width / currentRect.width;
      const scaleY = targetGalleryRect.height / currentRect.height;
      const translateX = targetGalleryRect.left - currentRect.left;
      const translateY = targetGalleryRect.top - currentRect.top;

      setIsAnimating(true);
      setAnimationStyle({
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        transition: 'transform 450ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      });

      setTimeout(() => {
        onExitComplete?.();
      }, 450);
    };

    // Wait for scroll restoration (happens in parent's requestAnimationFrame)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        startAnimation();
      });
    });
  }, [isExiting, onExitComplete, getExitTargetRect]);

  useEffect(() => {
    const quotesList = quotesListRef.current;
    if (!quotesList) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);

      if (deltaX > deltaY) {
        event.preventDefault();
      }
    };

    quotesList.addEventListener('touchstart', handleTouchStart, { passive: true });
    quotesList.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      quotesList.removeEventListener('touchstart', handleTouchStart);
      quotesList.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  return (
    <div className="book-detail">
      <div className="book-detail-cover">
        <div
          ref={setCoverRef}
          className="book-detail-cover-wrapper"
          style={{
            ...(isAnimating ? animationStyle : {}),
            opacity: isReady ? 1 : 0,
            zIndex: isExiting ? 1000 : 1,
            ...(isExiting && exitCoverPosition ? {
              position: 'fixed',
              // Use offsets for base positioning because container has transform
              top: exitCoverPosition.top,
              left: exitCoverPosition.left,
              width: exitCoverPosition.width,
              height: exitCoverPosition.height,
            } : {}),
          }}
        >
          <div className={`book-cover book-detail-cover-inner ${darkMode ? 'book-cover--dark' : ''}`}>
            <Image
              src={book.cover}
              alt={book.title}
              fill
              sizes="350px"
              style={{ objectFit: 'cover' }}
              priority
            />
            <div className="book-spine" />
          </div>
        </div>
        <div
          className="book-detail-info"
          style={{
            opacity: isAnimating || isExiting ? 0 : 1,
            transform: isAnimating || isExiting ? 'translateY(20px)' : 'translateY(0)',
            transition: isExiting 
              ? 'opacity 150ms ease-out, transform 150ms ease-out'
              : 'opacity 300ms ease-out 200ms, transform 300ms ease-out 200ms',
          }}
        >
          <h2 className="book-detail-title" style={{ color: textColor }}>
            {book.title}
          </h2>
          <p className="book-detail-author" style={{ color: subTextColor }}>
            {book.author}
          </p>
        </div>
      </div>

      <div
        className={`book-detail-quotes ${isExiting ? 'book-detail-quotes--exiting' : ''}`}
        style={{
          opacity: isAnimating || isExiting ? 0 : 1,
          transform: isAnimating || isExiting ? 'translateX(30px)' : 'translateX(0)',
          transition: isExiting
            ? 'opacity 150ms ease-out, transform 150ms ease-out'
            : 'opacity 350ms ease-out 250ms, transform 350ms ease-out 250ms',
        }}
      >
        <h3 className="book-detail-quotes-title" style={{ color: subTextColor }}>
          Quotes
        </h3>
        <div ref={quotesListRef} className="book-detail-quotes-list">
          {isLoadingQuotes ? (
            <p className="book-detail-quotes-loading" style={{ color: subTextColor }}>
              Cargando quotes...
            </p>
          ) : quotes.length > 0 ? (
            quotes.map((quote) => (
              <blockquote
                key={quote}
                className="book-detail-quote"
                style={{
                  color: textColor,
                  borderLeftColor: darkMode ? '#444' : '#ddd',
                }}
              >
                {quote}
              </blockquote>
            ))
          ) : (
            <p className="book-detail-quotes-empty" style={{ color: subTextColor }}>
              No hay quotes todavía
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookDetail;
