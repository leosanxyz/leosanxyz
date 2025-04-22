"use client";
import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { GeistSans } from "geist/font/sans";

// Define un tipo para las propiedades personalizadas de los bloques
interface BouncingBlock extends Matter.Body {
  originX?: number;
  originY?: number;
  isBouncing?: boolean;
  noteIndex?: number;
  noteFrequency?: number;
}

const geist = GeistSans;

export default function Home() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const blocksRef = useRef<Matter.Body[]>([]);
  const playAnimationRef = useRef<(() => void) | null>(null);

  // Detectar si es móvil después del montaje para evitar error de hidratación
  useEffect(() => {
    // Establecer soundEnabled dependiendo del ancho de la pantalla
    const isMobile = window.innerWidth < 600;
    setSoundEnabled(!isMobile); // Apagado en móviles, encendido en desktop
  }, []);

  // Aplicar cambios al body cuando cambia el modo oscuro
  useEffect(() => {
    // Aplicar estilos al body para eliminar márgenes blancos
    document.body.style.backgroundColor = darkMode ? '#1a1a1a' : '#f8fafc';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    
    // Aplicar clase para detectar modo oscuro a nivel global
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [darkMode]);

  useEffect(() => {
    // Audio setup for block bounce sounds
    // Se crea como referencia para poder accederlo de manera lazy al interactuar con la página
    let audioContext: AudioContext | null = null;

    // Función para crear o resumir el contexto de audio (necesario para Safari)
    const getAudioContext = () => {
      if (!audioContext) {
        // Crear el contexto de audio si no existe
        audioContext = new (window.AudioContext)();
        setAudioInitialized(true);
      }
      
      // En Safari y Chrome, el contexto inicialmente está en estado "suspended"
      if (audioContext.state === 'suspended') {
        audioContext.resume();
        setAudioInitialized(true);
      }
      
      return audioContext;
    };
    
    // Función para tocar un sonido que funciona en Safari y móviles
    const playSound = (frequency: number) => {
      if (!soundEnabled) return;
      
      try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        
        osc.connect(gainNode).connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } catch (err) {
        console.log("Error reproduciendo sonido:", err);
      }
    };

    let width = window.innerWidth;
    let height = window.innerHeight;
    const blockSize = 40;
    const word = "leosanxyz";
    const spacing = 5;

    // Setup Matter.js
    const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Mouse = Matter.Mouse,
      MouseConstraint = Matter.MouseConstraint,
      Constraint = Matter.Constraint;

    const engine = Engine.create();
    engineRef.current = engine;

    const render = Render.create({
      element: sceneRef.current!,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: darkMode ? '#1a1a1a' : '#f8fafc',
      },
    });
    renderRef.current = render;

    // Suelo invisible más abajo
    const ground = Bodies.rectangle(
      width / 2,
      height + 40, // más abajo para que no se vea
      width,
      80,
      {
        isStatic: true,
        render: { visible: false }, // invisible
      }
    );

    // Paredes invisibles laterales
    const leftWall = Bodies.rectangle(-20, height / 2, 40, height * 2, {
      isStatic: true,
      render: { visible: false },
    });
    const rightWall = Bodies.rectangle(width + 20, height / 2, 40, height * 2, {
      isStatic: true,
      render: { visible: false },
    });

    // Detectar si es móvil
    const isMobile = width < 600;
    // Palabra a mostrar
    const displayWord = isMobile ? 'leosan' : word;
    // Margen derecho proporcional para responsividad
    const rightMargin = isMobile ? Math.max(12, width * 0.04) : Math.max(24, width * 0.08);
    // Bloques de 'leosanxyz' como estáticos en la parte superior derecha (más abajo)
    const titleX = isMobile
      ? width - (displayWord.length * (blockSize + spacing)) - rightMargin
      : width - (displayWord.length * (blockSize + spacing)) - rightMargin;
    const titleY = isMobile ? 100 : 120;
    const blocks: Matter.Body[] = [];
    for (let i = 0; i < displayWord.length; i++) {
      const block = Bodies.rectangle(
        titleX + i * (blockSize + spacing),
        titleY,
        blockSize,
        blockSize,
        {
          isStatic: true,
          render: {
            fillStyle: darkMode ? '#ddd' : '#222',
            strokeStyle: darkMode ? '#eee' : '#444',
            lineWidth: 2,
          },
          label: displayWord[i],
        }
      );
      (block as BouncingBlock).originY = block.position.y; // dónde debe "volver"
      (block as BouncingBlock).originX = block.position.x; // posición original en X
      (block as BouncingBlock).isBouncing = false; // evita rebotes simultáneos
      (block as BouncingBlock).noteIndex = i;
      (block as BouncingBlock).noteFrequency = 261.63 * Math.pow(Math.pow(2, 1/12), i);
      blocks.push(block);
    }

    // Guardar referencia a los bloques para poder accederlos más tarde
    blocksRef.current = blocks;

    // Figuras dinámicas apiladas encima de los bloques
    const figures: Matter.Body[] = [
      Bodies.rectangle(titleX + 60, titleY - 60, 60, 30, { restitution: 0.5, render: { fillStyle: '#f59e42' } }),
      Bodies.circle(titleX + 120, titleY - 100, 20, { restitution: 0.8, render: { fillStyle: '#10b981' } }),
      Bodies.polygon(titleX + 180, titleY - 80, 3, 30, { restitution: 0.7, render: { fillStyle: '#fbbf24' } }),
      Bodies.rectangle(titleX + 200, titleY - 60, 30, 70, { restitution: 0.4, render: { fillStyle: '#6366f1' } }),
      Bodies.rectangle(titleX + 40, titleY - 120, 40, 40, { restitution: 0.8, render: { fillStyle: '#f43f5e' } }),
    ];

    // Resortera y bola (posición responsiva)
    const slingStart = isMobile
      ? { x: width / 2, y: height - 120 }
      : { x: width / 2, y: height - 120 }; // Centrado horizontalmente
    let ball: Matter.Body | null = null;
    let sling: Matter.Constraint | null = null;
    let activeBallId: number | null = null;

    Composite.add(engine.world, [ground, leftWall, rightWall, ...blocks, ...figures]);

    // Mouse control
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.1,
        render: { visible: false },
      },
    });
    Composite.add(engine.world, mouseConstraint);

    // Permitir crear bola y resortera con mousedown cerca del círculo
    const handleInteraction = (x: number, y: number) => {
      if (!ball && !sling) {
        const rect = render.canvas.getBoundingClientRect();
        // Convertir coordenadas de página a coordenadas de canvas
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        // Zona de detección más grande en móvil
        const detectRadius = isMobile ? 120 : 60;
        const dist = Math.hypot(canvasX - slingStart.x, canvasY - slingStart.y);
        if (dist < detectRadius) {
          ball = Bodies.circle(slingStart.x, slingStart.y, 22, {
            density: 0.004,
            restitution: 0.8,
            render: { fillStyle: '#eab308' },
          });
          sling = Constraint.create({
            pointA: slingStart,
            bodyB: ball,
            stiffness: 0.05,
            render: {
              strokeStyle: '#f59e42',
              lineWidth: 6,
            },
          });
          Composite.add(engine.world, [ball, sling]);
          activeBallId = ball.id;
          console.log("New ball created. Active ID:", activeBallId);
        }
      }
    };

    // Eventos de mouse
    render.canvas.addEventListener('mousedown', (e) => {
      // Activar audio en la primera interacción del usuario
      getAudioContext();
      handleInteraction(e.clientX, e.clientY);
    });

    // Eventos touch para móvil
    render.canvas.addEventListener('touchstart', (e) => {
      // Activar audio en la primera interacción del usuario
      getAudioContext();
      if (e.touches.length > 0) {
        handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
      }
    });

    // Lógica para soltar la bola de la resortera
    Matter.Events.on(mouseConstraint, "enddrag", (event: Matter.IEvent<Matter.MouseConstraint>) => {
      if (ball && sling && (event as { body?: Matter.Body }).body === ball) {
        // Calcular vector de estiramiento
        const dx = sling.pointA.x - ball.position.x;
        const dy = sling.pointA.y - ball.position.y;
        // Normalizar y escalar la fuerza
        const forceScale = 0.002;
        const fx = dx * forceScale;
        const fy = dy * forceScale;
        setTimeout(() => {
          // Eliminar el constraint del mundo
          Composite.remove(engine.world, sling!);
          Matter.Body.applyForce(ball!, ball!.position, { x: fx, y: fy });
          // Dejar referencias listas para la siguiente bola
          ball = null;
          sling = null;
          console.log("Ball launched. Active ID remains:", activeBallId);
        }, 16);
      }
    });

    // Renderizar letras sobre los bloques y la resortera si no hay bola
    Matter.Events.on(render, "afterRender", () => {
      const ctx = render.context;
      ctx.save();
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Letras de los bloques
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        ctx.fillStyle = darkMode ? "#333" : "#fff";
        ctx.fillText(b.label || '', b.position.x, b.position.y + 2);
      }
      // Indicador visual para crear bola
      if (!ball && !sling) {
        ctx.strokeStyle = '#f59e42';
        ctx.lineWidth = isMobile ? 8 : 6;
        ctx.beginPath();
        ctx.arc(slingStart.x, slingStart.y, isMobile ? 32 : 24, 0, 2 * Math.PI);
        ctx.stroke();
        // Mensaje de ayuda
        ctx.fillStyle = '#f59e42';
        ctx.font = "16px Arial";
        ctx.fillText(isMobile ? "Toca aquí" : "Haz click aquí", slingStart.x, slingStart.y + 50);
      }
      ctx.restore();
    });

    // Función auxiliar para el efecto de rebote con interpolación
    const bounceBlock = (block: BouncingBlock) => {
      if (block.isBouncing) return;
      block.isBouncing = true;
      // Play bounce sound
      if (audioContext && soundEnabled) {
        const freq = block.noteFrequency ?? 261.63;
        playSound(freq);
      }
      const origX = block.originX!;
      const origY = block.originY!;
      const bounceHeight = 40; // stronger impulse
      const duration = 300;
      const half = duration / 2;
      const easeOutQuad = (t: number) => t * (2 - t);

      console.log(`-> bounceBlock: "${block.label}" bounceHeight=${bounceHeight}, duration=${duration}`);

      const startTime = performance.now();
      function animateUp(time: number) {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / half, 1);
        const y = origY - bounceHeight * easeOutQuad(progress);
        Matter.Body.setPosition(block, { x: origX, y });
        if (progress < 1) {
          requestAnimationFrame(animateUp);
        } else {
          const downStart = performance.now();
          function animateDown(now: number) {
            const downElapsed = now - downStart;
            const downProgress = Math.min(downElapsed / half, 1);
            const y2 = origY - bounceHeight + bounceHeight * easeOutQuad(downProgress);
            Matter.Body.setPosition(block, { x: origX, y: y2 });
            if (downProgress < 1) {
              requestAnimationFrame(animateDown);
            } else {
              Matter.Body.setPosition(block, { x: origX, y: origY });
              block.isBouncing = false;
              console.log(`-> bounceBlock: "${block.label}" returned to origin`);
            }
          }
          requestAnimationFrame(animateDown);
        }
      }
      requestAnimationFrame(animateUp);
    };

    // Añadir evento a la página completa para activar audio (necesario para Safari)
    document.addEventListener('click', () => {
      getAudioContext();
    }, { once: true });

    document.addEventListener('touchstart', () => {
      getAudioContext();
    }, { once: true });

    // Animación inicial tipo gusano para las letras tras 2s de carga
    const playWormAnimation = () => {
      blocks.forEach((blk, idx) => {
        setTimeout(() => {
          bounceBlock(blk as BouncingBlock);
        }, idx * 100);
      });
    };
    
    // Guardar referencia a la función de animación
    playAnimationRef.current = playWormAnimation;

    setTimeout(() => {
      // Intentamos iniciar el audio al lanzar la animación,
      // pero primero tenemos que esperar una interacción del usuario
      if (document.body.clientWidth) {
        getAudioContext();
      }
      playWormAnimation();
    }, 2000);

    // Detectar colisión de la bola con los bloques y aplicar rebote si es desde abajo
    Matter.Events.on(engine, 'collisionStart', (event) => {
      if (!activeBallId) {
        return;
      }

      for (const pair of event.pairs) {
        let blockHit: BouncingBlock | null = null;
        let projectile: Matter.Body | null = null;

        if (blocks.some(b => b.id === pair.bodyA.id) && pair.bodyB.id === activeBallId) {
          blockHit = pair.bodyA as BouncingBlock;
          projectile = pair.bodyB;
        } else if (blocks.some(b => b.id === pair.bodyB.id) && pair.bodyA.id === activeBallId) {
          blockHit = pair.bodyB as BouncingBlock;
          projectile = pair.bodyA;
        }

        if (blockHit && projectile) {
          console.log("\tCollision involves ball and block:", blockHit.label);
          const ballY = projectile.position.y;
          const blockY = blockHit.position.y;
          console.log(`\tBall Y: ${ballY.toFixed(2)}, Block Y: ${blockY.toFixed(2)}`);
          if (ballY > blockY) {
            console.log("\tCondition (ballY > blockY) met: Ball hit from below!");
            bounceBlock(blockHit);
          } else {
            console.log("\tCondition not met: Ball did not hit from below.");
          }
        }
      }
    });

    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);

    // Redimensionar el canvas al cambiar el tamaño de la ventana
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      render.options.width = width;
      render.options.height = height;
      render.canvas.width = width;
      render.canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    // Limpieza
    return () => {
      window.removeEventListener('resize', handleResize);
      Render.stop(render);
      Runner.stop(runner);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      if (render.canvas) render.canvas.remove();
    };
  }, [darkMode, soundEnabled]); // Agregar soundEnabled como dependencia

  // Handler para mostrar mensaje de construcción en los enlaces
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    alert('¡página aún en construcción! :)');
  };

  // Toggle para cambiar entre modo claro y oscuro
  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  // Toggle para activar/desactivar sonido
  const toggleSound = () => {
    setSoundEnabled(prev => {
      const newState = !prev;
      if (newState && playAnimationRef.current) {
        // Si activamos el sonido, reproducir animación de gusano
        playAnimationRef.current();
      }
      return newState;
    });
    
    // Crear evento de interacción fingido para iniciar el audio si es necesario
    if (!audioInitialized) {
      const event = new Event('click');
      document.dispatchEvent(event);
      setAudioInitialized(true);
    }
  };

  return (
    <>
      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          width: 100%;
          height: 100%;
          background-color: ${darkMode ? '#1a1a1a' : '#f8fafc'};
        }
      `}</style>
      
      <div 
        ref={sceneRef} 
        className="fixed inset-0 w-full h-full min-h-screen z-0"
        style={{ 
          backgroundColor: darkMode ? '#1a1a1a' : '#f8fafc',
        }}
      />
      
      {/* Dark Mode Switch */}
      <button 
        onClick={toggleDarkMode}
        className="fixed z-20 flex items-center justify-center rounded-full shadow-md hover:shadow-lg transition-all duration-300"
        style={{ 
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          top: '40px',         // Más arriba
          left: '24px',        // Cerca del margen izquierdo
          width: '48px',       // Tamaño grande
          height: '48px'       // Tamaño grande
        }}
        aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
      >
        {darkMode ? (
          // Luna
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        ) : (
          // Sol
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        )}
      </button>

      {/* Sound Toggle Button */}
      <button 
        onClick={toggleSound}
        className="fixed z-20 flex items-center justify-center rounded-full shadow-md hover:shadow-lg transition-all duration-300"
        style={{ 
          backgroundColor: darkMode ? '#333' : '#fff',
          color: darkMode ? '#fff' : '#333',
          top: '100px',        // Debajo del botón de modo oscuro
          left: '24px',        // Misma alineación horizontal
          width: '48px',       // Mismo tamaño
          height: '48px'       // Mismo tamaño
        }}
        aria-label={soundEnabled ? "Desactivar sonido" : "Activar sonido"}
      >
        {soundEnabled ? (
          // Icono de volumen alto
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
        ) : (
          // Icono de volumen apagado
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        )}
      </button>

      <div 
        className={geist.className} 
        style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          textAlign: 'center', 
          zIndex: 10 
        }}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <li style={{ margin: '1rem 0' }}>
            <a 
              href="/blog" 
              style={{ 
                fontSize: '2rem', 
                color: darkMode ? '#fff' : '#333', 
                textDecoration: 'none' 
              }} 
              onClick={handleNavClick}
            >
              blog
            </a>
          </li>
          <li style={{ margin: '1rem 0' }}>
            <a 
              href="/diseno" 
              style={{ 
                fontSize: '2rem', 
                color: darkMode ? '#fff' : '#333', 
                textDecoration: 'none' 
              }} 
              onClick={handleNavClick}
            >
              diseño
            </a>
          </li>
          <li style={{ margin: '1rem 0' }}>
            <a 
              href="/proyectos" 
              style={{ 
                fontSize: '2rem', 
                color: darkMode ? '#fff' : '#333', 
                textDecoration: 'none' 
              }} 
              onClick={handleNavClick}
            >
              proyectos
            </a>
          </li>
          <li style={{ margin: '1rem 0' }}>
            <a 
              href="/about" 
              style={{ 
                fontSize: '2rem', 
                color: darkMode ? '#fff' : '#333', 
                textDecoration: 'none' 
              }} 
              onClick={handleNavClick}
            >
              sobre mi:)
            </a>
          </li>
        </ul>
      </div>
    </>
  );
} 