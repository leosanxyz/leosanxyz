"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

export type GameDirection = "up" | "right" | "down" | "left";
export type GameHaptic = "selection" | "medium" | "rigid";

interface MobileGameControlsProps {
  darkMode: boolean;
  hapticsSupported: boolean;
  navigationEnabled?: boolean;
  navigationKey: string;
  navigationRootRef: RefObject<HTMLElement | null>;
  onBack: () => void;
  onHaptic: (pattern: GameHaptic, intensity: number) => void;
  smoothScroll?: boolean;
}

const TARGET_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[role="button"][tabindex]',
  "[data-gamepad-target]",
].join(",");

const ACTIONABLE_TARGET_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[role="button"]',
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
].join(",");

const DPAD_PRESS_PHASE_MS = 250;
const DPAD_REST_PATH = "M35.59 3.48L59.69 26.83Q64 31 64 37L64 68Q64 78 54 78L10 78Q0 78 0 68L0 37Q0 31 4.31 26.83L28.41 3.48Q32 0 35.59 3.48Z";
const DPAD_PRESS_PATH = "M35.59 3.48L59.69 26.83Q64 31 64 37L64 73Q64 98 39 98L25 98Q0 98 0 73L0 37Q0 31 4.31 26.83L28.41 3.48Q32 0 35.59 3.48Z";
const DPAD_UNDERSHOOT_PATH = "M35.59 3.48L59.69 26.83Q64 31 64 37L64 66Q64 74 56 74L8 74Q0 74 0 66L0 37Q0 31 4.31 26.83L28.41 3.48Q32 0 35.59 3.48Z";

const DEFAULT_CELEBRATION_THEME = {
  id: "stars",
  emojis: ["⭐", "💫", "✨", "🙂‍↕️"],
} as const;

const CELEBRATION_THEMES = [
  { id: "rick-rubin", keywords: ["the creative act", "rick rubin"], emojis: ["🎵", "🎛️", "🎨", "✨"] },
  { id: "steve-jobs", keywords: ["make something wonderful", "steve jobs"], emojis: ["🍎", "💡", "🖥️", "✨"] },
  { id: "love", keywords: ["the art of loving", "arte de amar", "erich fromm"], emojis: ["❤️", "🫶", "🌹", "✨"] },
  { id: "poetry", keywords: ["cartas a un joven poeta", "rainer maria rilke"], emojis: ["✉️", "✍️", "📜", "🌙"] },
  { id: "stormlight", keywords: ["camino de los reyes", "brandon sanderson"], emojis: ["⚔️", "👑", "🌩️", "📖"] },
  { id: "walden", keywords: ["walden", "thoreau"], emojis: ["🌲", "🏕️", "🪵", "📖"] },
  { id: "inspiration", keywords: ["objetos que me inspiran"], emojis: ["🎮", "🎹", "🎧", "✍️"] },
  { id: "games", keywords: ["videojuego", "gaming"], emojis: ["🎮", "🕹️", "👾", "✨"] },
  { id: "ai", keywords: ["inteligencia artificial"], emojis: ["🤖", "🧠", "⚙️", "✨"] },
  { id: "technology", keywords: ["software", "tecnolog", "program", "código"], emojis: ["💻", "⚙️", "💡", "✨"] },
  { id: "creativity", keywords: ["diseñ", "creativ", "crear", "contenido", "arte"], emojis: ["🎨", "🖌️", "💡", "✨"] },
  { id: "reading", keywords: ["generic book", "libro", "lectura", "leer", "quote", "escribir", "poeta", "historia"], emojis: ["📚", "📖", "✍️", "💭"] },
  { id: "people", keywords: ["persona", "conecten", "viaje"], emojis: ["🫶", "✨", "💫", "🙂‍↕️"] },
] as const;

const STAR_FLOATERS = [
  { size: 1.55, delay: 70, duration: 1450, rotation: -16 },
  { size: 2.15, delay: 0, duration: 1580, rotation: 13 },
  { size: 1.35, delay: 110, duration: 1380, rotation: -10 },
  { size: 1.85, delay: 40, duration: 1510, rotation: 17 },
  { size: 1.25, delay: 140, duration: 1320, rotation: -13 },
  { size: 2.4, delay: 90, duration: 1660, rotation: 9 },
] as const;

