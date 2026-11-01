/* Банки задач — задачи одной темы из многих источников, банк за раз.

   Сборки нет: страница читает data/banki.json. Его пишет скрипт выкладки
   в knowledge (.claude/meta/push-banki.py) из файлов банка
   tutoring/bank/<тема>/, файл на источник; здесь он только показывается.
   Что показать, задаёт адрес — банк и после косых черт источник или
   задача:
     #parametr                банк
     #parametr/ommo           только один источник
     #parametr/ФТ-2026-в1-7   весь банк, задача раскрыта, страница у неё
   Ссылка на задачу — её код в раскрытой карточке.
   Формулы — KaTeX, разметка — marked, как на «Лучезарности» и сайте курса:
   формулы вынимаются до разбора markdown, иначе подчёркивания в них marked
   принял бы за курсив. */
(function () {
  "use strict";

  var DATA = null;
  var state = { bank: null, src: null, task: null };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ── markdown с формулами ──────────────────────────────── */
  function splitCode(src) {
    return src.split(/(```[\s\S]*?```|`[^`\n]*`)/);
  }

  function attr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* Формула уходит в атрибут пустого span: внутри тега marked её
     не трогает. Текстом span заполняется уже после разбора. */
  function extractMath(text) {
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, tex) {
      return '<span class="math" data-d="1" data-tex="' + attr(tex) + '"></span>';
    });
    return text.replace(/\$([^\$\n]+?)\$/g, function (_, tex) {
      return '<span class="math" data-tex="' + attr(tex) + '"></span>';
    });
  }

  /* Пока карточка далеко от экрана, формула лежит исходником, «$…$»:
     так её находит поиск браузера по странице. KaTeX верстает её, когда
     карточка подъезжает к экрану (см. later): 1500 формул разом —
     секунды на телефоне и десятки тысяч узлов страницы. */
  function rawMath(host) {
    host.querySelectorAll("span.math").forEach(function (node) {
      var d = node.dataset.d ? "$$" : "$";
      node.textContent = d + node.dataset.tex + d;
    });
  }

  function typeset(root) {
    if (!window.katex) return;
    root.querySelectorAll("span.math:not(.done)").forEach(function (node) {
      node.classList.add("done");
      try {
        window.katex.render(node.dataset.tex, node,
          { displayMode: !!node.dataset.d, throwOnError: false });
      } catch (e) { /* остаётся исходник */ }
    });
  }

  var watcher = "IntersectionObserver" in window ? new IntersectionObserver(function (list) {
    list.forEach(function (en) {
      if (!en.isIntersecting) return;
      typeset(en.target);
      watcher.unobserve(en.target);
    });
  }, { rootMargin: "1500px 0px" }) : null;

  function later(node) {
    if (watcher) watcher.observe(node);
    else typeset(node);
  }

  function prepare(src) {
    var parts = splitCode(src);
    for (var i = 0; i < parts.length; i += 2) parts[i] = extractMath(parts[i]);
    return parts.join("");
  }

  function md(src, cls) {
    var host = el("div", cls || "md");
    if (!window.marked) {
      host.appendChild(el("pre", "md-raw", src));
      return host;
    }
    host.innerHTML = window.marked.parse(prepare(src), { gfm: true, breaks: false });
    rawMath(host);
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
    host.innerHTML = window.marked.parseInline(prepare(src.replace(/\n/g, " ")), { gfm: true });
    rawMath(host);
  }

  /* ── данные ─────────────────────────────────────────────── */
  function bankById(id) {
    return DATA.banki.filter(function (x) { return x.id === id; })[0];
  }

  function hasCode(b, code) {
    return b.sources.some(function (s) {
      return s.entries.some(function (e) { return e.code === code; });
    });
  }

  /* ── адрес ─────────────────────────────────────────────── */
  function parseHash() {
    var segs = location.hash.replace(/^#/, "").split("/").map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    var st = { bank: null, src: null, task: null };
    var b = bankById(segs[0]);
    if (!b) {
      /* голый код, «#ФТ-2026-в1-7»: ищем, в каком он банке */
      b = DATA.banki.filter(function (x) { return hasCode(x, segs[0]); })[0];
      if (b) st.task = segs[0];
      else b = DATA.banki[0];
    }
    st.bank = b.id;
    var slugs = b.sources.map(function (s) { return s.slug; });
    segs.slice(1).forEach(function (s) {
      if (!s) return;
      if (slugs.indexOf(s) >= 0) st.src = s;
      else if (hasCode(b, s)) st.task = s;
    });
    /* Задачу по ссылке показываем при любом фильтре: его снимаем. */
    if (st.task) st.src = null;
    return st;
  }

  function hashOf(st) {
    return "#" + st.bank +
      (st.src ? "/" + st.src : "") +
      (st.task ? "/" + encodeURIComponent(st.task) : "");
  }

  function setHash() {
    var h = hashOf(state);
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  /* ── карточка задачи ───────────────────────────────────────

     В покое — только условие в рамке: банк листают, чтобы собрать
     подборку, и всё лишнее между условиями мешает. Нажатие на условие
     раскрывает остальное: код со ссылкой и источник, ответ, пару,
     решение, справку. Раскрытая часть собирается при первом нажатии.
     «Проверка» и «Теги» — рабочая кухня банка, в справку не идут. */
  var HIDE = ["Проверка", "Теги"];

  /* Свёрнутая строка внутри раскрытой карточки: подпись, рядом тихая
     пометка, справа шеврон. */
  function fold(label, note) {
    var box = el("details", "bz-part bz-sol");
    var head = el("summary", "bz-sol-head");
    var name = el("span", "bz-sol-name");
    name.appendChild(el("span", "bz-label", label));
    if (note) name.appendChild(note);
    head.appendChild(name);
    head.appendChild(el("span", "chev"));
    box.appendChild(head);
    return box;
  }

  function part(label, text) {
    var box = el("div", "bz-part");
    box.appendChild(el("div", "bz-label", label));
    box.appendChild(md(text, "md bz-text"));
    return box;
  }

  function folded(label, text) {
    var box = fold(label);
    var body = md(text, "md bz-text");
    box.appendChild(body);
    box.addEventListener("toggle", function () { if (box.open) typeset(body); });
    return box;
  }

  /* Решение — последнее поле записи: первая строка — откуда оно, дальше
     текст. Свёрнуто и в раскрытой карточке: решение длинное и читается
     не всегда. Нет текста — «официального решения нет» — строкой. */
  function solution(v) {
    var cut = v.search(/\n\s*\n/);
    var otkuda = cut >= 0 ? v.slice(0, cut) : v;
    var text = cut >= 0 ? v.slice(cut).trim() : "";
    var src = el("span", "bz-sol-src");
    mdLine(otkuda, src);
    if (!text) {
      var line = el("div", "bz-part");
      line.appendChild(el("div", "bz-label", "Решение"));
      line.appendChild(src);
      return line;
    }
    var box = fold("Решение", src);
    var body = null;
    box.addEventListener("toggle", function () {
      if (box.open && !body) {
        body = md(text, "md bz-text");
        box.appendChild(body);
        typeset(body);
      }
    });
    return box;
  }

  /* Раскрытая часть: код и источник, ответ открыто, пара и решение
     свёрнутыми строками, справка тихим кеглем. */
  function more(b, s, e) {
    var box = el("div", "bz-more");
    var top = el("div", "bz-top");
    var code = el("a", "bz-code", e.code);
    code.href = hashOf({ bank: b.id, task: e.code });
    code.title = "Ссылка на эту задачу";
    top.appendChild(code);
    top.appendChild(el("span", "bz-src", s.name));
    box.appendChild(top);
    var pole = {};
    e.pole.forEach(function (p) { pole[p[0]] = p[1]; });
    if (pole["Ответ"]) box.appendChild(part("Ответ", pole["Ответ"]));
    if (pole["Пара"]) box.appendChild(folded("Пара", pole["Пара"]));
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
      var k = p[0];
      if (k === "Ответ" || k === "Пара" || k === "Решение" || HIDE.indexOf(k) >= 0) return;
      line(k, function (dd) { mdLine(p[1], dd); });
    });
    if (e.note) line("Примечание", function (dd) { dd.appendChild(md(e.note)); });
    if (info.children.length) box.appendChild(info);
    return box;
  }

  function card(b, s, e) {
    var box = el("article", "bz");
    box.id = e.code;
    var cond = md(e.cond, "md bz-text bz-cond");
    cond.tabIndex = 0;
    cond.setAttribute("role", "button");
    cond.setAttribute("aria-expanded", "false");
    box.appendChild(cond);
    var extra = null;
    function toggle(open) {
      if (open && !extra) {
        extra = more(b, s, e);
        box.appendChild(extra);
        typeset(extra);
      }
      box.classList.toggle("open", open);
      if (extra) extra.hidden = !open;
      cond.setAttribute("aria-expanded", String(open));
    }
    cond.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) return;
      /* Протянули мышью, чтобы скопировать условие, — это не нажатие. */
      if (window.getSelection && String(window.getSelection())) return;
      toggle(!box.classList.contains("open"));
    });
    cond.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      toggle(!box.classList.contains("open"));
    });
    box.expand = function () { toggle(true); };
    later(box);
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
      typeset(body);
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

  /* Счёт источника: «Пара» — вторая задача той же записи, поэтому задач
     бывает больше, чем карточек. Тогда видно оба числа. */
  function srcCount(s) {
    var n = s.n, k = s.entries.length;
    var t = n + " " + plural(n, "задача", "задачи", "задач");
    if (n !== k) t += " в " + k + " " + (k % 10 === 1 && k % 100 !== 11 ? "записи" : "записях");
    return t;
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

  var view = null;

  function render() {
    var b = bankById(state.bank);
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
    var chips = el("div", "chips chips-src");
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
        state.task = null;
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
      var head = el("div", "src-head");
      head.appendChild(el("h3", null, s.name));
      head.appendChild(el("span", "src-meta",
        srcCount(s) + (s.gody && s.gody !== "—" ? " · " + s.gody : "")));
      part.appendChild(head);
      if (s.head) part.appendChild(about(b, s));
      var grp = null;
      s.entries.forEach(function (e) {
        if (e.group !== grp) {
          grp = e.group;
          if (grp) part.appendChild(el("h4", "bz-grp", grp));
        }
        part.appendChild(card(b, s, e));
      });
      stack.appendChild(part);
      return { node: part, slug: s.slug };
    });
    sec.appendChild(stack);
    main.appendChild(sec);

    function apply() {
      buttons.forEach(function (x) { x.b.setAttribute("aria-pressed", String(state.src === x.value)); });
      secs.forEach(function (p) { p.node.hidden = state.src !== null && p.slug !== state.src; });
    }
    view = { bank: b.id, apply: apply };
    apply();
  }

  /* Перед прыжком к задаче она раскрывается, а формулы карточек над ней
     верстаются сразу: иначе их сверстает наблюдатель уже после прокрутки,
     карточки подрастут, и задача уедет вниз из-под глаз. Двенадцать
     свёрнутых карточек перекрывают запас наблюдателя в 1500 точек. */
  function jump(code) {
    var target = document.getElementById(code);
    if (!target) return;
    target.expand();
    var all = [].slice.call(document.querySelectorAll(".bz-sec:not([hidden]) .bz"));
    var i = all.indexOf(target);
    for (var j = Math.max(0, i - 12); j <= i; j++) typeset(all[j]);
    target.scrollIntoView({ block: "start" });
  }

  function route() {
    state = parseHash();
    setHash();
    if (!view || view.bank !== state.bank || !document.querySelector(".bz-sec")) render();
    else view.apply();
    if (state.task) jump(state.task);
  }

  function fail(text) {
    var main = document.getElementById("main");
    main.textContent = "";
    main.appendChild(el("div", "empty", text));
  }

  /* Знак в шапке — кнопка: нажатие только запускает вспышку лучей, как
     на других сайтах. Класс снимается и ставится заново, чтобы вспышка
     повторялась и при нажатии подряд. */
  document.querySelectorAll(".znak-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.classList.remove("tap");
      void btn.offsetWidth;
      btn.classList.add("tap");
    });
    btn.addEventListener("animationend", function () {
      btn.classList.remove("tap");
    });
  });

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
