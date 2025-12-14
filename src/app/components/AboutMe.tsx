"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

interface AboutMeProps {
    darkMode: boolean;
}

const AboutMe: React.FC<AboutMeProps> = ({ darkMode }) => {
    const textColor = darkMode ? '#eee' : '#111';
    const subTextColor = darkMode ? '#bbb' : '#555';

    const IDX = {
        HEADER: 0,
        P1: 1,
        P2: 2,
        QUOTE: 3,
        P3: 4,
        P4: 5,
        P5: 6,
    } as const;

    const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

    useEffect(() => {
        // Resolver preferencia de motion solo en cliente
        const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!mql) {
            setPrefersReducedMotion(false);
            return;
        }

        const update = () => setPrefersReducedMotion(mql.matches);
        update();

        // Fallback legacy (Safari viejo): addListener/removeListener
        if ('addEventListener' in mql) {
            mql.addEventListener('change', update);
            return () => mql.removeEventListener('change', update);
        }
        mql.addListener(update);
        return () => mql.removeListener(update);
    }, []);

    const headerNode = useMemo(() => (
        <h1
            style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: textColor,
                textAlign: 'center',
                margin: 0,
            }}
        >
            Quiero crear cosas increíbles.
        </h1>
    ), [textColor]);

    const sideCollageNode = useMemo(() => (
        <div className="about-side-collage">
            <img
                className="about-side-img about-side-img--a"
                src={encodeURI('/img/Playdate_Playdate Console.webp')}
                alt=""
                loading="lazy"
                decoding="async"
            />
            <img
                className="about-side-img about-side-img--b"
                src={encodeURI('/img/EP–133 K.O. II.webp')}
                alt=""
                loading="lazy"
                decoding="async"
            />
            <img
                className="about-side-img about-side-img--c"
                src={encodeURI('/img/airpods max.webp')}
                alt=""
                loading="lazy"
                decoding="async"
            />

            <div
                className="about-side-aa"
                style={{ color: textColor }}
            >
                Aa
            </div>
        </div>
    ), [textColor]);

    const steveNode = useMemo(() => (
        <div className="about-steve-wrap">
            <img
                className="about-steve-img"
                src={encodeURI('/img/steve.png')}
                alt=""
                loading="lazy"
                decoding="async"
            />
        </div>
    ), []);

    const [p5Highlight, setP5Highlight] = useState(false);

    const contentBlocks = useMemo(() => ([
        <p
            key="p1"
            style={{
                fontSize: '1.4rem',
                lineHeight: '1.6',
                color: subTextColor,
                margin: 0,
            }}
        >
            Cosas que conecten con las personas. Cosas que se vean, se sientan, y funcionen pensando en ellos. <span style={{ color: textColor, fontWeight: 500 }}>Simples pero sofisticadas.</span>
        </p>,

        <p
            key="p2"
            style={{
                fontSize: '1.28rem',
                lineHeight: '1.6',
                color: subTextColor,
                margin: 0,
            }}
        >
            Desde pequeño supe que mi vida estaría para siempre ligada a la tecnología y me dedicaría a descubrir qué tan lejos se podía llegar al usarla. Conforme fui creciendo descubrí que la tecnología tiene que ir de la mano con un gran diseño para llegar a la excelencia.
        </p>,

        <blockquote
            key="q"
            style={{
                margin: '1rem 0',
                paddingLeft: '1rem',
                borderLeft: `3px solid ${darkMode ? '#555' : '#ddd'}`,
                fontStyle: 'italic',
                color: subTextColor,
                fontSize: '1.28rem',
            }}
        >
            “El diseño no es solo como se ve y se siente. El diseño es como funciona” — Steve Jobs
        </blockquote>,

        <p
            key="p3"
            style={{
                fontSize: '1.28rem',
                lineHeight: '1.6',
                color: subTextColor,
                margin: 0,
            }}
        >
            Estudié ingeniería en tecnología de software en la Universidad Autónoma de Nuevo León, para luego cambiar a estudiar diseño y producción de videojuegos, en donde me sumergí completamente en la multidisciplinidad multimedia.
        </p>,

        <p
            key="p4"
            style={{
                fontSize: '1.28rem',
                lineHeight: '1.6',
                color: subTextColor,
                margin: 0,
            }}
        >
            Actualmente trabajo en <strong>Vidanta</strong>, un conglomerado de los resorts más grandes de México, dedicándome a la creación de contenido e innovación mediante inteligencia artificial.
        </p>,

        <p
            key="p5"
            style={{
                fontSize: '1.4rem',
                lineHeight: '1.6',
                color: textColor,
                fontWeight: 500,
                margin: 0,
                marginTop: '0.5rem',
            }}
        >
            Quiero seguir creando grandes cosas. Me importa el progreso tecnológico y quiero mejorar lo existente.{' '}
            <span className={`about-highlight ${p5Highlight ? 'about-highlight--on' : ''}`}>
                Estoy bastante seguro de que siempre será así.
            </span>
        </p>,

        <div key="cta" className="about-cta">
            <div className="about-cta-title" style={{ color: textColor }}>
                Sé parte de mi
                <br />
                viaje.
            </div>

            <a
                className="about-cta-button"
                href="mailto:leonsanchez09@protonmail.com?subject=Hablemos&body=Hola%20Leo%2C%0A%0A"
            >
                ¡hablemos!
            </a>
        </div>,

        <div
            key="social"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                marginTop: '3rem',
            }}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '1.5rem',
                flexWrap: 'wrap',
            }}>
                {[
                    { href: "https://www.linkedin.com/in/leosanxyz/", label: "linkedin" },
                    { href: "https://www.instagram.com/leosanxyz/", label: "instagram" },
                    { href: "https://x.com/leosanxyz", label: "twitter" },
                ].map((item, i) => (
                    <a
                        key={i}
                        className="about-social-link"
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: textColor,
                            textDecoration: 'none',
                            fontWeight: 600,
                        }}
                    >
                        {item.label}
                    </a>
                ))}
            </div>

            <a
                href="mailto:leonsanchez09@protonmail.com"
                className="about-social-email"
                style={{
                    color: subTextColor,
                    textDecoration: 'none',
                    textAlign: 'center',
                    fontWeight: 500,
                }}
            >
                leonsanchez09@protonmail.com
            </a>
        </div>,
    ]), [darkMode, subTextColor, textColor, p5Highlight]);

    const totalBlocks = 1 + contentBlocks.length; // header + contenido
    const [visible, setVisible] = useState<boolean[]>(() => Array(totalBlocks).fill(false));
    const blockRefs = React.useRef<Array<HTMLElement | null>>([]);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [sidePos, setSidePos] = useState<{ top: number; left: number; opacity: number }>({ top: 0, left: 0, opacity: 0 });
    const [stevePos, setStevePos] = useState<{ top: number; left: number; opacity: number }>({ top: 0, left: 0, opacity: 0 });
    const [isDesktopWide, setIsDesktopWide] = useState<boolean | null>(null);
    const [mounted, setMounted] = useState(false);
    const [collageRevealed, setCollageRevealed] = useState(false);
    const [steveRevealed, setSteveRevealed] = useState(false);

    useEffect(() => {
        // Mantener el array sincronizado si cambia el número de bloques
        setVisible((prev) => {
            if (prev.length === totalBlocks) return prev;
            const next = Array(totalBlocks).fill(false) as boolean[];
            for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
            return next;
        });
    }, [totalBlocks]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        // Delay extra para que el collage entre después del texto (y no se vea "blurred" antes)
        if (prefersReducedMotion === null) return;
        if (prefersReducedMotion) {
            setCollageRevealed(true);
            return;
        }

        if (!visible[1]) {
            setCollageRevealed(false);
            return;
        }

        const t = window.setTimeout(() => {
            setCollageRevealed(true);
        }, 260);

        return () => window.clearTimeout(t);
    }, [prefersReducedMotion, visible]);

    useEffect(() => {
        // Delay extra para que Steve entre después del quote
        if (prefersReducedMotion === null) return;
        if (prefersReducedMotion) {
            setSteveRevealed(true);
            return;
        }

        if (!visible[IDX.QUOTE]) {
            setSteveRevealed(false);
            return;
        }

        const t = window.setTimeout(() => setSteveRevealed(true), 300);
        return () => window.clearTimeout(t);
    }, [prefersReducedMotion, visible]);

    useEffect(() => {
        // Highlight amarillo en la frase final del bloque p5 cuando llega con el scroll
        if (prefersReducedMotion === null) return;
        if (prefersReducedMotion) {
            setP5Highlight(true);
            return;
        }
        if (!visible[IDX.P5]) return;
        const t = window.setTimeout(() => setP5Highlight(true), 120);
        return () => window.clearTimeout(t);
    }, [prefersReducedMotion, visible]);

    useEffect(() => {
        // Desktop threshold para usar el espacio a la derecha
        const mql = window.matchMedia?.('(min-width: 1101px)');
        if (!mql) {
            setIsDesktopWide(true);
            return;
        }

        const update = () => setIsDesktopWide(mql.matches);
        update();

        if ('addEventListener' in mql) {
            mql.addEventListener('change', update);
            return () => mql.removeEventListener('change', update);
        }
        mql.addListener(update);
        return () => mql.removeListener(update);
    }, []);

    useEffect(() => {
        // Revelar según scroll (lo que no está a la vista aparece al scrollear)
        if (prefersReducedMotion === null) return;
        if (prefersReducedMotion) {
            setVisible(Array(totalBlocks).fill(true));
            return;
        }

        const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
            let cur: HTMLElement | null = el?.parentElement ?? null;
            while (cur) {
                const style = window.getComputedStyle(cur);
                const oy = style.overflowY;
                if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return cur;
                cur = cur.parentElement;
            }
            return null;
        };

        const firstEl = blockRefs.current.find(Boolean) ?? null;
        const root = getScrollParent(firstEl as HTMLElement | null);

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const idxAttr = (entry.target as HTMLElement).getAttribute('data-reveal-idx');
                const idx = idxAttr ? Number(idxAttr) : NaN;
                if (!Number.isFinite(idx)) continue;
                setVisible((prev) => {
                    if (prev[idx]) return prev;
                    const next = prev.slice();
                    next[idx] = true;
                    return next;
                });
                observer.unobserve(entry.target);
            }
        }, {
            root: root ?? null,
            threshold: 0.15,
            // Un poquito antes de que esté totalmente en pantalla
            rootMargin: '0px 0px -10% 0px',
        });

        // Observar todos los bloques
        for (const el of blockRefs.current) {
            if (el) observer.observe(el);
        }

        return () => observer.disconnect();
    }, [prefersReducedMotion, totalBlocks]);

    useEffect(() => {
        // Anclar el collage al inicio del primer párrafo (block index 1)
        if (isDesktopWide === false) return;
        const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
            let cur: HTMLElement | null = el?.parentElement ?? null;
            while (cur) {
                const style = window.getComputedStyle(cur);
                const oy = style.overflowY;
                if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return cur;
                cur = cur.parentElement;
            }
            return null;
        };

        const firstBlock = blockRefs.current[1] ?? null;
        const scrollRoot = getScrollParent(firstBlock as HTMLElement | null);

        let raf = 0;
        const update = () => {
            raf = 0;
            const first = blockRefs.current[1] ?? null;
            const aboutContainer = containerRef.current;
            if (!first || !aboutContainer) return;

            // El collage vive fuera del recorte horizontal, así que lo posicionamos en viewport (fixed)
            const firstRect = first.getBoundingClientRect();
            const aboutRect = aboutContainer.getBoundingClientRect();
            const rootRect = (scrollRoot ?? aboutContainer).getBoundingClientRect();

            const gap = 56;
            const width = 320;
            const margin = 24;
            const leftCandidate = aboutRect.right + gap;
            const left = Math.round(Math.min(leftCandidate, window.innerWidth - width - margin));
            // Evita que el collage invada la zona superior (bloques/leosanxyz)
            const minTop = Math.round(rootRect.top + 24);
            const topCandidate = Math.round(firstRect.top);
            const top = Math.max(topCandidate, minTop);

            // Solo ocultar si realmente no hay espacio (ventanas muy angostas)
            const hasSpace = window.innerWidth >= aboutRect.right + gap + Math.min(width, 240);
            // Si el primer párrafo ya quedó arriba del panel, desvanecer el collage (no "apagar" de golpe)
            const fadeStart = minTop + 32;
            const fadeRange = 160; // px
            const stillRelevantAlpha = Math.max(0, Math.min(1, (firstRect.bottom - fadeStart) / fadeRange));

            setSidePos({
                left,
                top,
                opacity: hasSpace ? stillRelevantAlpha : 0,
            });
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(update);
        };

        schedule();
        window.addEventListener('resize', schedule);
        scrollRoot?.addEventListener('scroll', schedule, { passive: true } as AddEventListenerOptions);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', schedule);
            scrollRoot?.removeEventListener('scroll', schedule as EventListener);
        };
    }, [contentBlocks.length, isDesktopWide]);

    useEffect(() => {
        // Anclar imagen de Steve al quote (block index 3)
        if (isDesktopWide === false) return;

        const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
            let cur: HTMLElement | null = el?.parentElement ?? null;
            while (cur) {
                const style = window.getComputedStyle(cur);
                const oy = style.overflowY;
                if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return cur;
                cur = cur.parentElement;
            }
            return null;
        };

        const quoteEl = blockRefs.current[3] ?? null;
        const scrollRoot = getScrollParent(quoteEl as HTMLElement | null);

        let raf = 0;
        const update = () => {
            raf = 0;
            const quote = blockRefs.current[3] ?? null;
            const aboutContainer = containerRef.current;
            if (!quote || !aboutContainer) return;

            const quoteRect = quote.getBoundingClientRect();
            const aboutRect = aboutContainer.getBoundingClientRect();
            const rootRect = (scrollRoot ?? aboutContainer).getBoundingClientRect();

            // Más grande, un poco más a la izquierda y más arriba (como referencia)
            const gap = 72;
            const width = 320;
            const margin = 24;
            // Colocar a la IZQUIERDA de la columna de texto (alterno al collage de la derecha)
            const leftCandidate = aboutRect.left - gap - width;
            const left = Math.round(Math.max(margin, leftCandidate));

            const minTop = Math.round(rootRect.top + 24);
            const topCandidate = Math.round(quoteRect.top - 170);
            const top = Math.max(topCandidate, minTop);

            const hasSpace = leftCandidate >= margin;

            const fadeStart = minTop + 32;
            const fadeRange = 180;
            const alpha = Math.max(0, Math.min(1, (quoteRect.bottom - fadeStart) / fadeRange));

            setStevePos({ left, top, opacity: hasSpace ? alpha : 0 });
        };

        const schedule = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(update);
        };

        schedule();
        window.addEventListener('resize', schedule);
        scrollRoot?.addEventListener('scroll', schedule, { passive: true } as AddEventListenerOptions);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', schedule);
            scrollRoot?.removeEventListener('scroll', schedule as EventListener);
        };
    }, [contentBlocks.length, isDesktopWide]);

    return (
        <div
            ref={containerRef}
            style={{
            maxWidth: '540px',
            margin: '0 auto',
            paddingTop: '2rem',
            position: 'relative',
        }}
        >
            {/* Header with avatar placeholder */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '3rem'
            }}>
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    border: `2px solid ${darkMode ? '#555' : '#ddd'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    backgroundColor: darkMode ? '#333' : '#fff',
                }}>
                    {/* Simple brain/thought icon */}
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#eee' : '#333'} strokeWidth="1.5">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <circle cx="9" cy="9" r="1" fill={darkMode ? '#eee' : '#333'} />
                        <circle cx="15" cy="9" r="1" fill={darkMode ? '#eee' : '#333'} />
                    </svg>
                </div>

                <div
                    ref={(el) => { blockRefs.current[0] = el; }}
                    data-reveal-idx={0}
                    className={`about-reveal ${visible[0] ? 'about-reveal--visible' : ''}`}
                    style={{
                        transitionDelay: prefersReducedMotion ? '0ms' : '0ms',
                    }}
                >
                    {headerNode}
                </div>
            </div>

            {/* Collage: desktop goes to document.body (no clipping by transformed scroll container) */}
            {mounted && isDesktopWide && createPortal(
                <div
                    aria-hidden="true"
                    className="about-side-media"
                    style={{
                        top: sidePos.top,
                        left: sidePos.left,
                        opacity: sidePos.opacity,
                    }}
                >
                    <div className={`about-reveal ${collageRevealed ? 'about-reveal--visible' : ''}`}>
                        {sideCollageNode}
                    </div>
                </div>,
                document.body
            )}

            {/* Steve image: desktop goes to document.body */}
            {mounted && isDesktopWide && createPortal(
                <div
                    aria-hidden="true"
                    className="about-steve-media"
                    style={{
                        top: stevePos.top,
                        left: stevePos.left,
                        opacity: stevePos.opacity,
                        // @ts-expect-error CSS custom prop
                        ['--steve-size']: '460px',
                    }}
                >
                    <div className={`about-reveal ${steveRevealed ? 'about-reveal--visible' : ''}`}>
                        {steveNode}
                    </div>
                </div>,
                document.body
            )}

            {/* Main content - text blocks */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                textAlign: 'left',
            }}>
                {contentBlocks.map((node, i) => {
                    const nodeKey = (node as { key?: React.Key })?.key ?? i;
                    return (
                        <React.Fragment key={nodeKey}>
                            {/* index global = i + 1 (header es 0) */}
                            <div
                                ref={(el) => { blockRefs.current[i + 1] = el; }}
                                data-reveal-idx={i + 1}
                                className={`about-reveal ${visible[i + 1] ? 'about-reveal--visible' : ''}`}
                                style={{
                                    // Micro-stagger extra por si el navegador agrupa timeouts muy juntos
                                    transitionDelay: prefersReducedMotion ? '0ms' : `${Math.min((i + 1) * 20, 120)}ms`,
                                }}
                            >
                                {node}
                            </div>

                            {/* Mobile/tablet: show collage in flow after first paragraph */}
                            {i === 0 && isDesktopWide === false && (
                                <div
                                    aria-hidden="true"
                                    className="about-side-media"
                                >
                                    <div className={`about-reveal ${collageRevealed ? 'about-reveal--visible' : ''}`}>
                                        {sideCollageNode}
                                    </div>
                                </div>
                            )}

                            {/* Mobile/tablet: show Steve in flow after quote */}
                            {i === 2 && isDesktopWide === false && (
                                <div
                                    aria-hidden="true"
                                    className="about-steve-media about-steve-media--inline"
                                    style={{
                                        // @ts-expect-error CSS custom prop
                                        ['--steve-size']: '280px',
                                    }}
                                >
                                    <div className={`about-reveal ${steveRevealed ? 'about-reveal--visible' : ''}`}>
                                        {steveNode}
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>


        </div>
    );
};

export default AboutMe;
