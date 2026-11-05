import type { ShaderFrame, ShaderStrip } from '../../../shared/cosmetics'
import { NOISE } from '../../portal/pass/materials/shaders'

// Plates and frames share the materials' noise but no textures: each is a shade(p, sd) over a rounded box.
// p: design units with the origin at the box's bottom-left (y up); sd: distance to the box's rounded edge, negative inside.
// Everything animated loops on uT/uLoop (periodic noise, whole turns) so the baked sheet closes its cycle.
const HEAD = `#version 300 es
precision highp float;
out vec4 o;
uniform float uT, uLoop, uClock, uSpeed, uHover, uSprite, uRadius, uDpr;
uniform vec2 uBox, uPad, uRes, uPtr, uLamp, uTilt;
const float TAU = 6.2831853;
${NOISE}
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float sdBox(vec2 p){ return sdRound(p - uBox*.5, uBox*.5, uRadius); }
vec2 sdN(vec2 p){ float s = sdBox(p); return normalize(vec2(sdBox(p + vec2(.5, 0.)) - s, sdBox(p + vec2(0., .5)) - s) + 1e-6); }
float lum(vec3 c){ return dot(c, vec3(.3,.59,.11)); }
// the loop's phase, 0..1
float phase(){ return uT/uLoop; }
// a circle through noise space: any noise read at p + orbit(r) loops with the sheet
vec2 orbit(float r, float k){ float a = TAU*phase()*k; return r*vec2(cos(a), sin(a)); }
// screen pixels per design unit, so hairlines measure the same baked or live
float pxu(){ return uRes.x/(uBox.x + 2.*uPad.x); }
// the pointer in design units, far away when there is none
vec2 ptr(){ return uPtr.x < -1. ? vec2(-1e4) : uPtr*uBox; }
// distance along the rounded box's perimeter, counterclockwise from the bottom of its right side
float perim(vec2 p){
  vec2 h = uBox*.5, q = p - h; float r = uRadius; vec2 a = h - r;
  float PI = 3.14159265;
  if (abs(q.x) <= a.x && abs(q.y) <= a.y){
    if (h.x - abs(q.x) < h.y - abs(q.y)) q.x = sign(q.x)*h.x; else q.y = sign(q.y)*h.y;
  }
  if (abs(q.x) > a.x && abs(q.y) > a.y){
    vec2 c = vec2(sign(q.x)*a.x, sign(q.y)*a.y), d = q - c;
    float th = atan(d.y, d.x); if (th < 0.) th += TAU;
    if (q.x > 0. && q.y > 0.) return 2.*a.y + r*th;
    if (q.x < 0. && q.y > 0.) return 2.*a.y + PI*r*.5 + 2.*a.x + r*(th - PI*.5);
    if (q.x < 0.) return 4.*a.y + PI*r + 2.*a.x + r*(th - PI);
    return 4.*a.y + 1.5*PI*r + 4.*a.x + r*(th - 1.5*PI);
  }
  if (abs(q.x) > a.x) return q.x > 0. ? q.y + a.y : 2.*a.y + PI*r*.5 + 2.*a.x + PI*r*.5 + (a.y - q.y);
  return q.y > 0. ? 2.*a.y + PI*r*.5 + (a.x - q.x) : 4.*a.y + 1.5*PI*r + 2.*a.x + (q.x + a.x);
}
float perimLen(){ vec2 a = uBox*.5 - uRadius; return 4.*(a.x + a.y) + TAU*uRadius; }
// negro → rojo → naranja → amarillo → blanco
vec3 fireRamp(float x){
  vec3 c = mix(vec3(0.), vec3(.42,.02,.0), smoothstep(.0,.18,x));
  c = mix(c, vec3(.92,.16,.02), smoothstep(.14,.38,x));
  c = mix(c, vec3(1.,.5,.07), smoothstep(.34,.6,x));
  c = mix(c, vec3(1.,.83,.32), smoothstep(.56,.8,x));
  return mix(c, vec3(1.,.98,.9), smoothstep(.8,1.,x));
}
vec3 goldRamp(float x){
  vec3 c = mix(vec3(.16,.08,.0), vec3(.55,.32,.04), smoothstep(.0,.3,x));
  c = mix(c, vec3(.93,.68,.2), smoothstep(.25,.6,x));
  c = mix(c, vec3(1.,.9,.55), smoothstep(.55,.85,x));
  return mix(c, vec3(1.,.99,.9), smoothstep(.85,1.,x));
}
// jagged offset along a bolt
float jag(float x, float s){ return gnoise(vec2(x*.09, s), 1e4) + .5*gnoise(vec2(x*.23, s + 3.7), 1e4) + .25*gnoise(vec2(x*.6, s + 8.1), 1e4); }
float boltD(vec2 p, vec2 a, vec2 b, float amp, float s){
  vec2 ab = b - a; float L = max(length(ab), 1.); vec2 dir = ab/L, nr = vec2(-dir.y, dir.x);
  vec2 pa = p - a; float x = dot(pa, dir), y = dot(pa, nr);
  if (x < -12. || x > L + 12. || abs(y) > amp*1.6 + 12.) return 1e3;
  float xc = clamp(x, 0., L);
  float j = jag(xc, s)*amp*sqrt(sin(3.14159*xc/L));
  return length(vec2(max(0., max(-x, x - L)), y - j));
}
`
const TAIL = `
void main(){
  vec2 full = uBox + 2.*uPad;
  vec2 p = gl_FragCoord.xy/uRes*full - uPad;
  vec4 c = shade(p, sdBox(p));
  // the light fades before the canvas edge so its rectangle never shows
  vec2 e = min(p + uPad, full - uPad - p);
  c *= smoothstep(0., min(uPad.x, uPad.y)*.6, min(e.x, e.y));
  // As with the materials: on the app's light pages added light turns white, so it carries its brightest channel as alpha.
  c = clamp(c, 0., 1.);
  c.a = max(c.a, max(c.r, max(c.g, c.b)));
  o = c;
}`
const fsOf = (body: string) => HEAD + body + TAIL

