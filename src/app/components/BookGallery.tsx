"use client";
import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import Image from 'next/image';
import { books, type Book } from '@/data/books';

export interface BookClickData {
  book: Book;
  rect: DOMRect;
}

export interface BookGalleryRef {
  getBookRect: (bookId: string) => DOMRect | null;
}

interface BookGalleryProps {
  darkMode: boolean;
  onBookClick: (data: BookClickData) => void;
  excludeFromAnimation?: string;
  hideBook?: string;
}

const BookGallery = forwardRef<BookGalleryRef, BookGalleryProps>(({ darkMode, onBookClick, excludeFromAnimation, hideBook }, ref) => {
  const bookRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useImperativeHandle(ref, () => ({
    getBookRect: (bookId: string) => {
      const bookEl = bookRefs.current.get(bookId);
      if (!bookEl) return null;
      const wrapper = bookEl.querySelector('.book-cover-wrapper');
      return wrapper?.getBoundingClientRect() ?? null;
    },
  }));
  const textColor = darkMode ? '#eee' : '#111';
  const subTextColor = darkMode ? '#bbb' : '#555';

  const handleBookClick = (book: Book, event: React.MouseEvent<HTMLDivElement>) => {
    const wrapper = event.currentTarget.querySelector('.book-cover-wrapper');
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      onBookClick({ book, rect });
    }
  };

  return (
    <div
      style={{
        maxWidth: '900px',
        margin: '0 auto',
        paddingTop: '1rem',
      }}
    >
      <div
        style={{
          marginBottom: '3rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '1rem',
            color: subTextColor,
            marginBottom: '0.5rem',
          }}
        >
          Mis recomendaciones personales de lectura
        </p>
        <h1
          style={{
            fontSize: 'clamp(3rem, 8vw, 5rem)',
            fontWeight: 700,
            color: textColor,
            margin: 0,
            letterSpacing: '-0.03em',
          }}
        >
          Libros
        </h1>
      </div>

      <div className="book-grid">
        {books.map((book, index) => {
          const isHidden = hideBook === book.id;
          const skipAnimation = excludeFromAnimation === book.id || isHidden;
          return (
          <div
            key={book.id}
            ref={(el) => {
              if (el) bookRefs.current.set(book.id, el);
            }}
            className={`book-item ${isHidden ? 'book-item--hidden' : ''} ${skipAnimation && !isHidden ? 'book-item--no-animation' : ''}`}
            onClick={(e) => handleBookClick(book, e)}
            style={{
              cursor: 'pointer',
              animationDelay: skipAnimation ? undefined : `${index * 80}ms`,
            }}
          >
            <div className="book-cover-wrapper">
              <div className={`book-cover ${darkMode ? 'book-cover--dark' : ''}`}>
                <Image
                  src={book.cover}
                  alt={book.title}
                  fill
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                  style={{ objectFit: 'cover' }}
                />
                <div className="book-spine" />
              </div>
            </div>
            <div className="book-info">
              <h3
                className="book-title"
                style={{ color: textColor }}
              >
                {book.title}
              </h3>
              <p
                className="book-author"
                style={{ color: subTextColor }}
              >
                {book.author}
              </p>
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

BookGallery.displayName = 'BookGallery';

export default BookGallery;
