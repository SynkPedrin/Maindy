/* GLSL for the MAINDY world. Kept small and purposeful: every uniform maps to a directed effect. */

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ───────── Orb: navy glass core, violet→gold fresnel rim, official m. glyph seen "through" the glass ───────── */
export const orbVertex = /* glsl */ `
${NOISE}
uniform float uTime; uniform float uDeform; uniform float uBreath; uniform vec3 uTouch; uniform float uTouchAmt;
varying vec3 vN; varying vec3 vV; varying vec3 vObj;
void main(){
  vec3 p = position;
  vec3 dir = normalize(p);
  float n = snoise(dir*1.7 + vec3(0.0, 0.0, uTime*0.22));
  float touch = exp(-pow(distance(dir, uTouch)*2.4, 2.0)) * uTouchAmt;
  p += normal * (n*0.018*(1.0+uDeform*4.0) + uBreath*0.014 - touch*0.16);
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vObj = dir;
  gl_Position = projectionMatrix * mv;
}`;

export const orbFragment = /* glsl */ `
${NOISE}
uniform sampler2D uGlyph; uniform float uTime; uniform float uGlow; uniform float uPulse; uniform float uGold;
uniform float uOpacity; uniform float uGlyphAmt; uniform vec2 uParallax; uniform float uBlur;
varying vec3 vN; varying vec3 vV; varying vec3 vObj;
void main(){
  vec3 N = normalize(vN);
  float ndv = clamp(dot(N, normalize(vV)), 0.0, 1.0);
  float edge = 1.0 - ndv;
  float fres = pow(edge, 2.4);
  // deep navy core, indigo toward the edge, slow internal current
  vec3 core = mix(vec3(0.012,0.010,0.075), vec3(0.075,0.035,0.25), smoothstep(0.15, 1.0, edge));
  float cur = snoise(vec3(vObj.xy*2.2, uTime*0.12)) * 0.5 + 0.5;
  core += vec3(0.32,0.07,0.62) * 0.11 * cur * smoothstep(0.1, 0.9, edge);
  // rim colour: violet, with the brand's amber light on the upper-right
  vec2 nd = normalize(N.xy + 1e-5);
  float goldSide = smoothstep(0.15, 0.95, dot(nd, normalize(vec2(0.78, 0.62)))) * uGold;
  vec3 violet = vec3(0.64, 0.16, 1.0);
  vec3 amber = vec3(1.0, 0.70, 0.13);
  vec3 rimCol = mix(violet, amber, goldSide * 0.9);
  vec3 col = core + rimCol * fres * (1.35 + uGlow * 0.9 + uPulse * 2.2);
  // thin luminous inner ring, like the official icon
  float band = smoothstep(0.30, 0.20, ndv) * smoothstep(0.07, 0.16, ndv);
  col += mix(vec3(0.86,0.62,1.0), vec3(1.0,0.86,0.52), goldSide) * band * (0.42 + uPulse * 0.8);
  // soft key light top-left
  vec3 L = normalize(vec3(-0.55, 0.72, 0.55));
  vec3 H = normalize(L + normalize(vV));
  col += vec3(0.85,0.8,1.0) * pow(max(dot(N, H), 0.0), 48.0) * 0.45;
  // second, warmer specular from the amber side + a broad sheen (premium glass read)
  vec3 L2 = normalize(vec3(0.7, 0.55, 0.45));
  vec3 H2 = normalize(L2 + normalize(vV));
  col += vec3(1.0, 0.78, 0.4) * pow(max(dot(N, H2), 0.0), 90.0) * 0.55 * uGold;
  col += vec3(0.55, 0.45, 0.95) * pow(max(dot(N, H), 0.0), 6.0) * 0.05;
  // thin-film iridescence riding the fresnel edge
  // thin-film sheen kept inside the brand palette (violet ↔ orchid ↔ amber)
  float film = 0.5 + 0.5 * cos(6.28318 * (edge * 1.7 + uTime * 0.03));
  vec3 irid = mix(vec3(0.70, 0.30, 1.0), vec3(1.0, 0.62, 0.85), film);
  irid = mix(irid, vec3(1.0, 0.78, 0.4), goldSide * 0.6);
  col += irid * pow(edge, 3.5) * 0.12;
  // official glyph, projected through the glass (view-space normal → refraction-like at the edges)
  // sampled in uniform control flow (derivatives stay valid → no mip seams), then masked
  vec2 guv = (N.xy - uParallax) * 0.74 + 0.5;
  vec4 g = texture2D(uGlyph, clamp(guv, 0.0, 1.0), uBlur);
  float inside = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
  col = mix(col, g.rgb * (1.04 + uPulse * 0.25), g.a * inside * uGlyphAmt * smoothstep(0.05, 0.35, ndv));
  gl_FragColor = vec4(col, uOpacity);
}`;