// ——— Plates: 220 × 36, the name sits on the left third, so the busiest light stays on the edges and the right.

const BRASA = `
// la franja es carbón con vetas de brasa; arriba le salen lenguas de fuego y chispas
const float PER = 4.;
float tongues(vec2 p){
  float ph = phase()*PER;
  float above = p.y - uBox.y;
  vec2 q = vec2(p.x*.075, above*.07 - ph);
  vec2 w = vec2(fbm(q*.6, 2.), fbm(q*.6 + vec2(5.2, 1.), 2.));
  float n = fbm(q + w*1.4, PER);
  float n01 = clamp(n*1.5 + .5, 0., 1.);
  // más fuego hacia la derecha y en las esquinas, donde no estorba al nombre
  float bias = .55 + .45*smoothstep(.25, .95, p.x/uBox.x) + .25*exp(-p.x/14.);
  float sd = sdBox(p);
  // arriba las lenguas suben; a los lados y abajo el fuego apenas lame el borde
  float up = smoothstep(uBox.y*.4, uBox.y, p.y);
  float reach = mix(3.5, 17.*bias, up);
  float fuel = smoothstep(reach, -2., sd)*mix(.7, bias, up);
  float f = fuel*1.3 - (1. - n01)*.95;
  return pow(clamp(f*1.2, 0., 1.), 1.4);
}
vec3 sparks(vec2 p){
  vec3 acc = vec3(0.);
  for (int k = 0; k < 7; k++){
    float fk = float(k), h = hash12(vec2(fk, 3.1));
    float t = fract(phase()*(1. + floor(h*2.)) + h*7.);
    vec2 c = vec2((.3 + .7*hash12(vec2(fk, 9.)))*uBox.x + sin(t*TAU + fk)*5., uBox.y - 2. + t*22.);
    float d = length(p - c);
    acc += (vec3(1.,.45,.08)*exp(-d*d/3.) + vec3(1.,.9,.6)*exp(-d*d/.35))*smoothstep(1., .55, t)*smoothstep(0., .1, t);
  }
  return acc;
}
vec4 shade(vec2 p, float sd){
  float inside = clamp(.5 - sd*pxu(), 0., 1.);
  float edge = -sd;
  vec2 lp = ptr();
  vec3 col = vec3(0.);
  if (sd < 1.){
    // vetas: curvas de nivel de un ruido que fluye en círculo, más vivas lejos del nombre
    vec2 q = p*vec2(.055, .09) + orbit(.6, 1.);
    float n = fbmP(q, vec2(64.));
    float vein = smoothstep(.04, .0, abs(n - .05)) + .6*smoothstep(.025, .0, abs(n + .18));
    // el nombre vive a la izquierda: ahí el carbón descansa y las vetas apenas laten
    float heat = .18 + .82*smoothstep(.3, .95, p.x/uBox.x);
    float pulse = .7 + .3*sin(TAU*phase()*2. + p.x*.05);
    float near = exp(-length(p - lp)/26.)*uHover;
    vec3 coal = mix(vec3(.07,.05,.045), vec3(.13,.07,.04), smoothstep(36., 0., p.y));
    col = coal + fireRamp(vein*heat*pulse*.8 + near*.4)*vein*heat*1.1 + vec3(.4,.1,.02)*near*.3;
    // el borde de arriba arde; el resto es un filo de brasa
    col += vec3(1.,.42,.08)*smoothstep(1.4, .0, edge)*(.45 + .55*smoothstep(uBox.y - 8., uBox.y, p.y));
    col += vec3(.9,.25,.03)*exp(-(uBox.y - p.y)/6.)*.18;
    col *= inside;
  }
  float d = max(sd, 0.);
  float f = tongues(p);
  vec3 fire = fireRamp(f)*1.1;
  vec3 glow = vec3(1.,.4,.09)*(exp(-d/5.)*.32 + exp(-d/16.)*.16)*(.75 + .25*sin(uClock*11.)*sin(uClock*7.3));
  vec3 outside = (fire + glow + sparks(p))*(1. - inside);
  return vec4(col + outside, inside);
}`

