// Charts and per-slide hooks. Every chart is drawn from data/*.json (tools/export_site_data.py) and replays its
// entrance animation each time its slide opens.
window.SLIDES = {};
(() => {
  const C = { ink: "#0e0e10", muted: "#74747a", pink: "#d91e5b", pinkFill: "#e35886", b1: "#e4569c", orange: "#e48a56",
              grey: "#a6a6aa", greyLine: "#5f5f5f", greyFill: "#e4e4e6", hair: "#e8e6e3", mug: "#d91e5b", bowl: "#e48a56" };
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
    p.append("rect").attr("width", 6).attr("height", 6).attr("fill", C.greyFill);
    p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).attr("stroke", color).attr("stroke-width", 1.1).attr("opacity", .55);
  }

  function decadeTicks(g, x, lo, hi, y) {
    for (let k = Math.round(Math.log10(lo)); k <= Math.round(Math.log10(hi)); k++) {
      if (k % 2) continue;
      const t = g.append("text").attr("x", x(10 ** k)).attr("y", y).attr("text-anchor", "middle").attr("class", "mono")
        .attr("fill", "#8b8b91").attr("font-size", 12.5);
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
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", base).attr("y2", base).attr("stroke", "#d9d7d3");
    decadeTicks(svg, x, lo, hi, base + 24);
    svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 10).attr("text-anchor", "middle").attr("class", "axis-label").text(xLabel);
    const refG = svg.append("g");
    refG.append("line").attr("x1", x(ref)).attr("x2", x(ref)).attr("y1", m.t - 14).attr("y2", base).attr("stroke", C.ink).attr("stroke-width", 1.1).attr("stroke-dasharray", "4 4").attr("opacity", .55);
    refG.append("text").attr("x", x(ref) + 8).attr("y", m.t - 4).attr("font-size", 13).attr("fill", C.muted).text(refLabel);
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
      sel.join("path").attr("d", (s) => path(s.share, k)).attr("fill", (s) => s.color).attr("fill-opacity", (s) => s.opacity ?? 1);
      const lab = labels.selectAll("text").data(series.filter((s) => s.label), (s) => s.key);
      lab.join("text").attr("font-size", 15).attr("font-weight", (s) => s.bold ? 600 : 450)
        .attr("fill", (s) => s.labelColor ?? s.color).attr("text-anchor", "middle")
        .attr("opacity", ease(clamp(k * 2 - 1)))
        .each(function (s) {
          const j = d3.maxIndex(s.share);
          const px = Math.sqrt(edges[j] * edges[j + 1]);
          d3.select(this).attr("x", x(px)).attr("y", y(s.share[j] * ease(clamp(k * 1.7 - (j / s.share.length) * 0.7))) - 12).text(s.label);
        });
    }
    function setFloor(v, label, op) {
      floorG.selectAll("*").remove();
      floorG.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", m.t - 14).attr("y2", base).attr("stroke", C.pink).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 4");
      floorG.append("text").attr("x", x(v) - 8).attr("text-anchor", "end").attr("y", m.t + 12).attr("font-size", 13).attr("fill", C.pink).attr("font-weight", 600).text(label);
      floorG.attr("opacity", op);
    }

    // hover readout
    const hov = svg.append("g").attr("pointer-events", "none").attr("opacity", 0);
    hov.append("line").attr("y1", m.t - 14).attr("y2", base).attr("stroke", C.ink).attr("stroke-width", 1);
    svg.append("rect").attr("x", m.l).attr("y", m.t - 14).attr("width", W - m.l - m.r).attr("height", base - m.t + 14).attr("fill", "transparent")
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

  // ------------------------------------------------------------ noise space -> action space scatter
  function latentChart(el, data, { arm = "vanilla" } = {}) {
    const W = 660, H = 380, R = 150, RA = 118, cyy = 190, cxN = 175, cxA = 510;
    const svg = svgEl(el, W, H);
    const N = data.task.length;
    const pos = (arm) => data[arm].map(([a, b]) => [cxN + a * R, cyy - b * R]);
    const act = data.action.map(([a, b]) => [cxA + a * RA, cyy - b * RA]);
    let P = pos(arm);
    svg.append("circle").attr("cx", cxN).attr("cy", cyy).attr("r", R).attr("fill", "#fbfbfa").attr("stroke", C.hair).attr("stroke-width", 1.2);
    svg.append("circle").attr("cx", cxA).attr("cy", cyy).attr("r", RA).attr("fill", "#fbfbfa").attr("stroke", C.hair).attr("stroke-width", 1.2);
    const lab = (x0, t) => svg.append("text").attr("x", x0).attr("y", H - 2).attr("text-anchor", "middle").attr("class", "mono").attr("font-size", 11.5).attr("fill", C.muted).attr("letter-spacing", ".08em").text(t);
    lab(cxN, "NOISE SPACE"); lab(cxA, "ACTION SPACE");
    const col = (i) => (data.task[i] === "mug" ? C.mug : C.bowl);
    const curve = (p, q) => `M${p[0]},${p[1]}C${p[0] + 150},${p[1]} ${q[0] - 150},${q[1]} ${q[0]},${q[1]}`;
    const links = svg.append("g").attr("fill", "none");
    const L = links.selectAll("path").data(d3.range(N)).join("path").attr("stroke", col).attr("stroke-width", .8).attr("opacity", .07).attr("d", (i) => curve(P[i], act[i]));
    const aDots = svg.append("g").selectAll("circle").data(d3.range(N)).join("circle").attr("cx", (i) => act[i][0]).attr("cy", (i) => act[i][1]).attr("r", 3.4).attr("fill", col).attr("fill-opacity", .7);
    const nDots = svg.append("g").selectAll("circle").data(d3.range(N)).join("circle").attr("cx", (i) => P[i][0]).attr("cy", (i) => P[i][1]).attr("r", 4).attr("fill", col).attr("fill-opacity", .75).attr("stroke", "#fff").attr("stroke-width", .8);
    // task labels in action space
    for (const [t, name] of [["mug", "Pick Mug"], ["bowl", "Pick Bowl"]]) {
      const idx = d3.range(N).filter((i) => data.task[i] === t);
      const my = d3.mean(idx, (i) => act[i][1]);
      svg.append("text").attr("x", cxA).attr("y", my + (t === "mug" ? -RA * 0.62 : RA * 0.68)).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 550).attr("fill", t === "mug" ? C.mug : C.bowl)
        .attr("class", "tasklab").datum(t).style("cursor", "pointer").text(name)
        .on("pointerenter", () => focusTask(t)).on("pointerleave", () => focusTask(null));
    }
    function focusTask(t) {
      nDots.attr("fill-opacity", (i) => (!t || data.task[i] === t ? .85 : .08));
      aDots.attr("fill-opacity", (i) => (!t || data.task[i] === t ? .8 : .08));
      L.attr("opacity", (i) => (!t ? .07 : data.task[i] === t ? .16 : 0));
    }
    const hl = svg.append("path").attr("fill", "none").attr("stroke-width", 2.2).attr("opacity", 0).attr("pointer-events", "none");
    nDots.style("cursor", "pointer")
      .on("pointerenter", (e, i) => {
        hl.attr("d", curve(P[i], act[i])).attr("stroke", col(i)).attr("opacity", .9);
        nDots.filter((j) => j === i).attr("r", 7);
        aDots.filter((j) => j === i).attr("r", 7).attr("fill-opacity", 1);
        showTip(e, `<i style="background:${col(i)}"></i>${data.task[i] === "mug" ? "Pick Mug" : "Pick Bowl"} demo <span class="mono">#${i}</span>`);
      })
      .on("pointerleave", (e, i) => { hl.attr("opacity", 0); nDots.attr("r", 4); aDots.attr("r", 3.4).attr("fill-opacity", .7); hideTip(); });

    let cancel = () => {};
    function place(k, from, to) {
      const Q = d3.range(N).map((i) => {
        const f = ease(clamp(k * 1.6 - (i / N) * 0.6));
        return [from[i][0] + (to[i][0] - from[i][0]) * f, from[i][1] + (to[i][1] - from[i][1]) * f];
      });
      nDots.attr("cx", (i) => Q[i][0]).attr("cy", (i) => Q[i][1]);
      L.attr("d", (i) => curve(Q[i], act[i]));
      return Q;
    }
    return {
      play() {
        cancel();
        const center = d3.range(N).map(() => [cxN, cyy]);
        aDots.attr("r", 0);
        L.attr("opacity", 0);
        cancel = tween(1300, (k) => {
          place(k, center, P);
          aDots.attr("r", (i) => 3.4 * ease(clamp(k * 1.6 - (i / N) * 0.6)));
          L.attr("opacity", .07 * ease(clamp(k * 2 - 1)));
        });
      },
      to(arm2) {
        cancel();
        const from = P.map((p) => p.slice()), to = pos(arm2);
        P = to;
        cancel = tween(1200, (k) => place(k, from, to));
      },
    };
  }

  // ------------------------------------------------------------ grouped bars, Vanilla vs LoLip
  function barChart(el, { groups, yMax = 1, yTicks, fmt = pct, H = 380, labels = false, ratio = false, rotate = false, sepBeforeLast = false }) {
    const W = 680, m = { l: 46, r: 8, t: 26, b: rotate ? 92 : 48 };
    const svg = svgEl(el, W, H);
    hatch(svg, `h${el.id}`, C.greyLine);
    const x = d3.scaleBand().domain(groups.map((g) => g.name)).range([m.l, W - m.r]).paddingInner(.28).paddingOuter(.12);
    const y = d3.scaleLinear().domain([0, yMax]).range([H - m.b, m.t]);
    const g = svg.append("g");
    for (const t of yTicks) {
      g.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t === 0 ? "#d9d7d3" : "#efedea");
      g.append("text").attr("x", m.l - 10).attr("y", y(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 11.5).attr("fill", "#8b8b91").text(fmt(t));
    }
    if (sepBeforeLast) {
      const xs = x(groups.at(-1).name) - x.step() * x.paddingInner() / 2;
      g.append("line").attr("x1", xs).attr("x2", xs).attr("y1", m.t - 10).attr("y2", H - m.b).attr("stroke", "#d9d7d3");
    }
    const bw = x.bandwidth() / 2;
    const items = groups.flatMap((gr, gi) => ["vanilla", "lolip"].map((k, j) => ({ gr, gi, k, j, v: gr[k].mean, sd: gr[k].sd })));
    const bars = svg.append("g").selectAll("g").data(items).join("g");
    const rects = bars.append("rect").attr("x", (d) => x(d.gr.name) + d.j * bw + 1.5).attr("width", bw - 3).attr("rx", 3)
      .attr("fill", (d) => (d.k === "lolip" ? C.pinkFill : `url(#h${el.id})`)).attr("stroke", (d) => (d.k === "lolip" ? C.pink : "#8a8a8e")).attr("stroke-width", 1.5)
      .attr("y", y(0)).attr("height", 0);
    const errs = bars.filter((d) => d.sd != null).append("path").attr("stroke", C.ink).attr("stroke-width", 1.1).attr("fill", "none").attr("opacity", 0)
      .attr("d", (d) => { const cx = x(d.gr.name) + d.j * bw + bw / 2, a = y(clamp(d.v - d.sd, 0, yMax)), b = y(Math.min(d.v + d.sd, yMax)); return `M${cx},${a}V${b}M${cx - 4},${a}H${cx + 4}M${cx - 4},${b}H${cx + 4}`; });
    const vals = labels ? bars.append("text").attr("x", (d) => x(d.gr.name) + d.j * bw + bw / 2).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", (d) => (d.k === "lolip" ? 600 : 450))
      .attr("fill", (d) => (d.k === "lolip" ? C.pink : C.greyLine)).attr("opacity", 0) : null;
    const ratios = ratio ? svg.append("g").selectAll("text").data(groups).join("text").attr("x", (d) => x(d.name) + x.bandwidth() / 2).attr("y", (d) => y(Math.max(d.vanilla.mean, d.lolip.mean)) - 14)
      .attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 600).attr("fill", C.pink).attr("opacity", 0).text((d) => `×${(d.lolip.mean / d.vanilla.mean).toFixed(2)}`) : null;
    // x labels
    const xl = svg.append("g").selectAll("text").data(groups).join("text").attr("font-size", rotate ? 12 : 13.5).attr("fill", C.ink)
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
        g.append("line").attr("x1", m.l).attr("x2", PW - m.r).attr("y1", ys(t)).attr("y2", ys(t)).attr("stroke", t ? "#efedea" : "#d9d7d3");
        g.append("text").attr("x", m.l - 7).attr("y", ys(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 10.5).attr("fill", "#8b8b91").text(t * 100 + "%");
      }
      for (const t of [0, 2e5, 4e5]) g.append("text").attr("x", xs(t)).attr("y", PH - 6).attr("text-anchor", "middle").attr("class", "mono").attr("font-size", 10.5).attr("fill", "#8b8b91").text(t ? `${t / 1e3}k` : "0");
      const body = g.append("g").attr("clip-path", `url(#${id})`);
      for (const M of RL_METHODS) {
        const d = p[M.k];
        if (!d) continue;
        const idx = d3.range(steps.length).filter((i) => d.mean[i] != null);
        body.append("path").attr("class", `m-${M.k}`).attr("fill", M.color).attr("opacity", M.k === "lolip" ? .14 : .06)
          .attr("d", d3.area().x((i) => xs(steps[i])).y0((i) => ys(d.lo[i])).y1((i) => ys(d.hi[i])).curve(d3.curveMonotoneX)(idx));
        body.append("path").attr("class", `m-${M.k}`).attr("fill", "none").attr("stroke", M.color).attr("stroke-width", M.w).attr("stroke-dasharray", M.dash ?? null).attr("stroke-linejoin", "round")
          .attr("d", d3.line().x((i) => xs(steps[i])).y((i) => ys(d.mean[i])).curve(d3.curveMonotoneX)(idx));
      }
      const hl = g.append("line").attr("y1", m.t).attr("y2", PH - m.b).attr("stroke", C.ink).attr("opacity", 0).attr("pointer-events", "none");
      g.append("rect").attr("x", m.l).attr("y", m.t).attr("width", PW - m.l - m.r).attr("height", PH - m.t - m.b).attr("fill", "transparent")
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
      legendEl.innerHTML = RL_METHODS.slice().reverse().map((M) => `<span data-k="${M.k}"><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="${M.color}" stroke-width="${M.w + .4}" ${M.dash ? `stroke-dasharray="${M.dash}"` : ""}/></svg>${M.label}</span>`).join("");
      legendEl.querySelectorAll("span").forEach((s) => {
        s.onpointerenter = () => svg.selectAll("path[class^=m-]").attr("opacity", function () { return this.classList.contains(`m-${s.dataset.k}`) ? null : .06; });
        s.onpointerleave = () => svg.selectAll("path[class^=m-]").attr("opacity", function () { return this.getAttribute("fill") !== "none" ? (this.classList.contains("m-lolip") ? .14 : .06) : null; });
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
    return `<g style="--i:${i}"><polygon class="d-in" style="--i:${i}" points="${pts[0][0]},${b} ${line} ${pts.at(-1)[0]},${b}" fill="${col}" fill-opacity=".16"/>` +
      `<polyline class="d-draw" style="--i:${i}" pathLength="1" points="${line}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linejoin="round"/>` +
      `<line class="d-in" style="--i:${i}" x1="${cx - GW / 2 - 6}" y1="${b}" x2="${cx + GW / 2 + 6}" y2="${b}" stroke="${C.ink}" stroke-width="2"/></g>`;
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
      ? `<polyline class="d-in" style="--i:${i}" points="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-dasharray="7 6"/><polygon class="d-in" style="--i:${i}" points="${head}" fill="${col}"/>`
      : `<polyline class="d-draw" style="--i:${i}" pathLength="1" points="${line}" fill="none" stroke="${col}" stroke-width="2.2"/><polygon class="d-in" style="--i:${i}" points="${head}" fill="${col}"/>`;
  }
  const it = (s) => `<tspan font-style="italic">${s}</tspan>`;
  const SUB = (s) => `<tspan baseline-shift="sub" font-size=".68em">${s}</tspan>`;
  const SUP = (s) => `<tspan dx="2" baseline-shift="super" font-size=".62em">${s}</tspan>`;
  function box(x0, x1, y, BH, name, pink, i) {
    return `<g class="d-in" style="--i:${i}"><rect x="${x0}" y="${y - BH / 2}" width="${x1 - x0}" height="${BH}" rx="10" fill="${pink ? "#f2d7e1" : "#f2f2f2"}" stroke="${pink ? "#c5426c" : C.ink}" stroke-width="1.8"/><text x="${(x0 + x1) / 2}" y="${y}">${name}</text></g>`;
  }
  function dsbcSVG() {
    const BX0 = 50, BX1 = 290, GX = 400, Y0 = 36, P = 100, BH = 54, GW = 130, W = 520, H = Y0 + 4 * P + 36, cx = (BX0 + BX1) / 2;
    const st = [["Demos", it("a") + SUB(it("D")), [[0.42, -0.45, 0.17], [1.0, 0.18, 0.2]], "#4f4f4f"],
                ["Invert flow " + it("f") + SUP("−1"), it("w") + SUB(it("D")), [[1, 0, 0.3]], "#c5426c"],
                ["Noise policy " + it("π") + SUB(it("θ")), it("w′"), [[1, 0, 0.12]], "#c5426c"],
                ["Flow forward " + it("f"), it("a"), [[0.2, -0.3, 0.08], [1.0, 0.18, 0.11]], "#4f4f4f"],
                ["Environment", it("s′"), null, null]];
    let p = "";
    st.forEach(([name, out, comps, col], k) => {
      const y = Y0 + k * P, i = 2 * k;
      p += box(BX0, BX1, y, BH, name, k === 2, i);
      if (k + 1 < st.length) p += arrowD([[cx, y + BH / 2 + 3], [cx, y + P - BH / 2 - 3]], C.ink, i + 1);
      p += arrowD([[BX1 + 4, y], [GX - GW / 2 - 14, y]], C.ink, i + 1);
      p += comps ? gaussGlyph(GX, y, comps, col, GW, 44, i + 1) + `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX + GW / 2 + 16}" y="${y}">${out}</text>`
                 : `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX - GW / 2 + 4}" y="${y}">${out}</text>`;
    });
    const y2 = Y0 + 2 * P;
    p += `<text class="d-in" style="--i:4" x="${BX0 - 34}" y="${y2}">${it("s")}</text>` + arrowD([[BX0 - 22, y2], [BX0 - 3, y2]], C.ink, 4);
    return `<svg class="dg" viewBox="-6 0 ${W + 18} ${H}">${p}</svg>`;
  }
  function dsrlSVG() {
    const BX0 = 70, BX1 = 300, GX = 410, YS = [96, 206, 316], BH = 54, GW = 130, LX = 26, LY = 404, W = 520, H = 424, cx = (BX0 + BX1) / 2;
    const st = [["Noise policy " + it("π") + SUP(it("W")), it("w"), [[1, 0, 0.12]], "#c5426c"],
                ["Flow policy " + it("π") + SUB("dp"), it("a"), [[0.45, -0.4, 0.13], [1.0, 0.25, 0.15]], "#4f4f4f"],
                ["Environment", it("s′"), null, null]];
    let p = `<rect class="d-in" style="--i:3" x="${BX0 - 14}" y="${YS[1] - BH / 2 - 14}" width="${BX1 - BX0 + 28}" height="${YS[2] - YS[1] + BH + 50}" rx="14" fill="none" stroke="#b8b8b8" stroke-width="1.6"/>` +
            `<text class="d-in" style="--i:3;font-size:19px;fill:${C.muted}" x="${cx}" y="${YS[2] + BH / 2 + 19}">Latent-action environment</text>`;
    p += `<text class="d-in" style="--i:0" x="${cx}" y="${YS[0] - BH / 2 - 52}">${it("s")}</text>` + arrowD([[cx, YS[0] - BH / 2 - 36], [cx, YS[0] - BH / 2 - 3]], C.ink, 0);
    st.forEach(([name, out, comps, col], k) => {
      const y = YS[k], i = 1 + 2 * k;
      p += box(BX0, BX1, y, BH, name, k === 0, i);
      if (k + 1 < st.length) p += arrowD([[cx, y + BH / 2 + 3], [cx, YS[k + 1] - BH / 2 - 3]], C.ink, i + 1);
      p += arrowD([[BX1 + 4, y], [GX - GW / 2 - 14, y]], C.ink, i + 1);
      p += comps ? gaussGlyph(GX, y, comps, col, GW, 44, i + 1) + `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX + GW / 2 + 16}" y="${y}">${out}</text>`
                 : `<text class="d-in" style="--i:${i + 1};text-anchor:start" x="${GX - GW / 2 + 4}" y="${y}">${out}</text>`;
    });
    const sx = GX - GW / 2 + 16;
    p += arrowD([[sx, YS[2] + 22], [sx, LY], [LX, LY], [LX, YS[0]], [BX0 - 3, YS[0]]], "#c5426c", 7, true) +
         `<text class="d-in" style="--i:7;font-size:21px;fill:#c5426c;paint-order:stroke" stroke="#fff" stroke-width="10" x="${(sx + LX) / 2 + 60}" y="${LY}">RL training</text>`;
    return `<svg class="dg" viewBox="0 0 ${W} ${H}">${p}</svg>`;
  }

  // ------------------------------------------------------------ intro: noise flowing into actions
  function flowCanvas(cv, data) {
    const ctx = cv.getContext("2d");
    let W, H, R, RA, cxN, cxA, cy, raf = null;
    const N = data.task.length;
    const parts = d3.range(N).map((i) => ({ i, t: Math.random(), v: 0.0028 + Math.random() * 0.0028 }));
    function size() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = r.width; H = r.height; R = Math.min(H * 0.4, W * 0.21); RA = R * 0.8; cxN = R + 14; cxA = W - RA - 18; cy = H / 2;
    }
    const nP = (i) => [cxN + data.lolip[i][0] * R, cy - data.lolip[i][1] * R];
    const aP = (i) => [cxA + data.action[i][0] * RA, cy - data.action[i][1] * RA];
    const bez = (p, q, t) => {
      const c1 = [p[0] + (q[0] - p[0]) * 0.45, p[1]], c2 = [q[0] - (q[0] - p[0]) * 0.45, q[1]], u = 1 - t;
      return [u * u * u * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q[0], u * u * u * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q[1]];
    };
    const col = (i, a) => (data.task[i] === "mug" ? `rgba(217,30,91,${a})` : `rgba(228,138,86,${a})`);
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (const [x0, r] of [[cxN, R], [cxA, RA]]) { ctx.beginPath(); ctx.arc(x0, cy, r, 0, 7); ctx.fillStyle = "#fbfbfa"; ctx.fill(); ctx.strokeStyle = "#e8e6e3"; ctx.lineWidth = 1; ctx.stroke(); }
      for (let i = 0; i < N; i++) {
        const [a, b] = nP(i), [c, d] = aP(i);
        ctx.fillStyle = col(i, .32); ctx.beginPath(); ctx.arc(a, b, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = col(i, .32); ctx.beginPath(); ctx.arc(c, d, 2.2, 0, 7); ctx.fill();
      }
      for (const p of parts) {
        p.t += p.v;
        if (p.t > 1) { p.t = 0; p.v = 0.0028 + Math.random() * 0.0028; }
        const s = nP(p.i), e = aP(p.i);
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) { const q = bez(s, e, Math.max(0, p.t - 0.12 + (k / 8) * 0.12)); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        const fade = Math.sin(Math.PI * p.t);
        ctx.strokeStyle = col(p.i, 0.5 * fade); ctx.lineWidth = 1.4; ctx.stroke();
        const h = bez(s, e, p.t);
        ctx.fillStyle = col(p.i, 0.9 * fade); ctx.beginPath(); ctx.arc(h[0], h[1], 2.2, 0, 7); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    size();
    addEventListener("resize", size);
    return { start() { if (!raf) frame(); }, stop() { cancelAnimationFrame(raf); raf = null; } };
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

  let flow;
  SLIDES.intro = {
    init: async () => { flow = flowCanvas(document.getElementById("flowCanvas"), await load("latent")); },
    enter: async () => { await load("latent"); flow?.start(); },
    leave: () => flow?.stop(),
  };

  SLIDES.setting = {
    init() { document.getElementById("dgDSRL").innerHTML = dsrlSVG(); document.getElementById("dgDSBC").innerHTML = dsbcSVG(); },
  };

  const fwdReadout = (v, ss) => ss.map((s) => `<span class="mono">${pct(s.below)}</span> of directions shrink by more than <span class="mono">${fmtX(1 / v)}</span>`).join("<br>");
  const invReadout = (v, ss) => ss.map((s) => `<span class="mono">${pct(1 - s.below)}</span> of directions stretch by more than <span class="mono">${fmtX(v)}</span>`).join("<br>");
  const fmtX = (v) => (v >= 1000 ? `${d3.format(",.0f")(v)}×` : v >= 10 ? `${v.toFixed(0)}×` : `${v.toFixed(1)}×`);

  let hF;
  SLIDES.contraction = {
    async init() {
      const d = (await load("singular_values")).forward;
      hF = histChart(document.getElementById("histForward"), { edges: d.edges, lo: 1e-6, hi: 1e2, ymax: 1.12 * d3.max(d.vanilla.share), ref: 1, refLabel: "no change", xLabel: "Singular value of ∂a/∂z (stretch of a noise direction)", readout: fwdReadout });
      hF.set([{ key: "v", share: d.vanilla.share, color: "#b4b4b8", label: "Vanilla CFM", labelColor: C.ink }]);
      document.getElementById("contrMed").textContent = `${Math.round(1 / d.vanilla.median)}×`;
    },
    async enter() { await load("singular_values"); hF.play(); },
  };

  let expL, expH, expMode = "latent";
  const expCaps = {
    latent: "Isaac Lab, Vanilla CFM · each dot is one training demo's first action chunk mapped back to noise (PCA) · hover a dot to follow it to its action",
    hist: "Isaac Lab, Vanilla CFM · singular values of ∂z/∂a = 1 / those of ∂a/∂z · 3 training seeds, 50,232 values · hover to read",
  };
  SLIDES.expansion = {
    async init() {
      const [lat, sv] = await Promise.all([load("latent"), load("singular_values")]);
      expL = latentChart(document.getElementById("expLatent"), lat, { arm: "vanilla" });
      const d = sv.inverse;
      expH = histChart(document.getElementById("expHist"), { edges: d.edges, lo: 1e-2, hi: 1e6, ymax: 1.12 * d3.max(d.vanilla.share), ref: 1, refLabel: "no change", xLabel: "Singular value of ∂z/∂a (stretch of an action direction)", readout: invReadout });
      expH.set([{ key: "v", share: d.vanilla.share, color: "#b4b4b8", label: "Vanilla CFM", labelColor: C.ink }]);
      document.getElementById("expCap").textContent = expCaps.latent;
      seg(document.getElementById("segExp"), (v) => {
        expMode = v;
        document.getElementById("expLatent").hidden = v !== "latent";
        document.getElementById("expHist").hidden = v !== "hist";
        document.getElementById("expCap").textContent = expCaps[v];
        (v === "latent" ? expL : expH).play();
      });
    },
    async enter(s) { await load("latent"); await load("singular_values"); (expMode === "latent" ? expL : expH)?.play(); },
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
      const ci = d3.interpolateRgb("#b4b4b8", C.pink);
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
    },
    async enter() { await load("singular_values"); this.run?.(); },
    leave() { morphStop(); },
  };

  let bS;
  SLIDES.spread = {
    async init() {
      const d = await load("action_std");
      const groups = d.tasks.map((t) => ({ name: t.name, vanilla: { mean: t.vanilla }, lolip: { mean: t.lolip } }));
      const mx = d3.max(groups, (g) => g.lolip.mean);
      bS = barChart(document.getElementById("barsSpread"), { groups, yMax: mx * 1.2, yTicks: [0, mx * 0.4, mx * 0.8].map((v) => +v.toPrecision(1)), fmt: (v) => v.toFixed(2), ratio: true });
      const lo = d3.min(d.tasks, (t) => t.ratio), hi = d3.max(d.tasks, (t) => t.ratio);
      document.getElementById("spreadLbl").innerHTML = `<b>${lo.toFixed(2)}–${hi.toFixed(2)}×</b><br>more action spread from fresh noise, on each of the 4 LIBERO-Goal tasks`;
    },
    async enter() { await load("action_std"); bS.play(); },
  };

  let sepL, sepArm = "vanilla";
  SLIDES.separation = {
    async init() {
      sepL = latentChart(document.getElementById("sepLatent"), await load("latent"), { arm: "vanilla" });
      seg(document.getElementById("segSep"), (v) => { sepArm = v; sepL.to(v); });
    },
    async enter() {
      await load("latent");
      sepL.play();
      playVid("vReachV", "vReachL");
      // show the change: after the dots settle, morph to LoLip once
      setTimeout(() => { if (sepArm === "vanilla" && document.getElementById("separation").classList.contains("active")) document.querySelector('#segSep [data-v="lolip"]').click(); }, 2600);
    },
    leave() { stopVid("vReachV", "vReachL"); sepArm = "vanilla"; const b = document.querySelector('#segSep [data-v="vanilla"]'); if (b.getAttribute("aria-pressed") !== "true") b.click(); },
  };

  let bD;
  SLIDES.dsbc = {
    async init() {
      const d = await load("goal_dsbc");
      bD = barChart(document.getElementById("barsDSBC"), { groups: d.bars, yMax: 1.06, yTicks: [0, .25, .5, .75, 1], rotate: true, sepBeforeLast: true, H: 420 });
    },
    async enter() { await load("goal_dsbc"); bD.play(); },
  };

  let cRL, rlSet = "goal";
  SLIDES.dsrl = {
    async init() {
      const d = await load("rl");
      const host = document.getElementById("curvesRL");
      const legend = document.createElement("div");
      legend.className = "legend";
      host.before(legend);
      const at = (p, k) => d3.mean(p, (x) => x[k].mean.at(-1));
      const draw = (v) => {
        rlSet = v;
        cRL = curvesChart(host, d.steps, d[v], { legendEl: legend });
        const l = at(d[v], "lolip"), va = at(d[v], "vanilla");
        document.getElementById("rlStat").textContent = pct(l, 1);
        document.getElementById("rlStatLbl").textContent = v === "goal"
          ? `mean success at 500k steps on 4 LIBERO-Goal tasks (Vanilla CFM ${pct(va, 1)})`
          : `mean success at 500k steps on 5 LIBERO-10 tasks (Vanilla CFM ${pct(va, 1)})`;
        document.getElementById("rlCap").textContent = v === "goal"
          ? "Line: mean over 3 RL seeds · band: lowest to highest seed · 25 episodes per eval · Vanilla CFM: co-author's published runs"
          : "Line: mean over 2 RL seeds · band: lowest to highest seed · 25 episodes per eval · Vanilla CFM: co-author's published runs";
        cRL.play();
      };
      this.draw = draw;
      seg(document.getElementById("segRL"), draw);
      draw("goal");
    },
    async enter() { await load("rl"); cRL?.play(); },
  };

  let cReal;
  SLIDES.real = {
    async init() {
      const d = (await load("real_world")).plate;
      const el = document.getElementById("curveReal");
      const W = 640, H = 240, m = { l: 42, r: 52, t: 30, b: 34 };
      const svg = svgEl(el, W, H);
      const x = d3.scaleLinear().domain([0, d3.max(d.steps)]).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
      svg.append("text").attr("x", m.l).attr("y", 14).attr("font-size", 14).attr("font-weight", 550).text("Plate insertion · validation success");
      for (const t of [0, .5, 1]) {
        svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t ? "#efedea" : "#d9d7d3");
        svg.append("text").attr("x", m.l - 8).attr("y", y(t)).attr("dy", ".32em").attr("text-anchor", "end").attr("class", "mono").attr("font-size", 10.5).attr("fill", "#8b8b91").text(t * 100 + "%");
      }
      for (const t of [0, 20e3, 40e3, 60e3, 80e3]) svg.append("text").attr("x", x(t)).attr("y", H - 12).attr("text-anchor", "middle").attr("class", "mono").attr("font-size", 10.5).attr("fill", "#8b8b91").text(t ? `${t / 1e3}k` : "0");
      svg.append("text").attr("x", W - m.r).attr("y", H - 12).attr("text-anchor", "end").attr("class", "axis-label").attr("dx", 46).text("env steps");
      const cid = "clipReal";
      const clip = svg.append("defs").append("clipPath").attr("id", cid).append("rect").attr("height", H).attr("width", 0);
      const g = svg.append("g").attr("clip-path", `url(#${cid})`);
      const ser = [["vanilla", C.greyLine, 1.8, "6 3", "Vanilla CFM"], ["lolip", C.pink, 2.6, null, "LoLip"]];
      for (const [k, c, w, dash] of ser) {
        g.append("path").attr("fill", "none").attr("stroke", c).attr("stroke-width", w).attr("stroke-dasharray", dash).attr("d", d3.line().x((_, i) => x(d.steps[i])).y((v) => y(v))(d[k]));
        g.selectAll(null).data(d[k]).join("circle").attr("cx", (_, i) => x(d.steps[i])).attr("cy", (v) => y(v)).attr("r", k === "lolip" ? 3.6 : 3).attr("fill", k === "lolip" ? c : "#fff").attr("stroke", c).attr("stroke-width", 1.5);
      }
      const ends = svg.append("g").attr("opacity", 0);
      for (const [k, c, , , lab] of ser) ends.append("text").attr("x", W - m.r + 8).attr("y", y(d[k].at(-1))).attr("dy", ".32em").attr("font-size", 14).attr("font-weight", k === "lolip" ? 650 : 450).attr("fill", c).text(pct(d[k].at(-1)));
      const hov = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.ink).attr("opacity", 0);
      svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
        .on("pointermove", (e) => {
          const i = d3.minIndex(d.steps, (s) => Math.abs(s - x.invert(d3.pointer(e)[0])));
          hov.attr("x1", x(d.steps[i])).attr("x2", x(d.steps[i])).attr("opacity", .3);
          showTip(e, `<span class="mono">${d.steps[i] / 1e3}k steps</span><br><i style="background:${C.pink}"></i>LoLip <span class="mono">${pct(d.lolip[i])}</span><br><i style="background:${C.greyLine}"></i>Vanilla CFM <span class="mono">${pct(d.vanilla[i])}</span>`);
        })
        .on("pointerleave", () => { hov.attr("opacity", 0); hideTip(); });
      let cancel = () => {};
      cReal = { play() { cancel(); ends.attr("opacity", 0); cancel = tween(1900, (k) => { clip.attr("width", W * ease(k)); ends.attr("opacity", clamp(k * 4 - 3)); }); } };
    },
    async enter() { await load("real_world"); cReal.play(); playVid("vPlate"); },
    leave() { stopVid("vPlate"); },
  };

  let bC;
  SLIDES.cost = {
    async init() {
      const d = await load("libero90");
      bC = barChart(document.getElementById("barsCost"), { groups: d.groups, yMax: 1.06, yTicks: [0, .25, .5, .75, 1], labels: true });
    },
    async enter() { await load("libero90"); bC.play(); },
  };
})();
