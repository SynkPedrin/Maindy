"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from "three";
import { film, range, smooth, smoother, windowed } from "../store";
import { SCENE_INDEX } from "../storyboard";
import { buildFragmentAtlas, buildLetterTexture, FRAGMENTS } from "./fragments";
import { C2, samplePose, type Pose } from "./keyframes";
import { plateLayout } from "./plate";
import * as S from "./shaders";

const Effects = lazy(() => import("./Effects"));

/** pose shared by every actor in the frame (written first by the Director) */
const pose: Pose = { cam: new Vector3(), look: new Vector3(), orb: new Vector3(), scale: 1, light: 1, gold: 1 };
const tmp = new Vector3();
const tmp2 = new Vector3();
const UP = new Vector3(0, 1, 0);
const tmp3 = new Vector3();

const FINAL = SCENE_INDEX.final;
const ORBIT = SCENE_INDEX.orbit;

/* ───────────────────────── Director (camera) ───────────────────────── */
function Director() {
  const { camera, size } = useThree();
  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / size.height;
    const portrait = aspect < 0.9;
    samplePose(film.s, portrait, pose);
    // narrow screens: pull the camera back along its view line so framing survives the aspect
    const m = aspect < 1.25 ? Math.pow(1.25 / aspect, 0.75) : 1;
    tmp.copy(pose.cam).sub(pose.look).multiplyScalar(m);
    // free-look: orbit the directed camera around the subject while the visitor drags (springs back)
    if (film.look.yaw !== 0 || film.look.pitch !== 0) {
      tmp2.copy(pose.orb).sub(pose.look);
      tmp.sub(tmp2);
      tmp.applyAxisAngle(UP, film.look.yaw);
      tmp.applyAxisAngle(tmp3.copy(tmp).cross(UP).normalize(), film.look.pitch);
      tmp.add(tmp2);
    }
    cam.position.copy(pose.look).add(tmp);
    // subtle handheld parallax from the pointer (desktop only), damped
    if (!film.viewport.mobile && !film.reducedMotion && film.s < FINAL - 0.1) {
      cam.position.x += film.pointer.sx * 0.12;
      cam.position.y += film.pointer.sy * 0.08;
    }
    cam.lookAt(pose.look);
    // a touch of FOV "breathing" with scroll speed sells the motion
    const kick = film.reducedMotion ? 0 : Math.min(3.5, Math.abs(film.velocity) * 2.2);
    const fov = (portrait ? 42 : 35) + kick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    // final scene: size the live orb to the filmed orb of the official plate
    if (film.s > FINAL - 0.05) {
      const L = plateLayout(size.width, size.height);
      const dist = cam.position.distanceTo(pose.orb);
      const pxPerUnit = size.height / (2 * dist * Math.tan((cam.fov * Math.PI) / 360));
      const target = (L.orbPx / 2 / pxPerUnit) * 0.93;
      const k = smooth(range(film.s, FINAL - 0.05, FINAL + 0.06));
      pose.scale = pose.scale + (target - pose.scale) * k;
    }
  }, -3);
  return null;
}