const RAYO_STRIP = `
// tormenta en una franja: arcos que corren por el borde y saltan fuera, y el cuerpo se ilumina con cada golpe
const vec3 E1 = vec3(.5,.88,1.), E2 = vec3(.66,.5,1.);
vec3 strike(vec2 p, float seed, out float lit){
  float h1 = hash12(vec2(seed, 1.)), h2 = hash12(vec2(seed, 2.)), h3 = hash12(vec2(seed, 3.));
  vec2 a, b;
  float side = h3 < .5 ? uBox.y + .5 : -.5;
  if (h1 < .45){
    // corre por el borde
    float x0 = (.15 + .55*h2)*uBox.x;
    a = vec2(x0, side); b = vec2(x0 + (40. + 60.*h1)*(h2 > .5 ? 1. : -1.), side);
  } else {
    // salta hacia fuera
    float x0 = (.35 + .6*h2)*uBox.x;
    a = vec2(x0, side); b = a + vec2((h1 - .7)*40., (h3 < .5 ? 1. : -1.)*(10. + 12.*h1));
  }
  vec2 lp = ptr();
  if (uHover > .5 && h2 > .5) { a = vec2(clamp(lp.x, 6., uBox.x - 6.), side); b = lp + vec2(0., (lp.y > uBox.y*.5 ? 1. : -1.)*4.); }
  float d = boltD(p, a, b, 5., seed*13.);
  vec2 ab = b - a; float L = max(length(ab), 1.);
  lit = exp(-length(p - (a + b)*.5)/max(L, 30.));
  float w = max(.45, .8/pxu());
  vec3 c = mix(E1, E2, h2);
  // el impacto: un destello donde termina
  float di = length(p - b);
  return c*(exp(-d/1.2)*.9 + exp(-d/4.5)*.4) + vec3(.93,.97,1.)*smoothstep(w + .8/pxu(), w*.3, d)*1.6 + c*exp(-di/3.)*.8;
}
vec4 shade(vec2 p, float sd){
  float inside = clamp(.5 - sd*pxu(), 0., 1.);
  float fr = floor(phase()*24.);
  vec3 bolt = vec3(0.); float lit = 0.;
  for (int k = 0; k < 3; k++){
    float seed = fr + float(k)*61. + floor(fr/2.)*.37;
    float on = step(k == 0 ? .0 : .45, hash12(vec2(fr, float(k) + 9.)));
    float l; vec3 s = strike(p, seed, l);
    bolt += s*on*(.6 + .4*hash12(vec2(fr, 4.)));
    lit += l*on;
  }
  vec3 col = vec3(0.);
  if (sd < 1.){
    vec2 q = p*vec2(.03, .06) + orbit(.5, 1.);
    float cloud = fbmP(q, vec2(64.))*.5 + .5;
    col = mix(vec3(.03,.05,.12), vec3(.08,.12,.26), cloud);
    col += vec3(.25,.5,1.)*min(lit, 1.5)*.45*cloud;
    // un hilo eléctrico a 2.5 del borde que se enciende con los golpes
    col += mix(E1, E2, .3)*smoothstep(.9/pxu() + .4, .1, abs(-sd - 2.5))*(.25 + lit*1.2);
    col = col*inside + bolt*inside;
  }
  float d = max(sd, 0.);
  vec3 glow = mix(E1, E2, .4)*(exp(-d/5.)*.2 + exp(-d/14.)*.1)*(.6 + lit*.8);
  return vec4(col + (glow + bolt)*(1. - inside), inside);
}`

