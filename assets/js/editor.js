/* SIMDEC v3 — редактор кейсів. Працює повністю в браузері, нічого нікуди не надсилає. */
(function () {
  "use strict";

  var DRAFT_KEY = "simdec-draft";
  var PUBLISHED = window.SIMDEC_DATA ? JSON.stringify(window.SIMDEC_DATA) : null;
  var BASE_KEY = "simdec-draft-base"; // відбиток опублікованої версії, з якої почато чернетку
  var data = null, restoredDraft = false, staleDraft = null;
  function hash(str) {
    var h = 5381; str = String(str || "");
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h);
  }
  var PUB_HASH = hash(PUBLISHED);

  try {
    var d = localStorage.getItem(DRAFT_KEY);
    if (d && d !== PUBLISHED) {
      // чернетку відновлюємо лише якщо сайт відтоді не оновлювався
      if (localStorage.getItem(BASE_KEY) === PUB_HASH) { data = JSON.parse(d); restoredDraft = true; }
      else staleDraft = d;
    }
  } catch (e) {}
  if (!data) data = PUBLISHED ? JSON.parse(PUBLISHED) : emptyData();

  var sel = { type: "help" }; // help | settings | model | case
  var side = document.getElementById("side");
  var main = document.getElementById("main");

  /* ---------- утиліти ---------- */
  function emptyData() {
    return { version: 3, settings: { title: "Тренажер управлінських рішень SIMDEC", shuffleOptions: true, welcome: [] }, models: [] };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getPath(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, data);
  }
  function setPath(path, value) {
    var keys = path.split("."), o = data;
    for (var i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }
  function slug(s) { return String(s || "").trim().replace(/\s+/g, "") || "Stage"; }
  function uid(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function move(arr, i, dir) {
    var j = i + dir; if (j < 0 || j >= arr.length) return false;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t; return true;
  }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- збереження чернетки ---------- */
  var saveTimer;
  function changed(rerenderSide) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 300);
    if (rerenderSide) renderSide();
    updateStatus();
  }
  function saveDraft() {
    try {
      if (isDirty()) { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); localStorage.setItem(BASE_KEY, PUB_HASH); }
      else if (!staleDraft) { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(BASE_KEY); }
    } catch (e) {}
  }
  function isDirty() { return JSON.stringify(data) !== PUBLISHED; }
  function updateStatus() {
    var st = document.getElementById("status");
    st.textContent = isDirty() ? "Є неопубліковані зміни" : "Збігається з опублікованою версією";
    st.className = "ed-status " + (isDirty() ? "dirty" : "clean");
  }

  /* ---------- перевірка ---------- */
  function caseIssues(m, c) {
    var out = [];
    if (!String(c.title || "").trim()) out.push("немає назви кейсу");
    if (!String(c.scenario || "").trim()) out.push("порожня ввідна");
    if (!c.steps || !c.steps.length) out.push("немає жодного етапу");
    var ids = m.stages.map(function (s) { return s.id; });
    (c.steps || []).forEach(function (st, i) {
      var n = "етап " + (i + 1) + ": ";
      if (ids.indexOf(st.stage) < 0) out.push(n + "не обрано етап циклу");
      if (!String(st.question || "").trim()) out.push(n + "немає питання");
      var opts = st.options || [];
      if (opts.length < 2) out.push(n + "потрібно щонайменше 2 варіанти");
      var k = opts.filter(function (o) { return o.correct; }).length;
      if (k !== 1) out.push(n + (k ? "позначено кілька правильних варіантів" : "не позначено правильний варіант"));
      opts.forEach(function (o, j) {
        if (!String(o.text || "").trim()) out.push(n + "варіант " + (j + 1) + " без тексту");
        if (!String(o.feedback || "").trim()) out.push(n + "варіант " + (j + 1) + " без пояснення");
      });
    });
    return out;
  }
  function allIssues() {
    var list = [];
    data.models.forEach(function (m, mi) {
      if (!m.stages.length) list.push({ mi: mi, text: m.name + ": немає етапів циклу" });
      m.cases.forEach(function (c, ci) {
        caseIssues(m, c).forEach(function (t) { list.push({ mi: mi, ci: ci, text: m.name + ", кейс " + (ci + 1) + ": " + t }); });
      });
    });
    return list;
  }

  /* ---------- бічна панель ---------- */
  function renderSide() {
    var h = '<button class="side-link ' + (sel.type === "help" ? "on" : "") + '" data-go="help">Як користуватися</button>' +
      '<button class="side-link ' + (sel.type === "import" ? "on" : "") + '" data-go="import">Імпорт кейсу з тексту</button>' +
      '<button class="side-link ' + (sel.type === "publish" ? "on" : "") + '" data-go="publish">Публікація на сайті</button>' +
      '<button class="side-link ' + (sel.type === "settings" ? "on" : "") + '" data-go="settings">Загальні налаштування</button>';
    data.models.forEach(function (m, mi) {
      h += '<div class="side-model" style="--mc:' + esc(m.color) + '">' +
        '<button class="side-mhead ' + (sel.type === "model" && sel.mi === mi ? "on" : "") + '" data-go="model" data-mi="' + mi + '">' +
          '<span class="dot"></span>' + esc(m.name || "Модель") + '<small>опис і етапи</small></button>';
      m.cases.forEach(function (c, ci) {
        var bad = caseIssues(m, c).length;
        h += '<button class="side-case ' + (sel.type === "case" && sel.mi === mi && sel.ci === ci ? "on" : "") + '" data-go="case" data-mi="' + mi + '" data-ci="' + ci + '">' +
          '<span class="num">' + (ci + 1) + '</span><span class="t">' + esc(c.title || "Без назви") + '</span>' +
          (bad ? '<span class="warn" title="' + bad + ' ' + plural(bad, "зауваження", "зауваження", "зауважень") + '">!</span>' : "") + '</button>';
      });
      h += '<button class="side-add" data-act="addCase" data-mi="' + mi + '">+ Новий кейс</button></div>';
    });
    h += '<button class="side-add model-add" data-act="addModel">+ Нова модель</button>';
    var iss = allIssues().length;
    h += '<div class="side-check ' + (iss ? "bad" : "ok") + '">' + (iss ? "Зауважень: " + iss + ' <button data-go="check">показати</button>' : "✓ Помилок не знайдено") + '</div>';
    side.innerHTML = h;
  }

  side.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var go = b.getAttribute("data-go"), act = b.getAttribute("data-act");
    var mi = +b.getAttribute("data-mi"), ci = +b.getAttribute("data-ci");
    if (go) { select({ type: go, mi: mi, ci: ci }); return; }
    if (act === "addCase") {
      var m = data.models[mi];
      m.cases.push(newCase(m));
      changed(); select({ type: "case", mi: mi, ci: m.cases.length - 1 });
      toast("Додано новий кейс");
    }
    if (act === "addModel") {
      data.models.push({
        id: "MODEL" + (data.models.length + 1), name: "Нова модель", title: "Нова модель", subtitle: "", color: "#4D5E6B", short: "",
        stages: [{ id: "Stage1", code: "ЕТАП 1", name: "", text: "" }], intro: [], example: null, outro: [], quote: null, cases: []
      });
      changed(); select({ type: "model", mi: data.models.length - 1 });
    }
  });

  function select(s) {
    sel = s; renderSide(); renderMain();
    main.scrollTop = 0; window.scrollTo(0, 0);
  }

  function newCase(m) {
    return {
      id: uid((m.id || "case").toLowerCase()), title: "", summary: "", scenario: "",
      steps: m.stages.map(function (s) { return newStep(s.id); })
    };
  }
  function newStep(stageId) {
    return { stage: stageId || "", question: "", options: [newOpt(true), newOpt(false), newOpt(false), newOpt(false)] };
  }
  function newOpt(correct) { return { text: "", correct: !!correct, feedback: "" }; }

  /* ---------- поля форм ---------- */
  function field(label, path, opts) {
    opts = opts || {};
    var v = getPath(path);
    if (opts.kind === "paras") v = (v || []).join("\n\n");
    if (opts.kind === "lines") v = (v || []).join("\n");
    var id = "f_" + path.replace(/\./g, "_");
    var attrs = ' id="' + id + '" data-path="' + esc(path) + '"' + (opts.kind ? ' data-kind="' + opts.kind + '"' : "") +
      (opts.side ? ' data-side="1"' : "") + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "");
    var input;
    if (opts.type === "textarea") input = '<textarea rows="' + (opts.rows || 3) + '"' + attrs + '>' + esc(v) + '</textarea>';
    else if (opts.type === "color") input = '<input type="color"' + attrs + ' value="' + esc(v || "#0D55A3") + '">';
    else if (opts.type === "checkbox") return '<label class="check"><input type="checkbox"' + attrs + (v ? " checked" : "") + '> ' + esc(label) + '</label>';
    else input = '<input type="text"' + attrs + ' value="' + esc(v) + '">';
    return '<div class="field ' + (opts.cls || "") + '"><label for="' + id + '">' + esc(label) + '</label>' + input +
      (opts.hint ? '<p class="hint">' + esc(opts.hint) + '</p>' : "") + '</div>';
  }

  main.addEventListener("input", function (e) {
    var el = e.target, path = el.getAttribute && el.getAttribute("data-path");
    if (!path) return;
    var kind = el.getAttribute("data-kind");
    var v = el.type === "checkbox" ? el.checked : el.value;
    if (kind === "paras") v = String(v).split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (kind === "lines") v = String(v).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    setPath(path, v);
    if (el.tagName === "TEXTAREA") grow(el);
    changed(el.hasAttribute("data-side"));
    if (sel.type === "case") refreshCaseIssues();
  });
  main.addEventListener("change", function (e) {
    var el = e.target;
    if (el.name && el.name.indexOf("correct_") === 0) {
      var p = el.getAttribute("data-step");
      getPath(p + ".options").forEach(function (o, i) { o.correct = i === +el.value; });
      changed(true); renderMain(true);
    }
    if (el.getAttribute("data-path") && el.tagName === "SELECT") { setPath(el.getAttribute("data-path"), el.value); changed(true); refreshCaseIssues(); }
  });
  function grow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight + 2, 640) + "px"; }

  /* ---------- головна панель ---------- */
  function renderMain(keepScroll) {
    var y = window.scrollY;
    if (sel.type === "settings") main.innerHTML = settingsForm();
    else if (sel.type === "model") main.innerHTML = modelForm(sel.mi);
    else if (sel.type === "case") main.innerHTML = caseForm(sel.mi, sel.ci);
    else if (sel.type === "check") main.innerHTML = checkView();
    else if (sel.type === "import") main.innerHTML = importView();
    else if (sel.type === "publish") main.innerHTML = publishView();
    else main.innerHTML = helpView();
    main.querySelectorAll("textarea").forEach(grow);
    if (keepScroll) window.scrollTo(0, y);
  }

  function helpView() {
    var nCases = data.models.reduce(function (s, m) { return s + m.cases.length; }, 0);
    return '<div class="ed-card">' +
      '<h2>Редактор кейсів SIMDEC</h2>' +
      (staleDraft ? '<div class="note">У цьому браузері збереглася чернетка, зроблена до останнього оновлення сайту, тому зараз відкрито актуальну версію. <button class="link" data-act="openStale">Відкрити стару чернетку</button> (нові зміни на сайті буде замінено нею)</div>' : "") +
      (restoredDraft ? '<div class="note">Відкрито вашу незавершену чернетку з цього браузера. <button class="link" data-act="reset">Повернутися до опублікованої версії</button></div>' : "") +
      '<p>Зараз у тренажері ' + data.models.length + ' ' + plural(data.models.length, "модель", "моделі", "моделей") + ' і ' + nCases + ' ' + plural(nCases, "кейс", "кейси", "кейсів") + '. Усе, що ви змінюєте тут, автоматично зберігається як чернетка в цьому браузері, тож закрити вкладку можна без втрат.</p>' +
      '<ol class="steps-help">' +
        '<li><b>Оберіть ліворуч</b> кейс, який треба виправити, або натисніть «+ Новий кейс» під потрібною моделлю.</li>' +
        '<li><b>Заповніть поля.</b> Етапи кейсу вже створено за етапами моделі. На кожному етапі позначте кружечком один правильний варіант і напишіть пояснення до кожного варіанта.</li>' +
        '<li><b>Натисніть «Переглянути»</b>, щоб пройти кейс у тренажері так, як побачить його здобувач. У режимі перегляду результати не надсилаються.</li>' +
        '<li><b>Натисніть «Опублікувати».</b> Першого разу редактор попросить ключ доступу GitHub (інструкція на сторінці «Публікація на сайті»), далі публікація відбувається одним натисканням. Через хвилину-дві зміни з’являться на сайті.</li>' +
      '</ol>' +
      '<p>Кейс можна також написати окремо в Word чи Блокноті за шаблоном і завантажити: «Імпорт кейсу з тексту» ліворуч.</p>' +
      '<p class="muted">Кнопка «Відкрити файл…» завантажує раніше збережений simdec-data.js, а також окремі кейси у форматі SIMDEC 2 (файли на кшталт pdca4.json): вони додаються до моделі, яку зараз обрано ліворуч.</p>' +
    '</div>';
  }

  function settingsForm() {
    return '<div class="ed-card"><h2>Загальні налаштування</h2>' +
      field("Назва тренажера", "settings.title") +
      '<div class="row3">' + field("Університет", "settings.university") + field("Інститут", "settings.institute") + field("Кафедра", "settings.department") + '</div>' +
      field("Вітальний текст", "settings.welcome", { type: "textarea", kind: "paras", rows: 5, hint: "Абзаци відокремлюйте порожнім рядком." }) +
      field("Примітка про конфіденційність", "settings.privacyNote") +
      field("Рядок у підвалі", "settings.copyright") +
      '<h3 class="sub">Результати</h3>' +
      field("Адреса Google Apps Script для запису результатів", "settings.resultsUrl", { hint: "Тренажер надсилає поля name, date, result, percent, model. Залиште порожнім, щоб вимкнути надсилання." }) +
      field("Перемішувати варіанти відповідей для кожного здобувача", "settings.shuffleOptions", { type: "checkbox" }) +
    '</div>';
  }

  function modelForm(mi) {
    var m = data.models[mi], p = "models." + mi;
    var h = '<div class="ed-card" style="--mc:' + esc(m.color) + '">' +
      '<div class="card-head"><h2>Модель ' + esc(m.name) + '</h2><div class="head-tools">' +
        '<button class="btn btn-ghost btn-sm" data-act="mUp">↑</button><button class="btn btn-ghost btn-sm" data-act="mDown">↓</button>' +
        '<button class="btn btn-danger btn-sm" data-act="mDel">Видалити модель</button></div></div>' +
      '<div class="row3">' + field("Коротка назва", p + ".name", { side: true }) + field("Повна назва", p + ".title") + field("Колір", p + ".color", { type: "color", side: true }) + '</div>' +
      field("Підзаголовок", p + ".subtitle") +
      field("Опис для картки вибору моделі", p + ".short", { type: "textarea", rows: 2 }) +
      field("Вступний текст", p + ".intro", { type: "textarea", kind: "paras", rows: 4, hint: "Абзаци відокремлюйте порожнім рядком." }) +
      '<h3 class="sub">Етапи циклу</h3><p class="hint">Кожен етап кейсу прив’язано до одного з цих етапів. Позначення (латиницею) показується на кільці.</p>';
    m.stages.forEach(function (s, si) {
      var sp = p + ".stages." + si;
      h += '<div class="stage-row"><span class="stage-num">' + (si + 1) + '</span>' +
        field("Позначення", sp + ".code", { cls: "w-code" }) + field("Назва українською", sp + ".name", { cls: "w-name" }) +
        field("Пояснення", sp + ".text", { type: "textarea", rows: 2, cls: "w-text" }) +
        '<div class="row-tools"><button class="icon" data-act="sUp" data-i="' + si + '" title="Вище">↑</button><button class="icon" data-act="sDown" data-i="' + si + '" title="Нижче">↓</button><button class="icon del" data-act="sDel" data-i="' + si + '" title="Видалити">✕</button></div></div>';
    });
    h += '<button class="btn btn-ghost btn-sm" data-act="sAdd">+ Етап циклу</button>';
    var ex = m.example || {};
    h += '<h3 class="sub">Приклад застосування <span class="muted">(необов’язково)</span></h3>' +
      fieldObj("Заголовок", p + ".example.title", ex.title) +
      fieldObj("Текст", p + ".example.text", ex.text, "textarea") +
      field("Пункти списку", p + ".example.items", { type: "textarea", kind: "lines", rows: 3, hint: "Кожен пункт з нового рядка." }) +
      field("Текст після прикладу", p + ".outro", { type: "textarea", kind: "paras", rows: 3 }) +
      '<h3 class="sub">Цитата <span class="muted">(необов’язково)</span></h3>' +
      '<div class="row2">' + field("Автор", p + ".quote.author") + field("Зображення", p + ".quote.image", { hint: "Шлях до файлу, напр. assets/img/deming.jpg" }) + '</div>' +
      field("Вступ до цитати", p + ".quote.lead", { type: "textarea", rows: 2 }) +
      field("Цитата", p + ".quote.text", { type: "textarea", rows: 2 }) +
      '</div>';
    return h;
  }
  function fieldObj(label, path, v, type) {
    if (getPath(path) === undefined && v === undefined) {/* поле створиться під час введення */}
    return field(label, path, { type: type, rows: 2 });
  }

  function caseForm(mi, ci) {
    var m = data.models[mi], c = m.cases[ci];
    if (!c) return helpView();
    var p = "models." + mi + ".cases." + ci;
    var h = '<div class="ed-card" style="--mc:' + esc(m.color) + '">' +
      '<div class="card-head"><div><p class="label">' + esc(m.name) + ' · кейс ' + (ci + 1) + '</p><h2>' + esc(c.title || "Новий кейс") + '</h2></div>' +
      '<div class="head-tools">' +
        '<button class="btn btn-ghost btn-sm" data-act="cPlay">▶ Пройти</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="cUp" title="Перемістити вище">↑</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="cDown" title="Перемістити нижче">↓</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="cDup">Дублювати</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="cText" title="Завантажити кейс як текстовий файл">Зберегти як текст</button>' +
        '<select class="btn btn-ghost btn-sm" data-act="cMove" aria-label="Перенести в модель"><option value="">Перенести в…</option>' +
          data.models.map(function (mm, k) { return k === mi ? "" : '<option value="' + k + '">' + esc(mm.name) + '</option>'; }).join("") + '</select>' +
        '<button class="btn btn-danger btn-sm" data-act="cDel">Видалити</button>' +
      '</div></div>' +
      '<div id="caseIssues"></div>' +
      field("Назва кейсу", p + ".title", { side: true, placeholder: "Коротко про ситуацію" }) +
      field("Короткий опис для списку кейсів", p + ".summary", { placeholder: "Необов’язково: одне речення під назвою" }) +
      field("Ввідна (опис ситуації)", p + ".scenario", { type: "textarea", rows: 8, hint: "Абзаци відокремлюйте порожнім рядком. Опишіть обстановку і роль здобувача." }) +
      '</div>';
    c.steps.forEach(function (st, si) {
      var sp = p + ".steps." + si;
      h += '<div class="ed-card step-card" style="--mc:' + esc(m.color) + '">' +
        '<div class="card-head"><div class="step-title"><span class="stage-num">' + (si + 1) + '</span>' +
          '<label>Етап циклу <select data-path="' + sp + '.stage">' +
            '<option value="">— оберіть —</option>' +
            m.stages.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === st.stage ? " selected" : "") + '>' + esc(s.code + (s.name ? " · " + s.name : "")) + '</option>'; }).join("") +
          '</select></label></div>' +
          '<div class="head-tools"><button class="icon" data-act="stUp" data-i="' + si + '" title="Вище">↑</button><button class="icon" data-act="stDown" data-i="' + si + '" title="Нижче">↓</button><button class="icon del" data-act="stDel" data-i="' + si + '" title="Видалити етап">✕</button></div></div>' +
        field("Ситуація на цьому етапі і питання", sp + ".question", { type: "textarea", rows: 4, hint: "Останній абзац показується жирним як питання." }) +
        '<p class="opts-label">Варіанти відповіді <span class="muted">· позначте правильний</span></p>';
      st.options.forEach(function (o, oi) {
        var op = sp + ".options." + oi;
        h += '<div class="opt-row ' + (o.correct ? "is-correct" : "") + '">' +
          '<label class="correct-pick" title="Правильний варіант"><input type="radio" name="correct_' + si + '" value="' + oi + '" data-step="' + sp + '"' + (o.correct ? " checked" : "") + '><span>' + "АБВГДЕЖЗ".charAt(oi) + '</span></label>' +
          '<div class="opt-fields">' +
            '<textarea rows="2" data-path="' + op + '.text" placeholder="Текст варіанта дій">' + esc(o.text) + '</textarea>' +
            '<textarea rows="2" class="fb" data-path="' + op + '.feedback" placeholder="' + (o.correct ? "Чому це правильне рішення" : "Чому це рішення невдале, які наслідки") + '">' + esc(o.feedback) + '</textarea>' +
          '</div>' +
          '<div class="row-tools"><button class="icon" data-act="oUp" data-s="' + si + '" data-i="' + oi + '">↑</button><button class="icon" data-act="oDown" data-s="' + si + '" data-i="' + oi + '">↓</button><button class="icon del" data-act="oDel" data-s="' + si + '" data-i="' + oi + '">✕</button></div>' +
        '</div>';
      });
      h += '<button class="btn btn-ghost btn-sm" data-act="oAdd" data-s="' + si + '">+ Варіант</button></div>';
    });
    h += '<button class="btn btn-ghost add-step" data-act="stAdd">+ Додати етап</button>';
    setTimeout(refreshCaseIssues, 0);
    return h;
  }

  function refreshCaseIssues() {
    var box = document.getElementById("caseIssues");
    if (!box || sel.type !== "case") return;
    var m = data.models[sel.mi], c = m && m.cases[sel.ci]; if (!c) return;
    var iss = caseIssues(m, c);
    box.innerHTML = iss.length ? '<div class="issues"><b>Що ще треба доповнити:</b><ul>' + iss.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>"
      : '<div class="issues ok">✓ Кейс заповнено повністю</div>';
  }

  function checkView() {
    var iss = allIssues();
    return '<div class="ed-card"><h2>Перевірка всіх кейсів</h2>' +
      (iss.length ? '<ul class="check-list">' + iss.map(function (x) {
        return '<li><button class="link" data-act="goIssue" data-mi="' + x.mi + '" data-ci="' + (x.ci == null ? "" : x.ci) + '">' + esc(x.text) + '</button></li>';
      }).join("") + '</ul>' : '<p class="ok-text">✓ Усі кейси заповнено правильно.</p>') + '</div>';
  }

  /* ---------- дії в основній панелі ---------- */
  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    var act = b.getAttribute("data-act");
    var i = +b.getAttribute("data-i"), s = +b.getAttribute("data-s");
    var m = data.models[sel.mi], c = m && sel.type === "case" ? m.cases[sel.ci] : null;
    var structural = true;

    switch (act) {
      case "reset":
        if (!confirm("Відкинути чернетку і повернутися до опублікованої версії?")) return;
        data = JSON.parse(PUBLISHED); restoredDraft = false;
        try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(BASE_KEY); } catch (e2) {}
        select({ type: "help" }); updateStatus(); return;
      case "openStale":
        if (!confirm("Відкрити стару чернетку? Зміни, опубліковані на сайті після неї, у редакторі буде замінено.")) return;
        data = JSON.parse(staleDraft); staleDraft = null; restoredDraft = true;
        changed(); select({ type: "help" }); return;
      case "goIssue":
        var gci = b.getAttribute("data-ci");
        select(gci === "" ? { type: "model", mi: +b.getAttribute("data-mi") } : { type: "case", mi: +b.getAttribute("data-mi"), ci: +gci }); return;
      // модель
      case "mUp": if (move(data.models, sel.mi, -1)) sel.mi--; break;
      case "mDown": if (move(data.models, sel.mi, 1)) sel.mi++; break;
      case "mDel":
        if (!confirm("Видалити модель «" + m.name + "» разом з усіма її кейсами (" + m.cases.length + ")?")) return;
        data.models.splice(sel.mi, 1); sel = { type: "help" }; break;
      case "sAdd": m.stages.push({ id: "Stage" + Date.now().toString(36), code: "ЕТАП " + (m.stages.length + 1), name: "", text: "" }); break;
      case "sUp": move(m.stages, i, -1); break;
      case "sDown": move(m.stages, i, 1); break;
      case "sDel":
        var used = m.cases.filter(function (cc) { return cc.steps.some(function (st) { return st.stage === m.stages[i].id; }); }).length;
        if (!confirm("Видалити етап «" + m.stages[i].code + "»?" + (used ? " Він використовується в " + used + " " + plural(used, "кейсі", "кейсах", "кейсах") + ", там етап доведеться обрати заново." : ""))) return;
        m.stages.splice(i, 1); break;
      // кейс
      case "cPlay": saveDraft(); window.open("index.html?preview=1#/m/" + encodeURIComponent(m.id) + "/" + (sel.ci + 1), "simdec-preview"); return;
      case "cUp": if (move(m.cases, sel.ci, -1)) sel.ci--; break;
      case "cDown": if (move(m.cases, sel.ci, 1)) sel.ci++; break;
      case "cDup":
        var copy = JSON.parse(JSON.stringify(c)); copy.id = uid(m.id.toLowerCase()); copy.title = (c.title || "") + " (копія)";
        m.cases.splice(sel.ci + 1, 0, copy); sel.ci++; toast("Створено копію кейсу"); break;
      case "cDel":
        if (!confirm("Видалити кейс «" + (c.title || "без назви") + "»? Відновити його можна лише з раніше завантаженого файлу.")) return;
        m.cases.splice(sel.ci, 1); sel = m.cases.length ? { type: "case", mi: sel.mi, ci: Math.min(sel.ci, m.cases.length - 1) } : { type: "model", mi: sel.mi }; break;
      case "stAdd":
        var nextStage = m.stages[c.steps.length] || m.stages[m.stages.length - 1] || {};
        c.steps.push(newStep(nextStage.id)); break;
      case "stUp": move(c.steps, i, -1); break;
      case "stDown": move(c.steps, i, 1); break;
      case "stDel": if (!confirm("Видалити етап " + (i + 1) + " разом із варіантами?")) return; c.steps.splice(i, 1); break;
      case "oAdd": c.steps[s].options.push(newOpt(false)); break;
      case "oUp": move(c.steps[s].options, i, -1); break;
      case "oDown": move(c.steps[s].options, i, 1); break;
      case "oDel": c.steps[s].options.splice(i, 1); break;
      default: structural = false;
    }
    if (structural) { changed(); renderSide(); renderMain(true); }
  });
  main.addEventListener("change", function (e) {
    var el = e.target;
    if (el.getAttribute("data-act") !== "cMove" || el.value === "") return;
    var to = +el.value, m = data.models[sel.mi], c = m.cases.splice(sel.ci, 1)[0], target = data.models[to];
    var ids = target.stages.map(function (s) { return s.id; });
    c.steps.forEach(function (st, k) { if (ids.indexOf(st.stage) < 0) st.stage = (target.stages[k] || {}).id || ""; });
    target.cases.push(c);
    changed(); toast("Кейс перенесено в " + target.name);
    select({ type: "case", mi: to, ci: target.cases.length - 1 });
  });

  /* ---------- верхні кнопки ---------- */
  document.getElementById("btnPreview").addEventListener("click", function () {
    saveDraft(); window.open("index.html?preview=1", "simdec-preview");
  });

  document.getElementById("btnExport").addEventListener("click", function () {
    var iss = allIssues();
    if (iss.length && !confirm("Знайдено зауважень: " + iss.length + ". Незаповнені кейси можуть некоректно працювати в тренажері. Завантажити файл усе одно?")) {
      select({ type: "check" }); return;
    }
    var text = "/* SIMDEC — файл даних. Редагуйте через editor.html, а не вручну. Збережено " + new Date().toLocaleString("uk-UA") + " */\n" +
      "window.SIMDEC_DATA = " + JSON.stringify(data, null, 2) + ";\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    a.download = "simdec-data.js";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Файл завантажено. Замініть ним data/simdec-data.js на GitHub.");
  });

  var fileInput = document.getElementById("fileInput");
  document.getElementById("btnImport").addEventListener("click", function () { fileInput.value = ""; fileInput.click(); });
  fileInput.addEventListener("change", function () {
    var f = fileInput.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var txt = String(r.result), obj;
      try {
        var a = txt.search(/[\[{]/), b = Math.max(txt.lastIndexOf("}"), txt.lastIndexOf("]"));
        obj = JSON.parse(txt.slice(a, b + 1));
      } catch (err) { alert("Не вдалося прочитати файл: це не файл даних SIMDEC."); return; }
      if (obj && obj.models) {
        if (!confirm("Замінити всі дані в редакторі вмістом файлу «" + f.name + "»?")) return;
        data = obj; changed(); select({ type: "help" }); toast("Файл відкрито");
        return;
      }
      var list = Array.isArray(obj) ? obj : [obj];
      if (list.length && list[0].steps) {
        var mi = sel.mi != null && data.models[sel.mi] ? sel.mi : 0;
        var target = data.models[mi];
        if (!target) { alert("Спершу створіть модель."); return; }
        list.forEach(function (s) { target.cases.push(convertV2(s, target)); });
        changed(); select({ type: "case", mi: mi, ci: target.cases.length - 1 });
        toast("Додано " + list.length + " " + plural(list.length, "кейс", "кейси", "кейсів") + " до " + target.name);
        return;
      }
      alert("Формат файлу не розпізнано.");
    };
    r.readAsText(f, "utf-8");
  });

  function convertV2(s, m) {
    return {
      id: uid(m.id.toLowerCase()), title: s.title || "", summary: s.summary || "", scenario: s.scenario || "",
      steps: (s.steps || []).map(function (st, k) {
        var stage = m.stages.filter(function (x) { return x.id === st.stage; })[0] || m.stages[k] || {};
        return {
          stage: stage.id || "",
          question: String(st.question || "").replace(/^Етап \d+ — [^\n]*\n+/, "").trim(),
          options: (st.options || []).map(function (o) {
            return { text: o.text || "", correct: o.correct != null ? !!o.correct : o.result === "success", feedback: o.feedback || "" };
          })
        };
      })
    };
  }


  /* =====================================================================
     ІМПОРТ КЕЙСУ З ТЕКСТУ (формат, подібний до GIFT у Moodle)
     ===================================================================== */
  var TEXT_KEYS = {
    "МОДЕЛЬ": "model", "НАЗВА": "title", "КЕЙС": "title", "КОРОТКО": "summary",
    "ВВІДНА": "scenario", "СИТУАЦІЯ": "scenario", "ЕТАП": "stage", "ПИТАННЯ": "question", "ПОЯСНЕННЯ": "feedback"
  };
  var KEY_RE = /^\s*(МОДЕЛЬ|НАЗВА|КЕЙС|КОРОТКО|ВВІДНА|СИТУАЦІЯ|ЕТАП|ПИТАННЯ|ПОЯСНЕННЯ)\s*[:.]\s*(.*)$/i;
  var OPT_RE = /^\s*(\[\s*\+\s*\]|\(\s*\+\s*\)|\+|\[\s*-\s*\]|\(\s*-\s*\)|[-–—])\s+(.+)$/;
  var FB_RE = /^\s*>\s?(.*)$/;

  function norm(s) { return String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[«»"'’ʼ]/g, "").replace(/\s+/g, " ").trim(); }
  function findModel(v) {
    var n = norm(v); if (!n) return null;
    for (var i = 0; i < data.models.length; i++) {
      var m = data.models[i];
      if ([m.id, m.name, m.title].some(function (x) { return norm(x) === n || (n.length > 3 && norm(x).indexOf(n) >= 0); })) return i;
    }
    return null;
  }
  function findStage(m, v, k) {
    var n = norm(v);
    if (n) {
      for (var i = 0; i < m.stages.length; i++) {
        var s = m.stages[i];
        if ([s.id, s.code, s.name].some(function (x) { return norm(x) === n; })) return s.id;
      }
      var num = parseInt(n, 10);
      if (num >= 1 && num <= m.stages.length) return m.stages[num - 1].id;
    }
    return (m.stages[k] || {}).id || "";
  }
  function joinParas(lines) {
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /** Розбирає текст на кейси. defaultMi — модель, обрана в інтерфейсі. */
  function parseCasesText(text, defaultMi) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var cases = [], cur = null, step = null, opt = null, field = null, buf = [], warnings = [];

    function flush() {
      var v = joinParas(buf); buf = [];
      if (!field) return;
      if (field === "feedback" && opt) opt.feedback = (opt.feedback ? opt.feedback + "\n\n" : "") + v;
      else if (field === "optText" && opt) opt.text = (opt.text + (v ? " " + v : "")).trim();
      else if (field === "question" && step) step.question = v;
      else if (cur && (field === "title" || field === "summary" || field === "scenario")) cur[field] = v;
      field = null;
    }
    function newCase() { cur = { mi: defaultMi, title: "", summary: "", scenario: "", steps: [] }; cases.push(cur); step = null; opt = null; }

    lines.forEach(function (raw, ln) {
      var line = raw.replace(/ /g, " ");
      if (/^\s*#/.test(line)) return;                         // коментар
      if (/^\s*={3,}\s*$/.test(line)) { flush(); cur = null; return; } // роздільник кейсів
      var km = line.match(KEY_RE);
      if (km) {
        flush();
        var key = TEXT_KEYS[km[1].toUpperCase()], val = km[2];
        if (key === "model") {
          if (!cur || cur.steps.length || cur.title) newCase();
          var mi = findModel(val);
          if (mi == null) warnings.push("Рядок " + (ln + 1) + ": модель «" + val.trim() + "» не знайдено, кейс додано до обраної моделі.");
          else cur.mi = mi;
          return;
        }
        if (key === "title" && cur && (cur.title || cur.steps.length)) newCase();
        if (!cur) newCase();
        if (key === "stage") {
          step = { stageRaw: val.trim(), question: "", options: [] }; cur.steps.push(step); opt = null; return;
        }
        if (key === "question" && !step) { step = { stageRaw: "", question: "", options: [] }; cur.steps.push(step); }
        if (key === "feedback" && !opt) { warnings.push("Рядок " + (ln + 1) + ": пояснення без варіанта відповіді пропущено."); return; }
        field = key; if (val.trim()) buf.push(val.trim());
        return;
      }
      var om = line.match(OPT_RE);
      if (om && step && field !== "scenario") {
        flush();
        var mark = om[1].replace(/\s/g, "");
        opt = { text: om[2].trim(), correct: mark.indexOf("+") >= 0, feedback: "" };
        step.options.push(opt); field = "optText"; return;
      }
      var fm = line.match(FB_RE);
      if (fm && opt) {
        if (field !== "feedback") { flush(); field = "feedback"; }
        buf.push(fm[1]); return;
      }
      if (!field) {
        if (line.trim() && cur) warnings.push("Рядок " + (ln + 1) + ": текст поза полями пропущено («" + line.trim().slice(0, 40) + "…»).");
        return;
      }
      if (field === "optText" && !line.trim()) { flush(); return; }
      buf.push(line.trim());
    });
    flush();

    var out = cases.filter(function (c) { return c.title || c.steps.length; }).map(function (c) {
      var m = data.models[c.mi] || data.models[0];
      return {
        mi: data.models.indexOf(m),
        kase: {
          id: uid((m.id || "case").toLowerCase()), title: c.title, summary: c.summary, scenario: c.scenario,
          steps: c.steps.map(function (st, k) {
            return { stage: findStage(m, st.stageRaw, k), question: st.question, options: st.options };
          })
        }
      };
    });
    return { items: out, warnings: warnings };
  }

  function caseToText(m, c) {
    var t = "МОДЕЛЬ: " + m.id + "\nНАЗВА: " + (c.title || "") + "\n";
    if (c.summary) t += "КОРОТКО: " + c.summary + "\n";
    t += "\nВВІДНА:\n" + (c.scenario || "") + "\n";
    c.steps.forEach(function (st) {
      var s = m.stages.filter(function (x) { return x.id === st.stage; })[0];
      t += "\nЕТАП: " + (s ? s.code : st.stage) + "\nПИТАННЯ:\n" + (st.question || "") + "\n\n";
      st.options.forEach(function (o) {
        t += (o.correct ? "+ " : "- ") + o.text + "\n";
        if (o.feedback) t += o.feedback.split("\n").map(function (x) { return "> " + x; }).join("\n") + "\n";
      });
    });
    return t;
  }

  var TEMPLATE_TEXT =
    "# Шаблон кейсу SIMDEC. Рядки, що починаються з #, ігноруються.\n" +
    "# Кілька кейсів в одному файлі: кожен починайте з рядка МОДЕЛЬ: …\n" +
    "# Варіанти: + правильний, - хибний. Пояснення до варіанта: рядок з > на початку.\n" +
    "# ЕТАП: позначення етапу (PLAN, DO, CHECK, ACT, OBSERVE, ORIENT, DECIDE, STANDARDIZE…)\n\n" +
    "МОДЕЛЬ: OODA\n" +
    "НАЗВА: Назва вашого кейсу\n" +
    "КОРОТКО: Одне речення для списку кейсів (необов'язково)\n\n" +
    "ВВІДНА:\n" +
    "Опишіть обстановку і роль здобувача. Абзаци розділяйте порожнім рядком.\n\n" +
    "Другий абзац ввідної.\n\n" +
    "ЕТАП: OBSERVE\n" +
    "ПИТАННЯ:\n" +
    "Що відбувається на цьому етапі. Останній абзац — саме питання.\n\n" +
    "Які ваші першочергові дії?\n\n" +
    "+ Правильний варіант дій\n" +
    "> Чому це правильне рішення.\n" +
    "- Хибний, але правдоподібний варіант\n" +
    "> Чому це рішення не спрацює.\n" +
    "- Ще один хибний варіант\n" +
    "> Пояснення.\n" +
    "- Ще один хибний варіант\n" +
    "> Пояснення.\n\n" +
    "ЕТАП: ORIENT\n" +
    "ПИТАННЯ:\n" +
    "…і так далі для кожного етапу циклу.\n";

  function downloadText(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var importState = { text: "", parsed: null, mi: 0 };

  function importView() {
    var p = importState.parsed;
    var h = '<div class="ed-card"><h2>Імпорт кейсу з текстового файлу</h2>' +
      '<p>Напишіть кейс у Word або Блокноті за шаблоном, збережіть як <code>.txt</code> або <code>.docx</code> і завантажте сюди. Можна й просто вставити текст у поле нижче.</p>' +
      '<div class="import-tools">' +
        '<button class="btn btn-ghost btn-sm" data-act="tplDownload">Завантажити шаблон кейсу</button>' +
        '<label class="btn btn-primary btn-sm" for="importFile">Обрати файл (.txt, .docx)</label>' +
        '<input type="file" id="importFile" accept=".txt,.docx,text/plain" hidden>' +
        '<label class="inline-select">Якщо модель у файлі не вказано: <select id="importModel">' +
          data.models.map(function (m, i) { return '<option value="' + i + '"' + (i === importState.mi ? " selected" : "") + '>' + esc(m.name) + '</option>'; }).join("") +
        '</select></label>' +
      '</div>' +
      '<div class="field"><label for="importText">Текст кейсу</label><textarea id="importText" rows="14" placeholder="МОДЕЛЬ: OODA&#10;НАЗВА: …&#10;ВВІДНА:&#10;…">' + esc(importState.text) + '</textarea></div>' +
      '<button class="btn btn-gold" data-act="importParse">Розпізнати</button>' +
      '</div>';
    if (p) {
      h += '<div class="ed-card"><h3 class="sub" style="margin-top:0">Результат розпізнавання</h3>';
      if (p.warnings.length) h += '<div class="issues"><b>Попередження:</b><ul>' + p.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul></div>";
      if (!p.items.length) h += '<p class="muted">Жодного кейсу не знайдено. Перевірте, що текст містить рядки НАЗВА:, ВВІДНА:, ЕТАП: і варіанти з + або -.</p>';
      p.items.forEach(function (it) {
        var m = data.models[it.mi], iss = caseIssues(m, it.kase);
        h += '<div class="parsed-case" style="--mc:' + esc(m.color) + '"><div><b>' + esc(it.kase.title || "Без назви") + '</b>' +
          '<span class="muted"> · ' + esc(m.name) + ' · ' + it.kase.steps.length + ' ' + plural(it.kase.steps.length, "етап", "етапи", "етапів") + '</span></div>' +
          (iss.length ? '<ul class="mini-issues">' + iss.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>' : '<p class="ok-text">✓ Кейс заповнено повністю</p>') + '</div>';
      });
      if (p.items.length) h += '<button class="btn btn-primary" data-act="importAdd">Додати ' + (p.items.length > 1 ? p.items.length + " " + plural(p.items.length, "кейс", "кейси", "кейсів") : "кейс") + ' до тренажера</button>' +
        '<p class="hint">Після додавання кейс можна доопрацювати у формі, а потім опублікувати на сайті.</p>';
      h += '</div>';
    }
    return h;
  }

  main.addEventListener("input", function (e) {
    if (e.target.id === "importText") importState.text = e.target.value;
  });
  main.addEventListener("change", function (e) {
    if (e.target.id === "importModel") importState.mi = +e.target.value;
    if (e.target.id !== "importFile") return;
    var f = e.target.files[0]; if (!f) return;
    if (/\.docx$/i.test(f.name)) {
      loadMammoth(function (ok) {
        if (!ok) { toast("Не вдалося відкрити .docx. Збережіть файл як .txt і спробуйте ще раз."); return; }
        var r = new FileReader();
        r.onload = function () {
          window.mammoth.extractRawText({ arrayBuffer: r.result }).then(function (res) {
            importState.text = res.value; importState.parsed = parseCasesText(res.value, importState.mi); renderMain();
          }).catch(function () { toast("Не вдалося прочитати .docx. Збережіть як .txt."); });
        };
        r.readAsArrayBuffer(f);
      });
    } else {
      var r = new FileReader();
      r.onload = function () { importState.text = String(r.result); importState.parsed = parseCasesText(importState.text, importState.mi); renderMain(); };
      r.readAsText(f, "utf-8");
    }
  });
  function loadMammoth(cb) {
    if (window.mammoth) return cb(true);
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
    s.onload = function () { cb(!!window.mammoth); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  /* =====================================================================
     ПУБЛІКАЦІЯ НА САЙТІ ЧЕРЕЗ GITHUB (ключ доступу = пароль редактора)
     ===================================================================== */
  var GH_KEY = "simdec-github";
  var DATA_PATH = "data/simdec-data.js";
  function ghDefaults() {
    var host = location.hostname.match(/^([^.]+)\.github\.io$/i);
    var repo = location.pathname.split("/").filter(Boolean)[0];
    return { owner: host ? host[1] : "donduvs", repo: host && repo && !/\.html$/.test(repo) ? repo : "simdec", branch: "main", token: "" };
  }
  var gh = (function () {
    var d = ghDefaults();
    try { var s = JSON.parse(localStorage.getItem(GH_KEY) || "null"); if (s) { d.token = s.token || ""; d.owner = s.owner || d.owner; d.repo = s.repo || d.repo; d.branch = s.branch || d.branch; } } catch (e) {}
    return d;
  })();
  var ghState = { checking: false, ok: null, msg: "", publishing: false };

  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, "")))); }
  function ghFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Accept": "application/vnd.github+json", "Authorization": "Bearer " + gh.token }, opts.headers || {});
    return fetch("https://api.github.com/repos/" + encodeURIComponent(gh.owner) + "/" + encodeURIComponent(gh.repo) + path, opts)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }
  function dataFileText() {
    return "/* SIMDEC — файл даних. Редагуйте через editor.html, а не вручну. Збережено " + new Date().toLocaleString("uk-UA") + " */\n" +
      "window.SIMDEC_DATA = " + JSON.stringify(data, null, 2) + ";\n";
  }

  function publishView() {
    var connected = !!gh.token;
    return '<div class="ed-card"><h2>Публікація на сайті</h2>' +
      '<p>Сайт розміщено на GitHub Pages, тому зміни публікуються через ваш репозиторій. Ключ доступу GitHub працює як пароль редактора: без нього можна готувати чернетки, але змінити сайт неможливо.</p>' +
      (connected
        ? '<div class="issues ok">Ключ збережено в цьому браузері для репозиторію ' + esc(gh.owner + "/" + gh.repo) + '.</div>' +
          '<div class="import-tools"><button class="btn btn-gold" data-act="ghPublish"' + (ghState.publishing ? " disabled" : "") + '>' + (ghState.publishing ? "Публікую…" : "Опублікувати зміни") + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="ghCheck">Перевірити ключ</button>' +
          '<button class="btn btn-danger btn-sm" data-act="ghForget">Вийти (забути ключ)</button></div>'
        : '<h3 class="sub">Як отримати ключ (один раз)</h3>' +
          '<ol class="steps-help">' +
            '<li>Увійдіть на GitHub під акаунтом <b>' + esc(gh.owner) + '</b> і відкрийте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Settings → Developer settings → Fine-grained tokens → Generate new token</a>.</li>' +
            '<li>Назва: SIMDEC editor. Expiration: 1 рік. Resource owner: <b>' + esc(gh.owner) + '</b>.</li>' +
            '<li>Repository access: <b>Only select repositories</b> → <b>' + esc(gh.repo) + '</b>.</li>' +
            '<li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Більше нічого не вмикайте.</li>' +
            '<li>Натисніть Generate token, скопіюйте ключ (починається з github_pat_) і вставте нижче.</li>' +
          '</ol>' +
          '<div class="row3">' +
            '<div class="field"><label for="ghOwner">Акаунт</label><input type="text" id="ghOwner" value="' + esc(gh.owner) + '"></div>' +
            '<div class="field"><label for="ghRepo">Репозиторій</label><input type="text" id="ghRepo" value="' + esc(gh.repo) + '"></div>' +
            '<div class="field"><label for="ghBranch">Гілка</label><input type="text" id="ghBranch" value="' + esc(gh.branch) + '"></div>' +
          '</div>' +
          '<div class="field"><label for="ghToken">Ключ доступу</label><input type="password" id="ghToken" autocomplete="off" placeholder="github_pat_…"></div>' +
          '<p class="hint">Ключ зберігається лише в цьому браузері. Не зберігайте його на спільних комп\'ютерах; на чужому комп\'ютері після роботи натисніть «Вийти».</p>' +
          '<button class="btn btn-primary" data-act="ghSave">Зберегти ключ і перевірити</button>') +
      (ghState.msg ? '<p class="' + (ghState.ok === false ? "form-error" : "ok-text") + '" style="margin-top:14px">' + esc(ghState.msg) + '</p>' : "") +
      '</div>';
  }

  function ghCheck() {
    ghState.msg = "Перевіряю ключ…"; ghState.ok = null; renderMain();
    return ghFetch("").then(function (r) {
      if (r.status === 200 && r.body.permissions && r.body.permissions.push) { ghState.ok = true; ghState.msg = "Ключ дійсний, публікувати можна."; }
      else if (r.status === 200) { ghState.ok = false; ghState.msg = "Ключ дійсний, але не має права запису. Увімкніть Contents: Read and write."; }
      else if (r.status === 401) { ghState.ok = false; ghState.msg = "Ключ недійсний або прострочений. Створіть новий."; }
      else if (r.status === 404) { ghState.ok = false; ghState.msg = "Репозиторій не знайдено або ключ не має до нього доступу."; }
      else { ghState.ok = false; ghState.msg = "GitHub повернув помилку " + r.status + "."; }
      renderMain(); return ghState.ok;
    }).catch(function () { ghState.ok = false; ghState.msg = "Немає зв'язку з GitHub. Перевірте інтернет."; renderMain(); return false; });
  }

  function ghPublish() {
    var iss = allIssues();
    if (iss.length && !confirm("Знайдено зауважень: " + iss.length + ". Незаповнені кейси можуть некоректно працювати. Опублікувати все одно?")) { select({ type: "check" }); return; }
    if (!isDirty() && !confirm("Змін відносно опублікованої версії немає. Опублікувати повторно?")) return;
    ghState.publishing = true; ghState.msg = ""; if (sel.type === "publish") renderMain();
    ghFetch("/contents/" + DATA_PATH + "?ref=" + encodeURIComponent(gh.branch)).then(function (r) {
      if (r.status !== 200) throw r;
      var remote = null;
      try { var t = b64decode(r.body.content); remote = JSON.stringify(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1))); } catch (e) {}
      if (remote && remote !== PUBLISHED && remote !== JSON.stringify(data) &&
          !confirm("Після того як ви відкрили редактор, на сайті вже опублікували іншу версію (можливо, колега). Якщо продовжити, її буде замінено вашою. Продовжити?")) throw { cancelled: true };
      return ghFetch("/contents/" + DATA_PATH, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Оновлення кейсів через редактор SIMDEC", content: b64encode(dataFileText()), sha: r.body.sha, branch: gh.branch })
      });
    }).then(function (r) {
      if (!r || r.status === undefined) return;
      if (r.status !== 200 && r.status !== 201) throw r;
      PUBLISHED = JSON.stringify(data); PUB_HASH = hash(PUBLISHED); restoredDraft = false; staleDraft = null;
      try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(BASE_KEY); } catch (e) {}
      ghState.publishing = false; ghState.ok = true; ghState.msg = "Опубліковано. Сайт оновиться протягом 1–2 хвилин.";
      updateStatus(); renderSide(); if (sel.type === "publish") renderMain();
      toast("Опубліковано. Сайт оновиться за 1–2 хвилини.");
    }).catch(function (err) {
      ghState.publishing = false;
      if (err && err.cancelled) { ghState.msg = ""; renderMain(); return; }
      ghState.ok = false;
      ghState.msg = err && err.status === 401 ? "Ключ недійсний або прострочений. Вийдіть і введіть новий." :
        err && err.status === 409 ? "Файл на сайті щойно змінився. Натисніть «Опублікувати» ще раз." :
        err && err.status ? "Не вдалося опублікувати (помилка GitHub " + err.status + ")." : "Немає зв'язку з GitHub. Перевірте інтернет.";
      select({ type: "publish" });
    });
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "tplDownload") downloadText("Шаблон кейсу SIMDEC.txt", TEMPLATE_TEXT);
    if (act === "importParse") { importState.text = document.getElementById("importText").value; importState.parsed = parseCasesText(importState.text, importState.mi); renderMain(); }
    if (act === "importAdd" && importState.parsed) {
      var last = null;
      importState.parsed.items.forEach(function (it) { data.models[it.mi].cases.push(it.kase); last = { type: "case", mi: it.mi, ci: data.models[it.mi].cases.length - 1 }; });
      var n = importState.parsed.items.length;
      importState = { text: "", parsed: null, mi: importState.mi };
      changed(); select(last); toast("Додано " + n + " " + plural(n, "кейс", "кейси", "кейсів") + ". Не забудьте опублікувати.");
    }
    if (act === "cText") {
      var m = data.models[sel.mi], c = m.cases[sel.ci];
      downloadText((c.title || "Кейс").replace(/[\\/:*?"<>|]/g, "").slice(0, 60) + ".txt", caseToText(m, c));
    }
    if (act === "ghSave") {
      gh.owner = document.getElementById("ghOwner").value.trim(); gh.repo = document.getElementById("ghRepo").value.trim();
      gh.branch = document.getElementById("ghBranch").value.trim() || "main"; gh.token = document.getElementById("ghToken").value.trim();
      if (!gh.token) { ghState.ok = false; ghState.msg = "Вставте ключ доступу."; renderMain(); return; }
      ghCheck().then(function (ok) {
        if (ok) { try { localStorage.setItem(GH_KEY, JSON.stringify(gh)); } catch (e2) {} renderMain(); }
        else { gh.token = ""; renderMain(); }
      });
    }
    if (act === "ghCheck") ghCheck();
    if (act === "ghForget") {
      gh.token = ""; try { localStorage.removeItem(GH_KEY); } catch (e3) {}
      ghState = { ok: null, msg: "Ключ видалено з цього браузера.", publishing: false }; renderMain();
    }
    if (act === "ghPublish") ghPublish();
  });

  document.getElementById("btnPublish").addEventListener("click", function () {
    if (gh.token) ghPublish(); else select({ type: "publish" });
  });
  document.getElementById("btnTextImport").addEventListener("click", function () { select({ type: "import" }); });

  // для автоматичних перевірок
  window.__simdecEditor = { parse: function (t, mi) { return parseCasesText(t, mi); }, toText: caseToText, data: function () { return data; } };

  window.addEventListener("beforeunload", saveDraft);

  renderSide(); renderMain(); updateStatus();
})();