/* ───────────────────────── Orb ───────────────────────── */
function Orb({ glyph, hd }: { glyph: Texture; hd: boolean }) {
  const group = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const wave = useRef<Mesh>(null);
  const { camera } = useThree();
  const orbMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: S.orbVertex,
        fragmentShader: S.orbFragment,
        transparent: true,
        uniforms: {
          uGlyph: { value: glyph },
          uTime: { value: 0 },
          uDeform: { value: 0 },
          uBreath: { value: 0 },
          uTouch: { value: new Vector3(0, 0, 1) },
          uTouchAmt: { value: 0 },
          uGlow: { value: 0 },
          uPulse: { value: 0 },
          uGold: { value: 1 },
          uOpacity: { value: 1 },
          uGlyphAmt: { value: 1 },
          uParallax: { value: new Vector2() },
          uBlur: { value: 0 },
        },
      }),
    [glyph],
  );
  const haloMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: S.haloVertex,
        fragmentShader: S.haloFragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uOpacity: { value: 1 }, uGold: { value: 1 }, uPulse: { value: 0 }, uTime: { value: 0 } },
      }),
    [],
  );
  const waveMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: S.haloVertex,
        fragmentShader: /* glsl */ `uniform float uT; varying vec2 vUv; void main(){ float r=length(vUv-0.5)*2.0; float a=exp(-pow((r-0.6-uT*0.38)*22.0,2.0))*(1.0-uT); gl_FragColor=vec4(vec3(0.78,0.45,1.0)*a,1.0);} `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uT: { value: 1 } },
      }),
    [],
  );
  const geo = useMemo(() => new SphereGeometry(1, hd ? 192 : 112, hd ? 144 : 84), [hd]);
  const plane = useMemo(() => new PlaneGeometry(1, 1), []);
  const touch = useRef({ at: -10, dir: new Vector3(0, 0, 1) });

  // Pointer / touch on the orb: pulse + elastic dent (screen-space hit test, canvas stays pointer-transparent)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("a,button,input,textarea,select,[role=slider],[role=tab],[data-interactive]")) return;
      const g = group.current;
      if (!g || !g.visible) return;
      tmp.copy(g.position).project(camera);
      const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
      tmp2.copy(g.position).addScaledVector(UP, g.scale.x).project(camera);
      const rpx = Math.abs((-tmp2.y * 0.5 + 0.5) * window.innerHeight - sy);
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (dx * dx + dy * dy > rpx * rpx * 1.1) return;
      const nx = dx / rpx;
      const ny = -dy / rpx;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // to object space: approximate with camera basis (orb rotates only slightly)
      touch.current.dir.set(nx, ny, nz).applyQuaternion(camera.quaternion).normalize();
      touch.current.at = performance.now() / 1000;
      film.pulse += 1;
      film.pulseAt = performance.now() / 1000;
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [camera]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const now = performance.now() / 1000;
    const intro = film.intro;
    const introScale = smoother(range(intro, 0.18, 0.92));
    const scale = pose.scale * (film.s < 1 ? 0.02 + 0.98 * introScale : 1);
    g.visible = scale > 0.004 && !film.covered;
    if (!g.visible) return;
    g.position.copy(pose.orb);
    const breath = film.reducedMotion ? 0 : Math.sin(t * 1.15);
    g.scale.setScalar(scale * (1 + breath * 0.008));
    // pointer: limited, elegant follow
    g.rotation.y = film.pointer.sx * 0.22 + Math.sin(t * 0.3) * 0.04;
    g.rotation.x = -film.pointer.sy * 0.16;
    const sincePulse = now - film.pulseAt;
    const pulse = sincePulse < 3 ? Math.exp(-sincePulse * 2.6) : 0;
    const sinceTouch = now - touch.current.at;
    const touchAmt = sinceTouch < 2.5 ? Math.exp(-sinceTouch * 3.2) * Math.cos(sinceTouch * 13) : 0;
    // final scene: live orb hands off to the filmed plate
    const fade = 1 - smooth(range(film.s, FINAL + 0.05, FINAL + 0.12));
    const u = orbMat.uniforms;
    u.uTime!.value = t;
    u.uBreath!.value = breath;
    u.uPulse!.value = pulse + film.ctaHover * 0.35;
    u.uGlow!.value = pose.light * 0.6 + film.ctaHover * 0.5 + (1 - introScale) * 1.5;
    u.uGold!.value = pose.gold;
    u.uDeform!.value = Math.abs(touchAmt) * 0.6;
    u.uTouchAmt!.value = touchAmt;
    (u.uTouch!.value as Vector3).copy(touch.current.dir).applyQuaternion(tmpQ.copy(g.quaternion).invert());
    u.uOpacity!.value = fade;
    u.uGlyphAmt!.value = smooth(range(scale, 0.25, 0.6)) * smooth(range(intro, 0.55, 1));
    (u.uParallax!.value as Vector2).set(film.pointer.sx * 0.035, film.pointer.sy * 0.035);
    // halo always faces the camera
    const h = halo.current!;
    h.quaternion.copy(state.camera.quaternion);
    const pointLight = intro < 0.25 ? (1 - range(intro, 0.0, 0.25)) * 2.2 : 0;
    h.scale.setScalar(intro < 1 ? 3.6 * (0.12 + 0.88 * smooth(range(intro, 0.05, 0.8))) : 3.6);
    haloMat.uniforms.uOpacity!.value = (0.75 * pose.light + film.ctaHover * 0.6 + pulse * 0.5 + pointLight) * fade * smooth(range(intro, 0.0, 0.2));
    haloMat.uniforms.uGold!.value = pose.gold;
    haloMat.uniforms.uPulse!.value = pulse;
    haloMat.uniforms.uTime!.value = t;
    const w = wave.current!;
    w.quaternion.copy(state.camera.quaternion);
    waveMat.uniforms.uT!.value = Math.min(1, sincePulse / 1.1);
    w.visible = sincePulse < 1.1;
    w.scale.setScalar(2.6 + Math.min(1, sincePulse / 1.1) * 1.6);
  }, -1);

  return (
    <group ref={group}>
      <mesh ref={halo} geometry={plane} material={haloMat} renderOrder={0} />
      <mesh geometry={geo} material={orbMat} renderOrder={1} />
      <mesh ref={wave} geometry={plane} material={waveMat} renderOrder={2} />
    </group>
  );
}
const tmpQ = new Quaternion();