const ESCARCHA_STRIP = `
// hielo claro: la escarcha crece desde los bordes como helechos, y un reflejo frío sigue a la lámpara
const vec3 ICE = vec3(.84,.93,1.);
float fern(vec2 p, float grow){
  float e = -sdBox(p);
  vec2 q = p*.12 + orbit(.25, 1.);
  float r = 1. - abs(fbmP(q, vec2(64.))*2.);
  float r2 = 1. - abs(gnoiseP(p*.38 + orbit(.4, 1.)*2., vec2(256.))*2.);
  // crece desde las esquinas y el borde derecho; el nombre, a la izquierda, queda en hielo limpio
  float side = .45 + .55*smoothstep(.35, 1., p.x/uBox.x);
  float reach = (3. + 8.*grow)*(.6 + .8*r)*side;
  return smoothstep(reach, reach*.3, e)*smoothstep(.5, .9, r*.6 + r2*.55);
}
vec4 shade(vec2 p, float sd){
  float inside = clamp(.5 - sd*pxu(), 0., 1.);
  float grow = .55 + .45*sin(TAU*phase());
  vec2 lamp = uHover > .5 ? ptr() : vec2((.5 + .55*cos(TAU*phase()))*uBox.x, uBox.y*.7);
  vec3 col = vec3(0.);
  if (sd < 1.){
    // hielo pulido: claro arriba, un poco más profundo abajo, con grietas finas que no se mueven
    col = mix(vec3(.6,.78,.93), vec3(.88,.95,1.), smoothstep(0., uBox.y, p.y));
    float crack = smoothstep(.02, .0, abs(gnoise(p*vec2(.05, .11) + 3.1, 1e4)));
    col = mix(col, vec3(1.), crack*.5);
    float fr = fern(p, grow);
    col = mix(col, vec3(.97,.99,1.), fr*.85);
    col += vec3(.55,.8,1.)*fr*.15;
    // reflejo: una banda diagonal fría donde está la lámpara
    float band = exp(-pow((p.x - lamp.x) + (p.y - uBox.y*.5)*.8, 2.)/180.);
    col += vec3(.9,.97,1.)*band*.35;
    // destellos sobre la escarcha
    vec2 g = floor(p/3.);
    float h = hash12(g);
    float tw = pow(max(0., sin(TAU*(phase()*2. + h*7.))), 24.);
    col += vec3(1.)*step(.93, h)*tw*fr*1.2;
    // filo: hielo grueso, oscuro por fuera y con una línea de luz justo adentro
    col = mix(col, vec3(.36,.58,.82), smoothstep(1.4, .2, -sd));
    col += vec3(.9,.97,1.)*smoothstep(.9, 0., abs(-sd - 2.))*.45;
    col *= inside;
  }
  // fuera: niebla fría que se derrama, y astillas que brillan
  float d = max(sd, 0.);
  vec2 mq = p*vec2(.04, .08) + orbit(.5, 1.);
  float mist = smoothstep(-.1, .5, fbmP(mq, vec2(64.)))*exp(-d/9.);
  vec3 glow = ICE*(exp(-d/4.)*.28 + mist*.35);
  vec3 shards = vec3(0.);
  for (int k = 0; k < 5; k++){
    float fk = float(k), h = hash12(vec2(fk, 11.));
    vec2 c = vec2((.1 + .85*hash12(vec2(fk, 2.)))*uBox.x, h < .5 ? uBox.y + 3. + 6.*h : -3. - 6.*h);
    vec2 r = abs(p - c);
    float star = exp(-(r.x*1.6 + r.y*.35)*1.2) + exp(-(r.y*1.6 + r.x*.35)*1.2);
    shards += vec3(.92,.97,1.)*star*pow(max(0., sin(TAU*(phase() + h))), 6.)*.9;
  }
  return vec4(col + (glow + shards)*(1. - inside), inside);
}`