/* ───────── Halo: camera-facing glow (violet core + amber offset), additive ───────── */
export const haloVertex = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const haloFragment = /* glsl */ `
uniform float uOpacity; uniform float uGold; uniform float uPulse; uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float breathe = 0.92 + 0.08 * sin(uTime * 1.1);
  float violet = smoothstep(1.0, 0.36, r) * 0.55 * breathe;
  float ring = exp(-pow((r - 0.47) * 9.0, 2.0)) * 0.35;
  float gold = smoothstep(0.62, 0.0, length(p - vec2(0.17, 0.15)) * 2.0) * 0.42 * uGold;
  vec3 col = vec3(0.56, 0.13, 1.0) * (violet + ring * (1.0 + uPulse * 2.0)) + vec3(1.0, 0.66, 0.12) * gold;
  gl_FragColor = vec4(col * uOpacity, 1.0);
}`;

/* ───────── Particles: four GPU states blended by the film coordinate ───────── */
export const particleVertex = /* glsl */ `
uniform float uTime; uniform float uT1; uniform float uT2; uniform float uT3; uniform float uSize; uniform float uPixel;
uniform vec3 uO1; uniform vec3 uC2; uniform float uCalm; uniform vec3 uMouse; uniform float uMouseR;
attribute vec4 aSeed; // x,y,z,w in 0..1
attribute vec3 aColor;
varying vec3 vColor; varying float vAlpha;
const float TAU = 6.28318530718;
vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
void main(){
  float t = uTime;
  // A — dust around the hero orb (shell + far field), slowly orbiting
  float rA = mix(1.55, 7.5, pow(aSeed.x, 1.8));
  float thA = aSeed.y * TAU + t * (0.05 + 0.12 / rA);
  float phA = acos(2.0 * aSeed.z - 1.0);
  vec3 A = uO1 + vec3(rA * sin(phA) * cos(thA), rA * cos(phA) * 0.62, rA * sin(phA) * sin(thA));
  // B — the overload corridor
  float zB = mix(-1.0, -46.0, aSeed.x);
  float rB = mix(1.25, 9.5, pow(aSeed.y, 1.4));
  float thB = aSeed.z * TAU + t * 0.03;
  vec3 B = vec3(cos(thB) * rB, sin(thB) * rB * 0.7, zB);
  // C — clean orbits around the orb (three tilted rings)
  float ringId = floor(aSeed.w * 3.0);
  float rC = 1.55 + ringId * 0.85 + (aSeed.x - 0.5) * 0.18;
  float thC = aSeed.y * TAU + t * (0.22 - ringId * 0.05);
  vec3 C = vec3(cos(thC) * rC, (aSeed.z - 0.5) * 0.05, sin(thC) * rC);
  C = rotX(C, 1.15 + ringId * 0.32);
  C = rotY(C, ringId * 1.1);
  C += uC2;
  // D — calm: a wide, slow, flat galaxy
  float rD = mix(2.4, 15.0, pow(aSeed.x, 0.8));
  float thD = aSeed.y * TAU + t * 0.012;
  vec3 D = uC2 + vec3(cos(thD) * rD, (aSeed.z - 0.5) * 0.35 - 0.6, sin(thD) * rD);
  // staggered convergence: each particle has its own moment in the shift
  float s2 = clamp((uT2 - aSeed.w * 0.35) / 0.65, 0.0, 1.0);
  s2 = s2 * s2 * (3.0 - 2.0 * s2);
  vec3 bc = mix(B, C, s2);
  // curved pull (magnetic-field feel): bow the path sideways mid-flight
  bc += normalize(cross(C - B + vec3(0.0001), vec3(0.0, 1.0, 0.0))) * sin(s2 * 3.14159) * 1.8 * (aSeed.z - 0.3);
  vec3 p = mix(A, bc, uT1);
  p = mix(p, D, uT3);
  // cursor field: particles part around the pointer like iron filings around a magnet
  vec3 dm = p - uMouse;
  float dl = length(dm);
  float push = uMouseR * smoothstep(1.5, 0.0, dl);
  p += normalize(dm + vec3(1e-4)) * push * (0.55 + aSeed.x * 0.6);
  p.y += push * 0.15 * sin(t * 2.0 + aSeed.y * 20.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.65 + 0.35 * sin(t * (0.6 + aSeed.x * 1.6) + aSeed.y * 40.0);
  twinkle = mix(twinkle, 0.85, uCalm);
  float size = uSize * (0.5 + aSeed.z * 1.25) * mix(1.0, 0.7, uCalm);
  gl_PointSize = size * uPixel / max(0.5, -mv.z);
  vColor = aColor;
  vAlpha = twinkle * smoothstep(60.0, 8.0, -mv.z) * smoothstep(0.2, 1.2, -mv.z);
}`;

