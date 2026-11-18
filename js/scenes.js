// Canvas rebuild of the contraction slide animations from data/scene_*.json (ISAAC-FLOW-FINAL
// experiment_plot_data/slides_contraction_videos, see its guide): drawing units -> pixels, sizes in pt x S at 200 dpi,
// cubic-Bezier arrows that grow along the curve, smoothstep cues, "ghost" elements at 0.15 until their cue.
// Theme colours come from the page's CSS tokens, so the scenes follow light / dark mode.
window.Scenes = (() => {
  const GHOST = 0.15;
  const TEXT = 0.8;                                            // site: scene text a bit smaller than in the slide video
  const ease = (x) => x * x * (3 - 2 * x);
  const ramp = (t, a, b) => (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : t >= a ? 1 : 0);
  const sramp = (t, a, b) => ease(ramp(t, a, b));
  const g = (a) => GHOST + (1 - GHOST) * a;
  const cache = {};
  const loadScene = (n) => (cache[n] ??= fetch(`data/scene_${n}.json`).then((r) => r.json()));

  function tokens() {
    const s = getComputedStyle(document.documentElement), v = (n) => s.getPropertyValue(n).trim();
    return { ink: v("--ink"), bg: v("--bg"), disc: v("--scene-disc"), discEdge: v("--scene-disc-edge"), grey: v("--scene-grey"),
             font: getComputedStyle(document.body).fontFamily };
  }
  const rgb = (c) => {
    if (c.startsWith("#")) { const h = c.length === 4 ? c.slice(1).replace(/./g, "$&$&") : c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    return c.match(/[\d.]+/g).slice(0, 3).map(Number);
  };
  const mix = (c, bg, f) => { const a = rgb(c), b = rgb(bg); return `rgb(${a.map((x, i) => Math.round(x * (1 - f) + b[i] * f)).join(",")})`; };

  class Scene {
    constructor(el, sc) {
      this.sc = sc;
      this.cv = document.createElement("canvas");
      this.cv.className = "scene-canvas";
      el.appendChild(this.cv);
      this.ctx = this.cv.getContext("2d");
      const [x0, x1] = sc.canvas.xlim, [y0, y1] = sc.canvas.ylim;
      this.X = [x0, x1]; this.Y = [y0, y1];
      this.cv.style.aspectRatio = `${x1 - x0} / ${y1 - y0}`;
      this.frames = [];
      const F = sc.site_frames;
      for (let k = 0; k < F.n; k++) { const im = new Image(); im.decoding = "async"; im.onload = () => this.draw(this.t); im.src = `${F.dir}/${F.pattern.replace("%03d", String(k).padStart(3, "0"))}`; this.frames.push(im); }
      this.t = 0;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.cv);
      addEventListener("themechange", () => this.draw(this.t));
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = r.width; this.H = r.height;
      this.k = (r.width / this.sc.canvas.width_px) * (this.sc.canvas.dpi / 72) * this.sc.canvas.S;   // px per pt x S
      this.draw(this.t);
    }
    px(x) { return ((x - this.X[0]) / (this.X[1] - this.X[0])) * this.W; }
    py(y) { return ((this.Y[1] - y) / (this.Y[1] - this.Y[0])) * this.H; }
    // ---- primitives (sizes in points, as in the scene; S is folded into this.k)
    circle(c, r, fill, stroke, lw, alpha, dash) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha; x.beginPath();
      x.arc(this.px(c[0]), this.py(c[1]), r * (this.W / (this.X[1] - this.X[0])), 0, 2 * Math.PI);
      if (fill && fill !== "none") { x.fillStyle = fill; x.fill(); }
      if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw * this.k; if (dash) x.setLineDash(dash.map((d) => d * lw * this.k)); x.stroke(); }
      x.restore();
    }
    dots(pts, size, color, alpha, edge, ew) {
      if (alpha <= 0) return;
      const x = this.ctx, r = (Math.sqrt(size) * this.k) / 2;
      x.save(); x.globalAlpha = alpha; x.fillStyle = color;
      for (const p of pts) {
        x.beginPath(); x.arc(this.px(p[0]), this.py(p[1]), r, 0, 2 * Math.PI); x.fill();
        if (edge && ew > 0) { x.strokeStyle = edge; x.lineWidth = ew * this.k; x.stroke(); }
      }
      x.restore();
    }
    text(s, p, size, color, alpha, align = "center", base = "middle", bold = false, halo = null) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha;
      x.font = `${bold ? 600 : 400} ${size * this.k * TEXT}px ${this.T.font}`;
      x.textAlign = align; x.textBaseline = base;
      if (halo) { x.strokeStyle = halo; x.lineWidth = 4 * this.k; x.lineJoin = "round"; x.strokeText(s, this.px(p[0]), this.py(p[1])); }
      x.fillStyle = color; x.fillText(s, this.px(p[0]), this.py(p[1]));
      x.restore();
    }
    line(a, b, color, lw, alpha, shrinkA = 0, shrinkB = 0) {
      if (alpha <= 0) return;
      const x = this.ctx, ax = this.px(a[0]), ay = this.py(a[1]), bx = this.px(b[0]), by = this.py(b[1]);
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
      const sa = shrinkA * this.k, sb = shrinkB * this.k;
      x.save(); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = lw * this.k; x.beginPath();
      x.moveTo(ax + ux * sa, ay + uy * sa); x.lineTo(bx - ux * sb, by - uy * sb); x.stroke(); x.restore();
    }
    // cubic Bezier p0, (p0.x + 0.45 dx, p0.y), (p1.x - 0.45 dx, p1.y), p1, drawn up to fraction frac (60 points)
    flow(p0, p1, color, lw, alpha, frac, outline = false) {
      if (frac <= 0 || alpha <= 0) return;
      frac = Math.min(1, frac);
      const dx = p1[0] - p0[0], c = [p0, [p0[0] + 0.45 * dx, p0[1]], [p1[0] - 0.45 * dx, p1[1]], p1];
      const n = 60, k = Math.max(2, Math.round(frac * n)), pts = [];
      for (let i = 0; i < k; i++) {
        const t = i / (n - 1), u = 1 - t;
        pts.push([0, 1].map((d) => u * u * u * c[0][d] + 3 * u * u * t * c[1][d] + 3 * u * t * t * c[2][d] + t * t * t * c[3][d]));
      }
      const P = pts.map((p) => [this.px(p[0]), this.py(p[1])]);
      const ms = (6 + 2 * lw) * this.k, hl = 0.55 * ms, hw = 0.22 * ms;
      const [a, b] = [P.at(-2), P.at(-1)];
      let ux = b[0] - a[0], uy = b[1] - a[1]; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      const tip = [b[0] - ux * 2 * this.k, b[1] - uy * 2 * this.k];           // shrinkB = 2 pt
      const base = [tip[0] - ux * hl, tip[1] - uy * hl];
      const head = [tip, [base[0] - uy * hw, base[1] + ux * hw], [base[0] + uy * hw, base[1] - ux * hw]];
      const x = this.ctx;
      const path = () => { x.beginPath(); x.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1, -1)) x.lineTo(p[0], p[1]); x.lineTo(base[0], base[1]); };
      const tri = () => { x.beginPath(); x.moveTo(head[0][0], head[0][1]); x.lineTo(head[1][0], head[1][1]); x.lineTo(head[2][0], head[2][1]); x.closePath(); };
      x.save(); x.globalAlpha = alpha; x.lineJoin = "round";
      if (outline) {
        x.strokeStyle = this.T.ink; x.lineWidth = (lw + 1.4) * this.k; path(); x.stroke();
        x.lineWidth = 1.4 * this.k; tri(); x.stroke();
      }
      x.strokeStyle = color; x.fillStyle = color; x.lineWidth = lw * this.k; path(); x.stroke(); tri(); x.fill();
      x.restore();
    }
    blob(pts, color, alpha) {                                  // 3 covariance ellipses, 2.6 / 1.8 / 1.0 std
      if (alpha <= 0 || pts.length < 3) return;
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [a, b] of pts) { sxx += (a - mx) ** 2; syy += (b - my) ** 2; sxy += (a - mx) * (b - my); }
      sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr / 2 - Math.sqrt(tr * tr / 4 - det);
      const ang = Math.atan2(l1 - sxx, sxy || 1e-12);         // direction of the larger eigenvector
      const s = this.W / (this.X[1] - this.X[0]), x = this.ctx;
      x.save(); x.globalAlpha = alpha;
      for (const [k, f] of [[2.6, 0.86], [1.8, 0.78], [1.0, 0.68]]) {
        x.fillStyle = mix(color, this.T.bg, f); x.beginPath();
        x.ellipse(this.px(mx), this.py(my), k * Math.sqrt(l1) * s, k * Math.sqrt(Math.max(l2, 0)) * s, -ang, 0, 2 * Math.PI); x.fill();
      }
      x.restore();
    }
    robot(k, alpha) {
      if (alpha <= 0) return;
      const R = this.sc.layout.robot_panel, x = this.ctx;
      const X0 = this.px(R.x0), Y0 = this.py(R.y0 + R.size), sz = this.px(R.x0 + R.size) - X0;
      const im = this.frames[Math.max(0, Math.min(this.frames.length - 1, k))];
      x.save(); x.globalAlpha = alpha;
      if (im.complete && im.naturalWidth) x.drawImage(im, X0, Y0, sz, sz); else { x.fillStyle = this.T.disc; x.fillRect(X0, Y0, sz, sz); }
      x.strokeStyle = this.T.ink; x.lineWidth = 1.0 * this.k; x.beginPath(); x.roundRect(X0, Y0, sz, sz, 0.03 * sz / R.size); x.stroke();
      x.restore();
    }
    rollOut(a) {
      const L = this.sc.layout, ra = L.roll_out_arrow;
      if (a > 0) {
        const x = this.ctx, A = [this.px(ra.from[0]), this.py(ra.from[1])], B = [this.px(ra.to[0]), this.py(ra.to[1])];
        const ms = 12 * this.k, hl = 0.55 * ms, hw = 0.22 * ms;
        x.save(); x.globalAlpha = a; x.strokeStyle = x.fillStyle = this.T.ink; x.lineWidth = 1.3 * this.k;
        x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0] - hl, B[1]); x.stroke();
        x.beginPath(); x.moveTo(B[0], B[1]); x.lineTo(B[0] - hl, B[1] - hw); x.lineTo(B[0] - hl, B[1] + hw); x.closePath(); x.fill(); x.restore();
      }
      this.text(ra.label, ra.label_xy, 11.5, this.T.ink, a, "center", "bottom");
      this.text(L.goal_label.text, L.goal_label.xy, L.goal_label.fontsize, this.T.ink, a);
    }
    endMark(a, ok, label, dxMark) {
      if (a <= 0) return;
      const L = this.sc.layout, R = L.robot_panel, col = ok ? "#d91e5b" : this.T.grey;
      const xc = R.x0 + R.size / 2, yc = R.y0 - 0.3, m = 0.12, mx = xc - dxMark, x = this.ctx;
      x.save(); x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = 2.4 * this.k; x.lineCap = "butt"; x.lineJoin = "miter";
      x.beginPath();
      if (ok) { x.moveTo(this.px(mx - m), this.py(yc)); x.lineTo(this.px(mx - 0.25 * m), this.py(yc - 0.75 * m)); x.lineTo(this.px(mx + m), this.py(yc + 0.9 * m)); }
      else for (const s of [1, -1]) { x.moveTo(this.px(mx - 0.8 * m), this.py(yc - s * 0.8 * m)); x.lineTo(this.px(mx + 0.8 * m), this.py(yc + s * 0.8 * m)); }
      x.stroke(); x.restore();
      this.text(label, [mx + 1.6 * m, yc], 13.5, col, a, "left");
    }
    // ---- playback
    play(from, to, speed, done) {
      cancelAnimationFrame(this.raf);
      let t0 = null;
      const step = (now) => {
        t0 ??= now;
        const t = Math.min(to, from + ((now - t0) / 1000) * speed);
        this.t = t; this.draw(t);
        if (t < to) this.raf = requestAnimationFrame(step); else done?.();
      };
      if (window.SHOT) { this.t = to; this.draw(to); done?.(); return; }
      this.raf = requestAnimationFrame(step);
    }
    stop() { cancelAnimationFrame(this.raf); }
    draw(t) {
      if (!this.W) return;
      this.T = tokens();
      this.ctx.clearRect(0, 0, this.W, this.H);
      this.render(t);
    }
  }

  // ------------------------------------------------------------------ 3 / 4: action spread (t = timeline time)
  class Spread extends Scene {
    get end() { return this.sc.clock.T_END + 1.0; }
    render(t) {
      const sc = this.sc, L = sc.layout, C = sc.clock, T = this.T, MUG = "#d91e5b";
      const a_in = g(sramp(t, 0.3, 1.5)), a_sel = sramp(t, C.T_PICK, C.T_PICK + 0.6), rest = a_in * (1 - 0.8 * a_sel);
      this.text(sc.title, L.title.xy, L.title.fontsize, sc.policy === "lolip" ? MUG : T.ink, 1, "left", "middle", true);
      this.circle(L.noise_circle.c, L.noise_circle.r, T.bg, T.ink, 0.9, a_in);
      this.circle(L.action_circle.c, L.action_circle.r, T.disc, T.discEdge, 0.9, a_in);
      this.blob(sc.action_points, MUG, rest);
      this.rollOut(g(sramp(t, C.T_FLOW + 2.4, C.T_FLOW + 2.8)));
      this.robot(Math.floor(Math.max(0, (t - C.T_CLIP) / C.robot_frame_dt)), g(sramp(t, C.T_FLOW + 2.4, C.T_FLOW + 2.8)));
      for (const b of sc.background_arrows) this.flow(b.from, b.to, MUG, 0.6, 0.5 * rest, 1);
      sc.selected_noises.forEach((q, i) => this.flow(q, sc.selected_actions[i], MUG, 0.6, 0.5 * rest, 1));
      this.dots(sc.noise_points, 13, MUG, 0.9 * rest);
      this.dots(sc.action_points, 13, MUG, 0.9 * rest);
      this.dots(sc.selected_noises, 13 + 37 * a_sel, MUG, Math.max(a_sel, 0.9 * rest), T.ink, 1.0 * a_sel);
      const a_lab = sramp(t, C.T_PICK + 0.3, C.T_PICK + 0.8), fl = L.far_apart_label;
      for (const q of fl.lines_to) this.line(fl.xy, q, T.ink, 0.8, a_lab, 2, 4);
      this.text(fl.text, fl.xy, fl.fontsize, T.ink, a_lab, "left", "middle", false, T.bg);
      this.text(L.mode_label.text, L.mode_label.xy, L.mode_label.fontsize, MUG, a_in, "center", "middle", false, T.bg);
      sc.selected_arrows.forEach((s) => this.flow(s.from, s.to, MUG, 1.5, 1, ease(Math.min(1, Math.max(0, t - s.start_t)))));
      const a_dot = sramp(t, C.T_FLOW + 1.4, C.T_FLOW + 1.8);
      this.dots(sc.selected_actions, 13 + 37 * a_dot, MUG, a_dot, T.ink, 1.0 * a_dot);
      const a_ring = sramp(t, C.T_FLOW + 1.8, C.T_FLOW + 2.3), ring = L.spread_ring, sl = L.spread_label;
      this.circle(ring.c, ring.r, null, T.ink, 1.3, a_ring, ring.dash);
      this.line(sl.xy, sl.line_to, T.ink, 0.8, a_ring, 2, 0);
      this.text(sl.text, sl.xy, sl.fontsize, T.ink, a_ring, "left", "middle", false, T.bg);
      this.text(L.latent_label.text, L.latent_label.xy, 11.5, T.ink, a_in);
      this.text(L.action_label.text, L.action_label.xy, 11.5, T.ink, a_in);
      const ok = sc.policy === "lolip";
      this.endMark(g(sramp(t, C.T_END + 0.1, C.T_END + 0.6)), ok, L.end_label.text, ok ? 0.95 : 0.89);
    }
  }

  // ------------------------------------------------------------------ 1 / 2: inference (ti = timeline time from 0)
  class Inference extends Scene {
    get T0() { return this.sc.clock.T0_intro; }
    get end() { return this.T0 + this.sc.clock.T_END_t + 1.0; }
    render(ti) {
      const sc = this.sc, L = sc.layout, C = sc.clock, T = this.T, t = ti - this.T0;
      const TC = { mugplace: "#d91e5b", bowlplace: "#e48a56" };
      const N = sc.noise_points.map((p) => p.xy), A = sc.action_points.map((p) => p.xy), task = sc.noise_points.map((p) => p.task);
      const hi = sc.selected, ins = sc.circle_dots, starts = sc.forward_arrows.map((f) => f.start_t);
      const a_noise = g(sramp(ti, 1.4, 2.4)), fo = 1 - 0.8 * sramp(ti, 2.6, 3.2), unf_n = sramp(t, 0.9, 1.3);
      const a_reg = sramp(t, 0.3, 0.9), a_hi = sramp(t, 2.6, 3.0), a_roll = g(sramp(t, 4.6, 5.2));
      this.text(sc.title, L.title.xy, L.title.fontsize, sc.title_color === "#2a2a2a" ? T.ink : sc.title_color, 1, "left", "middle", true);
      this.circle(L.noise_circle.c, L.noise_circle.r, T.bg, T.ink, 0.9, a_noise);
      this.circle(L.action_circle.c, L.action_circle.r, T.disc, T.discEdge, 0.9, 1);
      for (const tk of ["mugplace", "bowlplace"]) this.blob(A.filter((_, i) => task[i] === tk), TC[tk], fo);
      sc.backward_arrows.forEach((b) => this.flow(A[b.i], N[b.i], TC[task[b.i]], b.lw, b.alpha * (1 - 0.85 * sramp(ti, 2.6, 3.2)), sramp(ti, b.start_ti, b.start_ti + 1.0)));
      ins.forEach((i, k) => this.flow(N[i], A[i], TC[task[i]], 0.8, 0.75, sramp(t, starts[k], starts[k] + 1.0)));
      this.rollOut(a_roll);
      this.robot(Math.floor(Math.max(0, (t - C.T_CLIP_t) / C.robot_frame_dt_t)), a_roll);
      for (const tk of ["bowlplace", "mugplace"]) this.dots(N.filter((_, i) => task[i] === tk), 13, TC[tk], 0.9 * a_noise * fo);
      for (const tk of ["mugplace", "bowlplace"]) this.dots(A.filter((_, i) => task[i] === tk), 13, TC[tk], 0.9 * fo);
      ins.forEach((i) => this.dots([N[i]], 13, TC[task[i]], 0.9 * Math.max(a_noise * fo, unf_n)));
      this.dots([N[hi]], 13, TC[task[hi]], 0.9 * Math.max(a_noise * fo, unf_n));
      ins.forEach((i, k) => this.dots([A[i]], 13, TC[task[i]], 0.9 * Math.max(fo, sramp(t, starts[k] + 0.8, starts[k] + 1.1))));
      this.dots([A[hi]], 13, TC[task[hi]], 0.9 * Math.max(fo, sramp(t, 4.2, 4.4)));
      const S = L.sample_circle, sl = L.sample_label;
      this.circle(S.c, S.r, null, T.ink, 1.3, a_reg, S.dash);
      this.dots([N[hi]], 50, TC[task[hi]], a_hi, T.ink, 1.0);
      this.line(sl.xy, sl.line_to, T.ink, 0.8, a_reg, 2, 0);
      this.text(sl.text, sl.xy, sl.fontsize, T.ink, a_reg, "left", "middle", false, T.bg);
      this.text(L.latent_label.text, L.latent_label.xy, 11.5, T.ink, a_noise);
      this.text(L.action_label.text, L.action_label.xy, 11.5, T.ink, 1);
      for (const m of L.mode_labels) this.text(m.text, m.xy, m.fontsize, m.color, 1, "center", "middle", false, T.bg);
      this.flow(N[hi], A[hi], TC[task[hi]], 1.5, 1, sramp(t, 3.2, 4.4), true);
      // site addition: the target of the inference step
      this.text("Target: pick the mug", [L.noise_circle.c[0] + L.noise_circle.r + 0.25, L.noise_circle.c[1] + L.noise_circle.r - 0.1], 12.5, "#d91e5b", this.showTarget ? sramp(ti, this.T0 + 1.3, this.T0 + 1.8) : 0, "left", "middle", true, T.bg);
      const e = L.end_label;
      this.endMark(g(sramp(t, C.T_END_t + 0.1, C.T_END_t + 0.6)), e.mark === "tick", e.text, e.mark === "tick" ? 1.0 : 0.9);
    }
  }

  return { loadScene, Spread, Inference };
})();