const ORO_STRIP = `
// oro líquido: la superficie se mueve lenta, refleja un estudio de luz y gotea por abajo
float height(vec2 p){ return fbmP(p*vec2(.035, .07) + orbit(.45, 1.), vec2(64.)); }
vec3 gold(vec2 p, vec2 lamp){
  float e = .6, h = height(p);
  vec2 g = vec2(height(p + vec2(e, 0.)) - h, height(p + vec2(0., e)) - h)/e;
  vec3 n = normalize(vec3(-g*26., 1.));
  // la franja es un cilindro: se curva hacia los bordes de arriba y abajo
  float v = (p.y/uBox.y)*2. - 1.;
  n = normalize(n + vec3(0., v*.9, 0.));
  vec3 L = normalize(vec3((lamp - p)/vec2(uBox.x, uBox.y*3.), .7));
  float diff = clamp(dot(n, L), 0., 1.);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0., 0., 1.)), 0., 1.), 28.);
  // el estudio: dos ventanas que se reflejan como franjas
  float env = smoothstep(.25, .05, abs(n.y - .35)) + .6*smoothstep(.2, .04, abs(n.y + .45));
  return goldRamp(.32 + diff*.38 + env*.22) + vec3(1.,.95,.8)*spec*1.1;
}
float drip(vec2 p, out float bead){
  float acc = 0.; bead = 0.;
  for (int k = 0; k < 3; k++){
    float fk = float(k), h = hash12(vec2(fk, 5.));
    float x = (.22 + .26*fk + .1*h)*uBox.x;
    float t = fract(phase() + h);
    // la gota se estira bajo el borde y cae
    float len = 3. + 12.*smoothstep(0., .7, t);
    float fall = smoothstep(.7, 1., t)*18.;
    float y0 = -fall;
    float w = 2.2*(1. - .5*smoothstep(0., .7, t));
    vec2 q = p - vec2(x, y0);
    float neck = smoothstep(w, w*.4, abs(q.x))*step(-len, q.y)*step(q.y, 1. - fall*.0)*step(fall, .1);
    float drop = smoothstep(2.6, 1.6, length(q - vec2(0., -len)));
    acc += max(neck, drop);
    bead += drop;
  }
  return clamp(acc, 0., 1.);
}
vec4 shade(vec2 p, float sd){
  float inside = clamp(.5 - sd*pxu(), 0., 1.);
  vec2 lamp = uHover > .5 ? ptr() : vec2((.5 + .6*cos(TAU*phase()))*uBox.x, uBox.y*(.8 + .5*sin(TAU*phase())));
  float bead; float dr = drip(p, bead);
  float a = max(inside, dr*(1. - inside));
  vec3 col = vec3(0.);
  if (a > 0.) col = gold(p, lamp)*a;
  // el borde: un filo brillante, y la gota cuelga con su propio brillo
  col += vec3(1.,.9,.6)*smoothstep(1., 0., abs(sd + .6))*.35*inside;
  col += vec3(1.,.95,.75)*bead*.25;
  float d = max(sd, 0.);
  vec3 glow = vec3(1.,.78,.3)*(exp(-d/4.)*.25 + exp(-d/14.)*.12);
  return vec4(col + glow*(1. - a), a);
}`

// ——— Frames: around the 270 × 393.6 card. The art shows through; only a band at the edge and what it throws outside are drawn.

