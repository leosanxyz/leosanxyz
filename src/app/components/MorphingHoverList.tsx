"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import ScrambleIn from "./ScrambleIn";

export interface MorphingHoverItem {
  id: string;
  href: string;
  label: string;
}

interface MorphingHoverListProps<T extends MorphingHoverItem> {
  darkMode: boolean;
  items: T[];
  onItemClick: (event: ReactMouseEvent<HTMLAnchorElement>, item: T) => void;
  scrambleSpeed?: number;
  variant: "home" | "blog";
}

const INDICATOR_SHAPES = [
  {
    color: "#10b981",
    clipPath: "polygon(50% 0%, 75% 7%, 93% 25%, 100% 50%, 93% 75%, 75% 93%, 50% 100%, 25% 93%, 7% 75%, 0% 50%, 7% 25%, 25% 7%)",
  },
  {
    color: "#f43f5e",
    clipPath: "polygon(0% 0%, 33% 0%, 67% 0%, 100% 0%, 100% 33%, 100% 67%, 100% 100%, 67% 100%, 33% 100%, 0% 100%, 0% 67%, 0% 33%)",
  },
  {
    color: "#6366f1",
    clipPath: "polygon(0% 25%, 33% 25%, 67% 25%, 100% 25%, 100% 42%, 100% 58%, 100% 75%, 67% 75%, 33% 75%, 0% 75%, 0% 58%, 0% 42%)",
  },
  {
    color: "#fbbf24",
    clipPath: "polygon(50% 0%, 63% 25%, 75% 50%, 88% 75%, 100% 100%, 75% 100%, 50% 100%, 25% 100%, 0% 100%, 13% 75%, 25% 50%, 38% 25%)",
  },
] as const;

const HOP_DURATION_MS = 140;
const INTERRUPTED_HOP_DURATION_MS = 90;

export default function MorphingHoverList<T extends MorphingHoverItem>({
  darkMode,
  items,
  onItemClick,
  scrambleSpeed,
  variant,
}: MorphingHoverListProps<T>) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [displayedIndex, setDisplayedIndex] = useState(0);
  const [indicatorY, setIndicatorY] = useState(0);
  const [isMorphing, setIsMorphing] = useState(false);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const activeIndexRef = useRef<number | null>(null);
  const movementAnimationRef = useRef<Animation | null>(null);
  const displayedShape = INDICATOR_SHAPES[displayedIndex % INDICATOR_SHAPES.length];
  const linkColor = darkMode
    ? variant === "blog" ? "#eee" : "#fff"
    : variant === "blog" ? "#111" : "#333";

  useEffect(() => {
    return () => movementAnimationRef.current?.cancel();
  }, []);

  const selectItem = (index: number, element: HTMLElement) => {
    const nextY = element.offsetTop + element.offsetHeight / 2;
    const indicator = indicatorRef.current;
    const isChangingItem = activeIndexRef.current !== null && activeIndexRef.current !== index;
    const isInterruptingHop = movementAnimationRef.current !== null;
    const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (indicator && isChangingItem && !shouldReduceMotion) {
      const computedTransform = getComputedStyle(indicator).transform;
      const currentTransform = computedTransform === "none"
        ? new DOMMatrixReadOnly()
        : new DOMMatrixReadOnly(computedTransform);
      const startX = currentTransform.m41;
      const startY = currentTransform.m42;
      const targetY = nextY - indicator.offsetHeight / 2;
      const middleY = startY + (targetY - startY) / 2 - 7;

      movementAnimationRef.current?.cancel();
      const animation = indicator.animate(
        [
          { transform: `translate3d(${startX}px, ${startY}px, 0)` },
          { transform: `translate3d(-12px, ${middleY}px, 0)`, offset: 0.5 },
          { transform: `translate3d(0, ${targetY}px, 0)` },
        ],
        {
          duration: isInterruptingHop ? INTERRUPTED_HOP_DURATION_MS : HOP_DURATION_MS,
          easing: "cubic-bezier(0.645, 0.045, 0.355, 1)",
        },
      );

      movementAnimationRef.current = animation;
      animation.onfinish = () => {
        if (movementAnimationRef.current === animation) {
          movementAnimationRef.current = null;
        }
      };
    }

    activeIndexRef.current = index;
    setIsMorphing(isChangingItem);
    setDisplayedIndex(index);
    setIndicatorY(nextY);
    setActiveIndex(index);
  };

  const clearSelection = () => {
    movementAnimationRef.current?.cancel();
    movementAnimationRef.current = null;
    activeIndexRef.current = null;
    setIsMorphing(false);
    setActiveIndex(null);
  };

  const handlePointerEnter = (
    event: PointerEvent<HTMLLIElement>,
    index: number,
  ) => {
    if (event.pointerType === "touch") return;
    selectItem(index, event.currentTarget);
  };

  return (
    <div className={`morph-list-shell morph-list-shell--${variant}`}>
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="morph-list__indicator"
        data-morphing={isMorphing}
        data-visible={activeIndex !== null}
        style={{
          "--morph-list-indicator-y": `${indicatorY}px`,
        } as CSSProperties}
      >
        <span
          className="morph-list__shape"
          style={{
            backgroundColor: displayedShape.color,
            clipPath: displayedShape.clipPath,
          }}
        />
      </span>

      <ul
        className="morph-list"
        onPointerLeave={clearSelection}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            clearSelection();
          }
        }}
      >
        {items.map((item, index) => (
          <li
            className="morph-list__item"
            key={item.id}
            onPointerEnter={(event) => handlePointerEnter(event, index)}
            onFocus={(event) => selectItem(index, event.currentTarget)}
          >
            <a
              className="morph-list__link"
              data-active={activeIndex === index}
              href={item.href}
              onClick={(event) => onItemClick(event, item)}
              style={{ color: linkColor }}
            >
              <ScrambleIn text={item.label} scrambleSpeed={scrambleSpeed} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