/* ───────────────────────── Particles ───────────────────────── */
function Particles({ count }: { count: number }) {
  const { geometry, material } = useMemo(() => {
    const g = new BufferGeometry();
    const seeds = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const pos = new Float32Array(count * 3);
    // deterministic hash (no Math.random: same film every visit)
    const h = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const violet = new Color("#A424FF");
    const lilac = new Color("#D8C2FF");
    const gold = new Color("#FFC83A");
    const white = new Color("#F4F0FF");
    for (let i = 0; i < count; i++) {
      seeds.set([h(i * 4 + 1), h(i * 4 + 2), h(i * 4 + 3), h(i * 4 + 4)], i * 4);
      const r = h(i * 9.7 + 5);
      const c = r < 0.06 ? gold : r < 0.14 ? white : r < 0.55 ? lilac : violet;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    g.setAttribute("aColor", new BufferAttribute(colors, 3));
    const m = new ShaderMaterial({
      vertexShader: S.particleVertex,
      fragmentShader: S.particleFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uT1: { value: 0 },
        uT2: { value: 0 },
        uT3: { value: 0 },
        uSize: { value: 0.07 },
        uPixel: { value: 800 },
        uO1: { value: new Vector3(0, 0, 0) },
        uMouse: { value: new Vector3(0, 0, -999) },
        uMouseR: { value: 0 },
        uC2: { value: C2.clone() },
        uCalm: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    return { geometry: g, material: m };
  }, [count]);
  const { size, viewport } = useThree();
  useFrame((state) => {
    const s = film.s;
    const u = material.uniforms;
    u.uTime!.value = film.reducedMotion ? 0 : state.clock.elapsedTime;
    u.uT1!.value = smooth(range(s, 0.86, 1.04));
    u.uT2!.value = range(s, 2.12, 2.86);
    u.uT3!.value = smooth(range(s, 7.55, 8.35));
    u.uCalm!.value = smooth(range(s, 7.8, 8.4)) * (1 - smooth(range(s, 9.2, 9.8)));
    (u.uO1!.value as Vector3).copy(film.s < 1 ? pose.orb : (u.uO1!.value as Vector3));
    u.uPixel!.value = (size.height * viewport.dpr) / 2;
    // cursor field: the pointer, unprojected onto the plane through the current subject
    if (film.pointer.active && !film.viewport.mobile && !film.reducedMotion) {
      mouseNdc.set(film.pointer.x, film.pointer.y, 0.5).unproject(state.camera).sub(state.camera.position).normalize();
      const dist = state.camera.position.distanceTo(pose.look);
      (u.uMouse!.value as Vector3).copy(state.camera.position).addScaledVector(mouseNdc, dist);
      u.uMouseR!.value += (1.35 - (u.uMouseR!.value as number)) * 0.08;
    } else u.uMouseR!.value = (u.uMouseR!.value as number) * 0.9;
    u.uOpacity!.value = smooth(range(film.intro, 0.25, 1)) * (0.55 + 0.45 * pose.light) * (1 - smooth(range(s, FINAL + 0.02, FINAL + 0.12)));
  }, -1);
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}

/* ───────────────────────── Thought fragments ───────────────────────── */
function Fragments({ hd }: { hd: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const atlas = useMemo(() => buildFragmentAtlas(hd ? 2 : 1.2), [hd]);
  const n = FRAGMENTS.length;
  const { geometry, material, scatter, orbitBase } = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const rects = new Float32Array(n * 4);
    atlas.rects.forEach((r, i) => rects.set(r, i * 4));
    g.setAttribute("aRect", new InstancedBufferAttribute(rects, 4));
    g.setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aBlur", new InstancedBufferAttribute(new Float32Array(n), 1));
    const m = new ShaderMaterial({
      vertexShader: S.fragVertex,
      fragmentShader: S.fragFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uAtlas: { value: atlas.texture } },
    });
    const sc: Vector3[] = [];
    const ob: { r: number; a: number; ring: number }[] = [];
    for (let k = 0; k < n; k++) {
      // cards live in the right half of the corridor so the copy column (left) stays clean
      const fx = (k * 0.618) % 1;
      const fy = (k * 0.381 + 0.17) % 1;
      const z = -3.0 - k * 1.05 - ((k * 0.37) % 1) * 0.6;
      const reach = 0.9 + (-z / 40) * 2.6; // the corridor widens with depth (perspective)
      sc.push(new Vector3(0.35 + fx * reach * 1.15, (fy - 0.5) * reach * 1.25, z));
      ob.push({ r: 1.7 + (k % 3) * 0.45, a: (k / n) * Math.PI * 2, ring: k % 3 });
    }
    return { geometry: g, material: m, scatter: sc, orbitBase: ob };
  }, [atlas, n]);

  useEffect(
    () => () => {
      atlas.texture.dispose();
      geometry.dispose();
      material.dispose();
    },
    [atlas, geometry, material],
  );

  const dummy = useMemo(() => new Object3D(), []);
  const orbitP = useMemo(() => new Vector3(), []);
  const ctrl = useMemo(() => new Vector3(), []);
  const p = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const s = film.s;
    const visible = s > 0.97 && s < 3.4;
    m.visible = visible;
    if (!visible) return;
    const t = film.reducedMotion ? 0 : state.clock.elapsedTime;
    const cam = state.camera;
    const focus = s < 2.1 ? 5.5 : cam.position.distanceTo(C2);
    const alphaAttr = geometry.getAttribute("aAlpha") as InstancedBufferAttribute;
    const blurAttr = geometry.getAttribute("aBlur") as InstancedBufferAttribute;
    for (let k = 0; k < n; k++) {
      // cards materialise out of the dark as the camera approaches (distance-based, not index-based)
      const appear = smooth(range(s, 0.98, 1.06));
      const pull = smoother(range(s, 2.16 + k * 0.012, 2.72 + k * 0.012));
      const shrink = smooth(range(s, 2.86 + (k % 5) * 0.03, 3.25));
      // orbit target (slow rotation once captured)
      const o = orbitBase[k]!;
      const ang = o.a + t * 0.12 * (1 - o.ring * 0.2);
      orbitP.set(Math.cos(ang) * o.r, 0, Math.sin(ang) * o.r);
      orbitP.applyAxisAngle(AX, 1.25 + o.ring * 0.28).applyAxisAngle(UP, o.ring * 1.1).add(C2);
      const sc = scatter[k]!;
      // drifting thought (small float), deterministic per index
      p.copy(sc);
      p.x += Math.sin(t * 0.35 + k) * 0.08;
      p.y += Math.cos(t * 0.31 + k * 1.3) * 0.06;
      // curved pull: quadratic bezier through a sideways control point
      ctrl.copy(p).lerp(orbitP, 0.5);
      tmp.copy(orbitP).sub(p).cross(UP).normalize().multiplyScalar(k % 2 ? 2.4 : -2.4);
      ctrl.add(tmp);
      const it = 1 - pull;
      p.multiplyScalar(it * it).addScaledVector(ctrl, 2 * it * pull).addScaledVector(orbitP, pull * pull);
      const d = cam.position.distanceTo(p);
      const behind = tmp2.copy(p).sub(cam.position).dot(tmp.set(0, 0, -1).applyQuaternion(cam.quaternion)) < 0.3;
      const defocus = Math.min(1, Math.max(0, Math.abs(d - focus) - 1.2) / (focus * 1.1));
      const h = 0.28 * (1 - 0.5 * pull) * (1 - shrink);
      dummy.position.copy(p);
      dummy.quaternion.copy(cam.quaternion);
      dummy.rotateZ(Math.sin(k * 1.7) * 0.07 * (1 - pull));
      dummy.scale.set(h * atlas.aspects[k]!, h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      const near = smooth(range(d, 1.7, 3.4)) * (1 - smooth(range(d, 11, 17)));
      alphaAttr.setX(k, behind ? 0 : appear * near * (1 - shrink) * (1 - defocus * 0.45) * (0.7 + 0.3 * pose.light));
      blurAttr.setX(k, defocus * 1.6);
    }
    m.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    blurAttr.needsUpdate = true;
  }, -1);

  return <instancedMesh ref={mesh} args={[geometry, material, n]} frustumCulled={false} renderOrder={4} />;
}
const AX = new Vector3(1, 0, 0);
const mouseNdc = new Vector3();