const getCelebrationTheme = (target: HTMLElement) => {
  const bookDetail = target.closest<HTMLElement>(".book-detail");
  const bookContext = bookDetail
    ? [
        bookDetail.querySelector<HTMLElement>(".book-detail-title")?.innerText,
        bookDetail.querySelector<HTMLElement>(".book-detail-author")?.innerText,
      ]
    : [];
  const imageContext = Array.from(target.querySelectorAll<HTMLImageElement>("img"))
    .map((image) => image.alt);
  const elementType = target.matches(".book-detail-cover, .book-detail-quote")
    ? "generic book"
    : "";
  const context = [
    target.innerText,
    target.getAttribute("aria-label"),
    target.getAttribute("alt"),
    ...bookContext,
    ...imageContext,
    elementType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es");

  return CELEBRATION_THEMES.find((theme) =>
    theme.keywords.some((keyword) => context.includes(keyword)),
  ) ?? DEFAULT_CELEBRATION_THEME;
};

const isElementAvailable = (element: HTMLElement, root: HTMLElement) => {
  if (element.dataset.gamepadIgnore === "true") return false;
  if (element.getAttribute("aria-hidden") === "true") return false;

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      return false;
    }
    if (current === root) break;
    current = current.parentElement;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const isInsideRect = (element: HTMLElement, root: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();

  return (
    rect.bottom > rootRect.top &&
    rect.top < rootRect.bottom &&
    rect.right > rootRect.left &&
    rect.left < rootRect.right
  );
};

const isFullyInsideRect = (element: HTMLElement, root: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const inset = 18;

  return (
    rect.top >= rootRect.top + inset &&
    rect.bottom <= rootRect.bottom - inset &&
    rect.left >= rootRect.left &&
    rect.right <= rootRect.right
  );
};

const getCenter = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const getDirectionalScore = (
  current: HTMLElement,
  candidate: HTMLElement,
  direction: GameDirection,
) => {
  const origin = getCenter(current);
  const target = getCenter(candidate);
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;

  const isInDirection =
    direction === "up"
      ? dy < -2
      : direction === "down"
        ? dy > 2
        : direction === "left"
          ? dx < -2
          : dx > 2;

  if (!isInDirection) return Number.POSITIVE_INFINITY;

  const primary = direction === "up" || direction === "down" ? Math.abs(dy) : Math.abs(dx);
  const secondary = direction === "up" || direction === "down" ? Math.abs(dx) : Math.abs(dy);

  return primary + secondary * 0.45;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * Math.max(0, maximum - minimum);

const getScrollLimits = (root: HTMLElement) => ({
  left: Math.max(0, root.scrollWidth - root.clientWidth),
  top: Math.max(0, root.scrollHeight - root.clientHeight),
});

const getLayoutTopWithinRoot = (element: HTMLElement, root: HTMLElement) => {
  let top = 0;
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return current === root ? top : null;
};

const getGridTarget = (
  current: HTMLElement,
  targets: HTMLElement[],
  direction: GameDirection,
) => {
  const grid = current.closest<HTMLElement>("[data-gamepad-grid]");
  if (!grid) return { handled: false, target: null };

  const currentIndex = Number(current.dataset.gamepadGridIndex);
  if (!Number.isInteger(currentIndex)) return { handled: false, target: null };

  const columns = Math.max(
    1,
    window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
  );
  if (direction === "up" && currentIndex < columns) {
    return { handled: false, target: null };
  }
  const column = currentIndex % columns;
  const nextIndex =
    direction === "left"
      ? column === 0
        ? -1
        : currentIndex - 1
      : direction === "right"
        ? column === columns - 1
          ? -1
          : currentIndex + 1
        : direction === "up"
          ? currentIndex - columns
          : currentIndex + columns;

  return {
    handled: true,
    target:
      nextIndex >= 0
        ? (targets.find(
            (target) =>
              target.closest("[data-gamepad-grid]") === grid &&
              Number(target.dataset.gamepadGridIndex) === nextIndex,
          ) ?? null)
        : null,
  };
};

interface GameControlButtonProps {
  ariaLabel: string;
  className: string;
  onPress: () => void;
  pulseOnPress?: boolean;
  children?: ReactNode | ((isPressed: boolean) => ReactNode);
}

interface JoystickGesture {
  pointerId: number;
  startX: number;
  startY: number;
  direction: GameDirection | null;
}

function GameControlButton({
  ariaLabel,
  className,
  onPress,
  pulseOnPress = false,
  children,
}: GameControlButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const pointerPressRef = useRef(false);
  const pulseTimeoutRef = useRef<number | null>(null);

  const startVisualPress = useCallback(() => {
    if (pulseOnPress && pulseTimeoutRef.current !== null) return;

    setIsPressed(true);
    if (!pulseOnPress) return;

    pulseTimeoutRef.current = window.setTimeout(() => {
      pulseTimeoutRef.current = null;
      setIsPressed(false);
    }, DPAD_PRESS_PHASE_MS);
  }, [pulseOnPress]);

  const finishVisualPress = useCallback(() => {
    if (!pulseOnPress) setIsPressed(false);
  }, [pulseOnPress]);

  useEffect(() => () => {
    if (pulseTimeoutRef.current !== null) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
  }, []);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={className}
      data-gamepad-ignore="true"
      data-pressed={isPressed ? "true" : undefined}
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        pointerPressRef.current = true;
        startVisualPress();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!pointerPressRef.current) return;
        pointerPressRef.current = false;
        finishVisualPress();
        onPress();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        pointerPressRef.current = false;
        finishVisualPress();
      }}
      onPointerLeave={(event) => {
        event.stopPropagation();
        pointerPressRef.current = false;
        finishVisualPress();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        finishVisualPress();
        if (event.detail === 0) onPress();
      }}
    >
      {typeof children === "function" ? children(isPressed) : children}
    </button>
  );
}

