/* Банки задач — задачи и учебники по темам.

   Сборки нет: страница читает data/banki.json и конспекты из
   data/uchebniki/. Их пишет скрипт выкладки в knowledge
   (.claude/meta/push-banki.py) из папок tutoring/bank/<тема>/; здесь
   всё только показывается. Устройство — как у сайта курса ВсОШ по ИИ:
   главная со списком, по строке — своя страница. Что показать, задаёт
   адрес:
     (пусто)                          главная: раздел на тему, в нём
                                      строки «Задачи» и «Учебники»
     #parametr                        вкладка «Задачи» темы
     #parametr/ommo                   задачи одного источника
     #parametr/ФТ-2026-в1-7           задачи, эта раскрыта, страница у неё
     #parametr/uchebniki              вкладка «Учебники»
     #parametr/uchebniki/<конспект>   конспект своей страницей
   Ссылка на задачу — её код в раскрытой карточке.
   Формулы — KaTeX, разметка — marked, как на «Лучезарности» и сайте курса:
   формулы вынимаются до разбора markdown, иначе подчёркивания в них marked
   принял бы за курсив. */
(function () {
  "use strict";

  var DATA = null;
  var BOOKS = "uchebniki";
  var state = { page: "main", bank: null, src: null, task: null, book: null };

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

  function booksOf(b) { return b.uchebniki || []; }

  function hasCode(b, code) {
    return b.sources.some(function (s) {
      return s.entries.some(function (e) { return e.code === code; });
    });
  }

  /* ── адрес ─────────────────────────────────────────────── */
  function parseHash() {
    var raw = location.hash.replace(/^#/, "");
    var segs = raw ? raw.split("/").map(function (s) {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    }) : [];
    var st = { page: "main", bank: null, src: null, task: null, book: null };
    if (!segs.length) return st;
    var b = bankById(segs[0]);
    if (!b) {
      /* голый код, «#ФТ-2026-в1-7»: ищем, в каком он банке */
      b = DATA.banki.filter(function (x) { return hasCode(x, segs[0]); })[0];
      if (!b) return st;
      st.task = segs[0];
    }
    st.bank = b.id;
    if (segs[1] === BOOKS || !b.sources.length) {
      var slug = segs[1] === BOOKS ? segs[2] : null;
      var known = booksOf(b).some(function (u) { return u.slug === slug; });
      st.page = known ? "book" : "books";
      st.book = known ? slug : null;
      st.task = null;
      return st;
    }
    st.page = "tasks";
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
    if (!st.bank || st.page === "main") return "";
    if (st.page === "books") return "#" + st.bank + "/" + BOOKS;
    if (st.page === "book") return "#" + st.bank + "/" + BOOKS + "/" + st.book;
    return "#" + st.bank +
      (st.src ? "/" + st.src : "") +
      (st.task ? "/" + encodeURIComponent(st.task) : "");
  }

  function setHash() {
    var h = hashOf(state);
    if (location.hash === h || (!h && !location.hash)) return;
    history.replaceState(null, "", h || location.pathname + location.search);
  }

  /* ── общие куски ───────────────────────────────────────── */
  function blockHead(title, count) {
    var head = el("div", "block-head");
    head.appendChild(el("h2", null, title));
    if (count != null) head.appendChild(el("span", "block-count", String(count)));
    return head;
  }

  /* Строка главной и списка учебников — как на сайте курса: точка
     на месте миниатюры, название, под ним подпись. Ведёт на страницу
     сайта, в той же вкладке. */
  function row(href, title, sub) {
    var a = el("a", "row");
    a.href = href;
    a.appendChild(el("span", "nothumb"));
    var label = el("span", "row-label");
    label.appendChild(el("span", "row-title", title));
    if (sub) label.appendChild(el("span", "row-sub", sub));
    else a.classList.add("row-one");
    a.appendChild(label);
    return a;
  }

  /* Дорога назад — пилюля с шевроном влево, как «Все материалы»
     на странице задачников сайта курса: логотипы ведь не ссылки. */
  function back(href, text) {
    var a = el("a", "pill pill-sm back");
    a.href = href;
    var chev = el("span", "back-chev");
    chev.setAttribute("aria-hidden", "true");
    a.appendChild(chev);
    a.appendChild(el("span", null, text));
    return a;
  }

  function tasksSub(b) {
    var k = b.sources.length;
    return b.n + " " + plural(b.n, "задача", "задачи", "задач") + " · " +
      k + " " + plural(k, "источник", "источника", "источников");
  }

  function booksSub(b) {
    var k = booksOf(b).length;
    return k + " " + plural(k, "конспект", "конспекта", "конспектов");
  }

  /* ── главная ───────────────────────────────────────────── */

  /* Раздел на тему: плашка с её именем (поле razdel README папки,
     «Параметры»), под ней лист с двумя строками — задачи и учебники.
     Чего у темы нет, той строки и нет. */
  function renderMain(main) {
    document.title = "Банки задач";
    DATA.banki.forEach(function (b) {
      var sec = el("section", "block");
      sec.appendChild(blockHead(b.razdel || b.title));
      var stack = el("div", "stack");
      var panel = el("div", "panel");
      if (b.sources.length) panel.appendChild(row("#" + b.id, "Задачи", tasksSub(b)));
      if (booksOf(b).length) panel.appendChild(row("#" + b.id + "/" + BOOKS, "Учебники", booksSub(b)));
      stack.appendChild(panel);
      sec.appendChild(stack);
      main.appendChild(sec);
    });
  }

  /* Шапка темы: назад на главную и вкладки «Задачи» и «Учебники» —
     пилюлями, как переключатель задачников на сайте курса. Вкладка
     одна — переключателя нет. */
  function themeHead(main, b, tab) {
    main.appendChild(back("#", "Все темы"));
    if (!b.sources.length || !booksOf(b).length) return;
    var nav = el("nav", "trail-switch");
    nav.setAttribute("aria-label", b.razdel || b.title);
    [["tasks", "Задачи", b.n, "#" + b.id],
     ["books", "Учебники", booksOf(b).length, "#" + b.id + "/" + BOOKS]].forEach(function (t) {
      var a = el("a", "pill");
      a.href = t[3];
      a.appendChild(el("span", null, t[1]));
      a.appendChild(el("span", "pill-count", String(t[2])));
      if (t[0] === tab) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    main.appendChild(nav);
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
    code.href = hashOf({ page: "tasks", bank: b.id, task: e.code });
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
      var r = el("div");
      r.appendChild(el("dt", null, k));
      var dd = el("dd");
      fill(dd);
      r.appendChild(dd);
      info.appendChild(r);
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

  /* ── вкладка «Задачи» ──────────────────────────────────── */
  var filter = null;

  function renderTasks(main, b) {
    document.title = (b.razdel || b.title) + " · Задачи · Банки задач";
    themeHead(main, b, "tasks");

    var sec = el("section", "block");
    sec.appendChild(blockHead(b.title, b.n));
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
      var sp = el("section", "bz-sec");
      var head = el("div", "src-head");
      head.appendChild(el("h3", null, s.name));
      head.appendChild(el("span", "src-meta",
        srcCount(s) + (s.gody && s.gody !== "—" ? " · " + s.gody : "")));
      sp.appendChild(head);
      if (s.head) sp.appendChild(about(b, s));
      var grp = null;
      s.entries.forEach(function (e) {
        if (e.group !== grp) {
          grp = e.group;
          if (grp) sp.appendChild(el("h4", "bz-grp", grp));
        }
        sp.appendChild(card(b, s, e));
      });
      stack.appendChild(sp);
      return { node: sp, slug: s.slug };
    });
    sec.appendChild(stack);
    main.appendChild(sec);

    function apply() {
      buttons.forEach(function (x) { x.b.setAttribute("aria-pressed", String(state.src === x.value)); });
      secs.forEach(function (p) { p.node.hidden = state.src !== null && p.slug !== state.src; });
    }
    filter = apply;
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

  /* ── вкладка «Учебники» и конспект ─────────────────────── */

  /* Список конспектов: строка — название конспекта, под ним учебник. */
  function renderBooks(main, b) {
    document.title = (b.razdel || b.title) + " · Учебники · Банки задач";
    themeHead(main, b, "books");
    var books = booksOf(b);
    var sec = el("section", "block");
    sec.appendChild(blockHead("Учебники", books.length));
    var stack = el("div", "stack");
    if (books.length) {
      var panel = el("div", "panel");
      books.forEach(function (u) {
        panel.appendChild(row("#" + b.id + "/" + BOOKS + "/" + u.slug, u.title, u.istochnik));
      });
      stack.appendChild(panel);
    } else {
      stack.appendChild(el("div", "empty", "Учебников пока нет."));
    }
    sec.appendChild(stack);
    main.appendChild(sec);
  }

  /* Конспект — лист, как заметка на «Лучезарности»: название на платиновой
     плашке во всю ширину листа, под ним учебник тихой строкой, разделы —
     главами. Markdown показывается как есть; формулы верстаются разом —
     конспект читают целиком, а не листают. */
  function renderBook(main, b, slug) {
    var u = booksOf(b).filter(function (x) { return x.slug === slug; })[0];
    document.title = u.title + " · Банки задач";
    main.appendChild(back("#" + b.id + "/" + BOOKS, "Учебники"));
    var sheet = el("article", "note");
    var skel = el("div", "skeleton");
    skel.setAttribute("aria-hidden", "true");
    ["skel-head", "skel-row", "skel-row"].forEach(function (c) { skel.appendChild(el("span", c)); });
    sheet.appendChild(skel);
    main.appendChild(sheet);
    fetch(u.file, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
      .then(function (text) {
        if (state.page !== "book" || state.book !== slug) return;
        var body = md(text, "note-body");
        var h1 = body.querySelector("h1");
        if (!h1) {
          h1 = el("h1", null, u.title);
          body.insertBefore(h1, body.firstChild);
        }
        if (u.istochnik) h1.parentNode.insertBefore(el("p", "note-src", u.istochnik), h1.nextSibling);
        sheet.textContent = "";
        while (body.firstChild) sheet.appendChild(body.firstChild);
        typeset(sheet);
      })
      .catch(function () {
        sheet.textContent = "";
        sheet.appendChild(el("h1", null, u.title));
        sheet.appendChild(el("p", "empty", "Конспект не загрузился. Обновите страницу."));
      });
  }

  /* ── маршрут ───────────────────────────────────────────── */
  var shown = null;

  function route() {
    var prev = shown;
    state = parseHash();
    setHash();
    var key = state.page + ":" + state.bank + ":" + (state.book || "");
    if (state.page === "tasks" && prev === key && filter) {
      filter();
    } else {
      var main = document.getElementById("main");
      main.textContent = "";
      filter = null;
      var b = state.bank ? bankById(state.bank) : null;
      if (state.page === "main") renderMain(main);
      else if (state.page === "tasks") renderTasks(main, b);
      else if (state.page === "books") renderBooks(main, b);
      else renderBook(main, b, state.book);
      if (!state.task) window.scrollTo(0, 0);
    }
    shown = key;
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