/* ───────────────────────── ORBIT ring: five stages as a dial ───────────────────────── */
const LETTERS = ["O", "R", "B", "I", "T"];
const RING_R = 2.2;
function OrbitRing() {
  const outer = useRef<Group>(null);
  const nodes = useRef<(Sprite | null)[]>([]);
  const ringMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: S.haloVertex,
        fragmentShader: /* glsl */ `uniform float uProgress; uniform float uOpacity; varying vec2 vUv;
          void main(){ float a=vUv.x; float lit=step(a,uProgress); float head=exp(-pow((a-uProgress)*90.0,2.0));
          vec3 arc=mix(vec3(0.64,0.16,1.0),vec3(1.0,0.75,0.2),a); vec3 base=vec3(0.55,0.5,0.8)*0.28;
          gl_FragColor=vec4((mix(base,arc*1.5,lit)+vec3(1.0,0.92,0.75)*head*1.6)*uOpacity,1.0);} `,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uProgress: { value: 0 }, uOpacity: { value: 0 } },
      }),
    [],
  );
  const torus = useMemo(() => new TorusGeometry(RING_R, 0.009, 8, 512), []);
  const letters = useMemo(
    () =>
      LETTERS.map((l) => {
        const tex = buildLetterTexture(l);
        return new SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      }),
    [],
  );
  useEffect(
    () => () => {
      letters.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      torus.dispose();
      ringMat.dispose();
    },
    [letters, torus, ringMat],
  );
  useFrame(() => {
    const o = outer.current;
    if (!o) return;
    const s = film.s;
    const vis = windowed(s, ORBIT - 0.15, ORBIT + 0.12, ORBIT + 0.92, ORBIT + 1.12);
    o.visible = vis > 0.003;
    if (!o.visible) return;
    const local = range(s, ORBIT, ORBIT + 1);
    const f = Math.min(4, Math.max(0, local * 5.6 - 0.3)); // focused stage (continuous)
    o.position.copy(C2);
    o.rotation.y = -(f / 5) * Math.PI * 2 - Math.PI / 2;
    ringMat.uniforms.uProgress!.value = Math.min(1, f / 5 + 0.015);
    ringMat.uniforms.uOpacity!.value = vis;
    for (let k = 0; k < 5; k++) {
      const sp = nodes.current[k];
      if (!sp) continue;
      const emph = Math.exp(-Math.pow(f - k, 2) * 2.2);
      sp.scale.setScalar(0.34 + emph * 0.26);
      (sp.material as SpriteMaterial).opacity = vis * (0.45 + 0.55 * Math.max(emph, f >= k ? 0.75 : 0));
    }
  }, -1);
  return (
    <group ref={outer}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={torus} material={ringMat} />
        {LETTERS.map((l, k) => {
          const u = (k / 5) * Math.PI * 2;
          return (
            <sprite
              key={l}
              ref={(el) => {
                nodes.current[k] = el;
              }}
              material={letters[k]}
              position={[Math.cos(u) * RING_R, Math.sin(u) * RING_R, 0]}
            />
          );
        })}
      </group>
    </group>
  );
}