const LLAMAS = `
const float PER = 4.;
float flame(vec2 p, float sd){
  float ph = phase()*PER;
  vec2 q = vec2(p.x*.05, p.y*.045 - ph);
  vec2 w = vec2(fbm(q*.55, 2.), fbm(q*.55 + vec2(5.2, 1.), 2.));
  float n = fbm(q + w*1.5, PER);
  float n01 = clamp(n*1.5 + .5, 0., 1.);
  // las llamas suben: arriba son largas, a los lados lamen hacia arriba, abajo apenas
  vec2 nr = sdN(p);
  float up = .35 + .65*smoothstep(-.6, 1., nr.y);
  float reach = 10. + 26.*up;
  float fuel = smoothstep(reach, -3., sd)*smoothstep(-9., -2., sd);
  float f = fuel*1.3 - (1. - n01)*.95;
  return pow(clamp(f*1.15, 0., 1.), 1.35);
}
vec3 embers(vec2 p){
  vec3 acc = vec3(0.);
  for (int k = 0; k < 9; k++){
    float fk = float(k), h = hash12(vec2(fk, 3.7));
    float t = fract(phase()*(1. + floor(h*2.)) + h*5.);
    vec2 c = vec2((.05 + .9*hash12(vec2(fk, 1.)))*uBox.x + sin(t*TAU*1. + fk)*6., uBox.y - 4. + t*46.);
    float d = length(p - c);
    acc += (vec3(1.,.42,.07)*exp(-d*d/5.) + vec3(1.,.9,.6)*exp(-d*d/.6))*smoothstep(1., .5, t)*smoothstep(0., .08, t);
  }
  return acc;
}
vec4 shade(vec2 p, float sd){
  if (sd < -16.) return vec4(0.);
  float f = flame(p, sd);
  vec2 lp = ptr();
  float near = exp(-length(p - lp)/60.)*uHover;
  vec3 col = fireRamp(min(1., f + near*.15*f))*1.15;
  // un filo de brasa en el borde de la carta, y la luz del fuego que entra un poco sobre el arte
  float rim = smoothstep(1.6, 0., abs(sd + 1.));
  col += vec3(1.,.5,.12)*rim*.7;
  float inner = smoothstep(-10., 0., sd)*step(sd, 0.);
  col += vec3(.9,.3,.04)*inner*inner*inner*.4;
  float d = max(sd, 0.);
  float flick = .8 + .2*sin(uClock*12.)*sin(uClock*7.1);
  col += vec3(1.,.4,.09)*(exp(-d/10.)*.22 + exp(-d/26.)*.1)*flick;
  col += embers(p)*step(0., sd);
  return vec4(col, 0.);
}`

const ESCARCHA_FRAME = `
const vec3 ICE = vec3(.84,.93,1.);
vec4 shade(vec2 p, float sd){
  if (sd < -18.) return vec4(0.);
  float grow = .6 + .4*sin(TAU*phase());
  float s = perim(p);
  // escarcha: helechos que entran desde el borde
  vec2 q = vec2(s*.06, sd*.12) + orbit(.25, 1.);
  float r = 1. - abs(fbmP(q, vec2(64.))*2.);
  float r2 = 1. - abs(gnoiseP(vec2(s*.2, sd*.35) + orbit(.4, 1.)*2., vec2(256.))*2.);
  float reach = (6. + 10.*grow)*(.6 + .8*r);
  float fr = smoothstep(reach, reach*.35, -sd)*step(sd, .5)*smoothstep(.5, .95, r*.6 + r2*.55);
  vec3 col = vec3(.82,.92,1.)*fr;
  float a = fr*.9;
  // el borde: hielo grueso y translúcido
  float band = smoothstep(-6.5, -5., sd)*smoothstep(1., -.2, sd);
  vec2 L = normalize(uHover > .5 ? ptr() - uBox*.5 : vec2(cos(TAU*phase()), sin(TAU*phase())));
  float facing = .5 + .5*dot(sdN(p), L);
  // hielo con grosor: azul profundo en el centro del filo, blanco donde le da la luz
  float across = smoothstep(-6.5, 1., sd);
  vec3 ice = mix(vec3(.36,.6,.86), vec3(.72,.88,1.), across);
  col = mix(col, ice + vec3(1.)*pow(facing, 6.)*.7, band);
  col += vec3(1.)*smoothstep(.9, 0., abs(sd + .4))*facing*.6;
  a = max(a, band*.95);
  // carámbanos que cuelgan del borde de abajo
  float below = -p.y;
  float x = p.x;
  float cell = floor(x/9.), cx = (cell + .5)*9.;
  float h = hash12(vec2(cell, 4.));
  float len = (3. + 16.*h*h)*(.85 + .15*grow)*step(.35, h)*step(uRadius, x)*step(x, uBox.x - uRadius);
  float wid = 2.6*(1. - clamp(below/max(len, .1), 0., 1.));
  float ic = step(0., below)*step(below, len)*smoothstep(wid, wid*.5, abs(x - cx));
  col = mix(col, mix(vec3(.5,.74,.95), vec3(.93,.98,1.), smoothstep(0., 1., abs(x - cx)/max(wid, .1)*0. + clamp(below/max(len, .1), 0., 1.))), ic);
  a = max(a, ic*.95);
  // gota de luz que baja por cada carámbano
  float drop = exp(-pow((below - fract(phase()*2. + h)*len), 2.)/.8)*ic;
  col += vec3(1.)*drop*.8;
  // destellos sobre la escarcha y el borde
  vec2 g = floor(vec2(s, sd)/3.);
  float hh = hash12(g);
  col += vec3(1.)*step(.9, hh)*pow(max(0., sin(TAU*(phase()*2. + hh*9.))), 20.)*max(fr, band)*1.4;
  // niebla fría fuera
  float d = max(sd, 0.);
  float mist = smoothstep(-.1, .5, fbmP(vec2(s*.03, d*.05) + orbit(.5, 1.), vec2(64.)))*exp(-d/14.);
  col += ICE*(exp(-d/6.)*.2 + mist*.32)*(1. - a);
  return vec4(col, a);
}`

