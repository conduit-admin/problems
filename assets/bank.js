/* Банки задач — задачи и учебники по темам.

   Сборки нет: страница читает data/banki.json и файлы из data/uchebniki/ —
   конспекты и задачи книг. Их пишет скрипт выкладки в knowledge
   (.claude/meta/push-banki.py) из папок tutoring/bank/<тема>/; здесь всё
   только показывается. Устройство — как у сайта курса ВсОШ по ИИ:
   главная со списком, по строке — своя страница. Что показать, задаёт
   адрес:
     (пусто)                          главная: раздел на тему, в нём
                                      строки вкладок темы
     #parametr                        «Задачи» — олимпиады, с метками
     #parametr/ommo                   задачи одного источника
     #parametr/Техника:Виет           фильтр по меткам: «тип:метка», меток
                                      может быть несколько, видны задачи
                                      со всеми; «/решающая» — искать
                                      метки только как решающие
     #parametr/ФТ-2026-в1-7           задачи, эта раскрыта, страница у неё
     #parametr/metki                  реестр меток
     #parametr/drugie                 «Другие источники»: не олимпиады,
                                      дальше — источник или код, как выше
     #parametr/uchebniki              «Учебники»
     #parametr/uchebniki/<конспект>   конспект своей страницей
     #parametr/uchebniki/<конспект>/zadachi[/код]   задачи этой книги
   Голый код, «#ГПЯ-II.57», сам находит свою вкладку. Ссылка на задачу —
   её код в раскрытой карточке. Куда идёт источник, решает скрипт выкладки
   по полю vid файла банка: олимпиады — sources, книги — к конспекту,
   остальное — drugie.
   Формулы — KaTeX, разметка — marked, как на «Лучезарности» и сайте курса:
   формулы вынимаются до разбора markdown, иначе подчёркивания в них marked
   принял бы за курсив. */