/* ───────────────────────── Membrane flash (cut through the orb) ───────────────────────── */
function Flash() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: S.screenVertex,
        fragmentShader: S.flashFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uFlash: { value: 0 } },
      }),
    [],
  );
  const geo = useMemo(() => new PlaneGeometry(2, 2), []);
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const f = windowed(film.s, 0.86, 0.98, 1.0, 1.16);
    mat.uniforms.uFlash!.value = f * 0.92;
    if (ref.current) ref.current.visible = f > 0.002;
  }, -1);
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={10} />;
}

/* ───────────────────────── Dynamic resolution ─────────────────────────
   Renders at native resolution (up to 2× DPR: 4K / Retina) and trades pixels for frame rate:
   sustained frames > 18.5 ms step the DPR down, sustained headroom steps it back up.
   Only if even DPR 1 cannot hold ~36 fps do we drop post-processing. */
function DynamicResolution({ maxDpr, onSlow, locked }: { maxDpr: number; onSlow: () => void; locked: boolean }) {
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ dpr: maxDpr, acc: 0, n: 0, last: 0, good: 0, warm: 0, slowFired: false });
  useFrame((_, delta) => {
    const g = st.current;
    if (film.covered || locked) return;
    g.warm += delta;
    if (g.warm < 1.5 || delta > 0.25) return; // shader compile / tab switch
    g.acc += delta;
    g.n++;
    if (g.n < 45) return;
    const avg = (g.acc / g.n) * 1000;
    g.acc = 0;
    g.n = 0;
    const now = performance.now();
    if (now - g.last < 1200) return;
    const floor = maxDpr >= 2 && avg < 30 ? 1.5 : 1;
    if (avg > 21 && g.dpr > floor) {
      g.dpr = Math.max(floor, +(g.dpr - (avg > 28 ? 0.5 : 0.25)).toFixed(2));
      g.good = 0;
      g.last = now;
      setDpr(g.dpr);
    } else if (avg > 27 && g.dpr <= 1 && !g.slowFired) {
      g.slowFired = true;
      onSlow();
    } else if (avg < 17.5 && g.dpr < maxDpr) {
      if (++g.good >= 2) {
        g.dpr = Math.min(maxDpr, +(g.dpr + 0.25).toFixed(2));
        g.good = 0;
        g.last = now;
        setDpr(g.dpr);
      }
    } else g.good = 0;
  });
  return null;
}