const CIRCUITO = `
const vec3 CY = vec3(.43,.85,1.), VI = vec3(.62,.45,1.);
vec4 shade(vec2 p, float sd){
  if (sd < -15.) return vec4(0.);
  float P = perimLen(), s = perim(p), e = -sd;
  float px = 1./pxu();
  // la placa: un sustrato oscuro de 12 unidades por dentro del borde
  float sub = smoothstep(13., 12., e)*smoothstep(-.6, .4, e);
  vec3 col = vec3(.04,.07,.13)*sub; float a = sub*.92;
  // tres pistas; en cada celda una pista salta a la de al lado en diagonal
  float lanes[3] = float[3](3., 6.5, 10.);
  float cellW = 14., cell = floor(s/cellW), u = s - cell*cellW;
  float trace = 0., pulse = 0.;
  for (int k = 0; k < 3; k++){
    float y = lanes[k];
    float h = hash12(vec2(cell, float(k)));
    float jump = step(.72, h) * (k < 2 ? 1. : -1.);
    float ty = y + jump*(lanes[min(k + 1, 2)] - y)*smoothstep(5., 9., u);
    float d = abs(e - ty)/(1. + abs(jump)*.3);
    float gap = step(.08, hash12(vec2(cell, float(k) + 7.)));
    float line = smoothstep(.55 + px, .55, d)*gap;
    trace += line;
    // paquetes de luz que corren por cada pista, vueltas enteras por ciclo
    float speed = float(k) == 1. ? -2. : 1. + float(k);
    float head = fract(s/P - phase()*speed + float(k)*.31);
    float tail = exp(-head*P/22.) + exp(-(1. - head)*P/1.5);
    pulse += line*tail;
    // pads en los saltos
    float pad = smoothstep(1.4 + px, 1.4, length(vec2(u - 5., e - y)))*step(.72, h);
    trace += pad;
    pulse += pad*tail*.5;
  }
  trace = clamp(trace, 0., 1.);
  float buzz = uSprite > .5 ? 1. : .75 + .25*sin(uClock*30. + s*.4);
  col += CY*trace*.45*buzz + mix(CY, vec3(.92,.98,1.), .6)*min(pulse, 1.)*1.8;
  // el borde externo: un hilo fino
  float edge = smoothstep(.6 + px, .6, abs(e - .6));
  col += CY*edge*.6;
  a = max(a, max(trace, edge)*.95);
  // arcos que saltan del borde hacia fuera, cerca del puntero si lo hay
  float fr = floor(phase()*18.);
  vec2 lp = ptr();
  for (int k = 0; k < 2; k++){
    float seed = fr + float(k)*41.;
    float on = step(.45, hash12(vec2(seed, 3.)));
    vec2 c = uBox*.5;
    // de un lado al azar, hacia fuera
    float side = floor(hash12(vec2(seed, 2.))*4.);
    float t = hash12(vec2(seed, 5.));
    vec2 st = side < 1. ? vec2(uBox.x, mix(20., uBox.y - 20., t)) : side < 2. ? vec2(mix(20., uBox.x - 20., t), uBox.y) : side < 3. ? vec2(0., mix(20., uBox.y - 20., t)) : vec2(mix(20., uBox.x - 20., t), 0.);
    vec2 out_ = normalize(st - c)*vec2(1., .6);
    vec2 en = st + normalize(out_)*(14. + 14.*hash12(vec2(seed, 6.)));
    if (uHover > .5 && k == 0) { en = lp; on = step(sdBox(lp), 40.)*step(0., sdBox(lp) + 30.); st = lp - sdN(lp)*sdBox(lp); }
    float d = boltD(p, st, en, 5., seed*7.);
    col += (CY*(exp(-d/1.3)*.6 + exp(-d/5.)*.25) + vec3(.93,.97,1.)*smoothstep(.5 + px, .15, d)*1.3)*on;
  }
  float d = max(sd, 0.);
  col += mix(CY, VI, .5 + .5*sin(s/P*TAU*2.))*(exp(-d/6.)*.16 + exp(-d/18.)*.07)*(1. - a);
  return vec4(col, a);
}`