export const particleFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  // crisp core + soft halo (reads as a sharp star at 4K instead of a blurry blob)
  float core = smoothstep(0.2, 0.05, d);
  float halo = smoothstep(0.5, 0.0, d);
  float a = core + halo * halo * 0.35;
  gl_FragColor = vec4(vColor * a * vAlpha * uOpacity, 1.0);
}`;

/* ───────── Thought fragments: instanced cards sampling one atlas; mip bias = cheap depth of field ───────── */
export const fragVertex = /* glsl */ `
attribute vec4 aRect; attribute float aAlpha; attribute float aBlur;
varying vec2 vUv; varying float vAlpha; varying float vBlur;
void main(){
  vUv = aRect.xy + uv * aRect.zw;
  vAlpha = aAlpha; vBlur = aBlur;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

export const fragFragment = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv; varying float vAlpha; varying float vBlur;
void main(){
  vec4 c = texture2D(uAtlas, vUv, vBlur);
  if (c.a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(c.rgb, c.a * vAlpha);
}`;

/* ───────── ORBIT ring: lit arc grows violet → gold up to the active stage ───────── */
export const ringFragment = /* glsl */ `
uniform float uProgress; uniform float uOpacity; uniform float uTime;
varying vec2 vUv;
void main(){
  // RingGeometry uv: use angle from position encoded in uv
  vec2 p = vUv - 0.5;
  float ang = atan(p.x, p.y); // 0 at +y, clockwise
  float a01 = fract(ang / 6.28318530718 + 1.0);
  float lit = step(a01, uProgress);
  float head = exp(-pow((a01 - uProgress) * 60.0, 2.0));
  vec3 base = vec3(0.55, 0.5, 0.75) * 0.22;
  vec3 arc = mix(vec3(0.64, 0.16, 1.0), vec3(1.0, 0.75, 0.2), a01);
  vec3 col = mix(base, arc * 1.4, lit) + vec3(1.0, 0.9, 0.7) * head * 1.5;
  gl_FragColor = vec4(col * uOpacity, 1.0);
}`;

export const flashFragment = /* glsl */ `
uniform float uFlash; varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 1.6;
  vec3 col = mix(vec3(0.85, 0.55, 1.0), vec3(0.36, 0.06, 0.82), smoothstep(0.0, 1.0, r));
  gl_FragColor = vec4(col * uFlash, uFlash);
}`;

export const screenVertex = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
