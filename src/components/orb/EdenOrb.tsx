"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The Eden Core — a living wireframe orb.
 * A displaced sphere rendered as a fine grid, blue fading to magenta,
 * ringed by a halo of drifting particles. When Eden is thinking, the
 * surface agitates and brightens; at rest it breathes slowly.
 */

type OrbState = "idle" | "thinking";

const VERT = `
uniform float uTime;
uniform float uAmp;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vViewNormal;

// Simplex 3D noise (Ashima Arts / Stefan Gustavson, MIT)
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vUv = uv;
  vec3 dir = normalize(position);
  float n1 = snoise(dir * 1.6 + vec3(0.0, uTime * 0.12, uTime * 0.08));
  float n2 = snoise(dir * 3.4 - vec3(uTime * 0.10, 0.0, uTime * 0.06));
  vec3 displaced = position + normal * (n1 * uAmp + n2 * uAmp * 0.35);
  vPos = displaced;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const FRAG = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vViewNormal;

void main() {
  // Fine grid drawn from the sphere's UVs
  vec2 cells = vUv * vec2(96.0, 48.0);
  vec2 f = fract(cells);
  vec2 dist = min(f, 1.0 - f);
  float d = min(dist.x, dist.y);
  float line = 1.0 - smoothstep(0.015, 0.06, d);

  // Diagonal gradient: blue upper-left, magenta lower-right
  float t = clamp((vPos.x - vPos.y) * 0.32 + 0.55, 0.0, 1.0);
  vec3 color = mix(uColorA, uColorB, t);

  // Rim light so the silhouette glows
  float rim = pow(1.0 - abs(vViewNormal.z), 1.6);

  float alpha = line * (0.42 + 0.58 * rim) * uGlow + 0.02;
  vec3 finalColor = color * (0.75 + rim * 1.1) * uGlow;
  gl_FragColor = vec4(finalColor, alpha);
}
`;

export default function EdenOrb({ state = "idle" }: { state?: OrbState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OrbState>(state);
  stateRef.current = state;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // ── The mesh orb ──────────────────────────────────────────
    const geometry = new THREE.SphereGeometry(1.55, 180, 120);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.2 },
        uGlow: { value: 1.0 },
        uColorA: { value: new THREE.Color("#3B7BFF") },
        uColorB: { value: new THREE.Color("#FF3DDC") },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const orb = new THREE.Mesh(geometry, material);
    group.add(orb);

    // ── The particle halo ─────────────────────────────────────
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const blue = new THREE.Color("#5B8CFF");
    const magenta = new THREE.Color("#FF4DE1");
    const scratch = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      const r = 1.85 + Math.random() * 0.85;
      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = dir.y * r;
      positions[i * 3 + 2] = dir.z * r;
      const t = THREE.MathUtils.clamp((dir.x - dir.y) * 0.5 + 0.55, 0, 1);
      scratch.copy(blue).lerp(magenta, t);
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const halo = new THREE.Points(particleGeometry, particleMaterial);
    group.add(halo);

    // ── Sizing ────────────────────────────────────────────────
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ── Mouse parallax ────────────────────────────────────────
    const mouse = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer);

    // ── Animation ─────────────────────────────────────────────
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const thinking = stateRef.current === "thinking";

      material.uniforms.uTime.value = reducedMotion ? 0 : t * (thinking ? 2.1 : 1);
      material.uniforms.uAmp.value = THREE.MathUtils.lerp(
        material.uniforms.uAmp.value,
        thinking ? 0.3 : 0.2,
        0.04
      );
      material.uniforms.uGlow.value = THREE.MathUtils.lerp(
        material.uniforms.uGlow.value,
        thinking ? 1.35 : 1.0,
        0.04
      );

      if (!reducedMotion) {
        group.rotation.y = t * 0.06;
        halo.rotation.y = -t * 0.025;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 0.25, 0.03);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, -mouse.y * 0.2, 0.03);
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      geometry.dispose();
      material.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
}
