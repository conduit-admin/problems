/* Банки задач — задачи одной темы из многих источников, банк за раз.

   Сборки нет: страница читает data/banki.json. Его пишет скрипт выкладки
   в knowledge (.claude/meta/push-banki.py) из файлов банка
   tutoring/bank/<тема>/, файл на источник; здесь он только показывается.
   Что показать, задаёт адрес:
     #parametr        банк
     #parametr/ommo   банк, только один источник
   Фильтр пока один — по источнику: остальные владелец задаст сам.
   Формулы — KaTeX, разметка — marked, как на «Лучезарности» и сайте курса:
   формулы вынимаются до разбора markdown, иначе подчёркивания в них marked
   принял бы за курсив. */
(function () {
  "use strict";

  var DATA = null;
  var state = { bank: null, src: null };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ── markdown с формулами ──────────────────────────────── */
  function splitCode(src) {
    return src.split(/(```[\s\S]*?```|`[^`\n]*`)/);
  }

  function extractMath(text, store) {
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, tex) {
      store.push({ tex: tex, display: true });
      return '<span class="math" data-i="' + (store.length - 1) + '"></span>';
    });
    return text.replace(/\$([^\$\n]+?)\$/g, function (_, tex) {
      store.push({ tex: tex, display: false });
      return '<span class="math" data-i="' + (store.length - 1) + '"></span>';
    });
  }

  function renderMath(host, math) {
    host.querySelectorAll("span.math").forEach(function (node) {
      var m = math[+node.dataset.i];
      if (!window.katex) {
        node.textContent = (m.display ? "$$" : "$") + m.tex + (m.display ? "$$" : "$");
        return;
      }
      try {
        window.katex.render(m.tex, node, { displayMode: m.display, throwOnError: false });
      } catch (e) {
        node.textContent = "$" + m.tex + "$";
      }
    });
  }

  function prepare(src) {
    var math = [];
    var parts = splitCode(src);
    for (var i = 0; i < parts.length; i += 2) parts[i] = extractMath(parts[i], math);
    return { text: parts.join(""), math: math };
  }

  function md(src, cls) {
    var host = el("div", cls || "md");
    if (!window.marked) {
      host.appendChild(el("pre", "md-raw", src));
      return host;
    }
    var p = prepare(src);
    host.innerHTML = window.marked.parse(p.text, { gfm: true, breaks: false });
    renderMath(host, p.math);
    host.querySelectorAll("table").forEach(function (t) {
      var wrap = el("div", "tbl");
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
    host.querySelectorAll("a[href^='http']").forEach(function (a) {
      a.target = "_blank";
      a.rel = "noopener";
    });
    return host;
  }

  /* Одна строка без абзаца вокруг — для справки внизу карточки. */
  function mdLine(src, host) {
    if (!window.marked) { host.textContent = src; return; }
    var p = prepare(src.replace(/\n/g, " "));
    host.innerHTML = window.marked.parseInline(p.text, { gfm: true });
    renderMath(host, p.math);
  }

  /* ── адрес ─────────────────────────────────────────────── */
  function parseHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var slash = h.indexOf("/");
    var bank = slash >= 0 ? h.slice(0, slash) : h;
    var src = slash >= 0 ? h.slice(slash + 1) : null;
    var b = DATA.banki.filter(function (x) { return x.id === bank; })[0] || DATA.banki[0];
    var known = b.sources.map(function (s) { return s.slug; });
    return { bank: b.id, src: known.indexOf(src) >= 0 ? src : null };
  }

  function setHash() {
    var h = "#" + state.bank + (state.src ? "/" + state.src : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  /* ── карточка задачи ───────────────────────────────────────

     Условие видно сразу: банк читают глазами, а не ищут в нём по номеру.
     Ответ и пара — под чертой, справка — тихим кеглем внизу, в порядке
     полей файла. */
  var OWN = ["Ответ", "Пара"];

  /* Решение — последнее поле записи: первая строка — откуда оно, дальше
     текст. Свёрнуто: решение длинное и читается не всегда, а раскрытое
     сразу закрыло бы условия соседних задач. Текст рисуется при первом
     раскрытии. Нет текста — «официального решения нет» — строкой. */
  function solution(v) {
    var cut = v.search(/\n\s*\n/);
    var otkuda = cut >= 0 ? v.slice(0, cut) : v;
    var text = cut >= 0 ? v.slice(cut).trim() : "";
    if (!text) {
      var part = el("div", "bz-part");
      part.appendChild(el("div", "bz-label", "Решение"));
      var line = el("div", "bz-sol-src");
      mdLine(otkuda, line);
      part.appendChild(line);
      return part;
    }
    var box = el("details", "bz-part bz-sol");
    var head = el("summary", "bz-sol-head");
    var name = el("span", "bz-sol-name");
    name.appendChild(el("span", "bz-label", "Решение"));
    var src = el("span", "bz-sol-src");
    mdLine(otkuda, src);
    name.appendChild(src);
    head.appendChild(name);
    head.appendChild(el("span", "chev"));
    box.appendChild(head);
    var body = null;
    box.addEventListener("toggle", function () {
      if (box.open && !body) {
        body = md(text, "md bz-text");
        box.appendChild(body);
      }
    });
    return box;
  }

  function card(s, e) {
    var box = el("article", "bz");
    box.id = e.code;
    var top = el("div", "bz-top");
    top.appendChild(el("span", "bz-code", e.code));
    top.appendChild(el("span", "bz-src", s.name));
    box.appendChild(top);
    box.appendChild(md(e.cond, "md bz-text"));
    var pole = {};
    e.pole.forEach(function (p) { pole[p[0]] = p[1]; });
    OWN.forEach(function (k) {
      if (!pole[k]) return;
      var part = el("div", "bz-part");
      part.appendChild(el("div", "bz-label", k));
      part.appendChild(md(pole[k], "md bz-text"));
      box.appendChild(part);
    });
    if (pole["Решение"]) box.appendChild(solution(pole["Решение"]));
    var info = el("dl", "bz-meta");
    function line(k, fill) {
      var row = el("div");
      row.appendChild(el("dt", null, k));
      var dd = el("dd");
      fill(dd);
      row.appendChild(dd);
      info.appendChild(row);
    }
    e.pole.forEach(function (p) {
      if (OWN.indexOf(p[0]) < 0 && p[0] !== "Решение") line(p[0], function (dd) { mdLine(p[1], dd); });
    });
    if (e.note) line("Примечание", function (dd) { dd.appendChild(md(e.note)); });
    box.appendChild(info);
    return box;
  }

  /* Охват и оговорки источника — шапка его файла, свёрнутым листом:
     годы, пропуски, сомнительные места. */
  function about(b, s) {
    var box = el("details", "set");
    var id = "open:o:" + b.id + ":" + s.slug;
    try { box.open = localStorage.getItem(id) === "1"; } catch (e) { /* ничего */ }
    var head = el("summary", "set-head");
    var name = el("span", "set-label");
    name.appendChild(el("span", "set-title", "Охват и оговорки"));
    head.appendChild(name);
    head.appendChild(el("span", "chev"));
    box.appendChild(head);
    var body = null;
    function fill() {
      if (body) return;
      body = md(s.head, "md bz-about");
      box.appendChild(body);
    }
    if (box.open) fill();
    box.addEventListener("toggle", function () {
      if (box.open) fill();
      try {
        if (box.open) localStorage.setItem(id, "1");
        else localStorage.removeItem(id);
      } catch (e) { /* ничего */ }
    });
    return box;
  }

  /* Переключатель банков — только если их больше одного. */
  function switcher() {
    var nav = el("nav", "trail-switch");
    nav.setAttribute("aria-label", "Банки");
    DATA.banki.forEach(function (b) {
      var a = el("a", "pill");
      a.href = "#" + b.id;
      a.appendChild(el("span", null, b.title));
      a.appendChild(el("span", "pill-count", String(b.n)));
      if (b.id === state.bank) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    return nav;
  }

  function render() {
    var b = DATA.banki.filter(function (x) { return x.id === state.bank; })[0];
    var main = document.getElementById("main");
    main.textContent = "";
    document.title = b.title + " · Банки задач";
    if (DATA.banki.length > 1) main.appendChild(switcher());

    var sec = el("section", "block");
    var plate = el("div", "block-head");
    plate.appendChild(el("h2", null, b.title));
    plate.appendChild(el("span", "block-count", String(b.n)));
    sec.appendChild(plate);
    var stack = el("div", "stack");

    /* Пилюли источников: один выбран или ни одного, число — задач в нём. */
    var chips = el("div", "chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Источник");
    var buttons = [];
    function chip(label, n, value) {
      var btn = el("button", "pill pill-sm");
      btn.type = "button";
      btn.appendChild(el("span", null, label));
      btn.appendChild(el("span", "pill-count", String(n)));
      btn.addEventListener("click", function () {
        state.src = state.src === value ? null : value;
        setHash();
        apply();
      });
      buttons.push({ b: btn, value: value });
      chips.appendChild(btn);
    }
    chip("все", b.n, null);
    b.sources.forEach(function (s) { chip(s.name, s.n, s.slug); });
    stack.appendChild(chips);

    var secs = b.sources.map(function (s) {
      var part = el("section", "bz-sec");
      part.dataset.src = s.slug;
      var head = el("div", "src-head");
      head.appendChild(el("h3", null, s.name));
      var meta = String(s.n) + (s.gody && s.gody !== "—" ? " · " + s.gody : "");
      head.appendChild(el("span", "src-meta", meta));
      part.appendChild(head);
      if (s.head) part.appendChild(about(b, s));
      var grp = null;
      s.entries.forEach(function (e) {
        if (e.group !== grp) {
          grp = e.group;
          if (grp) part.appendChild(el("h4", "bz-grp", grp));
        }
        part.appendChild(card(s, e));
      });
      stack.appendChild(part);
      return part;
    });
    sec.appendChild(stack);
    main.appendChild(sec);

    function apply() {
      buttons.forEach(function (x) { x.b.setAttribute("aria-pressed", String(state.src === x.value)); });
      secs.forEach(function (p) { p.hidden = state.src !== null && p.dataset.src !== state.src; });
    }
    apply();
  }

  function route() {
    var st = parseHash();
    var bankChanged = st.bank !== state.bank;
    state = st;
    setHash();
    if (bankChanged || !document.querySelector(".bz-sec")) render();
    else {
      document.querySelectorAll(".chips .pill").forEach(function (btn, i) {
        var b = DATA.banki.filter(function (x) { return x.id === state.bank; })[0];
        var value = i === 0 ? null : b.sources[i - 1].slug;
        btn.setAttribute("aria-pressed", String(state.src === value));
      });
      document.querySelectorAll(".bz-sec").forEach(function (p) {
        p.hidden = state.src !== null && p.dataset.src !== state.src;
      });
    }
  }

  function fail(text) {
    var main = document.getElementById("main");
    main.textContent = "";
    main.appendChild(el("div", "empty", text));
  }

  fetch("data/banki.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (d) {
      DATA = d;
      if (!DATA.banki || !DATA.banki.length) return fail("Банков пока нет.");
      route();
      window.addEventListener("hashchange", route);
    })
    .catch(function () { fail("Банки не загрузились."); });
})();