const ORO_FRAME = `
float height(vec2 p){ return fbmP(p*.045 + orbit(.45, 1.), vec2(64.)); }
vec4 shade(vec2 p, float sd){
  if (sd < -14.) return vec4(0.);
  float e = -sd;
  // el marco: un tubo de oro de 9 unidades; abajo se engrosa donde se junta el oro que gotea
  float pool = smoothstep(40., 0., p.y)*(.6 + .4*gnoise(vec2(p.x*.08, 3.), 1e4));
  float W = 8. + 4.*pool;
  float tube = smoothstep(W + .6, W - .4, e)*smoothstep(-1.2, -.2, e);
  // gotas que cuelgan del borde de abajo, se estiran y caen
  float dr = 0., bead = 0.;
  for (int k = 0; k < 4; k++){
    float fk = float(k), h = hash12(vec2(fk, 8.));
    float x = (.16 + .22*fk + .08*h)*uBox.x;
    float t = fract(phase() + h*.73);
    float len = 4. + 22.*smoothstep(0., .75, t);
    float fall = smoothstep(.75, 1., t)*40.;
    vec2 q = p - vec2(x, -fall);
    float w = 3.*(1. - .55*smoothstep(0., .75, t));
    float neck = smoothstep(w, w*.4, abs(q.x))*step(-len, q.y)*step(q.y, .5)*step(fall, .1);
    float drop = smoothstep(3.4, 2.4, length((q - vec2(0., -len))*vec2(1., .85)));
    dr = max(dr, max(neck, drop));
    bead += drop;
  }
  float a = max(tube, dr);
  if (a <= 0.){
    float d = max(sd, 0.);
    vec3 glow = vec3(1.,.78,.3)*(exp(-d/6.)*.2 + exp(-d/20.)*.08);
    return vec4(glow, 0.);
  }
  // normal: el tubo redondeado más el ruido que fluye
  float hh = height(p), ee = .7;
  vec2 g = vec2(height(p + vec2(ee, 0.)) - hh, height(p + vec2(0., ee)) - hh)/ee;
  vec2 nr = sdN(p);
  float across = clamp((e - W*.5)/(W*.5), -1., 1.);
  vec3 n = normalize(vec3(-g*22. - nr*across*1.4, 1.));
  if (dr > tube) n = normalize(vec3(-g*10., 1.));
  vec2 lamp = uHover > .5 ? ptr() : uBox*vec2(.5 + .45*cos(TAU*phase()), .6 + .35*sin(TAU*phase()));
  vec3 L = normalize(vec3((lamp - p)/uBox, .55));
  float diff = clamp(dot(n, L), 0., 1.);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0., 0., 1.)), 0., 1.), 32.);
  float env = smoothstep(.22, .04, abs(n.x*.6 + n.y - .3));
  vec3 col = goldRamp(.3 + diff*.4 + env*.22) + vec3(1.,.96,.82)*spec*1.2 + vec3(1.,.95,.75)*bead*.2;
  return vec4(col*a, a);
}`

export const STRIP_FS: Record<ShaderStrip, string> = { brasa: fsOf(BRASA), rayo: fsOf(RAYO_STRIP), escarcha: fsOf(ESCARCHA_STRIP), oro: fsOf(ORO_STRIP) }
export const FRAME_FS: Record<ShaderFrame, string> = { llamas: fsOf(LLAMAS), escarcha: fsOf(ESCARCHA_FRAME), circuito: fsOf(CIRCUITO), oro: fsOf(ORO_FRAME) }
