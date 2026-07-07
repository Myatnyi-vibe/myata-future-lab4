/* МЯТА FUTURE LAB · Проект4 — живой 3D-гироскоп в герое (three.js)
   Хромовый «атом» как на рендере макета: два приплюснутых ирисцентных
   кольца прецессируют вокруг зеркального ядра. Свет — процедурная
   equirect-карта «студии»: мягкие розово-голубо-фиолетовые градиенты
   и длинные полосы света вместо жёстких плоскостей.
   При сбое WebGL/CDN остаётся статичная картинка (body.no-webgl). */
import * as THREE from 'three';

const wrap = document.querySelector('.gyro-wrap');
const canvas = document.getElementById('gyroGl');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  /* контекст создаём сами: failIfMajorPerformanceCaveat отсекает
     софтверный WebGL (SwiftShader) — там честнее статичный фолбэк */
  const ctxOpts = { alpha: true, antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: true };
  const gl = canvas.getContext('webgl2', ctxOpts) || canvas.getContext('webgl', ctxOpts);
  if (!gl) throw new Error('no hardware WebGL');
  renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
} catch (e) {
  document.body.classList.add('no-webgl');
  throw e;
}

/* мобильные и компактные планшеты (iPadOS маскируется под Mac —
   ловим по мультитачу) получают упрощённую геометрию */
const isMobile = /Mobi|Android/i.test(navigator.userAgent)
  || Math.min(window.innerWidth, window.innerHeight) < 560
  || (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 900);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
camera.position.set(0, 0, 8.8);

/* ---------- окружение: рисованная equirect-студия ----------
   плавные градиенты дают хрому мягкие «дорогие» переливы,
   яркие пятна — длинные блики на кольцах */
function makeEnvTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // вертикальный градиент неба студии: кремовый верх → перванш → глубокий фиолет
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.0, '#fdf4f6');
  sky.addColorStop(0.22, '#eadfec');
  sky.addColorStop(0.45, '#a7abcd');
  sky.addColorStop(0.72, '#655f8e');
  sky.addColorStop(1.0, '#2e2a46');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const blob = (x, y, r, color, alpha) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color.replace('A)', alpha + ')'));
    rg.addColorStop(1, color.replace('A)', '0)'));
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  };
  // ключевой белый свет сверху
  blob(W * 0.5, H * 0.13, W * 0.3, 'rgba(255,255,255,A)', 0.95);
  // розовое крыло слева (и дубль у шва панорамы для бесшовности)
  blob(W * 0.16, H * 0.46, W * 0.3, 'rgba(255,138,206,A)', 0.85);
  blob(W * 1.0, H * 0.5, W * 0.22, 'rgba(255,138,206,A)', 0.5);
  blob(0, H * 0.5, W * 0.22, 'rgba(255,138,206,A)', 0.5);
  // голубое крыло справа
  blob(W * 0.78, H * 0.48, W * 0.3, 'rgba(96,178,244,A)', 0.85);
  // фиолетовое дно
  blob(W * 0.45, H * 0.95, W * 0.5, 'rgba(122,102,214,A)', 0.8);
  // тёплый персиковый рефлекс
  blob(W * 0.35, H * 0.72, W * 0.2, 'rgba(255,196,181,A)', 0.5);

  // пакет тонких горизонтальных полос света: именно они дают
  // параллельные световые линии вдоль трубок колец, как на рендере
  const streak = (y, h, color, alpha) => {
    const sg = g.createLinearGradient(0, y - h, 0, y + h);
    sg.addColorStop(0, color.replace('A)', '0)'));
    sg.addColorStop(0.5, color.replace('A)', alpha + ')'));
    sg.addColorStop(1, color.replace('A)', '0)'));
    g.fillStyle = sg;
    g.fillRect(0, y - h, W, h * 2);
  };
  streak(H * 0.24, 10, 'rgba(255,255,255,A)', 0.95);
  streak(H * 0.33, 6, 'rgba(255,224,238,A)', 0.8);
  streak(H * 0.42, 8, 'rgba(255,170,222,A)', 0.75);
  streak(H * 0.5, 5, 'rgba(150,206,248,A)', 0.7);
  streak(H * 0.58, 9, 'rgba(255,255,255,A)', 0.55);
  streak(H * 0.67, 6, 'rgba(196,168,255,A)', 0.65);
  streak(H * 0.78, 8, 'rgba(150,120,230,A)', 0.6);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function bakeEnv() {
  /* PMREM и исходная текстура после свёртки не нужны — освобождаем */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  const env = pmrem.fromEquirectangular(envTex).texture;
  envTex.dispose();
  pmrem.dispose();
  return env;
}
scene.environment = bakeEnv();

scene.add(new THREE.AmbientLight(0xf2eef8, 0.35));
const lPink = new THREE.PointLight(0xff9ad5, 10, 30, 2);
const lBlue = new THREE.PointLight(0x74c1f0, 9, 30, 2);
lPink.position.set(-3.5, 2, 3);
lBlue.position.set(3.5, -1.5, 2.5);
scene.add(lPink, lBlue);

/* полированный хром с ирисценцией */
function makeChrome(rough) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: rough,
    envMapIntensity: 1.25,
    iridescence: 0.55,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [140, 620],
    clearcoat: 1,
    clearcoatRoughness: 0.08
  });
}
const matRing = makeChrome(0.055);
const matCore = makeChrome(0.02);
window.__gyroMat = matRing;