function DpadArrow() {
  return (
    <svg
      className="game-dpad__arrow"
      viewBox="0 0 16 10"
      aria-hidden="true"
    >
      <path
        d="M2 8 8 2l6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.25"
      />
    </svg>
  );
}

interface DpadShapeProps {
  pressed: boolean;
}

function DpadShape({ pressed }: DpadShapeProps) {
  const extendAnimationRef = useRef<SVGAnimateElement | null>(null);
  const retractAnimationRef = useRef<SVGAnimateElement | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (!pressed) return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animation = pressed
      ? extendAnimationRef.current
      : retractAnimationRef.current;
    animation?.beginElement();
  }, [pressed]);

  return (
    <svg
      className="game-dpad__shape"
      viewBox="0 0 64 78"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="game-dpad__shape-path"
        d={DPAD_REST_PATH}
      >
        <animate
          ref={extendAnimationRef}
          attributeName="d"
          from={DPAD_REST_PATH}
          to={DPAD_PRESS_PATH}
          dur={`${DPAD_PRESS_PHASE_MS}ms`}
          begin="indefinite"
          fill="freeze"
          restart="always"
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.42 0 0.58 1"
        />
        <animate
          ref={retractAnimationRef}
          attributeName="d"
          values={`${DPAD_PRESS_PATH};${DPAD_UNDERSHOOT_PATH};${DPAD_REST_PATH}`}
          dur={`${DPAD_PRESS_PHASE_MS}ms`}
          begin="indefinite"
          fill="freeze"
          restart="always"
          calcMode="spline"
          keyTimes="0;0.52;1"
          keySplines="0.42 0 0.58 1;0.25 0.46 0.45 0.94"
        />
      </path>
    </svg>
  );
}

