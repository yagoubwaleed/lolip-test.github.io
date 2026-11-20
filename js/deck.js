// Horizontal slide deck: nav pill, arrows, keys, swipe, wheel, hash. Each slide can register hooks in
// window.SLIDES[id] = { init(el), enter(el), leave(el), build(i) }; init runs once, on the first enter.
// A slide with several .build figures shows one at a time: the arrows step through them before changing slide,
// and a small step nav under the figure jumps between them (build(i) is called each time one is shown).
(() => {
  // ?shot: no transitions, for headless screenshots
  if (location.search.includes("shot")) { window.SHOT = true; document.documentElement.classList.add("shot"); }
  const track = document.getElementById("track");
  // the deck only moves by transform; undo the browser's own anchor / focus scrolling
  const deck = track.parentElement;
  deck.addEventListener("scroll", () => { deck.scrollLeft = 0; deck.scrollTop = 0; });
  const slides = [...track.querySelectorAll(".slide")];
  const nav = document.getElementById("navList");
  const pill = document.getElementById("navPill");
  const prev = document.getElementById("prev"), next = document.getElementById("next");
  const pad = (n) => String(n).padStart(2, "0");
  let cur = -1, lock = false;
  const inited = new Set();

  const buttons = slides.map((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<button><span class="n">${pad(i + 1)}</span>${s.dataset.title}</button>`;
    li.firstChild.addEventListener("click", () => go(i));
    nav.appendChild(li);
    return li.firstChild;
  });

  const builds = (s) => [...s.querySelectorAll(".build")];
  slides.forEach((s) => {
    const bs = builds(s);
    if (bs.length < 2) return;
    const bn = document.createElement("div");
    bn.className = "bnav";
    bn.innerHTML = bs.map((b) => `<button><i></i>${b.dataset.label}</button>`).join("");
    bn.querySelectorAll("button").forEach((x, k) => x.addEventListener("click", () => showBuild(s, k)));
    s.querySelector(".tpl-body").appendChild(bn);
  });
  function showBuild(s, k) {
    const bs = builds(s);
    if (!bs.length) return;
    s.dataset.b = k;
    bs.forEach((el, j) => (el.hidden = j !== k));
    s.querySelectorAll(".bnav button").forEach((x, j) => x.setAttribute("aria-current", j === k));
    history.replaceState(null, "", "#" + s.id + (k ? ":" + k : ""));
    window.SLIDES?.[s.id]?.build?.(k);
  }
  // arrows, keys, swipe and wheel: next build of this slide first, then the next slide
  function step(d) {
    const s = slides[cur], n = builds(s).length, k = +(s.dataset.b ?? 0);
    if (n > 1 && k + d >= 0 && k + d < n) return showBuild(s, k + d);
    go(cur + d, { fromEnd: d < 0 });
  }

  function placePill() {
    const b = buttons[cur];
    pill.style.width = b.offsetWidth + "px";
    pill.style.transform = `translateX(${b.offsetLeft}px)`;
    const l = b.offsetLeft - nav.clientWidth / 2 + b.offsetWidth / 2;
    nav.scrollTo({ left: l, behavior: "smooth" });
  }

  function go(i, opts = {}) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return;
    const dir = i > cur ? "next" : "prev";
    const old = slides[cur];
    if (old) { old.classList.remove("active"); window.SLIDES?.[old.id]?.leave?.(old); }
    cur = i;
    const s = slides[i];
    deck.scrollLeft = 0;
    track.style.transform = `translateX(${-100 * i}vw)`;
    s.classList.add("active");
    s.scrollTop = 0;
    buttons.forEach((b, k) => b.setAttribute("aria-current", k === i));
    placePill();
    prev.disabled = i === 0;
    next.disabled = i === slides.length - 1;
    if (i > 0) { next.classList.remove("pulse"); document.getElementById("hint").style.opacity = 0; }
    const btn = dir === "next" ? next : prev;
    if (!opts.silent) { btn.classList.remove("go"); void btn.offsetWidth; btn.classList.add("go"); }
    history.replaceState(null, "", "#" + s.id);
    const hooks = window.SLIDES?.[s.id], n = builds(s).length;
    const k = opts.build ?? (opts.fromEnd ? Math.max(0, n - 1) : 0);
    if (n) { s.dataset.b = k; builds(s).forEach((el, j) => (el.hidden = j !== k)); s.querySelectorAll(".bnav button").forEach((x, j) => x.setAttribute("aria-current", j === k)); }
    if (hooks) {
      if (!inited.has(s.id)) { inited.add(s.id); hooks.init?.(s); }
      // let the track move first, then play the slide's animation
      setTimeout(async () => { if (slides[cur] !== s) return; await hooks.enter?.(s); if (n && slides[cur] === s) showBuild(s, k); }, opts.silent ? 150 : 330);
    }
  }
  window.goSlide = go;

  document.getElementById("themeBtn").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) {}
    dispatchEvent(new Event("themechange"));
  });

  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  document.querySelectorAll("[data-go]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go(+a.dataset.go); }));
  document.addEventListener("click", (e) => { const a = e.target.closest(".narr-go"); if (a) { e.preventDefault(); go(cur + 1); } });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); step(1); }
    if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1); }
    if (e.key === "Home") go(0);
    if (e.key === "End") go(slides.length - 1);
  });

  // swipe
  let x0 = null, y0 = null;
  track.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  track.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
    x0 = null;
  });

  // trackpad / wheel: one slide per gesture (desktop only; on phones a slide scrolls vertically)
  window.addEventListener("wheel", (e) => {
    if (window.innerWidth <= 960 || e.target.closest("input")) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 18 || lock) return;
    lock = true;
    step(d > 0 ? 1 : -1);
    setTimeout(() => (lock = false), 750);
  }, { passive: true });

  window.addEventListener("resize", () => cur >= 0 && placePill());

  const [hid, hb] = location.hash.slice(1).split(":");          // #slide or #slide:build
  const start = Math.max(0, slides.findIndex((s) => s.id === hid));
  // fonts first, so the nav pill measures the final widths
  (document.fonts?.ready ?? Promise.resolve()).then(() => go(start, { silent: true, build: hb ? +hb : undefined }));
})();