const group = new THREE.Group();
scene.add(group);
window.__gyro = group;

/* геометрия по рендеру: не идеальные торы, а замкнутые ВОЛОКНА —
   петли с органической волной по радиусу и высоте (TubeGeometry по
   замкнутой кривой) вокруг зеркального шара.

   ГАРАНТИЯ НЕПЕРЕСЕЧЕНИЯ при полностью независимом вращении: обе петли
   концентричны, поэтому достаточно разнести их сферические оболочки.
   Внешняя: расстояние от центра ≥ minR1 − tube1 = 2.02 − 0.26 = 1.76.
   Внутренняя: ≤ √(maxR2² + maxZ2²) + tube2 = √(1.47²+0.20²) + 0.22 ≈ 1.70.
   Шар: r 0.92 < minR2 − tube2 = 1.21 − 0.22 = 0.99. Зазоры держатся
   при любых углах — «залезть» друг в друга элементы не могут. */
function makeLoopGeometry(R0, a2, a3, z2, z3, phase, tubeR, tubularSegs, radialSegs) {
  class LoopCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const th = t * Math.PI * 2;
      const R = R0 + a2 * Math.sin(2 * th + phase) + a3 * Math.sin(3 * th + phase * 1.7);
      const z = z2 * Math.sin(2 * th + phase * 0.6) + z3 * Math.sin(3 * th + phase * 2.3);
      return target.set(R * Math.cos(th), R * Math.sin(th), z);
    }
  }
  return new THREE.TubeGeometry(new LoopCurve(), tubularSegs, tubeR, radialSegs, true);
}
const ring1 = new THREE.Mesh(
  makeLoopGeometry(2.2, 0.12, 0.06, 0.22, 0.08, 1.3, 0.26, isMobile ? 180 : 300, isMobile ? 26 : 40),
  matRing
);
const ring2 = new THREE.Mesh(
  makeLoopGeometry(1.34, 0.08, 0.05, 0.14, 0.06, 4.1, 0.22, isMobile ? 150 : 260, isMobile ? 22 : 36),
  matRing
);
const core = new THREE.Mesh(new THREE.SphereGeometry(0.92, isMobile ? 64 : 96, isMobile ? 40 : 64), matCore);
group.add(ring1, ring2, core);

/* стартовые наклоны — «X»-поза с рендера ПДФ */
ring1.rotation.set(-0.62, 0.35, 0.3);
ring2.rotation.set(1.1, -0.4, -0.35);

let pointerX = 0, pointerY = 0, px = 0, py = 0;
if (!isMobile) {
  window.addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* сравниваем CSS-размеры, а не пиксели бэкбуфера: three в setSize
   использует floor, и сравнение с round зацикливало setSize каждый кадр */
let lastW = 0, lastH = 0;
function resize() {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  if (w !== lastW || h !== lastH) {
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

let inView = true, running = true;
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
  }, { rootMargin: '80px' }).observe(wrap);
}
document.addEventListener('visibilitychange', () => { running = !document.hidden; });

const clock = new THREE.Clock();

function pose(t) {
  /* каждый элемент живёт своей жизнью: непрерывное вращение вокруг
     медленно гуляющей оси (вложенные радиусы исключают касания) */
  ring1.rotation.x = -0.62 + Math.sin(t * 0.29) * 0.45;
  ring1.rotation.y = 0.35 + t * 0.42;
  ring1.rotation.z = 0.3 + Math.sin(t * 0.17) * 0.3;
  ring2.rotation.x = 1.1 + Math.cos(t * 0.24) * 0.5;
  ring2.rotation.y = -0.4 - t * 0.33;
  ring2.rotation.z = -0.35 + Math.cos(t * 0.21) * 0.35;
  core.rotation.y = t * 0.3;
  core.rotation.x = Math.sin(t * 0.2) * 0.25;
  group.position.y = reduceMotion ? 0 : Math.sin(t * 0.6) * 0.12;
  group.rotation.z = Math.sin(t * 0.16) * 0.05;
  group.rotation.y = px * 0.3;
  group.rotation.x = py * 0.22;
}

function renderOnce() {
  resize();
  pose(0);
  renderer.render(scene, camera);
}

function frame() {
  requestAnimationFrame(frame);
  if (!running || !inView) return;
  resize();
  const t = clock.getElapsedTime();
  px += (pointerX - px) * 0.05;
  py += (pointerY - py) * 0.05;
  pose(t);
  lPink.position.x = -3.5 + Math.sin(t * 0.3) * 1.4;
  lBlue.position.y = -1.5 + Math.cos(t * 0.26) * 1.2;
  renderer.render(scene, camera);
}

/* потеря контекста: возвращаем статичный фолбэк; при восстановлении —
   перепекаем окружение (render targets теряются) и оживаем обратно */
canvas.addEventListener('webglcontextlost', () => {
  wrap.classList.remove('gl-ok');
});
canvas.addEventListener('webglcontextrestored', () => {
  scene.environment = bakeEnv();
  renderOnce();
  wrap.classList.add('gl-ok');
});

/* первый кадр — синхронно: фолбэк-картинку прячем только после того,
   как на канвасе гарантированно что-то есть */
renderOnce();
wrap.classList.add('gl-ok');

if (reduceMotion) {
  /* без анимации: статичный кадр, перерисовка только при ресайзе */
  window.addEventListener('resize', renderOnce);
} else {
  frame();
}
