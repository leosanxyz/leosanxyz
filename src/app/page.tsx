"use client";
import { useEffect, useRef } from "react";
import Matter from "matter-js";

// Define un tipo para las propiedades personalizadas de los bloques
interface BouncingBlock extends Matter.Body {
  originX?: number;
  originY?: number;
  isBouncing?: boolean;
}

export default function Home() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  useEffect(() => {
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
        background: '#f8fafc',
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
            fillStyle: '#222',
            strokeStyle: '#444',
            lineWidth: 2,
          },
          label: displayWord[i],
        }
      );
      (block as BouncingBlock).originY = block.position.y; // dónde debe "volver"
      (block as BouncingBlock).originX = block.position.x; // posición original en X
      (block as BouncingBlock).isBouncing = false; // evita rebotes simultáneos
      blocks.push(block);
    }

    // Figuras dinámicas apiladas encima de los bloques
    const figures: Matter.Body[] = [
      Bodies.rectangle(titleX + 60, titleY - 60, 60, 30, { restitution: 0.5, render: { fillStyle: '#f59e42' } }),
      Bodies.circle(titleX + 120, titleY - 100, 20, { restitution: 0.8, render: { fillStyle: '#10b981' } }),
      Bodies.polygon(titleX + 180, titleY - 80, 3, 30, { restitution: 0.7, render: { fillStyle: '#fbbf24' } }),
      Bodies.rectangle(titleX + 200, titleY - 60, 30, 70, { restitution: 0.4, render: { fillStyle: '#6366f1' } }),
      Bodies.circle(titleX + 40, titleY - 120, 20, { restitution: 0.8, render: { fillStyle: '#f43f5e' } }),
    ];

    // Resortera y bola (posición responsiva)
    const slingStart = isMobile
      ? { x: Math.max(32, width * 0.12), y: height - 120 }
      : { x: width * 0.15, y: height - 120 }; // Desktop: inferior izquierda
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
      handleInteraction(e.clientX, e.clientY);
    });

    // Eventos touch para móvil
    render.canvas.addEventListener('touchstart', (e) => {
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
        ctx.fillStyle = "#fff";
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

    // Función auxiliar para el efecto de rebote (simplified manual bounce)
    const bounceBlock = (block: BouncingBlock) => {
      if (block.isBouncing) return;
      block.isBouncing = true;
      const origX = block.originX!;
      const origY = block.originY!;
      const bounceHeight = 20;
      console.log(`-> bounceBlock: "${block.label}" up by ${bounceHeight}px`);
      Matter.Body.setPosition(block, { x: origX, y: origY - bounceHeight });
      setTimeout(() => {
        Matter.Body.setPosition(block, { x: origX, y: origY });
        block.isBouncing = false;
        console.log(`-> bounceBlock: "${block.label}" returned to origin`);
      }, 200);
    };

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
  }, []);

  return (
    <div ref={sceneRef} className="fixed inset-0 w-full h-full min-h-screen bg-gray-50 z-0" />
  );
} 