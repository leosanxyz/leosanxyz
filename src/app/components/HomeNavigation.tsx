"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import MorphingHoverList, { type MorphingHoverItem } from "./MorphingHoverList";

type NavigationTarget = "/blog" | "/diseno" | "/proyectos" | "/about";

interface HomeNavigationProps {
  darkMode: boolean;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, target: NavigationTarget) => void;
}

interface NavigationItem extends MorphingHoverItem {
  href: NavigationTarget;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: "blog", href: "/blog", label: "blog" },
  { id: "diseno", href: "/diseno", label: "diseño" },
  { id: "proyectos", href: "/proyectos", label: "proyectos" },
  { id: "about", href: "/about", label: "sobre mi:)" },
];

export default function HomeNavigation({ darkMode, onNavigate }: HomeNavigationProps) {
  return (
    <MorphingHoverList
      darkMode={darkMode}
      items={NAVIGATION_ITEMS}
      onItemClick={(event, item) => onNavigate(event, item.href)}
      variant="home"
    />
  );
}
