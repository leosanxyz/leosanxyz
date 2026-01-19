'use client';

import { useState, useEffect } from 'react';

/**
 * Hook para escuchar cambios en media queries
 * Retorna boolean | null (null durante SSR/render inicial)
 * Soporta navegadores legacy con fallback a addListener/removeListener
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    // Verificar que window y matchMedia estén disponibles
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mql = window.matchMedia(query);

    // Actualizar estado inicial
    setMatches(mql.matches);

    // Callback para cambios
    const update = () => setMatches(mql.matches);

    // Usar addEventListener si está disponible (navegadores modernos)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }

    // Fallback para Safari viejo: addListener/removeListener
    const legacy = mql as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };

    legacy.addListener?.(update);
    return () => legacy.removeListener?.(update);
  }, [query]);

  return matches;
}
