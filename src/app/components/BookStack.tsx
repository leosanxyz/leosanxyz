import React from 'react';
import { books } from '@/data/books';

interface BookStackProps {
  onGoToBooks?: () => void;
  darkMode: boolean;
}

const BookStack: React.FC<BookStackProps> = ({ onGoToBooks, darkMode }) => {
  const stackBooks = books.filter(b => 
    ['the-creative-act', 'make-something-wonderful', 'the-art-of-loving', 'walden'].includes(b.id)
  ).slice(0, 4);

  const displayBooks = stackBooks.length >= 3 ? stackBooks : books.slice(0, 4);

  return (
    <div 
      className="book-stack-container group" 
      onClick={onGoToBooks}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onGoToBooks?.();
        }
      }}
    >
      <div 
        className="book-stack-label"
        style={{ color: darkMode ? '#bbb' : '#555' }}
      >
        mis recomendaciones de lectura
      </div>
      
      <div className="book-stack-wrapper">
        {displayBooks.map((book, index) => (
          <div
            key={book.id}
            className={`book-stack-item book-stack-item--${index}`}
            style={{ zIndex: 4 - index }}
          >
            <div className={`book-stack-cover ${darkMode ? 'book-stack-cover--dark' : ''}`}>
              <img
                src={book.cover}
                alt={book.title}
                className="book-stack-img"
                loading="lazy"
              />
              <div className="book-stack-spine" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BookStack;