export default function MobileGameControls({
  darkMode,
  hapticsSupported,
  navigationEnabled = true,
  navigationKey,
  navigationRootRef,
  onBack,
  onHaptic,
  smoothScroll = false,
}: MobileGameControlsProps) {
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const blockedAnimationRef = useRef<Animation | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const scrollDestinationRef = useRef<number | null>(null);
  const selectionSuspendedRef = useRef(false);
  const joystickGestureRef = useRef<JoystickGesture | null>(null);
  const joystickPulseTimeoutRef = useRef<number | null>(null);
  const celebrationAnimationRef = useRef<Animation | null>(null);
  const starBurstsRef = useRef<Set<HTMLDivElement>>(new Set());
  const [joystickDirection, setJoystickDirection] = useState<GameDirection | null>(null);

  const pulseJoystickDirection = useCallback((direction: GameDirection) => {
    if (joystickPulseTimeoutRef.current !== null) {
      window.clearTimeout(joystickPulseTimeoutRef.current);
    }

    setJoystickDirection(direction);
    joystickPulseTimeoutRef.current = window.setTimeout(() => {
      joystickPulseTimeoutRef.current = null;
      setJoystickDirection(null);
    }, DPAD_PRESS_PHASE_MS);
  }, []);

  useEffect(() => () => {
    if (joystickPulseTimeoutRef.current !== null) {
      window.clearTimeout(joystickPulseTimeoutRef.current);
    }
  }, []);

  const clearStarBursts = useCallback(() => {
    starBurstsRef.current.forEach((burst) => burst.remove());
    starBurstsRef.current.clear();
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    scrollDestinationRef.current = null;
  }, []);

  const scrollToPosition = useCallback((root: HTMLElement, requestedTop: number) => {
    const limits = getScrollLimits(root);
    const destination = clamp(requestedTop, 0, limits.top);
    const start = clamp(root.scrollTop, 0, limits.top);

    cancelScrollAnimation();

    const shouldAnimate =
      smoothScroll &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      Math.abs(destination - start) > 2;

    if (!shouldAnimate) {
      root.scrollTo({
        top: destination,
        left: clamp(root.scrollLeft, 0, limits.left),
        behavior: "auto",
      });
      return;
    }

    scrollDestinationRef.current = destination;
    const distance = destination - start;
    const duration = clamp(360 + Math.abs(distance) * 0.22, 420, 620);
    let startedAt: number | null = null;

    const step = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;

      root.scrollTop = start + distance * eased;

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        scrollAnimationFrameRef.current = null;
        scrollDestinationRef.current = null;
      }
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelScrollAnimation, smoothScroll]);

  const getTargets = useCallback(() => {
    const root = navigationRootRef.current;
    if (!root) return [];

    return Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR)).filter((element) =>
      isElementAvailable(element, root),
    );
  }, [navigationRootRef]);

  const clearTarget = useCallback(() => {
    cancelScrollAnimation();
    blockedAnimationRef.current?.cancel();
    blockedAnimationRef.current = null;
    const current = currentTargetRef.current;
    if (current) {
      delete current.dataset.gamepadActive;
      if (document.activeElement === current) current.blur();
    }
    currentTargetRef.current = null;
  }, [cancelScrollAnimation]);

  const selectTarget = useCallback((element: HTMLElement, shouldScroll = true) => {
    blockedAnimationRef.current?.cancel();
    blockedAnimationRef.current = null;
    const previous = currentTargetRef.current;
    if (previous && previous !== element) {
      delete previous.dataset.gamepadActive;
    }

    currentTargetRef.current = element;
    element.dataset.gamepadActive = "true";
    element.focus({ preventScroll: true });

    if (shouldScroll) {
      const root = navigationRootRef.current;
      if (!root) return;

      if (element.dataset.gamepadScrollTop === "true") {
        scrollToPosition(root, 0);
        return;
      }

      const elementRect = element.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const inset = 18;
      const isFullyVisible =
        elementRect.top >= rootRect.top + inset &&
        elementRect.bottom <= rootRect.bottom - inset;
      const shouldCenter = element.dataset.gamepadCenter === "true";

      if (shouldCenter || !isFullyVisible) {
        const limits = getScrollLimits(root);
        const layoutTop = shouldCenter ? getLayoutTopWithinRoot(element, root) : null;
        const centeredTop = layoutTop !== null
          ? layoutTop - (root.clientHeight - element.offsetHeight) / 2
          : clamp(root.scrollTop, 0, limits.top) +
            elementRect.top -
            rootRect.top -
            (root.clientHeight - elementRect.height) / 2;

        scrollToPosition(root, centeredTop);
      }
    }
  }, [navigationRootRef, scrollToPosition]);

  const initializeVisibleTarget = useCallback(() => {
    if (!navigationEnabled || currentTargetRef.current) return;

    const root = navigationRootRef.current;
    if (!root) return;

    const visibleTargets = getTargets().filter((element) => isInsideRect(element, root));
    const initialTarget =
      visibleTargets.find((element) => element.dataset.gamepadDefault === "true") ??
      visibleTargets[0];

    if (initialTarget) selectTarget(initialTarget, false);
  }, [getTargets, navigationEnabled, navigationRootRef, selectTarget]);

  const scrollRoot = useCallback((direction: GameDirection) => {
    const root = navigationRootRef.current;
    if (!root || direction === "left" || direction === "right") return false;

    const amount = smoothScroll
      ? Math.max(64, root.clientHeight * 0.24)
      : Math.max(72, root.clientHeight * 0.28);
    const limits = getScrollLimits(root);
    const currentTop = scrollDestinationRef.current ?? clamp(root.scrollTop, 0, limits.top);
    const nextTop = clamp(
      currentTop + (direction === "up" ? -amount : amount),
      0,
      limits.top,
    );

    scrollToPosition(root, nextTop);

    return Math.abs(nextTop - currentTop) > 1;
  }, [navigationRootRef, scrollToPosition, smoothScroll]);

  const canScrollRoot = useCallback((direction: GameDirection) => {
    const root = navigationRootRef.current;
    if (!root) return false;

    const threshold = 2;
    const top = scrollDestinationRef.current ?? root.scrollTop;
    if (direction === "up") return top > threshold;
    if (direction === "down") {
      return top + root.clientHeight < root.scrollHeight - threshold;
    }
    return false;
  }, [navigationRootRef]);

  const bounceBlockedTarget = useCallback((element: HTMLElement, direction: GameDirection) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const distance = 7;
    const dx = direction === "left" ? -distance : direction === "right" ? distance : 0;
    const dy = direction === "up" ? -distance : direction === "down" ? distance : 0;
    const reboundX = dx * -0.2;
    const reboundY = dy * -0.2;

    blockedAnimationRef.current?.cancel();
    const animation = element.animate(
      [
        { transform: "translate3d(0, 0, 0)" },
        { transform: `translate3d(${dx}px, ${dy}px, 0)`, offset: 0.42 },
        { transform: `translate3d(${reboundX}px, ${reboundY}px, 0)`, offset: 0.72 },
        { transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
      },
    );

    blockedAnimationRef.current = animation;
    animation.onfinish = () => {
      if (blockedAnimationRef.current === animation) {
        blockedAnimationRef.current = null;
      }
    };
  }, []);

  const move = useCallback((direction: GameDirection) => {
    if (!navigationEnabled) return;
    selectionSuspendedRef.current = false;

    const root = navigationRootRef.current;
    const targets = getTargets();
    if (!root || targets.length === 0) {
      if (root && !scrollRoot(direction)) {
        const content = root.firstElementChild;
        if (content instanceof HTMLElement) bounceBlockedTarget(content, direction);
      }
      return;
    }

    const rememberedTarget = currentTargetRef.current;
    const markedTarget = root.querySelector<HTMLElement>('[data-gamepad-active="true"]');
    const current =
      rememberedTarget && targets.includes(rememberedTarget)
        ? rememberedTarget
        : markedTarget && targets.includes(markedTarget)
          ? markedTarget
          : null;

    if (current && currentTargetRef.current !== current) {
      currentTargetRef.current = current;
    }

    if (!current || !targets.includes(current)) {
      const visibleTargets = targets.filter((element) => isInsideRect(element, root));
      const rootRect = root.getBoundingClientRect();
      const rootCenter = {
        x: rootRect.left + rootRect.width / 2,
        y: rootRect.top + rootRect.height / 2,
      };
      const next = visibleTargets.reduce<HTMLElement | null>((nearest, candidate) => {
        if (!nearest) return candidate;
        const candidateCenter = getCenter(candidate);
        const nearestCenter = getCenter(nearest);
        const candidateDistance = Math.hypot(
          candidateCenter.x - rootCenter.x,
          candidateCenter.y - rootCenter.y,
        );
        const nearestDistance = Math.hypot(
          nearestCenter.x - rootCenter.x,
          nearestCenter.y - rootCenter.y,
        );
        return candidateDistance < nearestDistance ? candidate : nearest;
      }, null);
      if (next) {
        selectTarget(next);
      } else if (!scrollRoot(direction)) {
        const content = root.firstElementChild;
        if (content instanceof HTMLElement) bounceBlockedTarget(content, direction);
      }
      return;
    }

    if (
      current.dataset.gamepadAxis === "vertical" &&
      (direction === "left" || direction === "right")
    ) {
      bounceBlockedTarget(current, direction);
      return;
    }

    const gridMove = getGridTarget(current, targets, direction);
    let next = gridMove.target;

    if (!gridMove.handled) {
      let nextScore = Number.POSITIVE_INFINITY;
      for (const candidate of targets) {
        if (candidate === current) continue;
        const score = getDirectionalScore(current, candidate, direction);
        if (score < nextScore) {
          next = candidate;
          nextScore = score;
        }
      }
    }

    const shouldScrollBeforeSelecting =
      next !== null &&
      smoothScroll &&
      (direction === "up" || direction === "down") &&
      next.dataset.gamepadScrollTop !== "true" &&
      next.dataset.gamepadCenter !== "true" &&
      !isFullyInsideRect(next, root) &&
      canScrollRoot(direction);

    if (shouldScrollBeforeSelecting) {
      scrollRoot(direction);
    } else if (next) {
      selectTarget(next);
    } else if (canScrollRoot(direction)) {
      scrollRoot(direction);
    } else {
      const bounceTarget = isInsideRect(current, root)
        ? current
        : root.firstElementChild instanceof HTMLElement
          ? root.firstElementChild
          : current;
      bounceBlockedTarget(bounceTarget, direction);
    }
  }, [
    bounceBlockedTarget,
    canScrollRoot,
    getTargets,
    navigationEnabled,
    navigationRootRef,
    scrollRoot,
    selectTarget,
    smoothScroll,
  ]);

  const pressDirection = useCallback((direction: GameDirection) => {
    move(direction);
    onHaptic("selection", 0.6);
  }, [move, onHaptic]);

  const handleJoystickPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
    };
  }, []);

  const handleJoystickPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = joystickGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const dpadSize = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 128;
    const threshold = Math.max(18, dpadSize * 0.14);

    if (Math.hypot(dx, dy) < threshold) {
      if (gesture.direction !== null) {
        gesture.direction = null;
      }
      return;
    }

    const direction: GameDirection = Math.abs(dx) > Math.abs(dy)
      ? dx > 0 ? "right" : "left"
      : dy > 0 ? "down" : "up";

    if (direction === gesture.direction) return;
    gesture.direction = direction;
    pulseJoystickDirection(direction);
    pressDirection(direction);
  }, [pressDirection, pulseJoystickDirection]);

  const finishJoystickGesture = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = joystickGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    joystickGestureRef.current = null;
  }, []);

  const celebrateTarget = useCallback((target: HTMLElement) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    celebrationAnimationRef.current?.cancel();

    const bounceAnimation = target.animate(
      [
        {
          transform: "translate3d(0, 0, 0) scale(1)",
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
        {
          transform: "translate3d(0, 7px, 0) scale(0.975)",
          offset: 0.34,
          easing: "cubic-bezier(0.45, 0, 0.55, 1)",
        },
        { transform: "translate3d(0, 0, 0) scale(1)" },
      ],
      {
        duration: 430,
      },
    );
    celebrationAnimationRef.current = bounceAnimation;
    bounceAnimation.onfinish = () => {
      if (celebrationAnimationRef.current === bounceAnimation) {
        celebrationAnimationRef.current = null;
      }
    };

    const targetRect = target.getBoundingClientRect();
    const rootRect = navigationRootRef.current?.getBoundingClientRect();
    const visibleLeft = Math.max(targetRect.left, rootRect?.left ?? 0);
    const visibleRight = Math.min(targetRect.right, rootRect?.right ?? window.innerWidth);
    const visibleTop = Math.max(targetRect.top, rootRect?.top ?? 0);
    const visibleBottom = Math.min(targetRect.bottom, rootRect?.bottom ?? window.innerHeight);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const horizontalInset = Math.min(22, visibleWidth * 0.18);
    const verticalInset = Math.min(18, visibleHeight * 0.2);
    const desiredLift = clamp(window.innerHeight * 0.21, 150, 190);
    const theme = getCelebrationTheme(target);
    const emojiOffset = Math.floor(Math.random() * theme.emojis.length);

    const burst = document.createElement("div");
    burst.setAttribute("aria-hidden", "true");
    burst.dataset.gamepadCelebration = "true";
    burst.dataset.gamepadCelebrationTheme = theme.id;
    Object.assign(burst.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "0",
      height: "0",
      zIndex: "10000",
      pointerEvents: "none",
    });
    document.body.appendChild(burst);
    starBurstsRef.current.add(burst);

    const animations = STAR_FLOATERS.map((floater, index) => {
      const star = document.createElement("span");
      star.textContent = theme.emojis[(emojiOffset + index) % theme.emojis.length];
      Object.assign(star.style, {
        position: "absolute",
        left: "-22px",
        top: "-22px",
        width: "44px",
        height: "44px",
        display: "grid",
        placeItems: "center",
        fontSize: `${floater.size}rem`,
        lineHeight: "1",
        willChange: "transform, opacity",
      });
      burst.appendChild(star);

      const startX = randomBetween(
        visibleLeft + horizontalInset,
        visibleRight - horizontalInset,
      );
      const startY = randomBetween(
        visibleTop + verticalInset,
        visibleBottom - verticalInset,
      );
      const endX = clamp(
        startX + randomBetween(-86, 86),
        24,
        window.innerWidth - 24,
      );
      const middleX = clamp(
        startX + (endX - startX) * 0.48 + randomBetween(-14, 14),
        24,
        window.innerWidth - 24,
      );
      const lift = Math.min(
        desiredLift * randomBetween(0.82, 1.06),
        Math.max(24, startY - 64),
      );
      const popY = startY - Math.min(28, lift * 0.28);
      const rotation = floater.rotation * randomBetween(0.75, 1.25);
      return star.animate(
        [
          {
            transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.45) rotate(0deg)`,
            opacity: 0,
          },
          {
            transform: `translate3d(${startX + (endX - startX) * 0.08}px, ${popY}px, 0) scale(1.08) rotate(${rotation * 0.2}deg)`,
            opacity: 1,
            offset: 0.14,
          },
          {
            transform: `translate3d(${middleX}px, ${startY - lift * 0.58}px, 0) scale(1) rotate(${rotation * 0.65}deg)`,
            opacity: 1,
            offset: 0.62,
          },
          {
            transform: `translate3d(${endX}px, ${startY - lift}px, 0) scale(0.9) rotate(${rotation}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: floater.duration,
          delay: floater.delay,
          easing: "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
          fill: "both",
        },
      );
    });

    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      burst.remove();
      starBurstsRef.current.delete(burst);
    });
  }, [navigationRootRef]);

  useEffect(() => {
    return () => {
      cancelScrollAnimation();
      blockedAnimationRef.current?.cancel();
      celebrationAnimationRef.current?.cancel();
      clearStarBursts();
    };
  }, [cancelScrollAnimation, clearStarBursts]);

  const pressA = useCallback(() => {
    if (!navigationEnabled) return;

    const root = navigationRootRef.current;
    const rememberedTarget = currentTargetRef.current;
    const markedTarget = root?.querySelector<HTMLElement>('[data-gamepad-active="true"]');
    const target = rememberedTarget?.isConnected ? rememberedTarget : markedTarget;
    if (target && currentTargetRef.current !== target) currentTargetRef.current = target;
    if (target && target.isConnected) {
      if (target.matches(ACTIONABLE_TARGET_SELECTOR)) {
        target.click();
      } else {
        celebrateTarget(target);
      }
    }
    onHaptic("medium", 0.72);
  }, [celebrateTarget, navigationEnabled, navigationRootRef, onHaptic]);

  const pressB = useCallback(() => {
    clearTarget();
    onBack();
    onHaptic("rigid", 0.68);
  }, [clearTarget, onBack, onHaptic]);

  useEffect(() => {
    selectionSuspendedRef.current = false;
    clearTarget();
    if (!navigationEnabled) return;

    const root = navigationRootRef.current;
    if (!root) return;

    const syncSelection = () => {
      const current = currentTargetRef.current;
      if (current?.isConnected) {
        if (current.dataset.gamepadActive !== "true") {
          current.dataset.gamepadActive = "true";
        }
        return;
      }

      currentTargetRef.current = null;
      if (selectionSuspendedRef.current) return;
      initializeVisibleTarget();
    };

    let frame = window.requestAnimationFrame(syncSelection);

    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncSelection);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-gamepad-active"],
    });

    const handleFocusIn = (event: FocusEvent) => {
      if (selectionSuspendedRef.current) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(TARGET_SELECTOR)) return;
      if (!isElementAvailable(target, root)) return;
      selectTarget(target, false);
    };
    root.addEventListener("focusin", handleFocusIn);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("focusin", handleFocusIn);
    };
  }, [
    clearTarget,
    initializeVisibleTarget,
    navigationEnabled,
    navigationKey,
    navigationRootRef,
    selectTarget,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!window.matchMedia("(max-width: 599px)").matches) return;
      if (event.defaultPrevented) return;
      if (event.repeat) return;

      const tagName = (event.target as HTMLElement | null)?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;

      const direction =
        event.key === "ArrowUp"
          ? "up"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowDown"
              ? "down"
              : event.key === "ArrowLeft"
                ? "left"
                : null;

      if (direction) {
        event.preventDefault();
        pressDirection(direction);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pressA();
      } else if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        pressB();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pressA, pressB, pressDirection]);

  useEffect(() => {
    const root = navigationRootRef.current;
    if (!root || !navigationEnabled) return;

    const releaseSelectionFocus = () => {
      selectionSuspendedRef.current = true;
      clearTarget();
    };

    const releaseSelectionOnTouchPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") releaseSelectionFocus();
    };

    root.addEventListener("touchstart", releaseSelectionFocus, { passive: true });
    root.addEventListener("pointerdown", releaseSelectionOnTouchPointer, { passive: true });
    root.addEventListener("wheel", releaseSelectionFocus, { passive: true });

    return () => {
      root.removeEventListener("touchstart", releaseSelectionFocus);
      root.removeEventListener("pointerdown", releaseSelectionOnTouchPointer);
      root.removeEventListener("wheel", releaseSelectionFocus);
    };
  }, [clearTarget, navigationEnabled, navigationKey, navigationRootRef]);

  return (
    <div
      className={`mobile-game-controls ${darkMode ? "mobile-game-controls--dark" : ""}`}
      data-haptics={hapticsSupported ? "vibration-api" : "switch-fallback"}
      data-testid="mobile-game-controls"
    >
      <div
        className="game-dpad"
        aria-label="Cruceta"
        data-joystick-direction={joystickDirection ?? undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <GameControlButton
          ariaLabel="Mover arriba"
          className="game-dpad__button game-dpad__button--up"
          onPress={() => pressDirection("up")}
          pulseOnPress
        >
          {(isPressed) => (
            <>
              <DpadShape pressed={isPressed || joystickDirection === "up"} />
              <DpadArrow />
            </>
          )}
        </GameControlButton>
        <GameControlButton
          ariaLabel="Mover a la derecha"
          className="game-dpad__button game-dpad__button--right"
          onPress={() => pressDirection("right")}
          pulseOnPress
        >
          {(isPressed) => (
            <>
              <DpadShape pressed={isPressed || joystickDirection === "right"} />
              <DpadArrow />
            </>
          )}
        </GameControlButton>
        <GameControlButton
          ariaLabel="Mover abajo"
          className="game-dpad__button game-dpad__button--down"
          onPress={() => pressDirection("down")}
          pulseOnPress
        >
          {(isPressed) => (
            <>
              <DpadShape pressed={isPressed || joystickDirection === "down"} />
              <DpadArrow />
            </>
          )}
        </GameControlButton>
        <GameControlButton
          ariaLabel="Mover a la izquierda"
          className="game-dpad__button game-dpad__button--left"
          onPress={() => pressDirection("left")}
          pulseOnPress
        >
          {(isPressed) => (
            <>
              <DpadShape pressed={isPressed || joystickDirection === "left"} />
              <DpadArrow />
            </>
          )}
        </GameControlButton>
        <button
          type="button"
          aria-label="Desliza desde el centro para mover"
          className="game-dpad__center"
          data-gamepad-ignore="true"
          tabIndex={-1}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={finishJoystickGesture}
          onPointerCancel={finishJoystickGesture}
          onLostPointerCapture={() => {
            joystickGestureRef.current = null;
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </div>

      <div
        className="game-actions"
        aria-label="Botones de acción"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <GameControlButton
          ariaLabel="A, entrar o activar"
          className="game-action game-action--a"
          onPress={pressA}
        >
          <span className="game-action__label" aria-hidden="true">A</span>
        </GameControlButton>
        <GameControlButton
          ariaLabel="B, volver o salir"
          className="game-action game-action--b"
          onPress={pressB}
        >
          <span className="game-action__label" aria-hidden="true">B</span>
        </GameControlButton>
      </div>
    </div>
  );
}
