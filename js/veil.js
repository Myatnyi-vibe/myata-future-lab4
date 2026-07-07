/* МЯТА FUTURE LAB · Проект4 — шёлковая вуаль из точек в секции «Когда»
   WebGL-облако точек (three.js Points + свой шейдер): волнующийся лист
   из точечных линий с перспективой, подсветкой гребней и переливом
   серебро/перванш/розовый — как дотс-волна в макете.
   При сбое WebGL/CDN тихо остаётся 2D-фолбэк из main.js. */
import * as THREE from 'three';

const host = document.getElementById('waveCanvas'); // 2D-фолбэк
const section = document.getElementById('when');
if (!host || !section) throw new Error('veil: no host');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = /Mobi|Android/i.test(navigator.userAgent)
  || Math.min(window.innerWidth, window.innerHeight) < 560
  || (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 900);

const glCanvas = document.createElement('canvas');
glCanvas.className = 'when-wave';
glCanvas.setAttribute('aria-hidden', 'true');

let renderer;
try {
  /* софтверный WebGL не тянем — 2D-вуаль честнее */
  const ctxOpts = { alpha: true, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
  const gl = glCanvas.getContext('webgl2', ctxOpts) || glCanvas.getContext('webgl', ctxOpts);
  if (!gl) throw new Error('no hardware WebGL');
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, context: gl, alpha: true, antialias: false });
} catch (e) {
  throw e; // 2D-вуаль остаётся
}

/* канвас на всю секцию — на мобильных дешевле держать dpr 1.5 */
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
camera.position.set(0, 0.4, 7.4);
camera.lookAt(0, -0.2, 0);

/* сетка точек: линии вдоль экрана (u), веер линий по глубине/высоте (v) */
const COLS = isMobile ? 200 : 320;
const ROWS = isMobile ? 42 : 58;
const N = COLS * ROWS;
const uv = new Float32Array(N * 2);
let k = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    uv[k++] = c / (COLS - 1);
    uv[k++] = r / (ROWS - 1);
  }
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
// position обязателен для Points; реальная позиция считается в шейдере
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 30);

/* ОСОЗНАННО: hex уходят в linear-конверсию ColorManagement и рисуются
   темнее номинала (шейдер пишет gl_FragColor без обратной конверсии) —
   итоговые экранные цвета подгонялись по факту рендера, не менять
   вместе с пайплайном по отдельности */
const uniforms = {
  uTime: { value: 0 },
  uSize: { value: 30 * renderer.getPixelRatio() },
  uSilver: { value: new THREE.Color(0x949eb2) },
  uPeri: { value: new THREE.Color(0x6c76c4) },
  uPink: { value: new THREE.Color(0xc98fca) }
};

const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  uniforms: uniforms,
  vertexShader: `
    attribute vec2 aUV;
    uniform float uTime;
    uniform float uSize;
    varying float vLit;
    varying float vFade;
    void main() {
      float u = aUV.x, v = aUV.y;
      float t = uTime * 0.32;

      /* лист: x поперёк, z в глубину, базовый веер по высоте */
      float x = (u - 0.5) * 17.0;
      float z = (v - 0.5) * 5.0;
      float y0 = (0.5 - v) * 4.6;

      /* три наложенные волны — «шёлк» */
      float w1 = sin(u * 7.2 + v * 2.6 + t)        * 0.42;
      float w2 = sin(u * 3.0 - v * 5.2 + t * 0.7 + 1.7) * 0.75;
      float w3 = sin(u * 12.5 + v * 8.5 - t * 1.25)     * 0.11;
      float w4 = sin(v * 12.0 + t * 0.5)                * 0.22;
      float y = y0 + w1 + w2 + w3 + w4;

      /* «освещение» гребней — производная главных волн */
      float crest = cos(u * 7.2 + v * 2.6 + t) * 0.55
                  + cos(u * 3.0 - v * 5.2 + t * 0.7 + 1.7) * 0.8;
      vLit = clamp(crest * 0.5 + 0.5, 0.0, 1.0);

      vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
      gl_Position = projectionMatrix * mv;
      float dist = -mv.z;
      gl_PointSize = uSize / dist;

      /* растворение к краям листа и в глубине */
      float edge = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u)
                 * smoothstep(0.0, 0.05, v) * smoothstep(1.0, 0.95, v);
      float depth = smoothstep(11.5, 5.0, dist);
      vFade = edge * depth;
    }
  `,
  fragmentShader: `
    precision mediump float;
    uniform vec3 uSilver;
    uniform vec3 uPeri;
    uniform vec3 uPink;
    varying float vLit;
    varying float vFade;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = dot(p, p);
      if (d > 0.25) discard;
      float soft = smoothstep(0.25, 0.04, d);
      vec3 col = mix(uPeri, uSilver, vLit);
      col = mix(col, uPink, pow(vLit, 3.0) * 0.4);
      float a = (0.1 + 0.34 * vLit) * vFade * soft;
      gl_FragColor = vec4(col, a);
    }
  `
});
window.__veilMat = mat;

scene.add(new THREE.Points(geo, mat));

function resize() {
  const w = Math.max(1, section.clientWidth);
  const h = Math.max(1, section.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

let inView = true;
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
  }, { rootMargin: '120px' }).observe(section);
}

/* потеря контекста: возвращаем 2D-фолбэк (main.js слушает veil:gl-lost) */
let glDead = false;
glCanvas.addEventListener('webglcontextlost', () => {
  glDead = true;
  glCanvas.remove();
  host.style.display = '';
  window.dispatchEvent(new CustomEvent('veil:gl-lost'));
});

/* первый кадр синхронно, затем передаём секции WebGL-вуаль
   и глушим 2D-фолбэк */
resize();
host.insertAdjacentElement('afterend', glCanvas);
host.style.display = 'none';
window.dispatchEvent(new CustomEvent('veil:gl'));

if ('ResizeObserver' in window) {
  new ResizeObserver(() => { if (!glDead) resize(); }).observe(section);
} else {
  window.addEventListener('resize', () => { if (!glDead) resize(); });
}

if (!reduceMotion) {
  (function loop() {
    if (glDead) return;
    requestAnimationFrame(loop);
    if (!inView || document.hidden) return;
    /* модуль по большому периоду: fp32-точность uniform'а деградирует
       на многочасовых сессиях, а редкий мягкий скачок волны незаметен */
    uniforms.uTime.value = (performance.now() / 1000) % 16384;
    renderer.render(scene, camera);
  })();
}
