/* МЯТА FUTURE LAB · Проект4 — интерфейс, календарь, форма */
(function () {
  'use strict';

  /* ============ КОНФИГ ============ */
  // URL веб-приложения Google Apps Script (приём заявок в таблицу «заявки на слёт»)
  var WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbziJ2OoSW38tfbQUch7LIvykWVa9KfQ1qu3xwgIvYMBoj6cZ19PAPLoNVZghdCmUAuRdQ/exec';
  var FORM_SECRET = 'MYATA-FUTURE-LAB-2026';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* надёжная подписка на скролл: window + document (если body станет
     скролл-контейнером, window-событие не стреляет) */
  function onScrollEvt(fn) {
    var scheduled = false;
    function run() { scheduled = false; fn(); }
    function onScroll() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  }

  /* ============ ШАПКА ============ */
  var topbar = document.getElementById('topbar');
  function onScrollTopbar() {
    if (window.scrollY > 24) topbar.classList.add('scrolled');
    else topbar.classList.remove('scrolled');
  }
  onScrollEvt(onScrollTopbar);
  onScrollTopbar();

  /* ============ REVEAL ПРИ СКРОЛЛЕ ============ */
  var revealEls = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ============ КАЛЕНДАРЬ: АВГУСТ 2026 ============ */
  // сетка с понедельника: 27.07 … 06.09, событие 27.08 (ЧТ)
  var calGrid = document.getElementById('calGrid');
  if (calGrid) {
    var cells = [];
    var d;
    for (d = 27; d <= 31; d++) cells.push({ n: d, dim: true });   // июль
    for (d = 1; d <= 31; d++) cells.push({ n: d, dim: false });   // август
    for (d = 1; d <= 6; d++) cells.push({ n: d, dim: true });     // сентябрь
    var html = '';
    cells.forEach(function (c) {
      var event = !c.dim && c.n === 27;
      var cls = 'cal-cell' + (c.dim ? ' dim' : '') + (event ? ' event' : '');
      html += '<span class="' + cls + '"' + (event ? ' data-day="27"' : '') + '>' + c.n + '</span>';
    });
    calGrid.innerHTML = html;
  }

  /* ============ ВУАЛЬ ИЗ ТОЧЕК В «КОГДА» ============ */
  // процедурная волна на всю плоскость секции: слои точечных линий,
  // плывущих по трём наложенным синусоидам
  var waveCanvas = document.getElementById('waveCanvas');
  if (waveCanvas && waveCanvas.getContext) {
    var wctx = waveCanvas.getContext('2d');
    var wSec = waveCanvas.parentElement;
    var wW = 0, wH = 0;
    var wDpr = Math.min(window.devicePixelRatio || 1, 2);
    var wInView = true;

    function sizeWave() {
      var w = wSec.clientWidth, h = wSec.clientHeight;
      if (!w || !h) return;
      wW = w; wH = h;
      waveCanvas.width = Math.round(w * wDpr);
      waveCanvas.height = Math.round(h * wDpr);
      wctx.setTransform(wDpr, 0, 0, wDpr, 0, 0);
    }

    function drawWave(t) {
      wctx.clearRect(0, 0, wW, wH);
      var lines = 26;
      var stepX = wW > 900 ? 16 : 20;
      for (var l = 0; l < lines; l++) {
        var f = l / (lines - 1);
        var base = wH * (0.06 + 0.88 * f);
        // чередуем серебро и перванш, как в макете
        var silver = l % 2 === 0;
        for (var x = 0; x <= wW; x += stepX) {
          var y = base
            + Math.sin(x * 0.0036 + l * 0.34 + t * 0.5) * 42
            + Math.sin(x * 0.0015 - l * 0.16 + t * 0.22) * (wH * 0.075)
            + Math.cos(x * 0.007 + l * 0.06 - t * 0.34) * 13;
          var a = 0.13 + 0.13 * Math.sin(x * 0.0021 + l * 0.72 + t * 0.4);
          if (a <= 0.02) continue;
          wctx.fillStyle = (silver ? 'rgba(148,158,178,' : 'rgba(122,132,196,') + a.toFixed(3) + ')';
          wctx.beginPath();
          wctx.arc(x, y, 1.4, 0, 6.2832);
          wctx.fill();
        }
      }
    }

    var wLastT = 0;
    // если поднялась WebGL-вуаль (js/veil.js) — 2D-фолбэк глушим и
    // освобождаем большой бэкбуфер; при потере GL-контекста воскресаем
    var veil2dActive = true;
    window.addEventListener('veil:gl', function () {
      veil2dActive = false;
      waveCanvas.width = 0;
      waveCanvas.height = 0;
    });
    window.addEventListener('veil:gl-lost', function () {
      if (veil2dActive) return;
      veil2dActive = true;
      waveCanvas.style.display = '';
      sizeWave();
      drawWave(wLastT);
      if (!reduceMotion) startWaveLoop();
    });
    // смена width/height очищает канвас — после каждого ресайза рисуем
    // кадр сразу, не дожидаясь rAF
    function onWaveResize() { if (!veil2dActive) return; sizeWave(); drawWave(wLastT); }
    if ('ResizeObserver' in window) {
      new ResizeObserver(onWaveResize).observe(wSec);
    } else {
      window.addEventListener('resize', onWaveResize);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        wInView = entries[0].isIntersecting;
      }, { rootMargin: '120px' }).observe(wSec);
    }

    var waveLoopRunning = false;
    function startWaveLoop() {
      if (waveLoopRunning) return;
      waveLoopRunning = true;
      (function waveLoop() {
        // при передаче секции WebGL-вуали цикл полностью останавливается
        if (!veil2dActive) { waveLoopRunning = false; return; }
        requestAnimationFrame(waveLoop);
        if (!wInView || document.hidden || !wW) return;
        wLastT = performance.now() / 1000;
        drawWave(wLastT);
      })();
    }

    sizeWave();
    drawWave(0); // первый кадр синхронно — вуаль видна и до старта rAF-цикла
    if (!reduceMotion) startWaveLoop();
  }

  /* ============ ПАУЗА ЛЕНТ (клавиатура/тап) ============ */
  ['.ticker', '.mem-marquee'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    function toggle() { el.classList.toggle('is-paused'); }
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
  });

  /* ============ МОДАЛЬНАЯ ФОРМА ============ */
  var modal = document.getElementById('modal');
  var form = document.getElementById('regForm');
  var success = document.getElementById('modalSuccess');
  var submitBtn = document.getElementById('submitBtn');
  var sbLabel = submitBtn ? submitBtn.querySelector('.sb-label') : null;
  var formStatus = document.getElementById('formStatus');
  var lastFocused = null;
  var isSubmitting = false;

  function openModal() {
    lastFocused = document.activeElement;
    modal.hidden = false;
    /* класс и на html: overflow с body не пробрасывается на viewport
       из-за overflow-x: clip на html */
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    form.hidden = false;
    success.hidden = true;
    setStatus('');
    ['name', 'location', 'phone'].forEach(function (n) { setInvalid(n, false); });
    var first = document.getElementById('fName');
    setTimeout(function () { if (first) first.focus(); }, 80);
  }
  function closeModal() {
    if (isSubmitting) return;
    modal.hidden = true;
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.js-open-form'), function (b) {
    b.addEventListener('click', openModal);
  });
  Array.prototype.forEach.call(modal.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // простая ловушка фокуса
  modal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var focusables = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    var list = Array.prototype.filter.call(focusables, function (el) {
      /* disabled-кнопка и honeypot (tabindex=-1) не участвуют в Tab-обходе —
         не должны попадать и в края ловушки */
      return el.offsetParent !== null && !el.disabled && el.getAttribute('tabindex') !== '-1';
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function setStatus(msg, isError) {
    if (!formStatus) return;
    formStatus.textContent = msg || '';
    formStatus.classList.toggle('error', !!isError);
  }

  function setInvalid(name, on) {
    var input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    if (on) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    var field = input.closest('.field');
    if (field) field.classList.toggle('invalid', on);
  }

  ['name', 'location', 'phone'].forEach(function (n) {
    var input = form.querySelector('[name="' + n + '"]');
    if (input) input.addEventListener('input', function () { setInvalid(n, false); });
  });

  function validate() {
    var ok = true;
    var name = form.name.value.trim();
    var location = form.location.value.trim();
    var phone = form.phone.value.trim();
    var digits = phone.replace(/\D/g, '');
    if (name.length < 2) { setInvalid('name', true); ok = false; }
    if (location.length < 3) { setInvalid('location', true); ok = false; }
    if (digits.length < 10 || digits.length > 15 || !/^[+\d\s\-()]+$/.test(phone)) { setInvalid('phone', true); ok = false; }
    return ok;
  }

  function showSuccess() {
    form.reset();
    form.hidden = true;
    success.hidden = false;
    var closeBtn = success.querySelector('[data-close]');
    if (closeBtn) closeBtn.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    // ловушка для ботов
    if (form.hp_extra && form.hp_extra.value) { showSuccess(); return; }
    if (!validate()) { setStatus('Проверьте выделенные поля', true); return; }

    var payload = {
      secret: FORM_SECRET,
      name: form.name.value.trim(),
      location: form.location.value.trim(),
      phone: form.phone.value.trim(),
      guests: (form.querySelector('[name="guests"]:checked') || {}).value || 'Буду один',
      page: location.href,
      ts: new Date().toISOString()
    };

    if (WEBHOOK_URL.indexOf('http') !== 0) {
      setStatus('Форма ещё не подключена к приёму заявок', true);
      return;
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    if (sbLabel) sbLabel.textContent = 'ОТПРАВЛЯЕМ…';
    setStatus('Отправляем данные…');

    var body = JSON.stringify(payload);

    /* таймаут: на зависшей мобильной сети запрос не должен держать
       пользователя в заблокированной модалке десятки секунд */
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 12000);

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      // ответ получен: дальнейшие ошибки окончательные, без no-cors повтора
      if (!res.ok) {
        var httpErr = new Error('HTTP ' + res.status);
        httpErr.confirmed = true;
        throw httpErr;
      }
      // наш doPost всегда отвечает JSON — HTML-тело при 200 значит,
      // что запрос попал не в скрипт (страница ошибки Google)
      return res.json().catch(function () {
        var parseErr = new Error('non-JSON response');
        parseErr.confirmed = true;
        throw parseErr;
      });
    }).then(function (data) {
      if (data && data.ok === false) {
        setStatus('Не удалось отправить заявку. Попробуйте ещё раз', true);
        return;
      }
      showSuccess();
    }).catch(function (err) {
      clearTimeout(timer);
      if (err && err.confirmed) {
        setStatus('Не удалось отправить заявку. Попробуйте ещё раз', true);
        return;
      }
      /* сетевой/CORS-сбой без HTTP-ответа: непрозрачный повтор.
         ОСОЗНАННЫЙ РИСК: opaque-ответ не различает успех и ошибку сервера —
         при мёртвом деплое вебхука посетитель увидит ложный успех.
         Компенсация — периодическая сверка заявок в таблице. */
      var ctrl2 = new AbortController();
      var timer2 = setTimeout(function () { ctrl2.abort(); }, 9000);
      return fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: body, signal: ctrl2.signal })
        .then(function () { clearTimeout(timer2); showSuccess(); })
        .catch(function () {
          clearTimeout(timer2);
          setStatus('Не удалось отправить. Проверьте связь и попробуйте ещё раз', true);
        });
    }).finally(function () {
      isSubmitting = false;
      submitBtn.disabled = false;
      if (sbLabel) sbLabel.textContent = 'ОТПРАВИТЬ ЗАЯВКУ';
    });
  });
})();
