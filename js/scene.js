/* МЯТА FUTURE LAB · Проект4 — живой 3D-гироскоп в герое (three.js)
   Хромовая «атом»-сфера: два ирисцентных кольца вокруг зеркального ядра,
   как на рендере из макета. При сбое WebGL/CDN остаётся статичная
   картинка assets/gyro.webp (body.no-webgl). */
import * as THREE from 'three';

const wrap = document.querySelector('.gyro-wrap');
const canvas = document.getElementById('gyroGl');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no-webgl');
  throw e;
}

const isMobile = /Mobi|Android/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 560;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
camera.position.set(0, 0, 8.8);

/* окружение: розово-голубая «студия» — даёт хрому фирменные
   переливы розовый/голубой/фиолетовый, как на рендере;
   фон тёмный, цветные полосы яркие — иначе хром выходит белёсым */
function makeEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x343a4e); // тёмный фон — контрастные тени в хроме
  const strip = (hex, intensity, w, h, pos) => {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    mat.color = new THREE.Color(hex).multiplyScalar(intensity);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  strip(0xffffff, 1.5, 5, 1.6, new THREE.Vector3(0, 6, 1));      // ключевой верхний
  strip(0xff9ad5, 9.0, 3.6, 9, new THREE.Vector3(-6.5, 0.5, 1)); // розовый слева
  strip(0x74c1f0, 9.0, 3.6, 9, new THREE.Vector3(6.5, -0.5, 1)); // голубой справа
  strip(0x8b7cd8, 8.0, 6, 2.6, new THREE.Vector3(1.5, -5, 2));   // фиолетовый снизу
  strip(0xffb3de, 6.0, 3, 2, new THREE.Vector3(-2.5, 4.5, -3));  // розовый рефлекс сверху
  // за камерой: розово-голубые половины — лицевые грани переливаются, не белеют
  strip(0xff9ad5, 3.8, 8, 10, new THREE.Vector3(-4, 0, 9));
  strip(0x74c1f0, 3.8, 8, 10, new THREE.Vector3(4, 0, 9));
  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(makeEnv(), 0.04).texture;

scene.add(new THREE.AmbientLight(0xf2eef8, 0.55));
const lPink = new THREE.PointLight(0xff9ad5, 18, 30, 2);
const lBlue = new THREE.PointLight(0x74c1f0, 16, 30, 2);
lPink.position.set(-3.5, 2, 3);
lBlue.position.set(3.5, -1.5, 2.5);
scene.add(lPink, lBlue);

/* хром с лёгкой ирисценцией */
const chrome = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 1,
  roughness: 0.12,
  envMapIntensity: 1.35,
  iridescence: 0.85,
  iridescenceIOR: 1.9,
  iridescenceThicknessRange: [120, 700],
  clearcoat: 0.5,
  clearcoatRoughness: 0.1
});
window.__gyroMat = chrome;

const group = new THREE.Group();
scene.add(group);
window.__gyro = group;

const seg = isMobile ? 96 : 160;
const tube = isMobile ? 18 : 28;
const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.34, tube, seg), chrome);
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.34, tube, seg), chrome);
const core = new THREE.Mesh(new THREE.SphereGeometry(1.02, isMobile ? 40 : 64, isMobile ? 28 : 48), chrome);
group.add(ring1, ring2, core);

/* стартовые наклоны — как на рендере из ПДФ */
ring1.rotation.set(-0.52, 0.42, 0.3);
ring2.rotation.set(1.02, -0.5, -0.35);

let pointerX = 0, pointerY = 0, px = 0, py = 0;
if (!isMobile) {
  window.addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
}

/* размер канваса = размеру обёртки */
function resize() {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

/* рендерим только когда герой на экране и вкладка видима */
let inView = true, running = true;
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
  }, { rootMargin: '80px' }).observe(wrap);
}
document.addEventListener('visibilitychange', () => { running = !document.hidden; });

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  if (!running || !inView) return;
  resize();

  const t = reduceMotion ? 0 : clock.getElapsedTime();

  px += (pointerX - px) * 0.05;
  py += (pointerY - py) * 0.05;

  /* кольца прецессируют в противоход, ядро медленно вращается */
  ring1.rotation.x = -0.52 + Math.sin(t * 0.42) * 0.3;
  ring1.rotation.y = 0.42 + t * 0.5;
  ring2.rotation.x = 1.02 + Math.cos(t * 0.36) * 0.28;
  ring2.rotation.y = -0.5 - t * 0.41;
  core.rotation.y = t * 0.24;
  core.rotation.x = Math.sin(t * 0.3) * 0.2;

  group.position.y = reduceMotion ? 0 : Math.sin(t * 0.7) * 0.14;
  group.rotation.y = px * 0.3;
  group.rotation.x = py * 0.22;

  /* дрейф света */
  lPink.position.x = -3.5 + Math.sin(t * 0.3) * 1.4;
  lBlue.position.y = -1.5 + Math.cos(t * 0.26) * 1.2;

  renderer.render(scene, camera);
}

/* первый кадр — синхронно: фолбэк-картинку прячем только после того,
   как на канвасе гарантированно что-то есть */
resize();
renderer.render(scene, camera);
wrap.classList.add('gl-ok');
frame();