/* ───────────────────────── Shader warm-up ─────────────────────────
   Three compiles a program the first time an object is drawn. Objects that only appear later in the
   film (cards, ORBIT ring, flash, pulse wave) would compile mid-scroll and stall 60–200 ms. Compile
   everything up front — behind the preloader — then tell it the world is ready. */
function Precompile() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(async () => {
      const hidden: Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        try {
          gl.compile(scene, camera);
        } catch {}
      }
      // per-frame actors restore their own visibility next frame; reset now to avoid a flash
      for (const o of hidden) o.visible = false;
      if (!cancelled) window.dispatchEvent(new Event("maindy:gl-ready"));
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [gl, scene, camera]);
  return null;
}

/* ───────────────────────── World ───────────────────────── */
export default function World({
  particles,
  postfx,
  hd,
  maxDpr,
  locked,
  onSlow,
}: {
  particles: number;
  postfx: boolean;
  hd: boolean;
  maxDpr: number;
  locked: boolean;
  onSlow: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const glyph = useMemo(() => {
    const t = new TextureLoader().load(hd ? "/lp/glyph-2048.webp" : "/lp/glyph-1024.webp");
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return t;
  }, [hd, gl]);
  useEffect(() => () => glyph.dispose(), [glyph]);
  return (
    <>
      <Director />
      <Particles count={particles} />
      <Orb glyph={glyph} hd={hd} />
      <Fragments hd={hd} />
      <OrbitRing />
      <Flash />
      <Precompile />
      <DynamicResolution maxDpr={maxDpr} onSlow={onSlow} locked={locked} />
      {postfx ? (
        <Suspense fallback={null}>
          <Effects msaa={maxDpr < 1.6} />
        </Suspense>
      ) : null}
    </>
  );
}
