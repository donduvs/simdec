/* SIMDEC v3 — тренажер. Логіку змінювати не потрібно: увесь зміст у data/simdec-data.js */
(function () {
  "use strict";

  var DRAFT_KEY = "simdec-draft";
  var NAME_KEY = "simdec-name";
  var params = new URLSearchParams(location.search);
  var PREVIEW = params.get("preview") === "1";
  var DEMO = !!window.SIMDEC_DEMO; // демонстраційна копія: без надсилання результатів

  var DATA = window.SIMDEC_DATA;
  if (PREVIEW) {
    try {
      var draft = localStorage.getItem(DRAFT_KEY);
      if (draft) DATA = JSON.parse(draft);
    } catch (e) { /* лишаємо опубліковані дані */ }
  }

  var app = document.getElementById("app");
  if (!DATA || !DATA.models) {
    app.innerHTML = '<div class="wrap"><div class="card"><h2>Не вдалося завантажити дані</h2><p>Перевірте файл data/simdec-data.js.</p></div></div>';
    return;
  }
  var S = DATA.settings || {};

  /* ---------- допоміжне ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function paras(text) {
    return String(text || "").split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function getModel(id) {
    return DATA.models.filter(function (m) { return m.id === id; })[0];
  }
  function stageOf(model, id) {
    var idx = -1;
    model.stages.forEach(function (s, i) { if (s.id === id) idx = i; });
    return { index: idx, stage: model.stages[idx] || { id: id, code: String(id || "").toUpperCase(), name: "" } };
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- стан ---------- */
  var state = { name: storeGet(NAME_KEY) || "", run: null };

  document.querySelectorAll("[data-bind]").forEach(function (el) {
    el.textContent = S[el.getAttribute("data-bind")] || "";
  });
  if (PREVIEW || DEMO) {
    var pb = document.getElementById("previewBanner"); pb.hidden = false;
    if (DEMO) pb.textContent = "Демонстраційна копія SIMDEC 3. Результати не надсилаються.";
  }

  function updateChip() {
    var chip = document.getElementById("userChip");
    if (state.name) {
      chip.hidden = false;
      chip.innerHTML = '<span class="chip-dot"></span>' + esc(state.name) +
        ' <button type="button" class="chip-change" data-act="rename">змінити</button>';
    } else chip.hidden = true;
  }

  /* ---------- маршрутизація ---------- */
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return h;
  }
  window.addEventListener("hashchange", render);

  function render() {
    var r = route();
    updateChip();
    window.scrollTo(0, 0);
    if (!state.name && r.length) return go("#/");
    if (!r.length) return renderWelcome();
    if (r[0] === "models") return renderModels();
    if (r[0] === "m" && r[1]) {
      var model = getModel(decodeURIComponent(r[1]));
      if (!model) return go("#/models");
      if (r[2] == null) return renderModel(model);
      var idx = parseInt(r[2], 10) - 1;
      var kase = model.cases[idx];
      if (!kase) return go("#/m/" + model.id);
      return renderCase(model, kase, idx);
    }
    go("#/");
  }

  /* ---------- 1. вітання ---------- */
  function renderWelcome() {
    app.innerHTML =
      '<section class="hero">' +
        '<div class="hero-inner">' +
          '<div class="hero-copy">' +
            '<p class="eyebrow">' + esc(S.department || "") + '</p>' +
            '<h1>' + esc(S.title || "SIMDEC") + '</h1>' +
            (S.welcome || []).map(function (p) { return '<p class="lead">' + esc(p) + '</p>'; }).join("") +
            '<form class="name-form" id="nameForm" novalidate>' +
              '<label for="nameInput">Ваше ім’я або позивний</label>' +
              '<div class="name-row">' +
                '<input id="nameInput" autocomplete="nickname" maxlength="60" placeholder="Напр., Петренко О. або «Сокіл»" value="' + esc(state.name) + '">' +
                '<button class="btn btn-gold" type="submit">Розпочати тренування</button>' +
              '</div>' +
              '<p class="form-error" id="nameError" hidden>Введіть ім’я або позивний, щоб викладач міг побачити ваш результат.</p>' +
              '<p class="privacy">' + esc(S.privacyNote || "") + '</p>' +
            '</form>' +
          '</div>' +
          '<div class="hero-art" aria-hidden="true">' + heroArt() + '</div>' +
        '</div>' +
      '</section>' +
      '<section class="wrap how">' +
        '<div class="how-item"><span>1</span><div><b>Оберіть модель</b>PDCA, OODA чи SDCA залежно від типу управлінської ситуації.</div></div>' +
        '<div class="how-item"><span>2</span><div><b>Пройдіть кейс</b>Чотири етапи циклу, на кожному обираєте одне рішення з кількох.</div></div>' +
        '<div class="how-item"><span>3</span><div><b>Отримайте результат</b>Зараховуються рішення, правильні з першої спроби. Результат бачить викладач.</div></div>' +
      '</section>';
    var form = document.getElementById("nameForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = document.getElementById("nameInput").value.trim();
      if (!v) { document.getElementById("nameError").hidden = false; return; }
      state.name = v; storeSet(NAME_KEY, v);
      go("#/models");
    });
    if (!state.name) document.getElementById("nameInput").focus();
  }

  function heroArt() {
    var html = '<div class="orbit">';
    DATA.models.forEach(function (m, i) {
      html += '<div class="orbit-ring orbit-' + i + '">' +
        SimdecCycle({ stages: m.stages, color: m.color, current: -1, done: m.stages.length, solid: true, size: 150, center: { top: m.name } }) + '</div>';
    });
    return html + "</div>";
  }

  /* ---------- 2. вибір моделі ---------- */
  function renderModels() {
    app.innerHTML =
      '<div class="wrap">' +
        '<div class="page-head">' +
          '<h2>Оберіть модель ухвалення рішень</h2>' +
          '<p class="muted">Кожна модель має свої кейси. Почати можна з будь-якої.</p>' +
        '</div>' +
        '<div class="model-grid">' +
        DATA.models.map(function (m) {
          var n = m.cases.length;
          return '<a class="model-card" href="#/m/' + encodeURIComponent(m.id) + '" style="--mc:' + esc(m.color) + '">' +
            '<div class="model-card-ring">' + SimdecCycle({ stages: m.stages, color: m.color, current: -1, done: m.stages.length, solid: true, size: 120, center: { top: m.name } }) + '</div>' +
            '<div class="model-card-body">' +
              '<h3>' + esc(m.title) + '</h3>' +
              '<p class="model-sub">' + esc(m.subtitle || "") + '</p>' +
              '<p>' + esc(m.short || "") + '</p>' +
              '<div class="model-stages">' + m.stages.map(function (s) { return '<span>' + esc(s.code) + '</span>'; }).join('<i>→</i>') + '</div>' +
            '</div>' +
            '<div class="model-card-foot"><span>' + n + " " + plural(n, "кейс", "кейси", "кейсів") + '</span><span class="arrow">Відкрити →</span></div>' +
          '</a>';
        }).join("") +
        '</div>' +
      '</div>';
  }

  /* ---------- 3. сторінка моделі ---------- */
  function renderModel(m) {
    var q = m.quote;
    var html =
      '<div class="wrap model-page" style="--mc:' + esc(m.color) + '">' +
        '<a class="back" href="#/models">← Усі моделі</a>' +
        '<div class="model-hero">' +
          '<div>' +
            '<p class="eyebrow dark">' + esc(m.subtitle || "") + '</p>' +
            '<h2>' + esc(m.title) + '</h2>' +
            (m.intro || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join("") +
          '</div>' +
          '<div class="model-hero-ring">' + SimdecCycle({ stages: m.stages, color: m.color, current: -1, done: m.stages.length, solid: true, size: 220, center: { top: m.name, bottom: "цикл" } }) + '</div>' +
        '</div>' +
        '<div class="layout-2">' +
          '<div class="theory">' +
            '<h3 class="section-title">Етапи циклу</h3>' +
            '<ol class="stage-list">' +
              m.stages.map(function (s, i) {
                return '<li><span class="stage-num">' + (i + 1) + '</span><div><b>' + esc(s.code) + ' · ' + esc(s.name) + '</b><p>' + esc(s.text) + '</p></div></li>';
              }).join("") +
            '</ol>' +
            (m.example && (m.example.text || (m.example.items || []).length) ?
              '<div class="example"><h4>' + esc(m.example.title || "Приклад") + '</h4><p>' + esc(m.example.text) + '</p>' +
              ((m.example.items || []).length ? '<ul>' + m.example.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>" : "") +
            (m.outro || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join("") +
            (q && q.text ?
              '<figure class="quote">' +
                (q.image ? '<img src="' + esc(q.image) + '" alt="' + esc(q.author || "") + '" loading="lazy">' : "") +
                '<div>' + (q.lead ? '<p class="quote-lead">' + esc(q.lead) + '</p>' : "") +
                '<blockquote>«' + esc(q.text) + '»</blockquote>' +
                (q.author ? '<figcaption>' + esc(q.author) + '</figcaption>' : "") + '</div>' +
              '</figure>' : "") +
          '</div>' +
          '<aside class="cases">' +
            '<h3 class="section-title">Кейси <span class="count">' + m.cases.length + '</span></h3>' +
            (m.cases.length ? m.cases.map(function (c, i) {
              return '<a class="case-item" href="#/m/' + encodeURIComponent(m.id) + '/' + (i + 1) + '">' +
                '<span class="case-num">' + String(i + 1).padStart(2, "0") + '</span>' +
                '<span class="case-text"><b>' + esc(c.title) + '</b>' +
                (c.summary ? '<small>' + esc(c.summary) + '</small>' : '<small>' + c.steps.length + ' ' + plural(c.steps.length, "етап", "етапи", "етапів") + '</small>') +
                '</span><span class="case-go">→</span></a>';
            }).join("") : '<p class="muted">Кейсів для цієї моделі ще немає.</p>') +
          '</aside>' +
        '</div>' +
      '</div>';
    app.innerHTML = html;
  }

  /* ---------- 4. проходження кейсу ---------- */
  function newRun(m, kase, idx) {
    return {
      key: m.id + "/" + idx, model: m, kase: kase, idx: idx, step: 0,
      firstTry: [], attempts: [], tried: {}, solved: false, finished: false, sent: false,
      order: kase.steps.map(function (st) {
        var ids = st.options.map(function (_, i) { return i; });
        return S.shuffleOptions ? shuffle(ids) : ids;
      })
    };
  }

  function renderCase(m, kase, idx) {
    if (!state.run || state.run.key !== m.id + "/" + idx) state.run = newRun(m, kase, idx);
    var run = state.run;
    if (run.finished) return renderResult(run);

    var st = kase.steps[run.step];
    var so = stageOf(m, st.stage);
    var total = kase.steps.length;

    app.innerHTML =
      '<div class="wrap play" style="--mc:' + esc(m.color) + '">' +
        '<div class="play-bar">' +
          '<a class="back" href="#/m/' + encodeURIComponent(m.id) + '">← До кейсів ' + esc(m.name) + '</a>' +
          '<div class="progress" aria-label="Етап ' + (run.step + 1) + ' з ' + total + '">' +
            kase.steps.map(function (_, i) {
              return '<span class="' + (i < run.step || (i === run.step && run.solved) ? "p-done" : i === run.step ? "p-now" : "") + '"></span>';
            }).join("") +
          '</div>' +
        '</div>' +
        '<div class="play-grid">' +
          '<article class="briefing">' +
            '<p class="label">Кейс ' + (idx + 1) + ' · ' + esc(m.name) + '</p>' +
            '<h2>' + esc(kase.title) + '</h2>' +
            '<details class="brief-body" ' + (run.step === 0 ? "open" : "") + '>' +
              '<summary>Ввідна</summary>' +
              '<div class="brief-text">' + paras(kase.scenario) + '</div>' +
            '</details>' +
          '</article>' +
          '<section class="stage-card">' +
            '<div class="stage-head">' +
              SimdecCycle({ stages: m.stages, color: m.color, current: so.index, done: Math.max(so.index, 0), size: 96, uid: "p" }) +
              '<div><p class="label">Етап ' + (run.step + 1) + ' / ' + total + '</p>' +
              '<h3>' + esc(so.stage.code) + (so.stage.name ? ' <span>· ' + esc(so.stage.name) + '</span>' : "") + '</h3></div>' +
            '</div>' +
            '<div class="question">' + paras(st.question) + '</div>' +
            '<div class="options" role="list">' +
              run.order[run.step].map(function (oi, k) {
                var o = st.options[oi];
                var tried = run.tried[oi];
                var cls = tried ? (o.correct ? "opt opt-ok" : "opt opt-bad") : "opt";
                var dis = run.solved || tried ? " disabled" : "";
                return '<button type="button" role="listitem" class="' + cls + '" data-opt="' + oi + '"' + dis + '>' +
                  '<span class="opt-key">' + "АБВГДЕЖЗ".charAt(k) + '</span><span>' + esc(o.text) + '</span></button>';
              }).join("") +
            '</div>' +
            '<div id="feedback"></div>' +
          '</section>' +
        '</div>' +
      '</div>';

    if (run.lastPick != null) showFeedback(run, st.options[run.lastPick]);

    app.querySelectorAll("[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () { choose(run, parseInt(b.getAttribute("data-opt"), 10)); });
    });
  }

  function choose(run, oi) {
    if (run.solved || run.tried[oi]) return;
    var st = run.kase.steps[run.step];
    var o = st.options[oi];
    run.tried[oi] = true;
    run.attempts[run.step] = (run.attempts[run.step] || 0) + 1;
    run.lastPick = oi;
    if (o.correct) {
      run.solved = true;
      run.firstTry[run.step] = run.attempts[run.step] === 1;
    }
    renderCase(run.model, run.kase, run.idx);
    var fb = document.getElementById("feedback");
    if (fb) fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showFeedback(run, o) {
    var fb = document.getElementById("feedback");
    var last = run.step === run.kase.steps.length - 1;
    fb.innerHTML =
      '<div class="feedback ' + (o.correct ? "fb-ok" : "fb-bad") + '">' +
        '<p class="fb-title">' + (o.correct
          ? (run.attempts[run.step] === 1 ? "Правильне рішення" : "Правильно, але не з першої спроби")
          : "Невдале рішення. Спробуйте інший варіант") + '</p>' +
        paras(o.feedback) +
        (o.correct ? '<button class="btn btn-primary" id="nextBtn" type="button">' + (last ? "Завершити кейс" : "Наступний етап →") + '</button>' : "") +
      '</div>';
    var nb = document.getElementById("nextBtn");
    if (nb) nb.addEventListener("click", function () {
      run.lastPick = null; run.tried = {}; run.solved = false;
      if (last) run.finished = true; else run.step++;
      renderCase(run.model, run.kase, run.idx);
    });
  }

  /* ---------- 5. результат ---------- */
  function renderResult(run) {
    var m = run.model, kase = run.kase;
    var total = kase.steps.length;
    var correct = run.firstTry.filter(Boolean).length;
    var pct = total ? Math.round(correct / total * 100) : 0;
    var verdict = pct >= 75 ? "Упевнене управлінське рішення" : pct >= 50 ? "Непогано, але є що відпрацювати" : "Варто пройти кейс ще раз";
    var circ = 2 * Math.PI * 52;

    app.innerHTML =
      '<div class="wrap play" style="--mc:' + esc(m.color) + '">' +
        '<a class="back" href="#/m/' + encodeURIComponent(m.id) + '">← До кейсів ' + esc(m.name) + '</a>' +
        '<div class="result card">' +
          '<div class="result-top">' +
            '<svg class="score" viewBox="0 0 120 120" width="150" height="150" aria-label="' + pct + '%">' +
              '<circle cx="60" cy="60" r="52" fill="none" stroke="#E3E8F0" stroke-width="12"/>' +
              '<circle cx="60" cy="60" r="52" fill="none" stroke="' + esc(m.color) + '" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="' + (circ * pct / 100).toFixed(1) + ' ' + circ.toFixed(1) + '"/>' +
              '<text x="60" y="62" text-anchor="middle" class="score-num">' + correct + '/' + total + '</text>' +
              '<text x="60" y="80" text-anchor="middle" class="score-pct">' + pct + '%</text>' +
            '</svg>' +
            '<div>' +
              '<p class="label">Кейс ' + (run.idx + 1) + ' · ' + esc(m.name) + ' завершено</p>' +
              '<h2>' + esc(verdict) + '</h2>' +
              '<p class="muted">' + esc(kase.title) + '</p>' +
            '</div>' +
          '</div>' +
          '<ol class="result-steps">' +
            kase.steps.map(function (st, i) {
              var so = stageOf(m, st.stage);
              var a = run.attempts[i] || 0;
              return '<li class="' + (run.firstTry[i] ? "rs-ok" : "rs-bad") + '"><span class="rs-mark">' + (run.firstTry[i] ? "✓" : "✕") + '</span>' +
                '<b>' + esc(so.stage.code) + '</b><span>' + (run.firstTry[i] ? "з першої спроби" : a + " " + plural(a, "спроба", "спроби", "спроб")) + '</span></li>';
            }).join("") +
          '</ol>' +
          '<div id="sendBox" class="send-box"></div>' +
          '<div class="result-actions">' +
            '<button class="btn btn-ghost" type="button" id="againBtn">Пройти ще раз</button>' +
            '<a class="btn btn-ghost" href="#/m/' + encodeURIComponent(m.id) + '">Інший кейс</a>' +
            '<a class="btn btn-ghost" href="#/models">Інша модель</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById("againBtn").addEventListener("click", function () {
      state.run = newRun(m, kase, run.idx);
      renderCase(m, kase, run.idx);
    });
    renderSend(run, correct, total, pct);
  }

  function renderSend(run, correct, total, pct) {
    var box = document.getElementById("sendBox");
    if (PREVIEW || DEMO || !S.resultsUrl) {
      box.innerHTML = '<p class="muted">' + (PREVIEW || DEMO ? "Режим перегляду: результат не надсилається." : "Надсилання результатів не налаштовано.") + '</p>';
      return;
    }
    if (run.sent) {
      box.innerHTML = '<p class="sent-ok">✓ Результат надіслано викладачеві від імені «' + esc(state.name) + '».</p>';
      return;
    }
    box.innerHTML = '<button class="btn btn-gold" type="button" id="sendBtn">Надіслати результат викладачеві</button>' +
      '<p class="muted small">Буде надіслано: ' + esc(state.name) + ', ' + correct + '/' + total + ' (' + pct + '%).</p>';
    var btn = document.getElementById("sendBtn");
    btn.addEventListener("click", function () {
      btn.disabled = true; btn.textContent = "Надсилаю…";
      var fd = new FormData();
      // Формат полів збережено як у версії 2, щоб Google-таблиця працювала без змін
      fd.append("name", state.name || "Анонім");
      fd.append("date", new Date().toLocaleString());
      fd.append("result", correct + "/" + total);
      fd.append("percent", pct);
      fd.append("model", run.model.id + " (Кейс " + (run.idx + 1) + ")");
      fetch(S.resultsUrl, { method: "POST", body: fd, mode: "no-cors" })
        .then(function () { run.sent = true; renderSend(run, correct, total, pct); })
        .catch(function () {
          btn.disabled = false; btn.textContent = "Спробувати ще раз";
          box.insertAdjacentHTML("beforeend", '<p class="form-error">Не вдалося надіслати. Перевірте з’єднання з інтернетом.</p>');
        });
    });
  }

  /* ---------- глобальні дії ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.getAttribute("data-act") === "rename") {
      state.name = ""; storeSet(NAME_KEY, ""); state.run = null; go("#/");
    }
  });

  render();
})();
