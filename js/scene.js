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

  // длинные горизонтальные полосы света — фирменные блики хрома
  const streak = (y, h, color, alpha) => {
    const sg = g.createLinearGradient(0, y - h, 0, y + h);
    sg.addColorStop(0, color.replace('A)', '0)'));
    sg.addColorStop(0.5, color.replace('A)', alpha + ')'));
    sg.addColorStop(1, color.replace('A)', '0)'));
    g.fillStyle = sg;
    g.fillRect(0, y - h, W, h * 2);
  };
  streak(H * 0.3, 14, 'rgba(255,255,255,A)', 0.85);
  streak(H * 0.55, 10, 'rgba(255,182,226,A)', 0.6);
  streak(H * 0.66, 8, 'rgba(140,196,246,A)', 0.55);

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

/* кольца — приплюснутые «ленты», как на рендере: тор, сплющенный по оси */
const seg = isMobile ? 140 : 240;
const tube = isMobile ? 36 : 56;
const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.04, 0.42, tube, seg), matRing);
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.38, tube, seg), matRing);
ring1.scale.set(1, 1, 0.52);
ring2.scale.set(1, 1, 0.52);
const core = new THREE.Mesh(new THREE.SphereGeometry(1.0, isMobile ? 64 : 96, isMobile ? 40 : 64), matCore);
group.add(ring1, ring2, core);

/* стартовые наклоны — поза с рендера ПДФ */
ring1.rotation.set(-0.52, 0.42, 0.3);
ring2.rotation.set(1.02, -0.5, -0.35);

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
  /* медленная элегантная прецессия: кольца в противоход,
     ядро дышит бликами */
  ring1.rotation.x = -0.52 + Math.sin(t * 0.31) * 0.34;
  ring1.rotation.y = 0.42 + t * 0.44;
  ring1.rotation.z = 0.3 + Math.sin(t * 0.21) * 0.18;
  ring2.rotation.x = 1.02 + Math.cos(t * 0.27) * 0.3;
  ring2.rotation.y = -0.5 - t * 0.37;
  ring2.rotation.z = -0.35 + Math.cos(t * 0.19) * 0.16;
  core.rotation.y = t * 0.2;
  core.rotation.z = Math.sin(t * 0.24) * 0.14;
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