(function () {
  "use strict";

  var DATA = null;
  var BOOKS = "uchebniki", METKI = "metki", DRUGIE = "drugie", ZADACHI = "zadachi";
  var MODE_R = "решающая";
  var state = blank();

  function blank() {
    return { page: "main", bank: null, src: null, task: null, book: null, labels: [], mode: "" };
  }

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

  function cnt(n, one, few, many) { return n + " " + plural(n, one, few, many); }

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

  /* Одна строка без абзаца вокруг — для справки внизу карточки и меток. */
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
  function drugieOf(b) { return b.drugie || []; }

  function bookBySlug(b, slug) {
    return booksOf(b).filter(function (u) { return u.slug === slug; })[0];
  }

  function sumN(list) { return list.reduce(function (a, s) { return a + s.n; }, 0); }

  function hasCode(list, code) {
    return list.some(function (s) {
      return s.entries.some(function (e) { return e.code === code; });
    });
  }

  function hasSlug(list, slug) {
    return list.some(function (s) { return s.slug === slug; });
  }

  /* Где в теме живёт источник или задача: вкладка и что на ней выбрать.
     Нужно голым кодам и старым ссылкам — до 08.11.2026 книги, ДВИ
     и problems.ru стояли в общем списке, «#parametr/gornshtein». */
  function where(b, seg) {
    if (hasSlug(b.sources, seg)) return { page: "tasks", src: seg };
    if (hasCode(b.sources, seg)) return { page: "tasks", task: seg };
    if (hasSlug(drugieOf(b), seg)) return { page: "drugie", src: seg };
    if (hasCode(drugieOf(b), seg)) return { page: "drugie", task: seg };
    var books = booksOf(b);
    for (var i = 0; i < books.length; i++) {
      var z = books[i].zadachi;
      if (!z) continue;
      if (z.slug === seg) return { page: "bookz", book: books[i].slug };
      if (z.kody.indexOf(seg) >= 0) return { page: "bookz", book: books[i].slug, task: seg };
    }
    return null;
  }

  /* ── метки ─────────────────────────────────────────────────

     У записи метки — [тип, метка, решающая 0/1]; типы и их порядок —
     поле tipy темы, из таблицы «Метки» README банка. Метка «Метода» —
     «Название — Книга раздел»: название крупно, ссылка тихо, а в реестре
     и в выборе такие метки ещё и разбиты по книгам. Что тип ссылочный,
     узнаётся по самим меткам, а не по его имени. */
  function keyOf(m) { return m[0] + ":" + m[1]; }

  function splitRef(text) {
    var i = text.lastIndexOf(" — ");
    if (i < 0) return { name: text, ref: "", book: "", rest: "" };
    var ref = text.slice(i + 3), sp = ref.indexOf(" ");
    return { name: text.slice(0, i), ref: ref,
             book: sp > 0 ? ref.slice(0, sp) : ref, rest: sp > 0 ? ref.slice(sp + 1) : "" };
  }

  function marks(e) {
    if (!e._mk) {
      e._mk = {};
      (e.metki || []).forEach(function (m) { e._mk[keyOf(m)] = m[2] ? 1 : 0; });
    }
    return e._mk;
  }

  function matches(e, sel, onlyR) {
    if (!sel.length) return true;
    var h = marks(e);
    return sel.every(function (k) { return k in h && (!onlyR || h[k]); });
  }

  /* Реестр списка источников: метки по типам, внутри — по частоте.
     Считается раз на список и запоминается на нём. */
  function registry(b, list) {
    if (list._reg) return list._reg;
    var map = {}, all = [];
    list.forEach(function (s) {
      s.entries.forEach(function (e) {
        (e.metki || []).forEach(function (m) {
          var k = keyOf(m), L = map[k];
          if (!L) {
            var p = splitRef(m[1]);
            L = map[k] = { key: k, t: m[0], text: m[1], name: p.name, ref: p.ref,
                           book: p.book, rest: p.rest, n: 0, nr: 0 };
            all.push(L);
          }
          L.n++;
          if (m[2]) L.nr++;
        });
      });
    });
    all.sort(function (x, y) {
      return y.n - x.n || y.nr - x.nr || x.name.localeCompare(y.name, "ru");
    });
    var order = (b.tipy || []).slice();
    all.forEach(function (L) { if (order.indexOf(L.t) < 0) order.push(L.t); });
    var types = [];
    order.forEach(function (t) {
      var ls = all.filter(function (L) { return L.t === t; });
      if (!ls.length) return;
      var groups = null;
      if (ls.some(function (L) { return L.ref; })) {
        var gm = {};
        groups = [];
        ls.forEach(function (L) {
          var g = gm[L.book];
          if (!g) { g = gm[L.book] = { book: L.book, labels: [], n: 0 }; groups.push(g); }
          g.labels.push(L);
          g.n += L.n;
        });
        groups.sort(function (x, y) { return y.n - x.n; });
      }
      types.push({ t: t, labels: ls, groups: groups });
    });
    list._reg = { map: map, all: all, types: types };
    return list._reg;
  }

  function groupsOf(T) { return T.groups || [{ book: "", labels: T.labels }]; }

  /* Подпись метки: название, у ссылочной рядом тихо книга с разделом —
     или один раздел, когда книга уже названа заголовком группы. */
  function labelText(host, L, short) {
    var nm = el("span", "mk-name");
    mdLine(L.name, nm);
    host.appendChild(nm);
    var ref = short ? L.rest : L.ref;
    if (ref) host.appendChild(el("span", "mk-ref", ref));
  }

  /* ── адрес ─────────────────────────────────────────────── */
  function dec(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function enc(s) { return encodeURIComponent(s); }

  function parseHash() {
    var raw = location.hash.replace(/^#/, "");
    var segs = raw ? raw.split("/").map(dec).filter(Boolean) : [];
    var st = blank();
    if (!segs.length) return st;
    var b = bankById(segs[0]), rest = segs.slice(1);
    if (!b) {
      /* голый код, «#ФТ-2026-в1-7»: ищем, в каком он банке */
      b = DATA.banki.filter(function (x) { return where(x, segs[0]); })[0];
      if (!b) return st;
      rest = [segs[0]];
    }
    st.bank = b.id;
    if (rest[0] === BOOKS) return bookState(st, b, rest);
    if (rest[0] === METKI && registry(b, b.sources).all.length) {
      st.page = "metki";
      return st;
    }
    var page = "tasks";
    if (rest[0] === DRUGIE && drugieOf(b).length) {
      page = "drugie";
      rest = rest.slice(1);
    } else if (!b.sources.length) {
      if (!drugieOf(b).length) { st.page = "books"; return st; }
      page = "drugie";
    }
    st.page = page;
    var reg = registry(b, page === "drugie" ? drugieOf(b) : b.sources).map;
    for (var i = 0; i < rest.length; i++) {
      var s = rest[i];
      if (s === MODE_R) { st.mode = "r"; continue; }
      if (reg[s]) {
        if (st.labels.indexOf(s) < 0) st.labels.push(s);
        continue;
      }
      var w = where(b, s);
      if (!w) continue;
      if (w.page !== page) {
        /* код или источник с другой вкладки — туда и ведём */
        var to = blank();
        to.bank = b.id;
        to.page = w.page;
        to.src = w.src || null;
        to.task = w.task || null;
        to.book = w.book || null;
        return to;
      }
      if (w.src) st.src = w.src;
      if (w.task) st.task = w.task;
    }
    /* Задачу по ссылке показываем при любом фильтре: его снимаем. */
    if (st.task) { st.src = null; st.labels = []; }
    return st;
  }

  function bookState(st, b, rest) {
    var u = bookBySlug(b, rest[1]);
    st.page = "books";
    if (!u) return st;
    st.book = u.slug;
    var t = rest[2], z = u.zadachi;
    if (z && t && t !== ZADACHI && z.kody.indexOf(t) >= 0) {
      st.page = "bookz";
      st.task = t;
    } else if (z && (t === ZADACHI || !u.file)) {
      st.page = "bookz";
    } else if (u.file) {
      st.page = "book";
    } else {
      st.book = null;
    }
    return st;
  }

  function hashOf(st) {
    if (!st.bank || st.page === "main") return "";
    var h = "#" + st.bank;
    if (st.page === "metki") return h + "/" + METKI;
    if (st.page === "books") return h + "/" + BOOKS;
    if (st.page === "book") return h + "/" + BOOKS + "/" + enc(st.book);
    if (st.page === "bookz") {
      return h + "/" + BOOKS + "/" + enc(st.book) + "/" + (st.task ? enc(st.task) : ZADACHI);
    }
    if (st.page === "drugie") h += "/" + DRUGIE;
    if (st.src) h += "/" + enc(st.src);
    (st.labels || []).forEach(function (k) { h += "/" + enc(k); });
    if (st.mode === "r") h += "/" + enc(MODE_R);
    if (st.task) h += "/" + enc(st.task);
    return h;
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

  function tasksSub(list) {
    return cnt(sumN(list), "задача", "задачи", "задач") + " · " +
      cnt(list.length, "источник", "источника", "источников");
  }

  function booksSub(b) {
    var ks = booksOf(b).filter(function (u) { return u.file; }).length;
    var zn = booksOf(b).reduce(function (a, u) { return a + (u.zadachi ? u.zadachi.n : 0); }, 0);
    var parts = [];
    if (ks) parts.push(cnt(ks, "конспект", "конспекта", "конспектов"));
    if (zn) parts.push(cnt(zn, "задача", "задачи", "задач"));
    return parts.join(" · ");
  }

  /* Вкладки темы — какие есть: олимпиады, реестр их меток, другие
     источники, учебники. */
  function tabsOf(b) {
    var t = [];
    if (b.sources.length) t.push(["tasks", "Задачи", b.n, "#" + b.id]);
    var reg = registry(b, b.sources);
    if (reg.all.length) t.push(["metki", "Метки", reg.all.length, "#" + b.id + "/" + METKI]);
    if (drugieOf(b).length) {
      t.push(["drugie", "Другие источники", sumN(drugieOf(b)), "#" + b.id + "/" + DRUGIE]);
    }
    if (booksOf(b).length) t.push(["books", "Учебники", booksOf(b).length, "#" + b.id + "/" + BOOKS]);
    return t;
  }

  function tabSub(b, tab) {
    if (tab === "tasks") return tasksSub(b.sources);
    if (tab === "drugie") return tasksSub(drugieOf(b));
    if (tab === "metki") {
      var r = registry(b, b.sources);
      return cnt(r.all.length, "метка", "метки", "меток") + " · " +
        cnt(r.types.length, "тип", "типа", "типов");
    }
    return booksSub(b);
  }

  /* Переключатель — пилюлями, как переключатель задачников на сайте
     курса; число — медальоном. */
  function switcher(label, tabs, cur) {
    var nav = el("nav", "trail-switch");
    nav.setAttribute("aria-label", label);
    tabs.forEach(function (t) {
      var a = el("a", "pill");
      a.href = t[3];
      a.appendChild(el("span", null, t[1]));
      if (t[2] != null) a.appendChild(el("span", "pill-count", String(t[2])));
      if (t[0] === cur) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    return nav;
  }

  /* ── главная ───────────────────────────────────────────── */

  /* Раздел на тему: плашка с её именем (поле razdel README папки,
     «Параметры»), под ней лист со строками вкладок. Чего у темы нет,
     той строки и нет. */
  function renderMain(main) {
    document.title = "Банки задач";
    DATA.banki.forEach(function (b) {
      var sec = el("section", "block");
      sec.appendChild(blockHead(b.razdel || b.title));
      var stack = el("div", "stack");
      var panel = el("div", "panel");
      tabsOf(b).forEach(function (t) { panel.appendChild(row(t[3], t[1], tabSub(b, t[0]))); });
      stack.appendChild(panel);
      sec.appendChild(stack);
      main.appendChild(sec);
    });
  }

  /* Шапка темы: назад на главную и вкладки. Вкладка одна —
     переключателя нет. */
  function themeHead(main, b, tab) {
    main.appendChild(back("#", "Все темы"));
    var tabs = tabsOf(b);
    if (tabs.length > 1) main.appendChild(switcher(b.razdel || b.title, tabs, tab));
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
     свёрнутыми строками, справка тихим кеглем. Метки в справке — по типу
     на строку, каждая кнопкой: нажатие добавляет её в фильтр списка.
     Решающая — жирным, как в банке. */
  function more(b, s, e, ctx) {
    var box = el("div", "bz-more");
    var top = el("div", "bz-top");
    var code = el("a", "bz-code", e.code);
    code.href = ctx.hrefOf(e.code);
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
    var byType = {}, order = [];
    (e.metki || []).forEach(function (m) {
      if (!byType[m[0]]) { byType[m[0]] = []; order.push(m[0]); }
      byType[m[0]].push(m);
    });
    var tipy = b.tipy || [];
    order.sort(function (x, y) { return tipy.indexOf(x) - tipy.indexOf(y); });
    order.forEach(function (t) {
      line(t, function (dd) {
        byType[t].forEach(function (m, i) {
          if (i) dd.appendChild(document.createTextNode("; "));
          var btn = el("button", "mk-link" + (m[2] ? " mk-r" : ""));
          btn.type = "button";
          btn.title = (m[2] ? "Решающая. " : "") + "Показать задачи с этой меткой";
          mdLine(m[1], btn);
          btn.addEventListener("click", function () { ctx.onLabel(keyOf(m), box); });
          dd.appendChild(btn);
        });
      });
    });
    if (e.note) line("Примечание", function (dd) { dd.appendChild(md(e.note)); });
    if (info.children.length) box.appendChild(info);
    return box;
  }

  function card(b, s, e, ctx) {
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
        extra = more(b, s, e, ctx);
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

  /* ── фильтр по меткам ──────────────────────────────────────

     Строка: кнопка «Метки» раскрывает выбор, рядом режим «любая /
     решающая». Под ней лист выбора — метки пилюлями по типам, ссылочные
     ещё и по книгам, — и выбранные метки чипами с крестиком. Метки
     складываются через «и»: видны задачи, где есть все выбранные
     (владелец, 08.11.2026). Число на пилюле — сколько задач останется,
     если её добавить; с нулём пилюля бледнеет и не нажимается, так что
     в пустой список не упрёшься. Лист выбора помнит, открыт ли он. */
  function toggleLabel(k) {
    var i = state.labels.indexOf(k);
    if (i >= 0) state.labels.splice(i, 1);
    else state.labels.push(k);
  }

  function labelFilter(stack, b, reg, changed) {
    var tools = el("div", "mk-tools");
    var open = el("button", "pill pill-sm mk-open");
    open.type = "button";
    open.appendChild(el("span", null, "Метки"));
    var selCount = el("span", "pill-count");
    open.appendChild(selCount);
    open.appendChild(el("span", "chev"));
    tools.appendChild(open);
    var seg = el("div", "seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Как искать метку");
    var modes = [["", "любая"], ["r", "решающая"]].map(function (m) {
      var btn = el("button", "seg-btn", m[1]);
      btn.type = "button";
      btn.title = m[0] ? "Метка — решающий шаг решения" : "Метка — любой шаг решения";
      btn.addEventListener("click", function () {
        if (state.mode === m[0]) return;
        state.mode = m[0];
        changed();
      });
      seg.appendChild(btn);
      return { b: btn, v: m[0] };
    });
    tools.appendChild(seg);
    stack.appendChild(tools);

    var sheet = el("div", "mk-sheet");
    var pills = [];
    reg.types.forEach(function (T) {
      var box = el("div", "mk-type");
      box.appendChild(el("div", "mk-type-name", T.t));
      groupsOf(T).forEach(function (g) {
        if (g.book) box.appendChild(el("div", "mk-book", g.book));
        var chips = el("div", "chips mk-chips");
        g.labels.forEach(function (L) {
          var btn = el("button", "pill pill-sm mk-pill");
          btn.type = "button";
          var txt = el("span", "mk-txt");
          labelText(txt, L, !!g.book);
          btn.appendChild(txt);
          var c = el("span", "pill-count");
          btn.appendChild(c);
          btn.addEventListener("click", function () { toggleLabel(L.key); changed(); });
          chips.appendChild(btn);
          pills.push({ b: btn, c: c, L: L });
        });
        box.appendChild(chips);
      });
      sheet.appendChild(box);
    });
    stack.appendChild(sheet);

    var active = el("div", "chips mk-active");
    stack.appendChild(active);

    var KEY = "open:mk:" + b.id;
    function setOpen(v) {
      sheet.hidden = !v;
      open.setAttribute("aria-expanded", String(v));
      if (v) typeset(sheet);
      try {
        if (v) localStorage.setItem(KEY, "1");
        else localStorage.removeItem(KEY);
      } catch (e) { /* ничего */ }
    }
    var was = false;
    try { was = localStorage.getItem(KEY) === "1"; } catch (e) { /* ничего */ }
    setOpen(was);
    open.addEventListener("click", function () { setOpen(sheet.hidden); });

    function chipOn(L, onClick, label) {
      var btn = el("button", "pill pill-sm mk-on");
      btn.type = "button";
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", label);
      var txt = el("span", "mk-txt");
      labelText(txt, L, false);
      btn.appendChild(txt);
      btn.appendChild(el("span", "mk-x", "×"));
      btn.addEventListener("click", onClick);
      return btn;
    }

    return function update(base) {
      var onlyR = state.mode === "r", n = {};
      base.forEach(function (rec) {
        var h = marks(rec.e);
        for (var k in h) if (!onlyR || h[k]) n[k] = (n[k] || 0) + 1;
      });
      pills.forEach(function (p) {
        var on = state.labels.indexOf(p.L.key) >= 0, c = n[p.L.key] || 0;
        p.b.setAttribute("aria-pressed", String(on));
        p.c.textContent = String(c);
        p.b.disabled = !on && c === 0;
      });
      modes.forEach(function (m) { m.b.setAttribute("aria-pressed", String(state.mode === m.v)); });
      selCount.hidden = !state.labels.length;
      selCount.textContent = String(state.labels.length);
      active.textContent = "";
      state.labels.forEach(function (k) {
        var L = reg.map[k];
        if (!L) return;
        active.appendChild(chipOn(L, function () { toggleLabel(k); changed(); },
          "Убрать метку «" + L.text + "»"));
      });
      if (state.labels.length > 1) {
        var all = el("button", "pill pill-sm mk-reset", "Сбросить");
        all.type = "button";
        all.addEventListener("click", function () { state.labels = []; changed(); });
        active.appendChild(all);
      }
      active.hidden = !state.labels.length;
      typeset(active);
    };
  }

  /* ── список задач ──────────────────────────────────────────

     Один и тот же для «Задач», «Других источников» и задач книги:
     пилюли источников (когда их больше одного), фильтр по меткам (когда
     у задач списка они есть), под ними источники с карточками. Что
     видно, решает apply по state; список при этом не перестраивается. */
  var filter = null;

  function renderList(main, b, list, opts) {
    var page = opts.page;
    var sec = el("section", "block");
    var head = blockHead(opts.title, opts.n);
    var countNode = head.querySelector(".block-count");
    sec.appendChild(head);
    var stack = el("div", "stack");

    function changed() {
      state.task = null;
      setHash();
      apply();
    }

    /* Пилюли источников: один выбран или ни одного, число — задач в нём,
       а при выбранных метках — сколько в нём осталось. */
    var buttons = [];
    if (list.length > 1) {
      var chips = el("div", "chips chips-src");
      chips.setAttribute("role", "group");
      chips.setAttribute("aria-label", "Источник");
      var chip = function (label, n, value) {
        var btn = el("button", "pill pill-sm");
        btn.type = "button";
        btn.appendChild(el("span", null, label));
        var c = el("span", "pill-count", String(n));
        btn.appendChild(c);
        btn.addEventListener("click", function () {
          state.src = state.src === value ? null : value;
          changed();
        });
        buttons.push({ b: btn, c: c, value: value, n: n });
        chips.appendChild(btn);
      };
      chip("все", sumN(list), null);
      list.forEach(function (s) { chip(s.name, s.n, s.slug); });
      stack.appendChild(chips);
    }

    var reg = registry(b, list);
    var ctx = {
      hrefOf: function (code) {
        return hashOf({ page: page, bank: b.id, book: state.book, task: code, labels: [] });
      },
      /* Метка из справки — в фильтр. Карточка, на которой нажали,
         остаётся под пальцем: всё, что над ней, может исчезнуть. */
      onLabel: function (k, node) {
        if (!reg.map[k]) {
          location.hash = hashOf({ page: "tasks", bank: b.id, labels: [k] });
          return;
        }
        if (state.labels.indexOf(k) >= 0) return;
        var y = node.getBoundingClientRect().top;
        state.labels.push(k);
        changed();
        window.scrollBy(0, node.getBoundingClientRect().top - y);
      }
    };
    var mk = reg.all.length ? labelFilter(stack, b, reg, changed) : null;

    var none = el("div", "empty", "Задач с такими метками здесь нет.");
    stack.appendChild(none);

    var cards = [], groups = [];
    var secs = list.map(function (s) {
      var sp = el("section", "bz-sec");
      if (list.length > 1) {
        var sh = el("div", "src-head");
        sh.appendChild(el("h3", null, s.name));
        sh.appendChild(el("span", "src-meta",
          srcCount(s) + (s.gody && s.gody !== "—" ? " · " + s.gody : "")));
        sp.appendChild(sh);
      }
      if (s.head) sp.appendChild(about(b, s));
      var grp = null, g = null, items = [];
      s.entries.forEach(function (e) {
        if (e.group !== grp) {
          grp = e.group;
          g = null;
          if (grp) {
            g = { node: el("h4", "bz-grp", grp), cards: [] };
            sp.appendChild(g.node);
            groups.push(g);
          }
        }
        var rec = { node: card(b, s, e, ctx), e: e, s: s.slug };
        sp.appendChild(rec.node);
        cards.push(rec);
        items.push(rec);
        if (g) g.cards.push(rec);
      });
      stack.appendChild(sp);
      return { node: sp, items: items };
    });
    sec.appendChild(stack);
    main.appendChild(sec);

    function apply() {
      var sel = state.labels, onlyR = state.mode === "r";
      var shown = 0, bySrc = {}, total = 0, base = [];
      cards.forEach(function (rec) {
        var ok = matches(rec.e, sel, onlyR);
        if (ok) { bySrc[rec.s] = (bySrc[rec.s] || 0) + 1; total++; }
        var v = ok && (state.src === null || rec.s === state.src);
        rec.node.hidden = !v;
        if (v) { shown++; base.push(rec); }
      });
      groups.forEach(function (g) {
        g.node.hidden = !g.cards.some(function (rec) { return !rec.node.hidden; });
      });
      secs.forEach(function (p) {
        p.node.hidden = !p.items.some(function (rec) { return !rec.node.hidden; });
      });
      buttons.forEach(function (x) {
        x.b.setAttribute("aria-pressed", String(state.src === x.value));
        x.c.textContent = String(!sel.length ? x.n : x.value ? bySrc[x.value] || 0 : total);
      });
      if (countNode) countNode.textContent = String(sel.length ? shown : opts.n);
      none.hidden = shown > 0;
      if (mk) {
        /* Счёт на пилюлях меток — в пределах выбранного источника. */
        mk(base);
      }
    }
    filter = apply;
    apply();
  }

  function renderTasks(main, b) {
    document.title = (b.razdel || b.title) + " · Задачи · Банки задач";
    themeHead(main, b, "tasks");
    renderList(main, b, b.sources, { page: "tasks", title: b.title, n: b.n });
  }

  function renderDrugie(main, b) {
    document.title = (b.razdel || b.title) + " · Другие источники · Банки задач";
    themeHead(main, b, "drugie");
    renderList(main, b, drugieOf(b),
      { page: "drugie", title: "Другие источники", n: sumN(drugieOf(b)) });
  }

  /* Перед прыжком к задаче она раскрывается, а формулы карточек над ней
     верстаются сразу: иначе их сверстает наблюдатель уже после прокрутки,
     карточки подрастут, и задача уедет вниз из-под глаз. Двенадцать
     свёрнутых карточек перекрывают запас наблюдателя в 1500 точек. */
  function jump(code) {
    var target = document.getElementById(code);
    if (!target || !target.expand) return;
    target.expand();
    var all = [].slice.call(document.querySelectorAll(".bz-sec:not([hidden]) .bz:not([hidden])"));
    var i = all.indexOf(target);
    for (var j = Math.max(0, i - 12); j <= i; j++) typeset(all[j]);
    target.scrollIntoView({ block: "start" });
  }

  /* ── вкладка «Метки» ───────────────────────────────────────

     Реестр меток олимпиадного списка: тип — плашкой, под ней лист
     со строками. Строка — метка, справа медальоном число задач с ней,
     под названием ссылка на книгу и сколько раз метка решающая. Методы
     разбиты по книгам, внутри всё по частоте. Строка ведёт в «Задачи»
     с фильтром по этой метке. */
  function renderMetki(main, b) {
    document.title = (b.razdel || b.title) + " · Метки · Банки задач";
    themeHead(main, b, "metki");
    var reg = registry(b, b.sources);
    main.appendChild(el("p", "tag-opis mk-note",
      "Метка — теория, на которой держится решение. Число справа — в скольких задачах " +
      "она стоит, «решающая» — в скольких из них это решающий шаг. Нажмите на метку — " +
      "откроются её задачи."));
    reg.types.forEach(function (T) {
      var sec = el("section", "block");
      sec.appendChild(blockHead(T.t, cnt(T.labels.length, "метка", "метки", "меток")));
      var stack = el("div", "stack");
      var panel = el("div", "panel mk-panel");
      groupsOf(T).forEach(function (g) {
        if (g.book) panel.appendChild(el("div", "mk-grp", g.book));
        g.labels.forEach(function (L) {
          var a = el("a", "row mk-row");
          a.href = hashOf({ page: "tasks", bank: b.id, labels: [L.key] });
          var label = el("span", "row-label");
          var t = el("span", "row-title");
          mdLine(L.name, t);
          label.appendChild(t);
          var sub = [], ref = g.book ? L.rest : L.ref;
          if (ref) sub.push(ref);
          if (L.nr) sub.push("решающая в " + L.nr);
          if (sub.length) label.appendChild(el("span", "row-sub", sub.join(" · ")));
          else a.classList.add("row-one");
          a.appendChild(label);
          a.appendChild(el("span", "pill-count", String(L.n)));
          panel.appendChild(a);
        });
      });
      stack.appendChild(panel);
      sec.appendChild(stack);
      main.appendChild(sec);
    });
    typeset(main);
  }

  /* ── вкладка «Учебники», конспект и задачи книги ───────── */

  /* Список: строка — название конспекта, под ним учебник и сколько
     в банке его задач. Книга без конспекта — строкой с одними задачами. */
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
        var sub = [];
        if (u.istochnik) sub.push(u.istochnik);
        if (u.zadachi) sub.push(cnt(u.zadachi.n, "задача", "задачи", "задач"));
        var href = "#" + b.id + "/" + BOOKS + "/" + enc(u.slug) + (u.file ? "" : "/" + ZADACHI);
        panel.appendChild(row(href, u.title, sub.join(" · ")));
      });
      stack.appendChild(panel);
    } else {
      stack.appendChild(el("div", "empty", "Учебников пока нет."));
    }
    sec.appendChild(stack);
    main.appendChild(sec);
  }

  /* Шапка книги: назад к учебникам, и если есть и конспект, и задачи —
     переключатель между ними. */
  function bookHead(main, b, u, tab) {
    main.appendChild(back("#" + b.id + "/" + BOOKS, "Учебники"));
    if (!u.file || !u.zadachi) return;
    var base = "#" + b.id + "/" + BOOKS + "/" + enc(u.slug);
    main.appendChild(switcher(u.title, [
      ["book", "Конспект", null, base],
      ["bookz", "Задачи", u.zadachi.n, base + "/" + ZADACHI]
    ], tab));
  }

  function skeleton() {
    var skel = el("div", "skeleton");
    skel.setAttribute("aria-hidden", "true");
    ["skel-head", "skel-row", "skel-row"].forEach(function (c) { skel.appendChild(el("span", c)); });
    return skel;
  }

  /* Конспект — лист, как заметка на «Лучезарности»: название на платиновой
     плашке во всю ширину листа, под ним учебник тихой строкой, разделы —
     главами. Markdown показывается как есть; формулы верстаются разом —
     конспект читают целиком, а не листают. */
  function renderBook(main, b, slug) {
    var u = bookBySlug(b, slug);
    document.title = u.title + " · Банки задач";
    bookHead(main, b, u, "book");
    var sheet = el("article", "note");
    sheet.appendChild(skeleton());
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

  /* Задачи книги лежат своим файлом и грузятся, только когда книгу
     открыли: в общем banki.json они утроили бы главную. */
  var BOOKDATA = {};

  function loadBook(z) {
    if (!BOOKDATA[z.file]) {
      BOOKDATA[z.file] = fetch(z.file, { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .catch(function (err) { delete BOOKDATA[z.file]; throw err; });
    }
    return BOOKDATA[z.file];
  }

  function renderBookTasks(main, b, slug) {
    var u = bookBySlug(b, slug), z = u.zadachi;
    document.title = z.name + " · Задачи · Банки задач";
    bookHead(main, b, u, "bookz");
    var wait = skeleton();
    main.appendChild(wait);
    loadBook(z)
      .then(function (s) {
        if (state.page !== "bookz" || state.book !== slug) return;
        wait.remove();
        renderList(main, b, [s], { page: "bookz", title: z.name, n: z.n });
        if (state.task) jump(state.task);
      })
      .catch(function () {
        wait.remove();
        main.appendChild(el("div", "empty", "Задачи книги не загрузились. Обновите страницу."));
      });
  }

  /* ── маршрут ───────────────────────────────────────────── */
  var shown = null;
  var LISTS = ["tasks", "drugie", "bookz"];

  function route() {
    var prev = shown;
    state = parseHash();
    setHash();
    var key = state.page + ":" + state.bank + ":" + (state.book || "");
    if (prev === key && filter && LISTS.indexOf(state.page) >= 0) {
      filter();
    } else {
      var main = document.getElementById("main");
      main.textContent = "";
      filter = null;
      var b = state.bank ? bankById(state.bank) : null;
      if (state.page === "main") renderMain(main);
      else if (state.page === "tasks") renderTasks(main, b);
      else if (state.page === "drugie") renderDrugie(main, b);
      else if (state.page === "metki") renderMetki(main, b);
      else if (state.page === "books") renderBooks(main, b);
      else if (state.page === "bookz") renderBookTasks(main, b, state.book);
      else renderBook(main, b, state.book);
      if (!state.task) window.scrollTo(0, 0);
    }
    shown = key;
    /* Задачи книги ещё могут ехать — тогда прыгнет загрузчик. */
    if (state.task && document.getElementById(state.task)) jump(state.task);
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
      DATA.banki.forEach(function (b) { b.sources = b.sources || []; });
      route();
      window.addEventListener("hashchange", route);
    })
    .catch(function () { fail("Банки не загрузились."); });
})();
