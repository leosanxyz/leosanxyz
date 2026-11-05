// Ported from the approved prototypes in designs/capsula/materiales (index.html and variantes.html).
// Only the card constants changed: the pass card is 270 × 393.6 units with a 17-unit corner, not 9:16.

const NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 grad(vec2 i, float per){ i.y = mod(i.y, per); float a = hash12(i)*6.2831853; return vec2(cos(a), sin(a)); }
// ruido de gradiente que se repite en y cada "per" unidades: así el fuego cierra el ciclo y sirve para la hoja de sprites
float gnoise(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  float a = dot(grad(i,per), f);
  float b = dot(grad(i+vec2(1,0),per), f-vec2(1,0));
  float c = dot(grad(i+vec2(0,1),per), f-vec2(0,1));
  float d = dot(grad(i+vec2(1,1),per), f-vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p, float per){
  float s = 0., a = .5;
  for (int k = 0; k < 5; k++){ s += a*gnoise(p, per); p = p*2. + vec2(17.3, 0.); per *= 2.; a *= .5; }
  return s;
}
// negro → rojo → naranja → amarillo → blanco
vec3 ramp(float x){
  vec3 c = mix(vec3(0.), vec3(.42,.02,.0), smoothstep(.0,.18,x));
  c = mix(c, vec3(.92,.16,.02), smoothstep(.14,.38,x));
  c = mix(c, vec3(1.,.5,.07), smoothstep(.34,.6,x));
  c = mix(c, vec3(1.,.83,.32), smoothstep(.56,.8,x));
  c = mix(c, vec3(1.,.98,.9), smoothstep(.8,1.,x));
  return c;
}
// lo mismo pero periódico en los dos ejes: la niebla y las volutas se desplazan y cierran el ciclo de la hoja
vec2 gradP(vec2 i, vec2 per){ i = mod(i, per); float a = hash12(i)*6.2831853; return vec2(cos(a), sin(a)); }
float gnoiseP(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.-15.)+10.);
  float a = dot(gradP(i,per), f);
  float b = dot(gradP(i+vec2(1,0),per), f-vec2(1,0));
  float c = dot(gradP(i+vec2(0,1),per), f-vec2(0,1));
  float d = dot(gradP(i+vec2(1,1),per), f-vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbmP(vec2 p, vec2 per){
  float s = 0., a = .5;
  for (int k = 0; k < 4; k++){ s += a*gnoiseP(p, per); p = p*2. + vec2(17.3, 5.1); per *= 2.; a *= .5; }
  return s;
}`

// Each material is only a shade() function; uniforms, coordinates and the card edge are shared.
// cp: card coordinates in 270 × 393.6 units (y up); sd: distance to the rounded edge (negative inside).
const HEAD = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uImg, uMask, uAux;
uniform float uT, uLoop, uClock, uSpeed, uSprite, uHover, uDpr, uAspect;
uniform vec2 uTilt, uTrail, uLamp, uPtr, uVel, uSpring, uCard, uPad;
uniform vec3 uAccent;
const float TAU = 6.2831853;
const vec2 CARD = vec2(270., 393.586);
const float H = 1.457726; // card height in card widths
${NOISE}
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float sdCard(vec2 cp){ return sdRound(cp - CARD*.5, CARD*.5, 17.); }
vec2 sdN(vec2 cp){ float s = sdCard(cp); return normalize(vec2(sdCard(cp + vec2(.5, 0.)) - s, sdCard(cp + vec2(0., .5)) - s) + 1e-6); }
float lum(vec3 c){ return dot(c, vec3(.3,.59,.11)); }
float smin(float a, float b, float k){ float h = clamp(.5 + .5*(b - a)/k, 0., 1.); return mix(b, a, h) - k*h*(1. - h); }
// canvas pixels per card unit: sharp lines measure the same in the hero and the mini
float pxu(){ return uDpr*uCard.x/CARD.x; }
`
const TAIL = `
void main(){
  vec2 px = gl_FragCoord.xy/uDpr;
  vec2 cp = (px - uPad)*(CARD.x/uCard.x);
  o = shade(cp/CARD, cp, sdCard(cp));
  // the light fades before the canvas edge so its rectangle never shows
  vec2 cs = uCard + 2.*uPad;
  if (uPad.x > 0.) {
    o *= smoothstep(0., 30., min(min(px.x, cs.x - px.x), min(px.y, cs.y - px.y)));
    // The prototypes added light over a dark table. The app's pages are light, where added light turns white:
    // giving the light its brightest channel as alpha keeps it the same on dark and keeps its color on light.
    o = clamp(o, 0., 1.);
    o.a = max(o.a, max(o.r, max(o.g, o.b)));
  }
}`
const fsOf = (body: string) => HEAD + body + TAIL

export const VS = `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0., 1.); }`

const FIRE = `
uniform float uWind, uEmber;
const float PER = 4.;

float fire(vec2 uv){
  float ph = uT/uLoop*PER;
  float h = uv.y;
  // x con más frecuencia que y: lenguas angostas y altas
  vec2 q = vec2(uv.x*uAspect*6.5 - uWind*h*3., uv.y*3.2 - ph);
  vec2 qw = vec2(q.x*.5, uv.y*1.6 - ph*.5);
  vec2 w = vec2(fbm(qw, 2.), fbm(qw + vec2(5.2, 1.), 2.));
  float n = fbm(q + w*1.8, PER);
  float n01 = clamp(n*1.5 + .5, 0., 1.);
  // el combustible se lee más abajo según el ruido: así nacen las lenguas hacia arriba
  vec2 s = uv - vec2(uWind*.09*h + n*.03, .02 + n01*n01*.24);
  float aura = texture(uMask, s).g;
  float bed = smoothstep(.26, .0, s.y)*.9;
  float fuel = max(aura, bed);
  float f = fuel*1.25 - (1. - n01)*.95;
  f *= smoothstep(1.02, .78, uv.y);
  return pow(clamp(f*1.15, 0., 1.), 1.35);
}

vec3 embers(vec2 uv, float lo, float hi){
  vec3 acc = vec3(0.);
  for (int k = 0; k < 3; k++){
    float fk = float(k), sc = 8. + fk*5.;
    vec2 p = vec2(uv.x*uAspect, uv.y)*sc;
    p.y -= uEmber*sc*(.75 + fk*.3);
    p.x -= uWind*uv.y*sc*.35;
    p.x += sin(p.y*.8 + fk*2.1)*.3;
    vec2 id = floor(p), f = fract(p) - .5;
    float h = hash12(id + fk*31.7);
    if (h < .62) continue;
    vec2 r = (vec2(hash12(id + 7.3), hash12(id + 3.1)) - .5)*.6;
    vec2 d = f - r;
    d.y *= mix(1., .28, uSpeed);
    d.x += d.y*uWind*.4;
    float size = .045 + .055*hash12(id + 1.7);
    float L = length(d);
    float g = smoothstep(size*2.2, 0., L);
    float core = smoothstep(size*.5, 0., L);
    float life = smoothstep(lo, lo + .2, uv.y)*smoothstep(hi, hi - .6, uv.y + (h - .6)*.8);
    float tw = .55 + .45*sin(uClock*(6. + h*8.) + h*40.);
    acc += (vec3(1.,.38,.06)*g*.9 + vec3(1.,.88,.55)*core*1.4)*life*tw;
  }
  return acc;
}

float flicker(){ return .8 + .35*gnoise(vec2(uClock*6., .5), 1e4) + .15*gnoise(vec2(uClock*17., 3.5), 1e4); }

vec3 fireCard(vec2 uv){
  float I = fire(uv);
  vec4 m = texture(uMask, uv);
  // calor: el fondo se deforma más cerca de las llamas
  float heat = clamp(texture(uMask, uv - vec2(0., .1)).g*1.1 + smoothstep(.55, .0, uv.y), 0., 1.);
  vec2 hq = vec2(uv.x*uAspect*10., uv.y*8. - uClock*3.2);
  vec2 disp = vec2(gnoise(hq, 1e4), gnoise(hq + vec2(7.,3.), 1e4))*.011*heat;
  vec3 bg = texture(uImg, uv + disp).rgb;
  bg = mix(bg, vec3(dot(bg, vec3(.3,.59,.11))), .35)*.5;
  vec3 col = bg*(1. - .55*smoothstep(.0, .2, I)) + ramp(I)*1.2;
  // personaje con luz de fuego por detrás
  vec3 ch = texture(uImg, uv).rgb;
  float flick = flicker();
  float rim = smoothstep(.95, .45, m.b)*m.r;
  ch += ch*vec3(1.,.45,.12)*rim*flick*1.6 + vec3(1.,.38,.06)*rim*flick*.28;
  ch *= .92 + .14*flick*(1. - uv.y);
  float lum = dot(texture(uImg, uv).rgb, vec3(.3,.59,.11));
  float gap = smoothstep(.97, .7, m.b)*smoothstep(.5, .62, uv.y)*smoothstep(.32, .12, lum);
  col = mix(col, ch, m.r*(1. - gap));
  col += embers(uv, 0., 1.05);
  // luz del fuego que sube desde abajo, sobre todo
  col *= 1. + vec3(.18,.05,0.)*smoothstep(.35, 0., uv.y)*flick;
  return col;
}

vec4 shade(vec2 uv, vec2 cp, float sd){
  if (uSprite > .5) return vec4(ramp(fire(uv))*1.1, 1.);
  float inside = clamp(.5 - sd, 0., 1.);
  vec3 col = vec3(0.);
  if (sd < 1.) col = fireCard(uv)*inside;
  // fuera de la carta: la luz naranja cae sobre la mesa, más fuerte abajo, donde está la cama de fuego
  float d = max(sd, 0.), flick = flicker();
  float low = smoothstep(.8, -.1, uv.y);
  vec3 glow = vec3(1., .4, .09)*(exp(-d/14.)*.55 + exp(-d/44.)*.26)*(.3 + .95*low)*flick;
  // las brasas escapan por arriba del marco
  vec3 e = embers(uv, .9, 1.32)*smoothstep(0., 6., sd);
  return vec4(col + (glow + e)*(1. - inside), inside);
}`

const SLIME = `
float topY(float x, float P){ return H - .07 - .016*sin(x*13. + TAU*P) - .009*sin(x*29. - TAU*P*2.); }

// distancia al gel en anchos de carta (negativa dentro): capa arriba, gotas que escurren, charco abajo
float gel(vec2 q){
  float P = uT/uLoop;
  // gelatina: el gel cuelga de arriba, así que el resorte lo mueve más cuanto más abajo
  float anchor = smoothstep(H, .2, q.y);
  q -= uSpring*.07*anchor;
  q.x += sin(q.y*24. - uClock*26.)*uSpeed*.007*anchor*(1. - uSprite);
  float top = topY(q.x, P);
  float d = top - q.y;
  float stretch = 1. + .45*length(uTilt);
  float lean = uTilt.x*.09;
  float pool = .14 + .014*sin(q.x*9. + TAU*P) + .008*sin(q.x*23. - TAU*P*2.)
             + .03*length(uSpring)*sin(q.x*15. - uClock*11.)*(1. - uSprite);
  for (int k = 0; k < 7; k++){
    float fk = float(k);
    float hk = hash12(vec2(fk, 3.7));
    float m = 1. + floor(hk*1.999);
    float lp = fract(P*m + hash12(vec2(fk, 1.3)));
    float L = (.2 + .5*hash12(vec2(fk, 9.1)))*stretch;
    float xk = (fk + .5)/7. + (hk - .5)*.06;
    // crece despacio, suelta la gota y se recoge de golpe, como un hilo elástico
    float grow = lp < .6 ? smoothstep(0., .6, lp) : 1. - smoothstep(.6, .7, lp);
    float len = L*(.3 + .7*grow);
    float tipY = top - len;
    float yc = clamp(q.y, tipY, top + .02);
    float t = clamp((top - yc)/len, 0., 1.);
    float wk = .7 + .55*hash12(vec2(fk, 4.4)); // cada gota con su grosor
    float r = mix(.042, .017, sqrt(t))*wk;
    float ds = length(vec2(q.x - xk - lean*(top - yc), q.y - yc)) - r;
    float rb = (.026 + .014*grow)*mix(1., wk, .6);
    ds = smin(ds, length(q - vec2(xk + lean*len, tipY - rb*.4)) - rb, .025);
    d = smin(d, ds, .035);
    if (lp > .6){
      float f = (lp - .6)/.4;
      float yd = mix(top - L - .02, pool, f*f);
      vec2 dq = q - vec2(xk + lean*(top - yd), yd);
      float e = 1. + 1.6*f*(1. - f*.6);
      // el radio de unión grande al principio dibuja el cuello que se estira antes de soltarse
      d = smin(d, length(dq*vec2(1., 1./e)) - .028, mix(.05, .01, smoothstep(0., .3, f)));
    }
    pool += .028*exp(-pow((q.x - xk)/.045, 2.))*(1. - smoothstep(0., .3, lp));
  }
  return smin(d, q.y - pool, .05);
}

// gotas que se desbordan por el borde de abajo y caen fuera de la carta
float gelOut(vec2 q){
  float P = uT/uLoop;
  float d = max(-.008 - .006*sin(q.x*17. + TAU*P) - q.y, abs(q.x - .5) - .43);
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float xk = .2 + fk*.31 + hash12(vec2(fk, 5.))*.05;
    float lp = fract(P + hash12(vec2(fk, 2.2)));
    float L = .04 + .05*hash12(vec2(fk, 7.));
    float grow = lp < .55 ? smoothstep(0., .55, lp) : 1. - smoothstep(.55, .65, lp);
    float len = L*(.4 + .6*grow)*(1. + .4*length(uTilt));
    float yc = clamp(q.y, -len, 0.);
    float xc = xk - uTilt.x*.05*yc;
    float ds = length(vec2(q.x - xc, q.y - yc)) - mix(.022, .01, -yc/len);
    ds = smin(ds, length(q - vec2(xk + uTilt.x*.05*len, -len)) - (.014 + .008*grow), .02);
    d = smin(d, ds, .02);
    if (lp > .55){
      float f = (lp - .55)/.45;
      float yd = -len - .02 - f*f*.32;
      vec2 dq = q - vec2(xk - uTilt.x*.05*yd, yd);
      d = smin(d, length(dq*vec2(1., 1./(1. + 1.4*f))) - .014*(1. - .4*f), mix(.03, .006, smoothstep(0., .25, f)));
    }
  }
  return d;
}

float thick(float d){ return sqrt(clamp(-d/.05, 0., 1.)); }

vec3 bubbles(vec2 q, float h, vec3 c, vec2 Ld){
  float P = uT/uLoop;
  vec2 g = q/.055;
  g.y -= P*4.; // suben cuatro celdas por vuelta: lento, el gel es espeso
  g.x += sin(g.y*1.5708)*.15;
  vec2 id = floor(g), f = fract(g) - .5;
  float hb = hash12(id + 11.);
  if (hb < .62) return c;
  float r = .1 + .22*hash12(id + 2.);
  vec2 ctr = (vec2(hash12(id + 5.), hash12(id + 8.)) - .5)*(.8 - 2.*r);
  float dd = length(f - ctr);
  float inB = smoothstep(r, r - .05, dd);
  float edge = smoothstep(r - .09, r, dd)*inB;
  float spot = smoothstep(r*.3, 0., length(f - ctr - Ld*r*.45));
  vec3 b = c*(1. + .15*inB) + mix(uAccent, vec3(1.), .6)*edge*.55 + vec3(1.)*spot*.9;
  return mix(c, b, smoothstep(.2, .5, h));
}

vec4 shade(vec2 uv, vec2 cp, float sd){
  vec2 q = cp/270.;
  float inside = clamp(.5 - sd, 0., 1.);
  float e = .004;
  bool inCard = sd < 1.;
  bool below = !inCard && uSprite < .5 && q.y < 0. && q.y > -.26 && q.x > .02 && q.x < .98;
  float d = 1., dx = 1., dy = 1.;
  if (inCard){ d = gel(q); dx = gel(q + vec2(e, 0.)); dy = gel(q + vec2(0., e)); }
  else if (below){ d = gelOut(q); dx = gelOut(q + vec2(e, 0.)); dy = gelOut(q + vec2(0., e)); }
  float px = 1./(uCard.x*uDpr);
  float cover = smoothstep(px, -px, d);
  // perfil de domo: grueso al centro de cada gota, fino en el borde
  float h = thick(d);
  vec3 N = normalize(vec3(-vec2(thick(dx) - h, thick(dy) - h)/e*.02, 1.));
  vec2 lampQ = uLamp*vec2(1., H);
  vec3 L = normalize(vec3(lampQ - q, .55));
  vec2 Ld = normalize(L.xy + 1e-5);
  float ndh = max(dot(N, normalize(L + vec3(0., 0., 1.))), 0.);
  float spec = pow(ndh, 120.)*2.4 + pow(ndh, 18.)*.2;
  float fres = pow(1. - N.z, 2.);
  float men = smoothstep(px*3., 0., abs(d + px*1.5));
  vec3 col; float a;
  if (inCard){
    // la carta vista a través del gel: lente convexa con algo de dispersión
    vec2 off = -N.xy*.05*h*vec2(1., 1./H);
    vec3 under = vec3(texture(uImg, uv + off*1.08).r, texture(uImg, uv + off).g, texture(uImg, uv + off*.92).b);
    // el acento de la carta es pastel: el gel lo concentra (más espesor, color más profundo)
    vec3 tint = uAccent*uAccent;
    vec3 gc = under*exp(-(1. - tint)*(.5 + h*2.2))*(.95 + .25*h) + tint*.1*h;
    // la luz que atraviesa el gel sale por el lado contrario a la lámpara
    gc += uAccent*max(0., dot(N.xy, -Ld))*h*.3;
    gc += mix(uAccent, vec3(1.), .5)*fres*.5;
    // borde oscuro y saturado, como una gota de verdad, y reflejo húmedo del lado de la lámpara
    gc *= mix(vec3(1.), tint*.5, pow(1. - h, 3.)*.75);
    gc = mix(gc, gc*tint*.4, men*.7);
    gc += vec3(1.)*smoothstep(.5, .95, dot(normalize(N.xy + 1e-5), Ld))*(1. - h)*fres*.9;
    gc = bubbles(q, h, gc, Ld) + spec;
    // sombra rosada del gel sobre la carta, desplazada lejos de la lámpara
    vec3 bg = texture(uImg, uv).rgb*.88;
    float sh = smoothstep(.012, -.02, gel(q + L.xy*.03))*(1. - cover);
    bg = bg*(1. - .45*sh) + uAccent*uAccent*.06*sh;
    col = mix(bg, gc, cover);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  } else {
    // gel colgando fuera de la carta: no hay imagen detrás, solo color y luz
    vec3 og = uAccent*uAccent*(.4 + .5*h)*(1. - men*.4) + mix(uAccent, vec3(1.), .5)*fres*.5 + spec;
    a = cover*(.8 + .15*h)*smoothstep(-.25, -.13, q.y);
    col = og*a;
  }
  float dd = max(sd, 0.);
  vec3 glow = uAccent*(exp(-dd/16.)*.22 + exp(-dd/46.)*.12)*(.45 + .9*smoothstep(.5, -.05, uv.y))*(1. + .6*length(uSpring));
  return vec4(col + glow*(1. - a), a);
}`

const METAL = `
vec3 goldRamp(float x){
  vec3 c = mix(vec3(.05,.03,.01), vec3(.32,.19,.06), smoothstep(.0,.25,x));
  c = mix(c, vec3(.78,.56,.22), smoothstep(.2,.55,x));
  c = mix(c, vec3(1.,.84,.48), smoothstep(.5,.85,x));
  return mix(c, vec3(1.,.96,.82), smoothstep(.85,1.,x));
}
// alto del bajorrelieve: la figura es una meseta con bisel suave y detalle de luminancia; el fondo, relieve bajo
float hgt(vec2 uvC, vec2 uvB){
  vec4 mk = texture(uMask, uvC);
  vec3 aC = texture(uAux, uvC).rgb, aB = texture(uAux, uvB).rgb;
  float hc = mk.b*.5 + (aC.r*.7 + aC.g*.3)*.5;
  float hb = (aB.r*.5 + aB.g*.5)*.32;
  return mix(hb, hc, mk.r);
}
vec3 flare(vec2 d, float k){
  float core = exp(-dot(d, d)/26.);
  float hz = exp(-abs(d.y)*.55)*exp(-abs(d.x)/85.);
  float vt = exp(-abs(d.x)*.65)*exp(-abs(d.y)/34.);
  vec2 r = vec2(d.x + d.y, d.x - d.y)*.7071;
  float dg = (exp(-abs(r.x)*.9)*exp(-abs(r.y)/14.) + exp(-abs(r.y)*.9)*exp(-abs(r.x)/14.))*.35;
  return vec3(1., .9, .7)*(core*1.6 + hz*.7 + vt*.45 + dg + exp(-length(d)/28.)*.22)*k;
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop, idle = 1. - uHover;
  vec3 V = normalize(vec3(-uTilt*.35, 1.));
  vec2 lampCp = uLamp*CARD;
  float inside = clamp(.5 - sd, 0., 1.);
  // reflejo de la lámpara en el metal plano: se corre al revés de la inclinación
  vec2 gp = lampCp - uTilt*60.;
  float glintK = (.25 + .45*uHover + 1.4*uSpeed)*(.85 + .15*sin(TAU*P*3.))*smoothstep(12., -12., sdCard(gp));
  vec3 col = vec3(0.); float a = 0.;
  if (sd < 1.){
    // parallax: la figura flota sobre el fondo
    vec2 pc = uTilt*.008, pb = -uTilt*.016;
    vec2 e = vec2(1./400., 1./711.);
    float h0 = hgt(uv + pc, uv + pb);
    float hx = hgt(uv + pc + vec2(e.x, 0.), uv + pb + vec2(e.x, 0.));
    float hy = hgt(uv + pc + vec2(0., e.y), uv + pb + vec2(0., e.y));
    float depth = 16.;
    vec3 N = normalize(vec3(-(hx - h0)/(e.x*270.)*depth, -(hy - h0)/(e.y*CARD.y)*depth, 1.));
    // cepillado horizontal: rayas finas y largas
    float brush = gnoise(vec2(cp.x*.012, cp.y*1.1), 1e4)*.7 + (hash12(vec2(floor(cp.y*1.5), 7.)) - .5)*.5;
    // bisel del marco: canto redondeado hacia fuera, chaflán hacia dentro y una ranura
    float ed = -sd;
    float frame = smoothstep(12.5, 11., ed);
    vec2 g2 = sdN(cp);
    vec2 nb = ed < 5. ? g2*mix(1.1, .1, ed/5.) : -g2*.6*smoothstep(11.5, 6., ed);
    N = normalize(mix(N, normalize(vec3(nb, 1.)), frame));
    float groove = smoothstep(1.2, 0., abs(ed - 12.));
    float m = texture(uMask, uv + pc).r;
    vec3 img = mix(texture(uImg, uv + pb).rgb, texture(uImg, uv + pc).rgb, m);
    float l = lum(img);
    vec3 alb = goldRamp(clamp(pow(l, .8)*1.08, 0., 1.));
    // queda un recuerdo del color original: la capa roja se vuelve oro rosado
    alb *= mix(vec3(1.), clamp(img/(l + .04), 0., 2.2)*.7 + .3, .2);
    alb *= mix(.72, 1., m)*(.95 + .1*brush);
    alb = mix(alb, vec3(.95,.76,.4), frame*.85);
    vec3 L = normalize(vec3(lampCp, 220.) - vec3(cp, h0*depth));
    vec3 Hh = normalize(L + V);
    float ndl = max(dot(N, L), 0.), ndh = max(dot(N, Hh), 0.);
    float spec = pow(ndh, 160.)*2.4 + pow(ndh, 24.)*.18;
    // brillo anisotrópico: el rayado estira el reflejo en vertical
    vec3 T = normalize(vec3(1., brush*.25, 0.) - N*N.x);
    float tdh = dot(T, Hh);
    float aniso = pow(sqrt(max(0., 1. - tdh*tdh)), 300.)*ndl*(1. - frame*.7);
    // estudio falso: cajas de luz en diagonal que barren la carta al inclinarla
    vec3 R = reflect(-V, N);
    float bands = R.y*1.1 + R.x*.55 + uTilt.y*.8 + uTilt.x*.55 + .25*sin(TAU*P)*idle;
    float env = mix(.1, .5, smoothstep(-.7, .9, R.y + uTilt.y*.4)) + .9*pow(smoothstep(.2, .0, abs(fract(bands*1.2) - .5)), 2.);
    float sw = dot(uv - .5, vec2(.8, .6)) - (uTilt.x*.55 + uTilt.y*.4 + .75*sin(TAU*P)*idle);
    float sheen = exp(-sw*sw*70.)*(.55 + .45*(brush + .5));
    vec3 aux = texture(uAux, uv + pc).rgb;
    float ao = clamp(1. - (aux.g - aux.r)*2.4, .45, 1.15);
    col = alb*(.08 + ndl*.5)*ao + alb*env*.6*ao + mix(alb, vec3(1.), .4)*(spec + aniso*.9) + vec3(1., .9, .7)*sheen*.28*ao;
    col *= 1. - groove*.55;
    // chispas: solo se encienden las que miran a la lámpara
    vec2 sg = cp/16., sid = floor(sg), sf = fract(sg) - .5;
    float shh = hash12(sid + 41.);
    if (shh > .86){
      vec2 dd = (sf - (vec2(hash12(sid + 3.), hash12(sid + 9.)) - .5)*.6)*16.;
      float tw = .5 + .5*sin(TAU*(P*2. + shh*7.));
      float star = (exp(-abs(dd.x)*.9)*exp(-abs(dd.y)*.2) + exp(-abs(dd.y)*.9)*exp(-abs(dd.x)*.2))*.5 + exp(-dot(dd, dd)*.3);
      col += vec3(1., .95, .8)*star*pow(ndh, 30.)*tw*(1. + uSpeed*2.)*.9;
    }
    col += flare(cp - gp, glintK);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: el canto del bisel brilla y la luz se derrama donde la lámpara lo toca
  float d = max(sd, 0.);
  vec2 g2 = sdN(cp);
  vec3 Le = normalize(vec3(lampCp - (cp - g2*sd), 220.));
  float es = pow(max(dot(normalize(vec3(g2*1.1, 1.)), normalize(Le + V)), 0.), 40.);
  vec3 glow = vec3(1., .8, .45)*es*(exp(-d/7.)*1.1 + exp(-d/26.)*.35) + uAccent*exp(-d/22.)*.1;
  return vec4(col + (glow + flare(cp - gp, glintK))*(1. - a), a);
}`

const GHOST = `
vec3 cold(float x){
  vec3 c = mix(vec3(.01,.02,.05), vec3(.08,.16,.34), smoothstep(0., .3, x));
  c = mix(c, uAccent*.95, smoothstep(.25, .65, x));
  return mix(c, vec3(.9,.97,1.), smoothstep(.6, 1., x));
}
// niebla en dos capas que ruedan de izquierda a derecha y cierran el ciclo
float fog(vec2 q, float P){
  float a = fbmP(vec2(q.x*2. - P*4., q.y*2.), vec2(4., 1e4));
  float b = fbmP(vec2(q.x*3.5 - P*8. + a*.8, q.y*3.5 + a*.6), vec2(8., 1e4));
  return smoothstep(.35, .85, a*.6 + b*.5 + .5);
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop;
  vec2 q = cp/270.;
  float inside = clamp(.5 - sd, 0., 1.);
  // el puntero empuja la niebla y deja estela
  vec2 dp = q - uPtr*vec2(1., H);
  float near = exp(-dot(dp, dp)/.025)*uHover;
  float fogA = fog(q - dp*near*.9 - uVel*vec2(1., H)*near*.06, P);
  vec3 fogC = mix(vec3(.05,.09,.18), uAccent, .55);
  // cuadro de proyección: parpadeos y saltos en cuadros sueltos
  float fr = floor(P*64.);
  float glitch = step(.9, hash12(vec2(fr, 3.1)))*.7 + uSpeed*.35*(1. - uSprite);
  vec3 col = vec3(0.); float a = 0.;
  if (sd < 1.){
    // el fantasma se aparta del puntero y flota
    vec2 push = normalize(dp + 1e-4)*exp(-dot(dp, dp)/.04)*.07*uHover;
    vec2 cuv = uv - push*vec2(1., 1./H) + vec2(0., .006*sin(TAU*P));
    cuv.x += (hash12(vec2(floor(cp.y/5.), fr)) - .5)*glitch*.02;
    float ca = .003 + glitch*.008;
    vec3 ch = vec3(texture(uImg, cuv + vec2(ca, 0.)).r, texture(uImg, cuv).g, texture(uImg, cuv - vec2(ca, 0.)).b);
    vec4 m = texture(uMask, cuv);
    float l = lum(ch);
    // se disuelve en manchas que suben; la orilla brilla fría
    float dn = fbmP(vec2(q.x*4.5, q.y*4. - P*4.), vec2(1e4, 4.))*.5 + .5;
    float th = .63 + .05*sin(TAU*P) - .03*uSpeed;
    float dis = smoothstep(th - .08, th + .02, dn);
    float edge = smoothstep(.035, 0., abs(dn - th + .03));
    vec3 bg = cold(lum(texture(uImg, uv + (fogA - .5)*.012).rgb))*.2;
    bg = mix(bg, fogC*.8, fogA*.6);
    vec3 g = mix(cold(l*1.1), ch*vec3(.7, .9, 1.25), .25);
    // el borde se lee con la máscara ondulada: ectoplasma, no un polígono
    vec4 mw = texture(uMask, cuv + vec2(dn - .5, .5 - dn)*.04);
    float rim = smoothstep(.95, .45, mw.b)*mw.r;
    float flick = 1. - .3*step(.86, hash12(vec2(fr, 9.))) - .25*glitch;
    float alpha = m.r*(.62 + .2*l)*(1. - dis)*flick;
    col = bg*(1. - alpha*.7) + g*alpha;
    col += uAccent*rim*.75*(1. - dis*.7)*flick + uAccent*edge*m.r*.1;
    // volutas: lo disuelto sube como humo y se lleva algo de la figura
    float wn = fbmP(vec2(q.x*14. + dn*2., q.y*1.5 - P*3.), vec2(1e4, 3.))*.5 + .5;
    float lb = lum(texture(uImg, cuv - vec2(0., .04)).rgb);
    col += uAccent*smoothstep(.5, .85, wn)*dis*m.g*(.25 + .6*lb)*.5;
    // eco espectral: una copia que sigue la inclinación con retraso
    vec2 eo = (uTilt - uTrail)*vec2(.07, .05) + vec2(.012, -.008)*(.5 + .5*sin(TAU*P));
    float me = texture(uMask, cuv - eo).r;
    float le = lum(texture(uImg, cuv - eo).rgb);
    col += uAccent*me*(.1 + .35*le)*(1. - m.r*.55)*.8;
    // niebla delante, sobre todo abajo
    col = mix(col, fogC*1.1, fogA*smoothstep(.55, .0, uv.y)*.45);
    // banda de proyección que sube y líneas de barrido
    col *= 1. + .12*exp(-pow((fract(uv.y - P*2.) - .5)*14., 2.));
    col *= mix(1., .94 + .06*sin(cp.y*2.2), 1. - uSprite);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: la carta enfría lo que la rodea, la niebla se escapa y las volutas suben por arriba
  float d = max(sd, 0.);
  vec3 glow = uAccent*(exp(-d/18.)*.32 + exp(-d/52.)*.16)*(.85 + .15*sin(TAU*P));
  float mist = fogA*exp(-d/24.)*.5;
  float above = q.y - H;
  float wn = fbmP(vec2(q.x*6., q.y*2.5 - P*4.), vec2(1e4, 4.))*.5 + .5;
  float wisp = smoothstep(.5, .8, wn)*smoothstep(0., .01, above)*exp(-max(above, 0.)/.09)*smoothstep(.08, .3, q.x)*smoothstep(.95, .7, q.x);
  float oa = (mist*.5 + wisp*.4)*(1. - a);
  return vec4(col + (glow + fogC*mist + uAccent*wisp*.8)*(1. - a), a + oa);
}`

const METALC = `
uniform vec4 uSpk[12];  // chispas: xy posición (carta), z vida 1→0, w tamaño
uniform vec4 uSpkV[12]; // xy velocidad en unidades de carta por segundo

vec3 goldRamp(float x){
  vec3 c = mix(vec3(.05,.03,.01), vec3(.32,.19,.06), smoothstep(.0,.25,x));
  c = mix(c, vec3(.78,.56,.22), smoothstep(.2,.55,x));
  c = mix(c, vec3(1.,.84,.48), smoothstep(.5,.85,x));
  return mix(c, vec3(1.,.96,.82), smoothstep(.85,1.,x));
}
// alto del bajorrelieve: la figura es una meseta con bisel suave y detalle de luminancia; el fondo, relieve bajo
float hgt(vec2 uvC, vec2 uvB){
  vec4 mk = texture(uMask, uvC);
  vec3 aC = texture(uAux, uvC).rgb, aB = texture(uAux, uvB).rgb;
  float hc = mk.b*.5 + (aC.r*.7 + aC.g*.3)*.5;
  float hb = (aB.r*.5 + aB.g*.5)*.32;
  return mix(hb, hc, mk.r);
}
vec3 flare(vec2 d, float k){
  float core = exp(-dot(d, d)/26.);
  float hz = exp(-abs(d.y)*.55)*exp(-abs(d.x)/85.);
  float vt = exp(-abs(d.x)*.65)*exp(-abs(d.y)/34.);
  return vec3(1., .9, .7)*(core*1.6 + hz*.7 + vt*.45 + exp(-length(d)/28.)*.22)*k;
}
// chispas que saltan del borde: un trazo corto en la dirección en que vuelan, núcleo blanco y halo naranja
vec3 sparks(vec2 cp){
  vec3 acc = vec3(0.);
  float pu = pxu();
  for (int k = 0; k < 12; k++){
    vec4 s = uSpk[k];
    if (s.z <= 0.) continue;
    vec2 a = s.xy - uSpkV[k].xy*.06, ba = s.xy - a, pa = cp - a;
    float t = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-4), 0., 1.);
    float d = length(pa - ba*t);
    if (d > 28.) continue;
    float r = .45 + .45*s.w;
    float core = smoothstep(r + 1./pu, r*.2, d);
    float halo = exp(-d/(1.6 + 2.2*s.w));
    vec3 hot = mix(vec3(1., .4, .1), vec3(1., .88, .6), smoothstep(.2, .8, s.z));
    float tw = .75 + .25*sin(uClock*31. + float(k)*2.3);
    acc += (hot*halo*.6 + vec3(1., .96, .86)*core*1.3)*(.2 + .8*t)*smoothstep(0., .3, s.z)*tw;
  }
  return acc;
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop, idle = 1. - uHover;
  vec3 V = normalize(vec3(-uTilt*.35, 1.));
  vec2 lampCp = uLamp*CARD;
  float inside = clamp(.5 - sd, 0., 1.);
  vec2 gp = lampCp - uTilt*60.;
  float glintK = (.1 + .2*uHover + .9*uSpeed)*(.85 + .15*sin(TAU*P*3.))*smoothstep(12., -12., sdCard(gp));
  vec3 col = vec3(0.); float a = 0.;
  if (sd < 1.){
    // parallax: la figura flota sobre el fondo
    vec2 pc = uTilt*.008, pb = -uTilt*.016;
    vec2 e = vec2(1./400., 1./711.);
    float h0 = hgt(uv + pc, uv + pb);
    float hx = hgt(uv + pc + vec2(e.x, 0.), uv + pb + vec2(e.x, 0.));
    float hy = hgt(uv + pc + vec2(0., e.y), uv + pb + vec2(0., e.y));
    float depth = 16.;
    vec3 N = normalize(vec3(-(hx - h0)/(e.x*270.)*depth, -(hy - h0)/(e.y*CARD.y)*depth, 1.));
    // marco de oro más fino que el legendario, con canto redondeado y ranura
    float ed = -sd;
    float frame = smoothstep(8., 6.5, ed);
    vec2 g2 = sdN(cp);
    vec2 nb = ed < 3.5 ? g2*mix(1.1, .1, ed/3.5) : -g2*.6*smoothstep(7., 4., ed);
    N = normalize(mix(N, normalize(vec3(nb, 1.)), frame));
    float groove = smoothstep(1., 0., abs(ed - 7.5));
    vec4 mk = texture(uMask, uv + pc);
    float m = mk.r;
    vec3 art = mix(texture(uImg, uv + pb).rgb, texture(uImg, uv + pc).rgb, m);
    // sombra de la figura sobre el fondo, del lado contrario a la lámpara
    vec2 away = normalize(cp - lampCp + 1e-3);
    float shadow = texture(uMask, uv + pc - away*vec2(.026, .015)*(1. + length(uTilt))).g*(1. - m);
    art *= 1. - shadow*.42;
    // dónde se dora: el contorno de la figura, las aristas fuertes del dibujo y el marco
    // la silueta trazada a mano es aproximada: solo marca la zona; el oro sigue las aristas reales del dibujo
    float a0 = texture(uAux, uv + pc).r;
    float ax = texture(uAux, uv + pc + vec2(e.x, 0.)).r, ay = texture(uAux, uv + pc + vec2(0., e.y)).r;
    float edgeL = length(vec2(ax - a0, ay - a0));
    float zone = smoothstep(.04, .25, mk.g)*smoothstep(1., .8, mk.g);
    float outline = zone*smoothstep(.035, .1, edgeL);
    float fil = smoothstep(.07, .2, edgeL)*mix(.15, .6, m);
    float gw = max(max(outline, fil), frame);
    vec3 L = normalize(vec3(lampCp, 220.) - vec3(cp, h0*depth));
    vec3 Hh = normalize(L + V);
    float ndl = max(dot(N, L), 0.), ndh = max(dot(N, Hh), 0.);
    float spec = pow(ndh, 160.)*2.4 + pow(ndh, 24.)*.18;
    // estudio falso: cajas de luz que barren al inclinar; la banda recorre los contornos dorados
    vec3 R = reflect(-V, N);
    float bands = R.y*1.1 + R.x*.55 + uTilt.y*.8 + uTilt.x*.55 + .25*sin(TAU*P)*idle;
    float env = mix(.12, .5, smoothstep(-.7, .9, R.y + uTilt.y*.4)) + .9*pow(smoothstep(.2, .0, abs(fract(bands*1.2) - .5)), 2.);
    float sw = dot(uv - .5, vec2(.8, .6)) - (uTilt.x*.55 + uTilt.y*.4 + .75*sin(TAU*P)*idle);
    float sheen = exp(-sw*sw*55.);
    vec3 alb = goldRamp(clamp(.52 + .5*lum(art), 0., 1.));
    // la banda de luz corre sobre el oro: el contorno de la figura la recibe entera, como un filo pulido
    vec3 gold = alb*(.12 + ndl*.5) + alb*env*.6 + mix(alb, vec3(1.), .4)*(spec + sheen*(1.1 + 1.2*outline));
    // el arte conserva sus colores: solo recibe el relieve, la lámpara y una laca muy fina
    vec3 lit = art*(.82 + .28*ndl) + vec3(1., .92, .78)*(spec*.12 + sheen*.05);
    col = mix(lit, gold, gw);
    col *= 1. - groove*.5;
    // destellos en el oro que mira a la lámpara: delante de todo
    vec2 sg = cp/15., sid = floor(sg);
    float shh = hash12(sid + 41.);
    if (shh > .72){
      vec2 sc = (sid + .5 + (vec2(hash12(sid + 3.), hash12(sid + 9.)) - .5)*.6)*15.;
      vec4 sm = texture(uMask, sc/CARD + pc);
      float gate = max(sm.r*smoothstep(1., .7, sm.b), smoothstep(-11., -7., sdCard(sc)));
      vec2 dd = cp - sc;
      float tw = .5 + .5*sin(TAU*(P*2. + shh*7.));
      float star = (exp(-abs(dd.x)*.9)*exp(-abs(dd.y)*.22) + exp(-abs(dd.y)*.9)*exp(-abs(dd.x)*.22))*.5 + exp(-dot(dd, dd)*.3);
      col += vec3(1., .95, .8)*star*pow(ndh, 24.)*tw*gate*(1. + uSpeed*2.)*1.1;
    }
    col += flare(cp - gp, glintK);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: el canto del marco brilla donde lo toca la lámpara y deja un reflejo cálido en la mesa
  float d = max(sd, 0.);
  vec2 g2 = sdN(cp);
  vec3 Le = normalize(vec3(lampCp - (cp - g2*sd), 220.));
  float es = pow(max(dot(normalize(vec3(g2*1.1, 1.)), normalize(Le + V)), 0.), 40.);
  float side = .5 + .5*dot(g2, normalize(lampCp - CARD*.5 + 1e-3));
  vec3 warm = vec3(1., .7, .34)*(exp(-d/10.)*.3 + exp(-d/36.)*.17)*(.3 + .7*side)*(1. + .6*uSpeed);
  vec3 glow = vec3(1., .8, .45)*es*(exp(-d/7.)*1.1 + exp(-d/26.)*.35) + warm;
  return vec4(col + (glow + flare(cp - gp, glintK))*(1. - a) + sparks(cp), a);
}`

const GHOSTC = `
uniform vec2 uEcho; // hacia dónde se queda la estela: contrario a la velocidad del puntero, en uv
const vec3 COLD = vec3(.62, .82, 1.);
vec3 wash(vec3 c){ float l = lum(c); return mix(c, vec3(l)*vec3(.93,.98,1.07), .3)*.9 + vec3(.035,.05,.075); }
// jirones: hebras que nacen bajo el marco y suben ondulando; cierran el ciclo en y
float wisps(vec2 q, float P){
  float sway = .06*sin(q.y*5. - TAU*P);
  float n = fbmP(vec2(q.x*5.5 + sway*5., q.y*1.5 - P*3.), vec2(1e4, 3.));
  float n2 = gnoiseP(vec2(q.x*12. - n*3., q.y*3. - P*6.), vec2(1e4, 6.));
  return smoothstep(.06, .42, n + n2*.3);
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop;
  vec2 q = cp/270.;
  float inside = clamp(.5 - sd, 0., 1.);
  // respiración: lenta, una vez por vuelta; se nota sobre todo quieta
  float br = .5 - .5*cos(TAU*P);
  float calm = 1. - uSpeed;
  // el puntero aparta los jirones
  vec2 dp = q - uPtr*vec2(1., H);
  float near = exp(-dot(dp, dp)/.03)*uHover;
  float wsp = wisps(q - dp*near*.7 - uVel*vec2(1., H)*near*.05, P);
  vec3 col = vec3(0.); float a = 0.;
  if (sd < 1.){
    vec2 c0 = vec2(.5, .42);
    vec2 cuv = c0 + (uv - c0)/(1. + .01*br*calm) - vec2(0., .005*br*calm) + uTilt*.007;
    vec2 buv = uv - uTilt*.012;
    vec4 m = texture(uMask, cuv);
    vec3 fig = wash(texture(uImg, cuv).rgb);
    vec3 base = wash(texture(uImg, buv).rgb)*.8;
    // estela: copias cada vez más lejos, más frías y más deshechas; se acumulan de la más cercana a la más lejana
    float dn = fbmP(vec2(q.x*5., q.y*4. - P*4.), vec2(1e4, 4.))*.5 + .5;
    vec3 E = vec3(0.); float A = 0.;
    for (int k = 1; k <= 4; k++){
      float fk = float(k)/4.;
      vec2 eu = cuv - uEcho*fk*1.5;
      float me = texture(uMask, eu).r;
      if (me < .01) continue;
      vec3 ec = wash(texture(uImg, eu).rgb);
      ec = mix(ec, COLD*(.25 + lum(ec)*1.3), .3 + .45*fk);
      float keep = 1. - smoothstep(.72 - fk*.42, .86 - fk*.42, dn);
      float w = me*keep*(.75 - fk*.4);
      E += ec*w*(1. - A); A += w*(1. - A);
    }
    // aura fría detrás de la silueta que sube y baja con la respiración
    base += COLD*clamp(m.g - m.r, 0., 1.)*(.08 + .2*br*calm);
    col = mix(base, fig, m.r);
    // detrás de la figura la estela tapa el fondo; sobre la figura se suma como luz, doble exposición
    vec3 Ec = E/max(A, 1e-3);
    col = mix(col, Ec, A*(1. - m.r));
    col += Ec*A*m.r*.6*(1. - col);
    // borde frío solo en la silueta, más fuerte del lado de la lámpara
    vec2 mg = vec2(texture(uMask, cuv + vec2(.006, 0.)).b - texture(uMask, cuv - vec2(.006, 0.)).b,
                   texture(uMask, cuv + vec2(0., .0034)).b - texture(uMask, cuv - vec2(0., .0034)).b);
    vec2 outN = -normalize(mg*vec2(1., 1./H) + 1e-6);
    float facing = .5 + .5*dot(outN, normalize((uLamp - cuv)*vec2(1., H) + 1e-6));
    float rim = smoothstep(.95, .45, m.b)*m.r;
    col += COLD*rim*(.2 + .8*facing)*(.6 + .4*br)*1.3;
    // jirones delante, abajo
    col = mix(col, COLD*.7 + .08, wsp*smoothstep(.8, .0, q.y)*.6);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: un halo frío y los jirones que nacen bajo el marco y suben por los lados
  float d = max(sd, 0.);
  vec3 glow = COLD*(exp(-d/18.)*.2 + exp(-d/50.)*.11)*(.75 + .25*br);
  float prof = exp(-d/30.)*smoothstep(.75, .0, q.y)*smoothstep(-.26, -.06, q.y);
  float oa = wsp*prof*.8*(1. - a);
  return vec4(col + glow*(1. - a) + (COLD*.75 + .05)*oa, a + oa*.5);
}`

const BOLT = `
uniform vec4 uBolt[10];  // xy origen, zw destino (unidades de carta)
uniform vec4 uBoltK[10]; // x intensidad, y semilla, z amplitud, w grosor
uniform float uFlash, uArc;
const vec3 E1 = vec3(.5, .88, 1.), E2 = vec3(.66, .5, 1.);

float jag(float x, float s){
  return gnoise(vec2(x*.05, s), 1e4) + .5*gnoise(vec2(x*.13, s + 3.7), 1e4) + .26*gnoise(vec2(x*.34, s + 8.1), 1e4) + .13*gnoise(vec2(x*.85, s + 11.), 1e4);
}
// distancia a un rayo quebrado de a a b; la pendiente corrige el grosor en los tramos empinados
float boltD(vec2 p, vec2 a, vec2 b, float amp, float s){
  vec2 ab = b - a; float L = max(length(ab), 1.); vec2 dir = ab/L, nr = vec2(-dir.y, dir.x);
  vec2 pa = p - a; float x = dot(pa, dir), y = dot(pa, nr);
  float pad = amp*1.4 + 30.;
  if (x < -30. || x > L + 30. || abs(y) > pad) return 1e3;
  float xc = clamp(x, 0., L);
  float j = jag(xc, s)*amp*sqrt(sin(3.14159*xc/L));
  float x2 = min(xc + 1.5, L);
  float j2 = jag(x2, s)*amp*sqrt(sin(3.14159*x2/L));
  float sl = (j2 - j)/1.5;
  return length(vec2(max(0., max(-x, x - L)), abs(y - j)/sqrt(1. + sl*sl)));
}
vec3 bolts(vec2 cp, out float lit){
  vec3 acc = vec3(0.); lit = 0.;
  float pu = pxu();
  for (int k = 0; k < 10; k++){
    vec4 K = uBoltK[k];
    if (K.x <= 0.) continue;
    vec4 B = uBolt[k];
    vec2 pa = cp - B.xy, ba = B.zw - B.xy;
    float ds = length(pa - ba*clamp(dot(pa, ba)/max(dot(ba, ba), 1.), 0., 1.));
    lit += K.x*exp(-ds/34.);
    if (ds > K.z*1.4 + 30.) continue;
    float d = boltD(cp, B.xy, B.zw, K.z, K.y);
    // una rama que sale del tramo medio
    float L = length(ba); vec2 dir = ba/max(L, 1.), nr = vec2(-dir.y, dir.x);
    float t0 = (.3 + .35*hash12(vec2(K.y, 2.)))*L;
    vec2 s0 = B.xy + dir*t0 + nr*jag(t0, K.y)*K.z*sqrt(sin(3.14159*t0/L));
    float side = hash12(vec2(K.y, 5.)) > .5 ? 1. : -1.;
    vec2 bd = normalize(dir + nr*side*.75);
    float db = boltD(cp, s0, s0 + bd*L*.32, K.z*.45, K.y + 19.);
    float w = max(K.w, .7/pu), wb = max(K.w*.6, .6/pu);
    float core = max(smoothstep(w + .9/pu, w*.3, d), smoothstep(wb + .9/pu, wb*.3, db)*.75);
    float dm = min(d, db*1.25);
    float halo = exp(-dm/2.2)*.55 + exp(-dm/9.)*.22;
    vec3 c = mix(E1, E2, hash12(vec2(K.y, 1.)));
    // el impacto: destello en el punto de llegada
    float di = length(cp - B.zw);
    acc += (c*halo + vec3(.93, .97, 1.)*core*1.5 + c*exp(-di/5.)*.7 + exp(-di*di/2.5)*.9)*K.x;
  }
  return acc;
}
// arcos que se arrastran por la silueta: una curva de nivel del halo de la máscara, quebrada por ruido a saltos
vec3 crawl(vec2 uv, float level, float seed, float fr, float boost){
  float g = texture(uMask, uv).g;
  vec2 q = uv*vec2(1., H);
  float n = gnoise(q*9. + vec2(seed, fr*3.1), 1e4)*.6 + gnoise(q*24. + vec2(fr*1.7, seed), 1e4)*.3 + gnoise(q*63. + vec2(seed*2., fr*.9), 1e4)*.14;
  float f = g - level + n*.26;
  float dpx = abs(f)/max(length(vec2(dFdx(f), dFdy(f))), 1e-4);
  float band = smoothstep(.0, .1, g)*smoothstep(1., .9, g);
  float win = smoothstep(.6, .7, gnoise(q*2.6 + vec2(fr*.63 + seed, seed*1.3), 1e4)*.5 + .45 + boost);
  float k = band*win;
  float core = smoothstep(1.4*uDpr, .35*uDpr, dpx);
  float halo = exp(-dpx/(3.*uDpr))*.45 + exp(-dpx/(11.*uDpr))*.18;
  vec3 c = mix(E1, E2, smoothstep(.3, .7, hash12(vec2(floor(q.y*6.), seed + fr))));
  return (c*halo + vec3(.94, .98, 1.)*core*1.3)*k;
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop;
  float fr = floor(P*32.);
  vec2 q = cp/270.;
  float inside = clamp(.5 - sd, 0., 1.);
  vec2 dq = q - uPtr*vec2(1., H);
  // el puntero atrae la electricidad, como una bola de plasma
  float boost = uArc*.22 + exp(-dot(dq, dq)/.03)*uHover*.28;
  vec2 pc = uTilt*.008, pb = -uTilt*.015;
  // fuera de cualquier rama: las derivadas de la curva de nivel necesitan los cuatro píxeles del bloque
  vec3 arcB = crawl(uv + pc, .3, 0., fr, boost);
  vec3 arcF = crawl(uv + pc, .8, 7.3, fr + 17., boost - .1);
  float lit; vec3 bl = bolts(cp, lit);
  vec3 col = vec3(0.); float a = 0.;
  if (sd < 1.){
    vec4 m = texture(uMask, uv + pc);
    vec3 bg = texture(uImg, uv + pb).rgb;
    vec3 ch = texture(uImg, uv + pc).rgb;
    // tormenta: el fondo más oscuro y frío para que los arcos se lean
    bg = mix(bg, vec3(lum(bg))*vec3(.8, .9, 1.15), .35)*.6;
    col = mix(bg, ch*.92, m.r);
    // la luz eléctrica tiñe el arte cerca de los rayos y los arcos
    float L = lit + lum(arcB + arcF)*.6;
    col += col*vec3(.3, .65, 1.)*min(L, 1.2)*.7*uFlash + vec3(.05, .1, .22)*min(L, 1.2)*.2;
    // borde cian en la figura, del lado de la lámpara, con el parpadeo
    vec2 mg = vec2(texture(uMask, uv + pc + vec2(.006, 0.)).b - texture(uMask, uv + pc - vec2(.006, 0.)).b,
                   texture(uMask, uv + pc + vec2(0., .0034)).b - texture(uMask, uv + pc - vec2(0., .0034)).b);
    vec2 outN = -normalize(mg*vec2(1., 1./H) + 1e-6);
    float facing = .5 + .5*dot(outN, normalize((uLamp - uv)*vec2(1., H) + 1e-6));
    float rim = smoothstep(.95, .45, m.b)*m.r;
    col += vec3(.45, .82, 1.)*rim*(.15 + .85*facing)*(.4 + .6*uFlash);
    // arcos: unos detrás de la figura, otros por encima
    col += arcB*(1. - m.r*.85) + arcF*m.r + bl;
    // el marco: un hilo eléctrico que se enciende donde llegan los rayos
    float ed = -sd;
    col += mix(E1, E2, .35)*smoothstep(.9/pxu() + .5, .2, abs(ed - 3.))*(.1 + .2*uFlash + lit*1.6);
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: resplandor cian-violeta que parpadea, más fuerte cerca de los rayos
  float d = max(sd, 0.);
  vec2 cc = cp - CARD*.5;
  vec3 gc = mix(vec3(.3, .82, 1.), vec3(.62, .4, 1.), .5 + .5*sin(atan(cc.y, cc.x)*2. + uClock*.8));
  vec3 glow = gc*(exp(-d/11.)*.36 + exp(-d/36.)*.18)*uFlash + gc*lit*exp(-d/18.)*.5;
  return vec4(col + (glow + bl)*(1. - a), a);
}`

const ICE = `
uniform float uFrost, uGlint;
const vec3 ICEC = vec3(.8, .91, 1.);
// voronoi: x distancia al centro, y distancia al borde de la celda; id y vector al centro por salida
vec2 vor(vec2 p, out vec2 id, out vec2 rc){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(x, y), r = g + hash22(i + g) - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = i + g; rc = r; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
// lejanía a las esquinas en anchos de carta; los bordes se escarchan un poco antes que el centro
float cornerD(vec2 q){
  vec2 c = vec2(min(q.x, 1. - q.x), min(q.y, H - q.y));
  return min(length(c*vec2(1., .8)), min(c.x, c.y)*2.4 + .1);
}
// vector desde la esquina más cercana, reflejado para que "hacia dentro" sea siempre +x +y
vec2 fromCorner(vec2 q){ return vec2(min(q.x, 1. - q.x), min(q.y, H - q.y)); }
float ridge(float n, float k){ return pow(1. - abs(n), k); }
float vapor(vec2 q, float P){
  float n = fbmP(vec2(q.x*5. + .3*sin(q.y*4. + TAU*P), q.y*1.3 + P*2.), vec2(1e4, 2.));
  return smoothstep(-.12, .4, n);
}
vec3 iceFlare(vec2 d, float k){
  float core = exp(-dot(d, d)/8.);
  float hz = exp(-abs(d.y)*.8)*exp(-abs(d.x)/42.);
  float vt = exp(-abs(d.x)*.8)*exp(-abs(d.y)/42.);
  vec2 r = vec2(d.x + d.y, d.x - d.y)*.7071;
  float dg = (exp(-abs(r.x)*1.)*exp(-abs(r.y)/14.) + exp(-abs(r.y)*1.)*exp(-abs(r.x)/14.))*.35;
  return vec3(.85, .94, 1.)*(core*1.4 + hz*.55 + vt*.55 + dg)*k;
}
vec4 shade(vec2 uv, vec2 cp, float sd){
  float P = uT/uLoop;
  vec2 q = cp/270.;
  float inside = clamp(.5 - sd, 0., 1.);
  vec3 V = normalize(vec3(-uTilt*.45, 1.));
  vec2 lampCp = uLamp*CARD;
  float R = mix(.08, .52, uFrost) + .01*sin(TAU*P);
  vec3 col = vec3(0.); float a = 0.;
  // cada esquina tiene un cristal grande que destella al inclinar: su luz se sale del marco
  vec3 flares = vec3(0.);
  for (int k = 0; k < 4; k++){
    vec2 cn = vec2(k & 1, k >> 1);
    vec2 fc = mix(vec2(15., 17.), CARD - vec2(15., 17.), cn);
    vec3 n = normalize(vec3((hash22(cn + 4.) - .5)*.9, 1.));
    vec3 Lf = normalize(vec3(lampCp - fc, 200.));
    float s = pow(max(dot(n, normalize(Lf + V)), 0.), 50.);
    flares += iceFlare(cp - fc, s*(.35 + 1.7*uGlint)*smoothstep(.12, .3, R));
  }
  if (sd < 1.){
    vec2 pc = uTilt*.008, pb = -uTilt*.014;
    // la escarcha está en el vidrio, delante: se mueve al revés que el fondo
    vec2 fq = q + uTilt*vec2(.01, .016);
    vec4 m = texture(uMask, uv + pc);
    vec3 art = mix(texture(uImg, uv + pb).rgb, texture(uImg, uv + pc).rgb, m.r);
    vec2 fc = fromCorner(fq);
    float r = length(fc), th = atan(fc.y, fc.x);
    // agujas que salen de la esquina: ruido estirado a lo largo del radio, afilado en crestas
    float rad = ridge(gnoise(vec2(th*30., r*9.), 1e4), 10.)*.7 + ridge(gnoise(vec2(th*70. + 3., r*20.), 1e4), 12.)*.45;
    // ramas: parches con su propia orientación, como plumas
    vec2 gid, grc;
    vec2 gv = vor(fq*7., gid, grc);
    float ang = th + (hash12(gid) > .5 ? 1. : -1.)*(.9 + .3*hash12(gid + 1.));
    vec2 dir = vec2(cos(ang), sin(ang));
    float br = ridge(gnoise(vec2(dot(fq, dir)*16., dot(fq, vec2(-dir.y, dir.x))*120.) + gid*7., 1e4), 10.);
    br *= smoothstep(.35, .0, gv.x*.5);
    // facetas finas: solo sus aristas, muy tenues
    vec2 fid, rc;
    vec2 fv = vor(fq*42., fid, rc);
    float edges = smoothstep(.07, .0, fv.y);
    // el frente avanza más lejos por las agujas: así termina en puntas de pluma
    float dend = gnoise(fq*8., 1e4)*.6 + gnoise(fq*21., 1e4)*.3;
    vec2 dp = q - uPtr*vec2(1., H);
    float melt = exp(-dot(dp, dp)/.014)*uHover;
    // el calor de las figuras: la escarcha no llega a tocarlas y deja un contorno limpio
    float Dj = cornerD(fq) + dend*.06 - rad*.05 - br*.03 + m.g*.03 + melt*.32;
    float cov = smoothstep(R, R - .008, Dj);
    float thick = smoothstep(R, R - .32, Dj);
    float front = cov*smoothstep(R - .035, R - .006, Dj);
    float grain = gnoise(fq*300., 1e4)*.5 + .5;
    // plumas en el frente: agujas finas a ±60° del radio, como helechos de escarcha
    vec2 er = fc/max(r, 1e-4);
    vec2 b1 = vec2(er.x*.5 - er.y*.866, er.x*.866 + er.y*.5), b2 = vec2(er.x*.5 + er.y*.866, -er.x*.866 + er.y*.5);
    float fern = max(ridge(gnoise(vec2(dot(fq, b1)*14., dot(fq, vec2(-b1.y, b1.x))*150.), 1e4), 14.),
                     ridge(gnoise(vec2(dot(fq, b2)*14., dot(fq, vec2(-b2.y, b2.x))*150.) + 9., 1e4), 14.));
    float feather = smoothstep(.26, .02, R - Dj);
    float rime = thick*thick*(.26 + .34*grain);
    float fa = cov*clamp(rime + thick*.08 + rad*(.22 + .26*thick) + br*.35 + fern*feather*1.1 + edges*.18*thick + front*.35, 0., .75);
    // la escarcha es del vidrio: queda detrás de las figuras salvo donde ya es gruesa, en las esquinas
    fa *= mix(1., smoothstep(.35, .7, thick), m.r);
    // brillo general de la lámpara sobre el hielo
    vec2 lp = (cp - lampCp)/270.;
    float sheen = exp(-dot(lp, lp)/.06);
    vec3 fcol = vec3(.84, .92, 1.)*(.85 + .35*sheen) + vec3(1.)*rad*sheen*.4;
    // velo azul muy sutil, solo bajo la escarcha
    vec3 veiled = mix(art, art*vec3(.8, .9, 1.05) + vec3(.03, .06, .1), cov*.55);
    col = mix(veiled, fcol, fa);
    // destellos: pocas facetas son espejos; al inclinar se encienden unas y se apagan otras
    if (hash12(fid + 9.) > .86){
      vec3 n = normalize(vec3((hash22(fid + 5.) - .5)*1.2, 1.));
      vec3 Lc = normalize(vec3(lampCp - cp, 200.));
      float s = pow(max(dot(n, normalize(Lc + V)), 0.), 70.);
      vec2 sv = rc/42.*270.;  // vector al centro de la faceta, en unidades de carta
      float star = (exp(-abs(sv.x)*2.2)*exp(-abs(sv.y)*.32) + exp(-abs(sv.y)*2.2)*exp(-abs(sv.x)*.32))*.7 + exp(-dot(sv, sv)*2.5)*1.6;
      col += vec3(.95, .98, 1.)*star*s*(.6 + 2.6*uGlint)*cov*(.3 + .7*thick)*mix(1., smoothstep(.35, .7, thick), m.r);
    }
    // vaho dentro, abajo, delante de todo
    col = mix(col, ICEC*.8, vapor(q, P)*smoothstep(.28, .0, q.y)*.22);
    col += flares*.5;
    if (uSprite > .5) return vec4(col, 1.);
    col *= inside; a = inside;
  }
  // fuera: agujas de escarcha que asoman por el canto en las esquinas, vaho que cae y un halo frío
  float d = max(sd, 0.);
  vec2 g2 = sdN(cp);
  vec2 edgeP = cp - g2*sd;
  float per = dot(edgeP, vec2(-g2.y, g2.x));
  float cell = floor(per/5.), u = fract(per/5.) - .5;
  float hc = hash12(vec2(cell, 7.));
  float prox = smoothstep(.2, .02, length(fromCorner(edgeP/270.)))*smoothstep(.12, .3, R);
  float len = (.3 + .7*hc)*16.*prox*step(.55, hc);
  float tip = clamp(d/max(len, .1), 0., 1.);
  float spike = smoothstep(.06, .0, abs(u - (hc - .5)*.6*tip) - .16*(1. - tip))*step(d, len);
  vec3 Lo = normalize(vec3(lampCp - edgeP, 200.));
  float ss = pow(max(dot(normalize(vec3(g2*.8, 1.)), normalize(Lo + V)), 0.), 30.);
  vec3 rime = vec3(.85, .93, 1.)*spike*(.4 + 1.2*ss*(1. + uGlint));
  float by = -q.y;
  float spread = .06 + max(by, 0.)*.6;
  float vap = vapor(q, P)*smoothstep(-.02, .03, by)*exp(-max(by, 0.)/.17)*smoothstep(-spread, .06, q.x)*smoothstep(1. + spread, .94, q.x);
  vec3 glow = vec3(.6, .8, 1.)*(exp(-d/14.)*.22 + exp(-d/44.)*.11);
  float oa = (vap*.45 + spike*.8)*(1. - a);
  return vec4(col + (glow + flares + ICEC*vap*.5 + rime)*(1. - a), a + oa*.6);
}`

export const FRAGMENT = {
	fuego: fsOf(FIRE),
	slime: fsOf(SLIME),
	metal: fsOf(METAL),
	fantasma: fsOf(GHOST),
	'metal-color': fsOf(METALC),
	'fantasma-color': fsOf(GHOSTC),
	rayo: fsOf(BOLT),
	hielo: fsOf(ICE),
}
