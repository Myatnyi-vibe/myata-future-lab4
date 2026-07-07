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
      html += '<span class="' + cls + '"' +
        (event ? ' data-day="27" aria-label="27 августа — день слёта"' : '') +
        '>' + c.n + '</span>';
    });
    calGrid.innerHTML = html;
  }

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
    document.body.classList.add('modal-open');
    form.hidden = false;
    success.hidden = true;
    setStatus('');
    var first = document.getElementById('fName');
    setTimeout(function () { if (first) first.focus(); }, 80);
  }
  function closeModal() {
    if (isSubmitting) return;
    modal.hidden = true;
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
      return el.offsetParent !== null;
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

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    }).then(function (res) {
      // ответ получен: дальнейшие ошибки окончательные, без no-cors повтора
      if (!res.ok) {
        var httpErr = new Error('HTTP ' + res.status);
        httpErr.confirmed = true;
        throw httpErr;
      }
      return res.json().catch(function () { return { ok: true }; });
    }).then(function (data) {
      if (data && data.ok === false) {
        setStatus('Не удалось отправить заявку. Попробуйте ещё раз', true);
        return;
      }
      showSuccess();
    }).catch(function (err) {
      if (err && err.confirmed) {
        setStatus('Не удалось отправить заявку. Попробуйте ещё раз', true);
        return;
      }
      // сетевой/CORS-сбой без HTTP-ответа: непрозрачный повтор
      return fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: body })
        .then(function () { showSuccess(); })
        .catch(function () {
          setStatus('Не удалось отправить. Проверьте связь и попробуйте ещё раз', true);
        });
    }).finally(function () {
      isSubmitting = false;
      submitBtn.disabled = false;
      if (sbLabel) sbLabel.textContent = 'ОТПРАВИТЬ ЗАЯВКУ';
    });
  });
})();
