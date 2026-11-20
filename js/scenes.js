// Contraction slide animations, rebuilt from data/scene_*.json (ISAAC-FLOW-FINAL experiment_plot_data/
// slides_contraction_videos). The scene gives the data (noise and action points, which arrows exist, the selected
// noises), the layout in drawing units and the timeline (smoothstep cues, "ghost" elements at 0.15 until their cue).
// The drawing itself uses the site's chart style: Geist, mono labels, hairline discs, small dots, thin arrows, theme
// tokens from css/site.css.
window.Scenes = (() => {
  const GHOST = 0.15;
  const MUG = "#d91e5b", BOWL = "#e48a56", TC = { mugplace: MUG, bowlplace: BOWL };
  const ease = (x) => x * x * (3 - 2 * x);
  const ramp = (t, a, b) => (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : t >= a ? 1 : 0);
  const sramp = (t, a, b) => ease(ramp(t, a, b));
  const g = (a) => GHOST + (1 - GHOST) * a;
  const cache = {};
  const loadScene = (n) => (cache[n] ??= fetch(`data/scene_${n}.json`).then((r) => r.json()));

  function tokens() {
    const s = getComputedStyle(document.documentElement), v = (n) => s.getPropertyValue(n).trim();
    return { ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"), hair: v("--hair"), bg: v("--bg"), disc: v("--disc"),
             pink: v("--pink"), pinkSoft: v("--pink-soft"), greyLine: v("--grey-line"),
             sans: getComputedStyle(document.body).fontFamily, mono: '"Geist Mono", ui-monospace, monospace' };
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
      // crop to the drawn content (discs, labels, robot panel), not the video's full frame
      this.X = [1.0, 14.35];
      this.Y = [-1.62, 1.45];
      this.cv.style.aspectRatio = `${this.X[1] - this.X[0]} / ${this.Y[1] - this.Y[0]}`;
      const F = sc.site_frames;
      this.frames = Array.from({ length: F.n }, (_, k) => {
        const im = new Image(); im.decoding = "async"; im.onload = () => this.draw(this.t);
        im.src = `${F.dir}/${F.pattern.replace("%03d", String(k).padStart(3, "0"))}`;
        return im;
      });
      this.t = 0;
      new ResizeObserver(() => this.resize()).observe(this.cv);
      addEventListener("themechange", () => this.draw(this.t));
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = r.width; this.H = r.height;
      this.b = Math.max(0.62, r.width / 1100);                  // px scale: sizes below are px at 1100 px wide
      this.u = r.width / (this.X[1] - this.X[0]);              // px per drawing unit
      this.draw(this.t);
    }
    px(x) { return (x - this.X[0]) * this.u; }
    py(y) { return (this.Y[1] - y) * this.u; }
    // ---- primitives (sizes in px at 1100 px wide)
    disc(c, r, alpha) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha; x.beginPath();
      x.arc(this.px(c[0]), this.py(c[1]), r * this.u, 0, 2 * Math.PI);
      x.fillStyle = this.T.disc; x.fill(); x.strokeStyle = this.T.hair; x.lineWidth = 1.2 * this.b; x.stroke(); x.restore();
    }
    ring(c, r, alpha) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha; x.beginPath();
      x.arc(this.px(c[0]), this.py(c[1]), r * this.u, 0, 2 * Math.PI);
      x.setLineDash([4 * this.b, 3 * this.b]); x.strokeStyle = this.T.ink; x.lineWidth = 1.3 * this.b; x.stroke(); x.restore();
    }
    dots(pts, color, alpha, r = 3, ring = 0) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha; x.fillStyle = color;
      for (const p of pts) {
        x.beginPath(); x.arc(this.px(p[0]), this.py(p[1]), r * this.b, 0, 2 * Math.PI); x.fill();
        if (ring) { x.strokeStyle = this.T.ink; x.lineWidth = ring * this.b; x.stroke(); }
      }
      x.restore();
    }
    text(s, p, { size = 12.5, color, alpha = 1, align = "center", base = "middle", weight = 400, mono = false, halo = false, dx = 0, dy = 0 } = {}) {
      if (alpha <= 0) return;
      const x = this.ctx; x.save(); x.globalAlpha = alpha;
      x.font = `${weight} ${size * this.b}px ${mono ? this.T.mono : this.T.sans}`;
      if (mono) { x.letterSpacing = `${0.08 * size * this.b}px`; s = s.toUpperCase(); }
      x.textAlign = align; x.textBaseline = base;
      const X = this.px(p[0]) + dx * this.b, Y = this.py(p[1]) + dy * this.b;
      if (halo) { x.strokeStyle = this.T.bg; x.lineWidth = 4 * this.b; x.lineJoin = "round"; x.strokeText(s, X, Y); }
      x.fillStyle = color ?? this.T.ink; x.fillText(s, X, Y);
      x.restore();
    }
    leader(a, b, alpha, gap = 0) {
      if (alpha <= 0) return;
      const x = this.ctx, ax = this.px(a[0]), ay = this.py(a[1]), bx = this.px(b[0]), by = this.py(b[1]);
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, s0 = 4 * this.b, s1 = gap * this.b;
      x.save(); x.globalAlpha = alpha; x.strokeStyle = this.T.muted; x.lineWidth = 0.9 * this.b; x.beginPath();
      x.moveTo(ax + ux * s0, ay + uy * s0); x.lineTo(bx - ux * s1, by - uy * s1); x.stroke(); x.restore();
    }
    // the scene's arrow curve: cubic Bezier p0, (p0.x + 0.45 dx, p0.y), (p1.x - 0.45 dx, p1.y), p1, grown to frac
    flow(p0, p1, color, lw, alpha, frac, head = 0) {
      if (frac <= 0 || alpha <= 0) return;
      frac = Math.min(1, frac);
      const dx = p1[0] - p0[0], c = [p0, [p0[0] + 0.45 * dx, p0[1]], [p1[0] - 0.45 * dx, p1[1]], p1];
      const n = 60, k = Math.max(2, Math.round(frac * n)), P = [];
      for (let i = 0; i < k; i++) {
        const t = i / (n - 1), u = 1 - t;
        P.push([0, 1].map((d) => u * u * u * c[0][d] + 3 * u * u * t * c[1][d] + 3 * u * t * t * c[2][d] + t * t * t * c[3][d]));
      }
      const Q = P.map((p) => [this.px(p[0]), this.py(p[1])]), x = this.ctx;
      x.save(); x.globalAlpha = alpha; x.strokeStyle = x.fillStyle = color; x.lineWidth = lw * this.b; x.lineJoin = x.lineCap = "round";
      let end = Q.at(-1);
      if (head) {                                              // small filled head, line stops at its base
        const [a, b] = [Q.at(-2), Q.at(-1)];
        let ux = b[0] - a[0], uy = b[1] - a[1]; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        const hl = head * this.b, hw = 0.42 * head * this.b, tip = [b[0] - ux * 2 * this.b, b[1] - uy * 2 * this.b];
        end = [tip[0] - ux * hl * 0.8, tip[1] - uy * hl * 0.8];
        x.beginPath(); x.moveTo(tip[0], tip[1]);
        x.lineTo(tip[0] - ux * hl - uy * hw, tip[1] - uy * hl + ux * hw); x.lineTo(tip[0] - ux * hl + uy * hw, tip[1] - uy * hl - ux * hw);
        x.closePath(); x.fill();
      }
      x.beginPath(); x.moveTo(Q[0][0], Q[0][1]); for (const q of Q.slice(1, -1)) x.lineTo(q[0], q[1]); x.lineTo(end[0], end[1]); x.stroke();
      x.restore();
    }
    blob(pts, color, alpha) {                                  // 3 covariance ellipses, 2.6 / 1.8 / 1.0 std
      if (alpha <= 0 || pts.length < 3) return;
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [a, b] of pts) { sxx += (a - mx) ** 2; syy += (b - my) ** 2; sxy += (a - mx) * (b - my); }
      sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, d = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + d, l2 = tr / 2 - d, ang = Math.atan2(l1 - sxx, sxy || 1e-12), x = this.ctx;
      x.save(); x.globalAlpha = alpha;
      for (const [k, f] of [[2.6, 0.9], [1.8, 0.84], [1.0, 0.76]]) {
        x.fillStyle = mix(color, this.T.disc, f); x.beginPath();
        x.ellipse(this.px(mx), this.py(my), k * Math.sqrt(l1) * this.u, k * Math.sqrt(Math.max(l2, 0)) * this.u, -ang, 0, 2 * Math.PI); x.fill();
      }
      x.restore();
    }
    // right-hand side: roll-out arrow, goal, robot panel, result
    robotSide(a, frame, aEnd, ok, label) {
      const R = this.sc.layout.robot_panel, ra = this.sc.layout.roll_out_arrow, x = this.ctx, b = this.b;
      if (a > 0) {
        const A = [this.px(ra.from[0]), this.py(ra.from[1])], B = [this.px(ra.to[0]) - 4 * b, this.py(ra.to[1])], hl = 7 * b;
        x.save(); x.globalAlpha = a; x.strokeStyle = x.fillStyle = this.T.muted; x.lineWidth = 1.2 * b;
        x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0] - hl, B[1]); x.stroke();
        x.beginPath(); x.moveTo(B[0], B[1]); x.lineTo(B[0] - hl, B[1] - 3.2 * b); x.lineTo(B[0] - hl, B[1] + 3.2 * b); x.closePath(); x.fill(); x.restore();
        this.text("Roll out", [(ra.from[0] + ra.to[0]) / 2, ra.from[1]], { size: 10.5, color: this.T.muted, alpha: a, mono: true, base: "bottom", dy: -8 });
        const X0 = this.px(R.x0), Y0 = this.py(R.y0 + R.size), sz = R.size * this.u, im = this.frames[Math.max(0, Math.min(this.frames.length - 1, frame))];
        x.save(); x.globalAlpha = a; x.beginPath(); x.roundRect(X0, Y0, sz, sz, 8); x.clip();
        if (im.complete && im.naturalWidth) x.drawImage(im, X0, Y0, sz, sz); else { x.fillStyle = this.T.disc; x.fillRect(X0, Y0, sz, sz); }
        x.restore();
        x.save(); x.globalAlpha = a; x.strokeStyle = this.T.hair; x.lineWidth = 1 * b; x.beginPath(); x.roundRect(X0, Y0, sz, sz, 8); x.stroke(); x.restore();
        this.text("Goal · pick up mug", [R.x0 + R.size / 2, R.y0 + R.size], { size: 10.5, color: this.T.muted, alpha: a, mono: true, base: "bottom", dy: -8 });
      }
      if (aEnd > 0) {
        const col = ok ? this.T.pink : this.T.greyLine, cx = R.x0 + R.size / 2, y = R.y0;
        this.verdict(ok, label, [cx, y], col, aEnd);
      }
    }
    // "✓ Correct action" / "✕ Wrong action" under the robot: the mark is drawn (straight strokes), sized to the
    // capitals of the label and centred on them; mark and label together are centred under the robot
    verdict(ok, label, p, color, alpha) {
      const x = this.ctx, b = this.b; x.save(); x.globalAlpha = alpha;
      x.font = `550 ${13.5 * b}px ${this.T.sans}`; x.textBaseline = "top"; x.textAlign = "left";
      const m = x.measureText("H"), Y = this.py(p[1]) + 10 * b;
      const capTop = Y - m.actualBoundingBoxAscent, base = Y + m.actualBoundingBoxDescent, cap = base - capTop, mid = (capTop + base) / 2;
      const mw = ok ? 1.05 * cap : 0.82 * cap, gap = 5 * b, lw = x.measureText(label).width;
      const X0 = this.px(p[0]) - (mw + gap + lw) / 2;
      x.strokeStyle = color; x.lineWidth = 1.6 * b; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
      if (ok) { const h = 0.84 * cap; x.moveTo(X0, mid + 0.02 * h); x.lineTo(X0 + 0.36 * mw, mid + h / 2); x.lineTo(X0 + mw, mid - h / 2); }
      else { const h = mw / 2; x.moveTo(X0, mid - h); x.lineTo(X0 + mw, mid + h); x.moveTo(X0 + mw, mid - h); x.lineTo(X0, mid + h); }
      x.stroke();
      x.fillStyle = color; x.fillText(label, X0 + mw + gap, Y);
      x.restore();
    }
    policyTag(alpha = 1) {
      const L = this.sc.layout, lolip = this.sc.policy === "lolip";
      this.text(lolip ? "LoLip" : "Vanilla CFM", [L.noise_circle.c[0] - L.noise_circle.r, L.noise_circle.c[1] + L.noise_circle.r],
        { size: 11.5, color: lolip ? this.T.pink : this.T.muted, alpha, mono: true, align: "left", base: "bottom", weight: lolip ? 600 : 400, dy: -6 });
    }
    spaceLabels(aN, aA) {
      const L = this.sc.layout;
      this.text("Noise space", [L.noise_circle.c[0], L.noise_circle.c[1] - L.noise_circle.r], { size: 10.5, color: this.T.muted, alpha: aN, mono: true, base: "top", dy: 10 });
      this.text("Action space", [L.action_circle.c[0], L.action_circle.c[1] - L.action_circle.r], { size: 10.5, color: this.T.muted, alpha: aA, mono: true, base: "top", dy: 10 });
    }
    // ---- playback
    play(from, to, speed, done) {
      cancelAnimationFrame(this.raf);
      if (window.SHOT) { this.t = to; this.draw(to); done?.(); return; }
      let t0 = null;
      const step = (now) => {
        t0 ??= now;
        const t = Math.min(to, from + ((now - t0) / 1000) * speed);
        this.t = t; this.draw(t);
        if (t < to) this.raf = requestAnimationFrame(step); else done?.();
      };
      this.raf = requestAnimationFrame(step);
    }
    stop() { cancelAnimationFrame(this.raf); cancelAnimationFrame(this.sparkRaf); this.sparkT = null; }
    // site addition: while the noise policy is fit, the Pick Mug noises light up one by one in a random order
    sparkle(at, sec, done) {
      cancelAnimationFrame(this.sparkRaf);
      if (window.SHOT) { done?.(); return; }
      let t0 = null;
      const step = (now) => {
        t0 ??= now;
        this.sparkT = (now - t0) / 1000;
        this.draw(at);
        if (this.sparkT < sec) this.sparkRaf = requestAnimationFrame(step); else { this.sparkT = null; this.draw(at); done?.(); }
      };
      this.sparkRaf = requestAnimationFrame(step);
    }
    draw(t) {
      if (!this.W) return;
      this.T = tokens();
      this.ctx.clearRect(0, 0, this.W, this.H);
      this.render(t);
    }
  }

  // ------------------------------------------------------------------ action spread (t = timeline time)
  class Spread extends Scene {
    get end() { return this.sc.clock.T_END + 1.0; }
    render(t) {
      const sc = this.sc, L = sc.layout, C = sc.clock, T = this.T;
      const a_in = g(sramp(t, 0.3, 1.5)), a_sel = sramp(t, C.T_PICK, C.T_PICK + 0.6), rest = a_in * (1 - 0.8 * a_sel);
      this.policyTag();
      this.disc(L.noise_circle.c, L.noise_circle.r, a_in);
      this.disc(L.action_circle.c, L.action_circle.r, a_in);
      this.blob(sc.action_points, MUG, rest);
      for (const b of sc.background_arrows) this.flow(b.from, b.to, MUG, 0.7, 0.35 * rest, 1);
      this.dots(sc.noise_points, MUG, 0.8 * rest, 2.6);
      this.dots(sc.action_points, MUG, 0.8 * rest, 2.6);
      sc.selected_arrows.forEach((s) => this.flow(s.from, s.to, MUG, 1.6, 0.9, ease(Math.min(1, Math.max(0, t - s.start_t))), 7));
      this.dots(sc.selected_noises, MUG, Math.max(a_sel, 0.8 * rest), 2.6 + 2.6 * a_sel, 1.2 * a_sel);
      const a_dot = sramp(t, C.T_FLOW + 1.4, C.T_FLOW + 1.8);
      this.dots(sc.selected_actions, MUG, a_dot, 2.6 + 2 * a_dot, 1.0 * a_dot);
      const a_lab = sramp(t, C.T_PICK + 0.3, C.T_PICK + 0.8), fl = L.far_apart_label;
      for (const q of fl.lines_to) this.leader(fl.xy, q, a_lab, 7);
      this.text("Far-apart noises", fl.xy, { size: 12.5, color: T.ink2, alpha: a_lab, align: "left", halo: true, dx: 4 });
      const a_ring = sramp(t, C.T_FLOW + 1.8, C.T_FLOW + 2.3), ring = L.spread_ring, sl = L.spread_label;
      this.ring(ring.c, ring.r, a_ring);
      this.leader(sl.xy, sl.line_to, a_ring);
      this.text(sc.policy === "lolip" ? "Wider spread" : "Narrow spread", sl.xy, { size: 12.5, color: T.ink2, alpha: a_ring, align: "left", halo: true, dx: 4 });
      this.text("Pick Mug", L.mode_label.xy, { size: 13, color: MUG, alpha: a_in, weight: 550, halo: true });
      this.spaceLabels(a_in, a_in);
      const ok = sc.policy === "lolip";
      this.robotSide(g(sramp(t, C.T_FLOW + 2.4, C.T_FLOW + 2.8)), Math.floor(Math.max(0, (t - C.T_CLIP) / C.robot_frame_dt)),
        sramp(t, C.T_END + 0.1, C.T_END + 0.6), ok, ok ? "High spread" : "Low spread");
    }
  }

  // ------------------------------------------------------------------ inference (ti = timeline time from 0)
  class Inference extends Scene {
    get T0() { return this.sc.clock.T0_intro; }
    get end() { return this.T0 + this.sc.clock.T_END_t + 1.0; }
    render(ti) {
      const sc = this.sc, L = sc.layout, C = sc.clock, T = this.T, t = ti - this.T0;
      const N = sc.noise_points.map((p) => p.xy), A = sc.action_points.map((p) => p.xy), task = sc.noise_points.map((p) => p.task);
      const hi = sc.selected, ins = sc.circle_dots, starts = sc.forward_arrows.map((f) => f.start_t);
      const a_noise = g(sramp(ti, 1.4, 2.4)), fo = 1 - 0.8 * sramp(ti, 2.6, 3.2), unf_n = sramp(t, 0.9, 1.3);
      const a_reg = sramp(t, 0.3, 0.9), a_hi = sramp(t, 2.6, 3.0);
      this.policyTag();
      this.disc(L.noise_circle.c, L.noise_circle.r, a_noise);
      this.disc(L.action_circle.c, L.action_circle.r, 1);
      for (const tk of ["mugplace", "bowlplace"]) this.blob(A.filter((_, i) => task[i] === tk), TC[tk], fo);
      sc.backward_arrows.forEach((b) => this.flow(A[b.i], N[b.i], TC[task[b.i]], 0.8, 0.45 * (1 - 0.85 * sramp(ti, 2.6, 3.2)), sramp(ti, b.start_ti, b.start_ti + 1.0), 5));
      ins.forEach((i, k) => this.flow(N[i], A[i], TC[task[i]], 0.8, 0.45, sramp(t, starts[k], starts[k] + 1.0), 5));
      for (const tk of ["bowlplace", "mugplace"]) this.dots(N.filter((_, i) => task[i] === tk), TC[tk], 0.85 * a_noise * fo, 2.6);
      for (const tk of ["mugplace", "bowlplace"]) this.dots(A.filter((_, i) => task[i] === tk), TC[tk], 0.85 * fo, 2.6);
      ins.forEach((i) => this.dots([N[i]], TC[task[i]], 0.9 * Math.max(a_noise * fo, unf_n), 2.6));
      ins.forEach((i, k) => this.dots([A[i]], TC[task[i]], 0.9 * Math.max(fo, sramp(t, starts[k] + 0.8, starts[k] + 1.1)), 2.6));
      const a_act = sramp(t, 4.2, 4.4);
      this.dots([A[hi]], TC[task[hi]], Math.max(0.85 * fo, a_act), 2.6 + 2 * a_act, 1.0 * a_act);
      const S = L.sample_circle, sl = L.sample_label;
      this.ring(S.c, S.r, a_reg);
      this.leader(sl.xy, sl.line_to, a_reg);
      this.text("Noise policy samples here", sl.xy, { size: 12.5, color: T.ink2, alpha: a_reg, align: "left", halo: true, dx: 4 });
      this.flow(N[hi], A[hi], TC[task[hi]], 2.2, 1, sramp(t, 3.2, 4.4), 9);
      this.dots([N[hi]], TC[task[hi]], a_hi, 5.5, 1.4);
      if (this.sparkT != null) this.drawSparkle(N, task);
      for (const m of L.mode_labels) this.text(m.text, m.xy, { size: 13, color: m.color, weight: 550, halo: true });
      this.spaceLabels(a_noise, 1);
      if (this.showTarget) {                                   // site addition: the target of the inference step
        const a = sramp(ti, this.T0 + 1.3, this.T0 + 1.8), x = this.ctx, b = this.b;
        const p = [L.noise_circle.c[0] + L.noise_circle.r + 0.3, L.noise_circle.c[1] + L.noise_circle.r - 0.15];
        x.save(); x.font = `600 ${12.5 * b}px ${T.sans}`; const w = x.measureText("Target: pick the mug").width; x.restore();
        x.save(); x.globalAlpha = a; x.fillStyle = T.pinkSoft; x.beginPath(); x.roundRect(this.px(p[0]) - 10 * b, this.py(p[1]) - 13 * b, w + 20 * b, 26 * b, 13 * b); x.fill(); x.restore();
        this.text("Target: pick the mug", p, { size: 12.5, color: T.pink, alpha: a, weight: 600, align: "left" });
      }
      const ok = L.end_label.mark === "tick";
      this.robotSide(g(sramp(t, 4.6, 5.2)), Math.floor(Math.max(0, (t - C.T_CLIP_t) / C.robot_frame_dt_t)),
        sramp(t, C.T_END_t + 0.1, C.T_END_t + 0.6), ok, ok ? "Correct action" : "Wrong action");
    }
  }

  // each Pick Mug noise flashes once (start time from a fixed hash of its index): the dot briefly grows
  Inference.prototype.drawSparkle = function (N, task) {
    const x = this.ctx, b = this.b, T = this.sparkT, hash = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
    x.save();
    N.forEach((p, i) => {
      if (task[i] !== "mugplace") return;
      const l = (T - hash(i) * 1.5) / 0.55;
      if (l <= 0 || l >= 1) return;
      const k = Math.sin(Math.PI * l), X = this.px(p[0]), Y = this.py(p[1]);
      x.globalAlpha = k;
      x.fillStyle = MUG; x.beginPath(); x.arc(X, Y, (2.6 + 1.6 * k) * b, 0, 2 * Math.PI); x.fill();
    });
    x.restore();
  };

  return { loadScene, Spread, Inference };
})();
