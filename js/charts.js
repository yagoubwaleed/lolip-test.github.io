// Charts and per-slide hooks. Every chart is drawn from data/*.json (tools/export_site_data.py) and replays its
// entrance animation each time its slide opens.
window.SLIDES = {};
(() => {
  // colours are CSS tokens (css/site.css), set as inline styles so the charts follow light / dark mode
  const C = { ink: "var(--ink)", muted: "var(--muted)", pink: "var(--pink)", pinkFill: "#e35886", b1: "#e4569c", orange: "#e48a56",
              grey: "#a6a6aa", greyLine: "var(--grey-line)", greyFill: "var(--bar-grey)", hair: "var(--hair)", mug: "#d91e5b", bowl: "#e48a56" };
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const cache = {};
  const load = (n) => (cache[n] ??= fetch(`data/${n}.json`).then((r) => r.json()));
  const ns = "http://www.w3.org/2000/svg";
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const pct = (v, d = 0) => `${(100 * v).toFixed(d)}%`;

  // ------------------------------------------------------------ tooltip
  const tip = document.getElementById("tip");
  tip.style.position = "fixed";
  const showTip = (e, html) => { tip.innerHTML = html; tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.style.opacity = 1; };
  const hideTip = () => (tip.style.opacity = 0);

  // run fn(t) for t in 0..1 over ms; returns a cancel function
  function tween(ms, fn, delay = 0) {
    if (window.SHOT) { fn(1); return () => {}; }
    let raf, t0;
    const step = (now) => {
      t0 ??= now + delay;
      const t = clamp((now - t0) / ms);
      if (now >= t0) fn(t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }

  function svgEl(el, W, H) {
    return d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  }

  function hatch(svg, id, color) {
    const p = svg.append("defs").append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 6).attr("height", 6).style("fill", C.greyFill);
    p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).style("stroke", color).attr("stroke-width", 1.1).attr("opacity", .55);
  }

  function decadeTicks(g, x, lo, hi, y) {
    for (let k = Math.round(Math.log10(lo)); k <= Math.round(Math.log10(hi)); k++) {
      if (k % 2) continue;
      const t = g.append("text").attr("x", x(10 ** k)).attr("y", y).attr("text-anchor", "middle").attr("class", "mono")
        .style("fill", "var(--tick)").attr("font-size", 12.5);
      t.append("tspan").text("10");
      t.append("tspan").attr("dy", -6).attr("font-size", 9).text(k);
    }
  }

  // ------------------------------------------------------------ histogram of singular values (log x)
  function histChart(el, { edges, lo, hi, ymax, ref, refLabel, xLabel, readout }) {
    const W = 640, H = 380, m = { l: 18, r: 18, t: 40, b: 64 };
    const svg = svgEl(el, W, H);
    const x = d3.scaleLog().domain([lo, hi]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, ymax]).range([H - m.b, m.t]);
    const base = H - m.b;
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", base).attr("y2", base).style("stroke", "var(--axis)");
    decadeTicks(svg, x, lo, hi, base + 24);
    svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 10).attr("text-anchor", "middle").attr("class", "axis-label").text(xLabel);
    const refG = svg.append("g");
    refG.append("line").attr("x1", x(ref)).attr("x2", x(ref)).attr("y1", m.t - 14).attr("y2", base).style("stroke", C.ink).attr("stroke-width", 1.1).attr("stroke-dasharray", "4 4").attr("opacity", .55);
    refG.append("text").attr("x", x(ref) + 8).attr("y", m.t - 4).attr("font-size", 13).style("fill", C.muted).text(refLabel);
    const floorG = svg.append("g").attr("opacity", 0);
    const areas = svg.append("g");
    const labels = svg.append("g");
    let series = [];

    function path(share, k) {
      const n = share.length;
      let d = `M${x(edges[0])},${base}`;
      for (let i = 0; i < n; i++) {
        const f = ease(clamp(k * 1.7 - (i / n) * 0.7));          // wave from left to right
        const yy = y(share[i] * f);
        d += `L${x(edges[i])},${yy}L${x(edges[i + 1])},${yy}`;
      }
      return d + `L${x(edges[n])},${base}Z`;
    }
    function draw(k = 1) {
      const sel = areas.selectAll("path").data(series, (s) => s.key);
      sel.join("path").attr("d", (s) => path(s.share, k)).style("fill", (s) => s.color).attr("fill-opacity", (s) => s.opacity ?? 1);
      const lab = labels.selectAll("text").data(series.filter((s) => s.label), (s) => s.key);
      lab.join("text").attr("font-size", 15).attr("font-weight", (s) => s.bold ? 600 : 450)
        .style("fill", (s) => s.labelColor ?? s.color).attr("text-anchor", "middle")
        .attr("opacity", ease(clamp(k * 2 - 1)))
        .each(function (s) {
          const j = d3.maxIndex(s.share);
          const px = Math.sqrt(edges[j] * edges[j + 1]);
          d3.select(this).attr("x", x(px)).attr("y", y(s.share[j] * ease(clamp(k * 1.7 - (j / s.share.length) * 0.7))) - 12).text(s.label);
        });
    }
    function setFloor(v, label, op) {
      floorG.selectAll("*").remove();
      floorG.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t - 14).attr("y2", base).style("stroke", C.pink).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4");
      floorG.append("text").attr("x", x(v) - 8).attr("text-anchor", "end").attr("y", m.t + 12).attr("font-size", 13).style("fill", C.pink).attr("font-weight", 600).text(label);
      floorG.attr("opacity", op);
    }

    // hover readout
    const hov = svg.append("g").attr("pointer-events", "none").attr("opacity", 0);
    hov.append("line").attr("y1", m.t - 14).attr("y2", base).style("stroke", C.ink).attr("stroke-width", 1);
    svg.append("rect").attr("x", m.l).attr("y", m.t - 14).attr("width", W - m.l - m.r).attr("height", base - m.t + 14).style("fill", "transparent")
      .on("pointermove", (e) => {
        const [px] = d3.pointer(e);
        const v = x.invert(px);
        hov.attr("opacity", 1).select("line").attr("x1", px).attr("x2", px);
        showTip(e, readout(v, series.map((s) => ({ ...s, below: below(s.share, v) }))));
      })
      .on("pointerleave", () => { hov.attr("opacity", 0); hideTip(); });
    function below(share, v) {                                   // share of values below v, at bin resolution
      let s = 0;
      for (let i = 0; i < share.length; i++) {
        if (edges[i + 1] <= v) s += share[i];
        else { if (edges[i] < v) s += share[i] * (Math.log(v / edges[i]) / Math.log(edges[i + 1] / edges[i])); break; }
      }
      return s;
    }
    let cancel = () => {};
    return {
      set(s) { series = s; },
      draw, setFloor,
      play(ms = 1500) { cancel(); draw(0); cancel = tween(ms, draw); },
    };
  }

  // ------------------------------------------------------------ grouped bars, Vanilla vs LoLip
  function barChart(el, { groups, W = 680, maxBar = 44, yMax = 1, yTicks, fmt = pct, H = 380, labels = false, ratio = false, rotate = false, sepBeforeLast = false }) {
    const m = { l: 46, r: 8, t: 26, b: rotate ? 92 : 48 };
    const svg = svgEl(el, W, H);
    hatch(svg, `h${el.id}`, C.greyLine);
    const x = d3.scaleBand().domain(groups.map((g) => g.name)).range([m.l, W - m.r]).paddingInner(.28).paddingOuter(.12);
    const y = d3.scaleLinear().domain([0, yMax]).range([H - m.b, m.t]);
    const g = svg.append("g");
    for (const t of yTicks) {
      g.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).style("stroke", t === 0 ? "var(--axis)" : "var(--gridline)");
      g.append("text").attr("x", m.l - 10).attr("y", y(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 11.5).style("fill", "var(--tick)").text(fmt(t));
    }
    if (sepBeforeLast) {
      const xs = x(groups.at(-1).name) - x.step() * x.paddingInner() / 2;
      g.append("line").attr("x1", xs).attr("x2", xs).attr("y1", m.t - 10).attr("y2", H - m.b).style("stroke", "var(--axis)");
    }
    const bw = Math.min(x.bandwidth() / 2, maxBar), off = (x.bandwidth() - 2 * bw) / 2;   // capped bar width, pair centred in its band
    const bx = (d) => x(d.gr.name) + off + d.j * bw;
    const items = groups.flatMap((gr, gi) => ["vanilla", "lolip"].map((k, j) => ({ gr, gi, k, j, v: gr[k].mean, sd: gr[k].sd })));
    const bars = svg.append("g").selectAll("g").data(items).join("g");
    const rects = bars.append("rect").attr("x", (d) => bx(d) + 1.5).attr("width", bw - 3)
      .style("fill", (d) => (d.k === "lolip" ? C.pinkFill : `url(#h${el.id})`)).style("stroke", (d) => (d.k === "lolip" ? C.pink : "var(--bar-edge)")).attr("stroke-width", 1.5)
      .attr("y", y(0)).attr("height", 0);
    const errs = bars.filter((d) => d.sd != null).append("path").style("stroke", C.ink).attr("stroke-width", 1.1).style("fill", "none").attr("opacity", 0)
      .attr("d", (d) => { const cx = bx(d) + bw / 2, a = y(clamp(d.v - d.sd, 0, yMax)), b = y(Math.min(d.v + d.sd, yMax)); return `M${cx},${a}V${b}M${cx - 4},${a}H${cx + 4}M${cx - 4},${b}H${cx + 4}`; });
    const vals = labels ? bars.append("text").attr("x", (d) => bx(d) + bw / 2).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", (d) => (d.k === "lolip" ? 600 : 450))
      .style("fill", (d) => (d.k === "lolip" ? C.pink : C.greyLine)).attr("opacity", 0) : null;
    const ratios = ratio ? svg.append("g").selectAll("text").data(groups).join("text").attr("x", (d) => x(d.name) + x.bandwidth() / 2).attr("y", (d) => y(Math.max(d.vanilla.mean, d.lolip.mean)) - 14)
      .attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 600).style("fill", C.pink).attr("opacity", 0).text((d) => `×${(d.lolip.mean / d.vanilla.mean).toFixed(2)}`) : null;
    // x labels
    const xl = svg.append("g").selectAll("text").data(groups).join("text").attr("font-size", rotate ? 12 : 13.5).style("fill", C.ink)
      .attr("font-weight", (d) => (d.mean ? 600 : 400));
    if (rotate) xl.attr("text-anchor", "end").attr("transform", (d) => `translate(${x(d.name) + x.bandwidth() / 2 + 4},${H - m.b + 14}) rotate(-38)`).text((d) => d.name);
    else xl.attr("text-anchor", "middle").attr("x", (d) => x(d.name) + x.bandwidth() / 2).attr("y", H - m.b + 26).text((d) => d.name);
    bars.style("cursor", "default")
      .on("pointerenter", (e, d) => showTip(e, `<b>${d.gr.name}</b><br><i style="background:${d.k === "lolip" ? C.pink : C.grey}"></i>${d.k === "lolip" ? "LoLip" : "Vanilla CFM"} <span class="mono">${fmt(d.v, 1)}${d.sd != null ? ` ± ${fmt(d.sd, 1)}` : ""}</span>`))
      .on("pointermove", (e, d) => { tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; })
      .on("pointerleave", hideTip);
    let cancel = () => {};
    return {
      play() {
        cancel();
        const n = items.length;
        cancel = tween(1500, (k) => {
          rects.each(function (d, i) {
            const f = ease(clamp(k * 1.8 - (i / n) * 0.8));
            d3.select(this).attr("y", y(d.v * f)).attr("height", y(0) - y(d.v * f));
          });
          const late = ease(clamp(k * 3 - 2));
          errs.attr("opacity", late);
          if (vals) vals.attr("opacity", late).attr("y", (d) => y(Math.min(d.v + (d.sd ?? 0), yMax)) - 10).text((d) => fmt(d.v * ease(clamp(k * 1.25)), 0));
          if (ratios) ratios.attr("opacity", late);
        });
      },
    };
  }

  // ------------------------------------------------------------ learning curves, small multiples
  const RL_METHODS = [
    { k: "vanilla", label: "Vanilla CFM", color: C.greyLine, w: 1.6, dash: "6 3" },
    { k: "sigma_bc", label: "Sigma-BC", color: C.orange, w: 1.6 },
    { k: "postbc", label: "POSTBC", color: C.b1, w: 1.6, dash: "3 2" },
    { k: "lolip", label: "LoLip (Ours)", color: C.pink, w: 2.6 },
  ];
  function curvesChart(el, steps, panels, { legendEl } = {}) {
    el.innerHTML = "";
    const cols = panels.length > 4 ? 3 : 2, rows = Math.ceil(panels.length / cols);
    const PW = cols === 3 ? 262 : 330, PH = 196, gap = cols === 3 ? 18 : 22, W = cols * PW + (cols - 1) * gap, H = rows * PH + (rows - 1) * gap + 24;
    const svg = svgEl(el, W, H);
    const m = { l: 34, r: 8, t: 26, b: 24 };
    const id = `clip${Math.random().toString(36).slice(2, 8)}`;
    const clipR = svg.append("defs").append("clipPath").attr("id", id).append("rect").attr("x", 0).attr("y", 0).attr("height", PH).attr("width", 0);
    const xs = d3.scaleLinear().domain([0, 5e5]).range([m.l, PW - m.r]);
    const ys = d3.scaleLinear().domain([0, 1]).range([PH - m.b, m.t]);
    const gs = [];
    panels.forEach((p, pi) => {
      const g = svg.append("g").attr("transform", `translate(${(pi % cols) * (PW + gap)},${Math.floor(pi / cols) * (PH + gap)})`);
      gs.push(g);
      g.append("text").attr("x", m.l).attr("y", 12).attr("font-size", 14).attr("font-weight", 550).text(p.name);
      for (const t of [0, .5, 1]) {
        g.append("line").attr("x1", m.l).attr("x2", PW - m.r).attr("y1", ys(t)).attr("y2", ys(t)).style("stroke", t ? "var(--gridline)" : "var(--axis)");
        g.append("text").attr("x", m.l - 7).attr("y", ys(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 10.5).style("fill", "var(--tick)").text(t * 100 + "%");
      }
      for (const t of [0, 2e5, 4e5]) g.append("text").attr("x", xs(t)).attr("y", PH - 6).attr("text-anchor", "middle").attr("class", "mono").attr("font-size", 10.5).style("fill", "var(--tick)").text(t ? `${t / 1e3}k` : "0");
      const body = g.append("g").attr("clip-path", `url(#${id})`);
      for (const M of RL_METHODS) {
        const d = p[M.k];
        if (!d) continue;
        const idx = d3.range(steps.length).filter((i) => d.mean[i] != null);
        body.append("path").attr("class", `m-${M.k}`).style("fill", M.color).attr("opacity", M.k === "lolip" ? .14 : .06)
          .attr("d", d3.area().x((i) => xs(steps[i])).y0((i) => ys(d.lo[i])).y1((i) => ys(d.hi[i])).curve(d3.curveMonotoneX)(idx));
        body.append("path").attr("class", `m-${M.k}`).style("fill", "none").style("stroke", M.color).attr("stroke-width", M.w).attr("stroke-dasharray", M.dash ?? null).attr("stroke-linejoin", "round")
          .attr("d", d3.line().x((i) => xs(steps[i])).y((i) => ys(d.mean[i])).curve(d3.curveMonotoneX)(idx));
      }
      const hl = g.append("line").attr("y1", m.t).attr("y2", PH - m.b).style("stroke", C.ink).attr("opacity", 0).attr("pointer-events", "none");
      g.append("rect").attr("x", m.l).attr("y", m.t).attr("width", PW - m.l - m.r).attr("height", PH - m.t - m.b).style("fill", "transparent")
        .on("pointermove", (e) => {
          const [px] = d3.pointer(e);
          const i = Math.round(clamp(xs.invert(px), 0, 5e5) / 1e4);
          hl.attr("x1", xs(steps[i])).attr("x2", xs(steps[i])).attr("opacity", .35);
          const lines = RL_METHODS.slice().reverse().filter((M) => p[M.k] && p[M.k].mean[i] != null)
            .map((M) => `<i style="background:${M.color}"></i>${M.label} <span class="mono">${pct(p[M.k].mean[i])}</span>`).join("<br>");
          showTip(e, `<b>${p.name}</b> <span class="mono">· ${steps[i] / 1e3}k steps</span><br>${lines}`);
        })
        .on("pointerleave", () => { hl.attr("opacity", 0); hideTip(); });
    });
    svg.append("text").attr("x", W / 2).attr("y", H - 2).attr("text-anchor", "middle").attr("class", "axis-label").text("Environment steps");
    if (legendEl) {
      legendEl.innerHTML = RL_METHODS.slice().reverse().map((M) => `<span data-k="${M.k}"><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" style="stroke:${M.color}" stroke-width="${M.w + .4}" ${M.dash ? `stroke-dasharray="${M.dash}"` : ""}/></svg>${M.label}</span>`).join("");
      legendEl.querySelectorAll("span").forEach((s) => {
        s.onpointerenter = () => svg.selectAll("path[class^=m-]").attr("opacity", function () { return this.classList.contains(`m-${s.dataset.k}`) ? null : .06; });
        s.onpointerleave = () => svg.selectAll("path[class^=m-]").attr("opacity", function () { return this.style.fill !== "none" ? (this.classList.contains("m-lolip") ? .14 : .06) : null; });
      });
    }
    let cancel = () => {};
    return { play() { cancel(); clipR.attr("width", 0); cancel = tween(1700, (k) => clipR.attr("width", PW * ease(k))); } };
  }

  // ------------------------------------------------------------ pipeline diagrams (slides/figure_*_pipeline.py)
  function gaussGlyph(cx, cy, comps, col, GW = 130, GH = 44, i = 0) {
    const n = 120, b = cy + GH / 2;
    const xs = d3.range(n).map((k) => -1 + (2 * k) / (n - 1));
    const ys = xs.map((x) => d3.sum(comps, ([w, mu, sd]) => w * Math.exp(-0.5 * ((x - mu) / sd) ** 2)));
    const mx = d3.max(ys);
    const pts = xs.map((x, k) => [cx + (x * GW) / 2, b - (ys[k] / mx) * GH]);
    const line = pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    return `<g style="--i:${i}"><polygon class="d-in" style="--i:${i};fill:${col}" points="${pts[0][0]},${b} ${line} ${pts.at(-1)[0]},${b}" fill-opacity=".16"/>` +
      `<polyline class="d-draw" style="--i:${i};fill:none;stroke:${col}" pathLength="1" points="${line}" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<line class="d-in" style="--i:${i};stroke:${C.ink}" x1="${cx - GW / 2 - 6}" y1="${b}" x2="${cx + GW / 2 + 6}" y2="${b}" stroke-width="2"/></g>`;
  }
  function arrowD(pts, col = C.ink, i = 0, dash = false) {
    const [a, b] = [pts.at(-2), pts.at(-1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const nx = -dy, ny = dx, h = 12;
    const bx = b[0] - dx * h, by = b[1] - dy * h;
    const line = [...pts.slice(0, -1), [bx, by]].map((p) => p.join(",")).join(" ");
    const head = `${b[0]},${b[1]} ${bx + nx * 6},${by + ny * 6} ${bx - nx * 6},${by - ny * 6}`;
    return dash
      ? `<polyline class="d-in" style="--i:${i};fill:none;stroke:${col}" points="${line}" stroke-width="2.2" stroke-dasharray="7 6"/><polygon class="d-in" style="--i:${i};fill:${col}" points="${head}"/>`
      : `<polyline class="d-draw" style="--i:${i};fill:none;stroke:${col}" pathLength="1" points="${line}" stroke-width="2.2"/><polygon class="d-in" style="--i:${i};fill:${col}" points="${head}"/>`;
  }
  const it = (s) => `<tspan font-style="italic">${s}</tspan>`;
  const SUB = (s) => `<tspan baseline-shift="sub" font-size=".68em">${s}</tspan>`;
  const SUP = (s) => `<tspan dx="2" baseline-shift="super" font-size=".62em">${s}</tspan>`;
  // kind: "pink" = trained (noise policy), "frozen" = the pretrained flow policy (light blue, snowflake), else grey
  function box(x0, x1, y, BH, name, kind, i) {
    const [fill, edge] = kind === "pink" ? ["var(--box-pink)", "var(--box-pink-edge)"] : kind === "frozen" ? ["var(--box-blue)", "var(--box-blue-edge)"] : ["var(--box)", C.ink];
    const label = kind === "frozen" ? `<tspan font-size=".86em">❄\uFE0F</tspan>\u2009${name}` : name;
    return `<g class="d-in" style="--i:${i}"><rect class="bx" x="${x0}" y="${y - BH / 2}" width="${x1 - x0}" height="${BH}" rx="10" style="fill:${fill};stroke:${edge}" stroke-width="1.8"/><text x="${(x0 + x1) / 2}" y="${y}">${label}</text></g>`;
  }
  // step groups for the walk-through: G(steps, html, pulse) wraps a piece of the diagram; `steps` lists the steps that
  // light it up, `pulse` ("k.n") marks an arrow a dot travels along in step k (n-th in that step)
  const G = (steps, html, pulse) => `<g data-s="${steps}"${pulse ? ` data-p="${pulse}"` : ""}>${html}</g>`;
  function dsbcSVG() {
    const BX0 = 50, BX1 = 290, GX = 400, Y0 = 36, P = 100, BH = 54, GW = 130, W = 520, H = Y0 + 4 * P + 36, cx = (BX0 + BX1) / 2;
    const st = [["Demos", it("a") + SUB(it("D")), [[0.42, -0.45, 0.17], [1.0, 0.18, 0.2]], "var(--grey-line)"],
                ["Invert flow " + it("f") + SUP("−1"), it("w") + SUB(it("D")), [[1, 0, 0.3]], "var(--box-pink-edge)"],
                ["Noise policy " + it("π") + SUB(it("θ")), it("w′"), [[1, 0, 0.12]], "var(--box-pink-edge)"],
                ["Flow forward " + it("f"), it("a"), [[0.2, -0.3, 0.08], [1.0, 0.18, 0.11]], "var(--grey-line)"],
                ["Environment", it("s′"), null, null]];
    let p = "";
    st.forEach(([name, out, comps, col], k) => {
      const y = Y0 + k * P, i = 2 * k, step = k + 1;
      p += G(step, box(BX0, BX1, y, BH, name, k === 2 ? "pink" : k === 3 ? "frozen" : null, i));
      if (k + 1 < st.length) p += G(step + 1, arrowD([[cx, y + BH / 2 + 3], [cx, y + P - BH / 2 - 3]], C.ink, i + 1), `${step + 1}.1`);
      p += G(step, arrowD([[BX1 + 4, y], [GX - GW / 2 - 14, y]], C.ink, i + 1), `${step}.3`);
      p += G(step, comps ? gaussGlyph(GX, y, comps, col, GW, 44, i + 1) + `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX + GW / 2 + 16}" y="${y}">${out}</text>`
                         : `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX - GW / 2 + 4}" y="${y}">${out}</text>`);
    });
    const y2 = Y0 + 2 * P;
    p += G(3, `<text class="d-in" style="--i:4" x="${BX0 - 34}" y="${y2}">${it("s")}</text>` + arrowD([[BX0 - 22, y2], [BX0 - 3, y2]], C.ink, 4), "3.2");
    return `<svg class="dg" viewBox="-6 0 ${W + 18} ${H}">${p}</svg>`;
  }
  function dsrlSVG() {
    const BX0 = 70, BX1 = 300, GX = 410, YS = [96, 206, 316], BH = 54, GW = 130, LX = 26, LY = 404, W = 520, H = 424, cx = (BX0 + BX1) / 2;
    const st = [["Noise policy " + it("π") + SUP(it("W")), it("w"), [[1, 0, 0.12]], "var(--box-pink-edge)"],
                ["Flow policy " + it("π") + SUB("dp"), it("a"), [[0.45, -0.4, 0.13], [1.0, 0.25, 0.15]], "var(--grey-line)"],
                ["Environment", it("s′"), null, null]];
    let p = G("4", `<rect class="d-in" style="--i:3;fill:none;stroke:var(--frame)" x="${BX0 - 14}" y="${YS[1] - BH / 2 - 14}" width="${BX1 - BX0 + 28}" height="${YS[2] - YS[1] + BH + 50}" rx="14" stroke-width="1.6"/>` +
            `<text class="d-in" style="--i:3;font-size:19px;fill:${C.muted}" x="${cx}" y="${YS[2] + BH / 2 + 19}">Latent-action environment</text>`);
    p += G(1, `<text class="d-in" style="--i:0" x="${cx}" y="${YS[0] - BH / 2 - 52}">${it("s")}</text>` + arrowD([[cx, YS[0] - BH / 2 - 36], [cx, YS[0] - BH / 2 - 3]], C.ink, 0), "1.1");
    st.forEach(([name, out, comps, col], k) => {
      const y = YS[k], i = 1 + 2 * k, step = k + 2;
      p += G(step, box(BX0, BX1, y, BH, name, k === 0 ? "pink" : k === 1 ? "frozen" : null, i));
      if (k + 1 < st.length) p += G(step + 1, arrowD([[cx, y + BH / 2 + 3], [cx, YS[k + 1] - BH / 2 - 3]], C.ink, i + 1), `${step + 1}.1`);
      p += G(step, arrowD([[BX1 + 4, y], [GX - GW / 2 - 14, y]], C.ink, i + 1), `${step}.2`);
      p += G(step, comps ? gaussGlyph(GX, y, comps, col, GW, 44, i + 1) + `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX + GW / 2 + 16}" y="${y}">${out}</text>`
                         : `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX - GW / 2 + 4}" y="${y}">${out}</text>`);
    });
    const sx = GX - GW / 2 + 16;
    p += G(5, arrowD([[sx, YS[2] + 22], [sx, LY], [LX, LY], [LX, YS[0]], [BX0 - 3, YS[0]]], "var(--box-pink-edge)", 7, true) +
         `<text class="d-in" style="--i:7;font-size:21px;fill:var(--box-pink-edge);paint-order:stroke;stroke:var(--bg)" stroke-width="10" x="${(sx + LX) / 2 + 60}" y="${LY}">RL training</text>`, "5.1");
    return `<svg class="dg" viewBox="0 0 ${W} ${H}">${p}</svg>`;
  }
  const DSRL_STEPS = [
    "The robot observes its state <i>s</i>.",
    "The trained noise policy picks a noise <i>w</i>.",
    "The frozen flow policy turns <i>w</i> into an action <i>a</i>.",
    "The robot acts; the environment returns <i>s′</i> and a reward.",
    "RL updates only the noise policy, from the reward.",
  ];
  const DSBC_STEPS = [
    "Start from demonstrations, with actions <i>a</i><sub>D</sub>.",
    "Invert the frozen flow: each action gives its noise <i>w</i><sub>D</sub>.",
    "Train the noise policy to predict <i>w</i><sub>D</sub> from <i>s</i>.",
    "At test time, its noise <i>w′</i> runs through the flow to <i>a</i>.",
    "The robot acts; the flow's weights never change.",
  ];
  // play button: dims the diagram, then lights each step's pieces in order, draws its arrows, runs a dot along them,
  // and shows the step's sentence below the diagram; at the end everything is lit again
  function walkthrough(card, steps) {
    const svg = card.querySelector("svg.dg"), cap = card.querySelector(".dstep"), btn = card.querySelector(".dplay");
    const STEP = 2.8;
    let timers = [], rafs = [];
    const later = (sec, fn) => timers.push(setTimeout(fn, sec * 1000));
    const caption = (html) => { cap.style.opacity = 0; later(0.22, () => { cap.innerHTML = html; cap.style.opacity = 1; }); };
    function pulse(poly, color, dur) {
      const pts = poly.getAttribute("points").trim().split(/\s+/).map((q) => q.split(",").map(Number));
      const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])), total = d3.sum(seg);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", 6.5); dot.setAttribute("class", "pulse"); dot.style.fill = color;
      svg.appendChild(dot);
      let t0 = null;
      const step = (now) => {
        t0 ??= now;
        const f = Math.min(1, (now - t0) / (dur * 1000)), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        let d = e * total, i = 0;
        while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
        const u = seg[i] ? d / seg[i] : 0;
        dot.setAttribute("cx", pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u); dot.setAttribute("cy", pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u);
        dot.style.opacity = f < 0.1 ? f / 0.1 : f > 0.85 ? (1 - f) / 0.15 : 1;
        if (f < 1) rafs.push(requestAnimationFrame(step)); else dot.remove();
      };
      rafs.push(requestAnimationFrame(step));
    }
    function light(k) {
      svg.querySelectorAll("[data-s]").forEach((g) => {
        const ss = g.dataset.s.split(" ").map(Number);
        g.classList.toggle("lit", ss.includes(k));
        g.classList.toggle("past", !ss.includes(k) && ss.some((x) => x < k));
      });
      svg.querySelectorAll(`[data-s~="${k}"] .d-draw`).forEach((el) => {      // redraw this step's arrows and curves
        el.style.transition = "none"; el.style.strokeDashoffset = 1; el.getBoundingClientRect();
        el.style.transition = "stroke-dashoffset .7s cubic-bezier(.16,1,.3,1)"; el.style.strokeDashoffset = 0;
      });
      [...svg.querySelectorAll(`[data-p^="${k}."]`)].sort((a, b) => a.dataset.p.localeCompare(b.dataset.p))
        .forEach((g, n) => later(0.15 + n * 0.75, () => pulse(g.querySelector("polyline"), k === 5 && g.querySelector("[stroke-dasharray]") ? "var(--box-pink-edge)" : "var(--ink)", 0.75)));
      caption(`<span class="n">${k} / ${steps.length}</span>${steps[k - 1]}`);
    }
    function reset(keepCaption) {
      timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame); timers = []; rafs = [];
      svg.querySelectorAll(".pulse").forEach((d) => d.remove());
      svg.classList.remove("playing");
      svg.querySelectorAll("[data-s]").forEach((g) => g.classList.remove("lit", "past"));
      svg.querySelectorAll(".d-draw").forEach((el) => { el.style.transition = ""; el.style.strokeDashoffset = ""; });
      btn.classList.remove("on");
      if (!keepCaption) { cap.innerHTML = ""; cap.style.opacity = 1; }
    }
    btn.addEventListener("click", () => {
      reset(true);
      btn.classList.add("on");
      svg.classList.add("playing");
      steps.forEach((_, i) => later(0.35 + i * STEP, () => light(i + 1)));
      later(0.35 + steps.length * STEP, () => { svg.classList.remove("playing"); svg.querySelectorAll("[data-s]").forEach((g) => g.classList.remove("lit", "past")); btn.classList.remove("on"); cap.style.opacity = 0; });
    });
    return { reset: () => reset(false) };
  }

  // ------------------------------------------------------------ intro: rotating 3D noise space, narrated
  // The cloud: for each task and policy, a Gaussian fit (robust covariance) to the 3D PCA of the real inverted noises
  // (Isaac Lab, seed 0, 299 demonstrations; tools/export_site_data.py). Each dot is one standard-normal draw u, placed
  // at mu + A u in both policies' fits, so it morphs from its Vanilla CFM position to its LoLip one.
  // The narration dims the cloud (CSS opacity / blur on the canvas); it un-dims to show the noise space.
  const NARRATION = [
    [2.4, "We want to finetune this flow policy <b>without touching its weights</b>, by learning in its noise space."],
    [7.0, "But this noise space is difficult to learn: the noises of different tasks are intermixed."],
    [10.4, null],
    [13.2, "What if there was a way to make this noise space easier to learn?"],
    [17.2, "Introducing <b>LoLip</b>, a regularizer that creates smoother latent spaces."],
    [21.2, null],
    [27.4, "This noise space is easier to learn."],
    [30.6, '<a href="#setting" class="narr-go">Scroll right to learn how →</a>'],
  ];
  const DIM = [[2.2, 10.4], [12.9, 21.2], [27.2, 1e9]];   // dimmed while the narration is on screen
  const MORPH = [21.8, 25.0];
  const PER_TASK = 650, LEVELS = 7;
  function cloud3D(cv, data, narr) {
    const ctx = cv.getContext("2d"), p = narr.querySelector("p");
    let seed = 7;
    const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const place = (f, u) => f.mu.map((m, r) => m + f.A[r].reduce((s, a, c) => s + a * u[c], 0));
    const V = [], L = [], task = [], order = [];
    for (const t of ["mug", "bowl"]) for (let k = 0; k < PER_TASK; k++) {
      const u = [normal(), normal(), normal()];
      V.push(place(data.cloud[t].vanilla, u)); L.push(place(data.cloud[t].lolip, u)); task.push(t); order.push(rnd());
    }
    const N = task.length;
    const r97 = (Q) => Q.map((v) => Math.hypot(...v)).sort((a, b) => a - b)[Math.floor(0.97 * N)];
    const scale = 1 / Math.max(r97(V), r97(L));               // both states fit the canvas
    for (const P of [V, L]) for (const v of P) for (let d = 0; d < 3; d++) v[d] *= scale;
    let W, H, raf = null, t0 = null, shown = -1;
    const sstep = (t, a, b) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
    function size() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (!r.width) return;
      cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); W = r.width; H = r.height;
      if (window.SHOT && t0 !== null) frame(performance.now());     // resizing clears the canvas
    }
    function narrate(e) {
      let k = -1;
      NARRATION.forEach(([at], i) => { if (e >= at) k = i; });
      if (k === shown) return;
      shown = k;
      p.classList.remove("on");
      const html = k >= 0 ? NARRATION[k][1] : null;
      setTimeout(() => { if (shown === k && html) { p.innerHTML = html; p.classList.add("on"); } }, window.SHOT ? 0 : 420);
    }
    const paths = Array.from({ length: LEVELS * 2 }, () => null);
    function frame(now) {
      t0 ??= now;
      if (!W) { if (!window.SHOT) raf = requestAnimationFrame(frame); return; }
      const e = window.SHOT ? 26 : (now - t0) / 1000, rot = (now / 1000) * 0.45, tilt = 0.42;
      narrate(e);
      const dim = Math.max(...DIM.map(([a, b]) => sstep(e, a, a + 0.7) * (1 - sstep(e, b, b + 0.6))));
      cv.style.opacity = (1 - 0.78 * dim).toFixed(3);
      cv.style.filter = dim > 0.01 ? `blur(${(2.2 * dim).toFixed(2)}px)` : "none";
      const m = sstep(e, MORPH[0], MORPH[1]);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * (+cv.dataset.r || 0.4);   // data-r: radius as a fraction of the canvas
      const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let k = 0; k < paths.length; k++) paths[k] = new Path2D();
      for (let i = 0; i < N; i++) {
        const f = m <= 0 ? 0 : m >= 1 ? 1 : sstep(m * 1.5 - order[i] * 0.5, 0, 1), a = V[i], b = L[i];
        const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
        const x1 = x * cr + z * sr, z1 = -x * sr + z * cr, y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        const persp = 3.2 / (3.2 + z2), X = cx + x1 * R * persp, Y = cy - y2 * R * persp, r = 2.3 * persp;
        const lvl = Math.min(LEVELS - 1, Math.max(0, Math.floor(((1.3 - z2) / 2.6) * LEVELS)));   // 0 = far
        const path = paths[lvl * 2 + (task[i] === "mug" ? 0 : 1)];
        path.moveTo(X + r, Y); path.arc(X, Y, r, 0, 2 * Math.PI);
      }
      ctx.clearRect(0, 0, W, H);
      for (let l = 0; l < LEVELS; l++) {                       // far to near
        ctx.globalAlpha = 0.28 + (0.62 * l) / (LEVELS - 1);
        ctx.fillStyle = C.bowl; ctx.fill(paths[l * 2 + 1]);
        ctx.fillStyle = C.mug; ctx.fill(paths[l * 2]);
      }
      if (!window.SHOT) raf = requestAnimationFrame(frame);
    }
    size();
    new ResizeObserver(size).observe(cv);
    return {
      start() { cancelAnimationFrame(raf); t0 = null; shown = -1; p.classList.remove("on"); raf = requestAnimationFrame(frame); if (window.SHOT) frame(performance.now()); },
      stop() { cancelAnimationFrame(raf); raf = null; },
    };
  }

  // ------------------------------------------------------------ segmented toggle
  function seg(el, onChange) {
    const knob = el.querySelector(".knob"), bs = [...el.querySelectorAll("button")];
    const place = (b) => { knob.style.width = b.offsetWidth + "px"; knob.style.transform = `translateX(${b.offsetLeft - 3}px)`; };
    bs.forEach((b) => b.addEventListener("click", () => {
      if (b.getAttribute("aria-pressed") === "true") return;
      bs.forEach((o) => o.setAttribute("aria-pressed", o === b));
      place(b); onChange(b.dataset.v);
    }));
    const fix = () => place(bs.find((b) => b.getAttribute("aria-pressed") === "true"));
    fix(); addEventListener("resize", fix);
    return { fix };
  }

  // ================================================================ slides
  const playVid = (...ids) => ids.forEach((id) => { const v = document.getElementById(id); v.currentTime = 0; v.play().catch(() => {}); });
  const stopVid = (...ids) => ids.forEach((id) => document.getElementById(id).pause());

  let cloud;
  SLIDES.intro = {
    async init() {
      cloud = cloud3D(document.getElementById("cloudCanvas"), await load("latent"), document.getElementById("narr"));
      document.getElementById("cloudReplay").addEventListener("click", () => cloud.start());
      const cp = document.getElementById("codeCopy");
      cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(document.querySelector(".code pre").textContent); cp.classList.add("done"); cp.title = "Copied"; } catch (e) {}
        setTimeout(() => { cp.classList.remove("done"); cp.title = "Copy"; }, 1400);
      });
    },
    async enter() { await load("latent"); cloud?.start(); },
    leave() { cloud?.stop(); },
  };

  let wDSRL, wDSBC;
  SLIDES.setting = {
    init() {
      document.getElementById("dgDSRL").innerHTML = dsrlSVG(); document.getElementById("dgDSBC").innerHTML = dsbcSVG();
      wDSRL = walkthrough(document.getElementById("dgDSRL").closest(".dcard"), DSRL_STEPS);
      wDSBC = walkthrough(document.getElementById("dgDSBC").closest(".dcard"), DSBC_STEPS);
    },
    leave() { wDSRL.reset(); wDSBC.reset(); },
  };

  const fwdReadout = (v, ss) => ss.map((s) => `<span class="mono">${pct(s.below)}</span> of singular values are below <span class="mono">${d3.format(".1~e")(v)}</span><br>(a change in the noise scaled down more than <span class="mono">${fmtX(1 / v)}</span>)`).join("<br>");
  const invReadout = (v, ss) => ss.map((s) => `<span class="mono">${pct(1 - s.below)}</span> of singular values are above <span class="mono">${d3.format(".1~e")(v)}</span><br>(a change in the action scaled up more than <span class="mono">${fmtX(v)}</span>)`).join("<br>");
  const fmtX = (v) => (v >= 1000 ? `${d3.format(",.0f")(v)}×` : v >= 10 ? `${v.toFixed(0)}×` : `${v.toFixed(1)}×`);

  // ------------------------------------------------------------ contraction scenes (js/scenes.js)
  const SCENE = { spread: { vanilla: "3_4_action_spread_vanilla", lolip: "3_4_action_spread_lolip" },
                  inference: { vanilla: "1_2_inference_vanilla", lolip: "1_2_inference_lolip" } };
  // one scene object per policy, created on first use; only the current one is shown
  function scenePool(host, kind) {
    const objs = {};
    return async (p) => {
      if (!objs[p]) {
        const el = document.createElement("div");
        host.appendChild(el);
        objs[p] = { el, sc: new (kind === "spread" ? Scenes.Spread : Scenes.Inference)(el, await Scenes.loadScene(SCENE[kind][p])) };
      }
      for (const k in objs) { objs[k].el.hidden = k !== p; if (k !== p) objs[k].sc.stop(); }
      objs[p].sc.resize();
      return objs[p].sc;
    };
  }
  // action spread: plays on its own, with replay and an optional Vanilla / LoLip switch
  function spreadWidget(hostId, initial) {
    const host = document.getElementById(hostId), bar = host.closest(".build").querySelector(".fig-head");
    const get = scenePool(host, "spread");
    let p = initial, cur = null;
    const run = async () => { cur = await get(p); cur.t = 0; cur.play(0, cur.end, cur.sc.clock.speedup); };
    bar.querySelector("[data-replay]").addEventListener("click", run);
    const ps = bar.querySelector("[data-policy]");
    if (ps) seg(ps, (v) => { p = v; run(); });
    return { run, stop: () => cur?.stop() };
  }
  // noise policy demo: (1) invert the demonstrations and fit the noise policy, (2) sample from it for "pick the mug"
  function inferenceWidget(hostId, initial) {
    const host = document.getElementById(hostId), fig = host.closest(".build"), bar = fig.querySelector(".fig-head");
    const bL = bar.querySelector("[data-learn]"), bI = bar.querySelector("[data-infer]"), st = fig.querySelector("[data-status]");
    const get = scenePool(host, "inference");
    let p = initial, cur = null, timers = [];
    const later = (sec, fn) => timers.push(setTimeout(fn, (sec * 1000) / cur.sc.clock.speedup));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const reset = async () => {
      clear(); cur?.stop();
      cur = await get(p);
      cur.showTarget = false; cur.t = 0; cur.draw(0);
      bL.disabled = false; bI.disabled = true; bL.classList.add("solid"); bI.classList.remove("solid");
      st.textContent = "";
    };
    const learn = (then) => {
      clear(); bL.disabled = bI.disabled = true; cur.showTarget = false;
      const v = cur.sc.clock.speedup;
      st.textContent = "Mapping 240 demonstrations back through the flow to their noises…";
      cur.play(0, 2.6, v, () => {
        st.textContent = "Fitting a noise policy to the noises of the Pick Mug demonstrations…";
        cur.sparkle(2.6, 2.3, () => cur.play(2.6, cur.T0 + 1.3, v, () => {
          st.textContent = "Noise policy learned: the dotted circle is where it samples for “pick the mug”.";
          bL.disabled = false; bL.classList.remove("solid"); bI.disabled = false; bI.classList.add("solid");
          then?.();
        }));
      });
    };
    const infer = () => {
      clear(); bL.disabled = bI.disabled = true; cur.showTarget = true;
      const t0 = cur.T0 + 1.3, mug = cur.sc.noise_points[cur.sc.selected].task === "mugplace";
      st.textContent = "Target: pick the mug. Sampling a noise from the noise policy…";
      later(2.6 - 1.3 + 0.3, () => (st.textContent = `The sampled noise is a ${mug ? "Pick Mug" : "Pick Bowl"} noise. Rolling out…`));
      cur.play(t0, cur.end, cur.sc.clock.speedup, () => {
        st.textContent = mug ? "The robot reaches for the mug." : "The robot reaches for the bowl, not the mug.";
        bL.disabled = false; bI.disabled = false;
      });
    };
    bL.addEventListener("click", () => learn());
    bI.addEventListener("click", infer);
    const ps = bar.querySelector("[data-policy]");
    if (ps) seg(ps, async (v) => { p = v; await reset(); });
    return { reset, stop: () => { clear(); cur?.stop(); }, demo: () => learn(infer) };
  }
  let wContr, hF;
  SLIDES.contraction = {
    async init() {
      wContr = spreadWidget("sceneSpreadV", "vanilla");
      const d = (await load("singular_values")).forward;
      hF = histChart(document.getElementById("histForward"), { edges: d.edges, lo: 1e-6, hi: 1e2, ymax: 1.12 * d3.max(d.vanilla.share), ref: 1, refLabel: "no change", xLabel: "Singular value of ∂a/∂z", readout: fwdReadout });
      hF.set([{ key: "v", share: d.vanilla.share, color: "var(--hist-grey)", label: "Vanilla CFM", labelColor: C.ink }]);
    },
    async enter() { await load("singular_values"); },
    build(k) { if (k === 0) wContr.run(); else { wContr.stop(); hF.play(); } },
    leave() { wContr.stop(); },
  };

  let wExp, expH;
  SLIDES.expansion = {
    async init() {
      wExp = inferenceWidget("sceneInfV", "vanilla");
      const d = (await load("singular_values")).inverse;
      expH = histChart(document.getElementById("expHist"), { edges: d.edges, lo: 1e-2, hi: 1e6, ymax: 1.12 * d3.max(d.vanilla.share), ref: 1, refLabel: "no change", xLabel: "Singular value of ∂z/∂a", readout: invReadout });
      expH.set([{ key: "v", share: d.vanilla.share, color: "var(--hist-grey)", label: "Vanilla CFM", labelColor: C.ink }]);
    },
    async enter() { await load("singular_values"); },
    async build(k) {
      if (k === 1) { wExp.stop(); return expH.play(); }
      await wExp.reset();
      if (window.SHOT) wExp.demo();
    },
    leave() { wExp.stop(); },
  };

  let hM, morphStop = () => {};
  SLIDES.method = {
    async init() {
      katex.render(String.raw`\mathcal{L} \;=\; \mathcal{L}_{\mathrm{CFM}} \;+\; \underbrace{\tfrac{\lambda}{2}\,\mathbb{E}_{x_t,\,u}\!\left[\max\!\big(0,\; s_{\min} - \lVert J_F(x_t)\,u \rVert\big)\right]}_{\color{#d91e5b}\textbf{LoLip}}`, document.getElementById("eqMain"), { displayMode: true });
      const st = document.getElementById("eqStep");
      katex.render(String.raw`J_F(x_t) = \tfrac{\partial}{\partial x_t}\big[x_t + \Delta t\, v_\theta(x_t, t)\big]`, st);
      st.insertAdjacentHTML("beforeend", `<span style="display:block;margin-top:4px">one Euler denoising step, not the whole flow</span>`);
      const sv = await load("singular_values"), d = sv.forward, q = sv.log_quantiles;
      const le = d.edges.map(Math.log10), n = d.edges.length - 1;
      const share = (t) => {
        const c = new Array(n).fill(0);
        for (let i = 0; i < q.vanilla.length; i++) {
          const v = clamp((1 - t) * q.vanilla[i] + t * q.lolip[i], le[0] + 1e-6, le[n] - 1e-6);
          c[Math.min(n - 1, Math.floor(((v - le[0]) / (le[n] - le[0])) * n))] += 1 / q.vanilla.length;
        }
        return c;
      };
      // endpoints are the measured histograms; in between, the quantile interpolation
      const ymax = 1.12 * Math.max(d3.max(d.vanilla.share), d3.max(d.lolip.share));
      hM = histChart(document.getElementById("histMorph"), { edges: d.edges, lo: 1e-6, hi: 1e2, ymax, ref: 1, refLabel: "no change", xLabel: "Singular value of ∂a/∂z", readout: fwdReadout });
      hM.setFloor(sv.floor, "floor", 0);
      const ci = (t) => d3.interpolateRgb(cssVar("--hist-grey"), cssVar("--pink"))(t);
      const set = (t) => {
        const sh = t <= 0 ? d.vanilla.share : t >= 1 ? d.lolip.share : share(t);
        hM.set([{ key: "m", share: sh, color: ci(t), opacity: .9, label: t < .5 ? "Vanilla CFM" : "LoLip", labelColor: t < .5 ? C.ink : C.pink, bold: t >= .5, side: t < .5 ? "left" : "right" }]);
        hM.setFloor(sv.floor, "floor", clamp(t * 1.5));
      };
      const range = document.getElementById("morphRange");
      range.addEventListener("input", () => { morphStop(); set(range.value / 1000); hM.draw(1); });
      this.run = () => {
        morphStop();
        range.value = 0; set(0); hM.play(1200);
        morphStop = tween(2200, (k) => { const t = d3.easeCubicInOut(k); range.value = t * 1000; set(t); hM.draw(1); }, 1700);
      };
      document.getElementById("morphPlay").addEventListener("click", () => this.run());
      addEventListener("themechange", () => { set(range.value / 1000); hM.draw(1); });
    },
    async enter() { await load("singular_values"); },
    build() { this.run?.(); },
    leave() { morphStop(); },
  };

  let wSpread, bS;
  SLIDES.spread = {
    async init() {
      wSpread = spreadWidget("sceneSpreadL", "lolip");
      const d = await load("action_std");
      const groups = d.tasks.map((t) => ({ name: t.name, vanilla: { mean: t.vanilla }, lolip: { mean: t.lolip } }));
      const mx = d3.max(groups, (g) => g.lolip.mean);
      bS = barChart(document.getElementById("barsSpread"), { groups, yMax: mx * 1.2, yTicks: [0, mx * 0.4, mx * 0.8].map((v) => +v.toPrecision(1)), fmt: (v) => v.toFixed(2), ratio: true });
      const lo = d3.min(d.tasks, (t) => t.ratio), hi = d3.max(d.tasks, (t) => t.ratio);
      document.getElementById("spreadRange").textContent = `${lo.toFixed(2)}–${hi.toFixed(2)}`;
    },
    async enter() { await load("action_std"); },
    build(k) { if (k === 0) wSpread.run(); else { wSpread.stop(); bS.play(); } },
    leave() { wSpread.stop(); },
  };

  let wSep;
  SLIDES.separation = {
    init() { wSep = inferenceWidget("sceneInfL", "lolip"); },
    async build() { await wSep.reset(); if (window.SHOT) wSep.demo(); },
    leave() { wSep.stop(); },
  };

  let bD;
  SLIDES.dsbc = {
    async init() {
      const d = await load("goal_dsbc");
      bD = barChart(document.getElementById("barsDSBC"), { groups: d.bars, yMax: 1.06, yTicks: [0, .25, .5, .75, 1], rotate: true, sepBeforeLast: true, H: 420 });
    },
    async enter() { await load("goal_dsbc"); },
    build() { bD.play(); },
  };

  const RL = {};
  SLIDES.dsrl = {
    async init() {
      const d = await load("rl");
      const at = (p, k) => d3.mean(p, (x) => x[k].mean.at(-1));
      for (const [v, host, leg, name] of [["goal", "curvesGoal", "legGoal", "4 LIBERO-Goal"], ["libero10", "curves10", "leg10", "5 LIBERO-10"]]) {
        RL[v] = { chart: curvesChart(document.getElementById(host), d.steps, d[v], { legendEl: document.getElementById(leg) }),
                  text: `Success rate after 500k environment steps, averaged over ${name} tasks: LoLip ${pct(at(d[v], "lolip"), 1)}, Vanilla CFM ${pct(at(d[v], "vanilla"), 1)}.` };
      }
    },
    async enter() { await load("rl"); },
    build(k) { const r = RL[k ? "libero10" : "goal"]; document.getElementById("rlStatLbl").textContent = r.text; r.chart.play(); },
  };

  let cReal;
  SLIDES.real = {
    async init() {
      const d = (await load("real_world")).plate;
      const el = document.getElementById("curveReal");
      const W = 600, H = 330, m = { l: 46, r: 104, t: 14, b: 52 };          // the video beside it spans the y axis (t to H - b)
      const svg = svgEl(el, W, H);
      const x = d3.scaleLinear().domain([0, d3.max(d.steps)]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
      for (const t of [0, .25, .5, .75, 1]) {
        svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).style("stroke", t ? "var(--gridline)" : "var(--axis)");
        svg.append("text").attr("x", m.l - 10).attr("y", y(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 12).style("fill", "var(--tick)").text(t * 100 + "%");
      }
      for (const t of [0, 20e3, 40e3, 60e3, 80e3]) svg.append("text").attr("x", x(t)).attr("y", H - m.b + 22).attr("text-anchor", "middle").attr("class", "mono").attr("font-size", 12).style("fill", "var(--tick)").text(t ? `${t / 1e3}k` : "0");
      svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("class", "axis-label").attr("font-size", 13.5).text("Environment steps");
      const cid = "clipReal";
      const clip = svg.append("defs").append("clipPath").attr("id", cid).append("rect").attr("height", H).attr("width", 0);
      const g = svg.append("g").attr("clip-path", `url(#${cid})`);
      const ser = [["vanilla", C.greyLine, 2, "6 3", "Vanilla CFM"], ["lolip", C.pink, 2.8, null, "LoLip"]];
      for (const [k, c, w, dash] of ser) {
        g.append("path").style("fill", "none").style("stroke", c).attr("stroke-width", w).attr("stroke-dasharray", dash).attr("d", d3.line().x((_, i) => x(d.steps[i])).y((v) => y(v))(d[k]));
        g.selectAll(null).data(d[k]).join("circle").attr("cx", (_, i) => x(d.steps[i])).attr("cy", (v) => y(v)).attr("r", k === "lolip" ? 4 : 3.4).style("fill", k === "lolip" ? c : "var(--bg)").style("stroke", c).attr("stroke-width", 1.6);
      }
      const ends = svg.append("g").attr("opacity", 0);                        // direct labels at the line ends
      for (const [k, c, , , lab] of ser) {
        const t = ends.append("text").attr("x", W - m.r + 12).attr("y", y(d[k].at(-1))).attr("dy", ".32em").attr("font-size", 14).style("fill", c);
        t.append("tspan").attr("font-weight", 600).text(pct(d[k].at(-1)));
        t.append("tspan").attr("dx", 6).attr("font-weight", 400).text(lab);
      }
      const hov = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).style("stroke", C.ink).attr("opacity", 0);
      svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).style("fill", "transparent")
        .on("pointermove", (e) => {
          const i = d3.minIndex(d.steps, (s) => Math.abs(s - x.invert(d3.pointer(e)[0])));
          hov.attr("x1", x(d.steps[i])).attr("x2", x(d.steps[i])).attr("opacity", .3);
          showTip(e, `<span class="mono">${d.steps[i] / 1e3}k steps</span><br><i style="background:${C.pink}"></i>LoLip <span class="mono">${pct(d.lolip[i])}</span><br><i style="background:${C.greyLine}"></i>Vanilla CFM <span class="mono">${pct(d.vanilla[i])}</span>`);
        })
        .on("pointerleave", () => { hov.attr("opacity", 0); hideTip(); });
      let cancel = () => {};
      // video: same height as the y axis, top aligned with 100%
      const vid = document.getElementById("rwVid");
      new ResizeObserver(() => { const w = el.getBoundingClientRect().width; vid.style.marginTop = `${(m.t * w) / W}px`; }).observe(el);
      cReal = { play() { cancel(); ends.attr("opacity", 0); cancel = tween(1900, (k) => { clip.attr("width", W * ease(k)); ends.attr("opacity", clamp(k * 4 - 3)); }); } };
    },
    async enter() { await load("real_world"); },
    build() { cReal.play(); playVid("vPlate"); },
    leave() { stopVid("vPlate"); },
  };

  let bC;
  SLIDES.cost = {
    async init() {
      const d = await load("libero90");
      bC = barChart(document.getElementById("barsCost"), { groups: d.groups, W: 440, yMax: 1.06, yTicks: [0, .25, .5, .75, 1], labels: true });
    },
    async enter() { await load("libero90"); },
    build() { bC.play(); },
  };
})();
