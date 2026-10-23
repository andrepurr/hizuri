// The Show page: one self-contained document (no network, no storage) that draws Show windows.
// Android loads it into react-native-webview and web into a sandboxed iframe (show/frame*.tsx);
// the app pushes windows in as messages (show/bridge.ts) and the page answers only
// `show.ready` and `show.error`. Agent-authored strings are set with textContent and SVG
// attributes only — never parsed as markup.
//
// The widget look and vocabulary follow mirafold/mirafold web/src/components (MIT); the code is
// our own, written as plain DOM + SVG so it needs no bundler and runs the same everywhere.
//
// The script is a raw string: keep it ES2019, no backticks and no dollar-brace sequences.

const SHOW_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const SHOW_PAGE_STYLE = String.raw`
:root {
  --bg: transparent; --s1: rgba(127,127,127,.08); --s2: rgba(127,127,127,.16);
  --fg: #e6e9ef; --muted: #a3aab8; --border: rgba(127,127,127,.2);
  --accent: #4373d5; --accent2: #c9d6f7; --ok: #6cb17b; --warn: #c09664; --bad: #d8847b;
  --merged: #a890d5; --glow: transparent;
  color-scheme: dark light;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body {
  font: 15px/1.45 "Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased; overflow-x: hidden; overflow-y: auto;
  min-height: 100vh;
}
#stage { position: relative; min-height: 100vh; }
.window {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  padding: 16px 16px 32px; align-content: start;
}
.window.leaving { position: absolute; top: 0; left: 0; right: 0; pointer-events: none; }
.w { grid-column: 1 / -1; min-width: 0; }
.w.half { grid-column: auto; }
.panel {
  background: var(--s1); border: 1px solid var(--border); border-radius: 18px;
  padding: 16px;
}
.title { font-weight: 500; margin: 0 0 10px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.num { font-variant-numeric: tabular-nums; }
.enter { animation: rise 160ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes rise {
  from { opacity: 0; transform: translateY(8px) scale(.99); }
  to { opacity: 1; transform: none; }
}
.empty { grid-column: 1 / -1; text-align: center; padding: 64px 16px; }
.stat-label { font-size: 13px; color: var(--muted); }
.stat-value { font-size: 32px; font-weight: 300; letter-spacing: -.01em; margin: 4px 0 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-value.long { font-size: 24px; }
.stat-value.longer { font-size: 19px; }
.delta { font-size: 13px; }
.delta.good { color: var(--ok); } .delta.bad { color: var(--bad); }
.bar { height: 8px; border-radius: 4px; background: var(--s2); overflow: hidden; margin: 10px 0 6px; }
.bar > i { display: block; height: 100%; width: 0; border-radius: 4px;
  background: linear-gradient(90deg, var(--accent), var(--accent2)); }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.card-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.card.info { border-color: var(--accent); }
.card.success { border-color: var(--ok); }
.card.warning { border-color: var(--warn); }
.card.error { border-color: var(--bad); }
.table-scroll { overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th { text-align: left; font-weight: 500; color: var(--muted); font-size: 13px; padding: 0 12px 8px 0; }
td { padding: 9px 12px 9px 0; border-top: 1px solid var(--border); vertical-align: top;
  overflow-wrap: anywhere; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
svg { display: block; overflow: visible; }
.chart { width: 100%; height: auto; }
.axis { fill: var(--muted); font-size: 10px; }
.grid { stroke: var(--border); stroke-width: 1; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font-size: 13px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.legend b { width: 8px; height: 8px; border-radius: 4px; display: inline-block; }
.grow { transform-box: fill-box; transform-origin: bottom; animation: grow 700ms cubic-bezier(.2,.8,.2,1) both; }
.grow.down { transform-origin: top; }
@keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.ring-wrap { position: relative; width: 100%; max-width: 168px; aspect-ratio: 1; margin: 0 auto; }
.ring-wrap svg { width: 100%; height: 100%; filter: drop-shadow(0 0 10px var(--glow)); }
.ring-track { stroke: var(--s2); }
.ring-center { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; }
.ring-value { font-size: 34px; font-weight: 300; letter-spacing: -.02em; line-height: 1; }
.ring-value small { font-size: 16px; margin-left: 1px; color: var(--muted); }
.ring-caption { font-size: 12px; color: var(--muted); margin-top: 4px; }
.limits-rings { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.limit { display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 18px 10px 16px; }
.limit-label { margin-top: 12px; font-weight: 500; }
.limit-reset { margin-top: 2px; font-size: 13px; color: var(--muted); }
.limit-at { font-size: 12px; opacity: .75; }
.limits-more { margin-top: 12px; }
.limits-more .row + .row { margin-top: 10px; }
.limits-foot { margin-top: 12px; text-align: center; }
.loading .ring-value { opacity: .35; }
@media (prefers-reduced-motion: reduce) {
  .enter, .grow { animation: none !important; }
}
`;

const SHOW_PAGE_SCRIPT = String.raw`
(function () {
  "use strict";
  var isNative = !!window.ReactNativeWebView;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var stage = document.getElementById("stage");
  var SVGNS = "http://www.w3.org/2000/svg";
  var strings = {
    locale: "en", empty: "Nothing to show yet", loading: "Loading…", resetsAt: "Resets {time}", inTime: "in {time}",
    updated: "Updated {time}", used: "used", noData: "No usage data", widgetError: "Could not draw this",
    units: { d: "d", h: "h", m: "min" }, windowLabels: {}
  };
  var palette = null;
  var current = null;
  var lastWindow = null;
  var currentIndex = null;
  var gradientSeq = 0;

  function send(message) {
    try {
      if (isNative) window.ReactNativeWebView.postMessage(JSON.stringify(message));
      else if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
    } catch (error) { /* the host is gone */ }
  }

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) el.setAttribute(key, String(attrs[key]));
    }
    return el;
  }
  function str(value, max) {
    if (typeof value === "string") return value.slice(0, max || 4000);
    if (typeof value === "number" && isFinite(value)) return String(value);
    return "";
  }
  function num(value) { return typeof value === "number" && isFinite(value) ? value : null; }
  function clamp(value, lo, hi) { return Math.min(hi, Math.max(lo, value)); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // Tweens one displayed number; a newer tween on the same key wins.
  function tween(holder, key, to, ms, onFrame) {
    var from = typeof holder["v_" + key] === "number" ? holder["v_" + key] : 0;
    var token = {};
    holder["t_" + key] = token;
    function show(value) { holder["v_" + key] = value; onFrame(value); }
    if (reduceMotion || from === to) { show(to); return; }
    var start = null;
    function step(ts) {
      if (holder["t_" + key] !== token) return;
      if (start === null) start = ts;
      var t = clamp((ts - start) / ms, 0, 1);
      show(from + (to - from) * ease(t));
      if (t < 1) window.requestAnimationFrame(step); else show(to);
    }
    window.requestAnimationFrame(step);
  }

  function hexAlpha(color, alpha) {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color + alpha : "transparent";
  }
  function isDark(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return true;
    var r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  }
  function applyPalette(p) {
    var root = document.documentElement.style;
    root.setProperty("--bg", p.background);
    root.setProperty("--s1", p.surface1);
    root.setProperty("--s2", p.surface2);
    root.setProperty("--fg", p.foreground);
    root.setProperty("--muted", p.foregroundMuted);
    root.setProperty("--border", p.border);
    root.setProperty("--accent", p.accent);
    root.setProperty("--accent2", p.accentBright);
    root.setProperty("--ok", p.success);
    root.setProperty("--warn", p.warning);
    root.setProperty("--bad", p.danger);
    root.setProperty("--merged", p.merged);
    root.setProperty("--glow", isDark(p.background) ? hexAlpha(p.accent, "59") : "transparent");
    document.documentElement.style.colorScheme = isDark(p.background) ? "dark" : "light";
  }
  function seriesColors() {
    var p = palette || {};
    return [p.accent || "#4373d5", p.merged || "#a890d5", p.success || "#6cb17b",
      p.warning || "#c09664", p.accentBright || "#c9d6f7", p.danger || "#d8847b"];
  }

  // ---- number formatting ----
  var NUMBER = /^([^0-9+-]*)([+-]?[0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/;
  function parseNumber(text) {
    var match = NUMBER.exec(text);
    if (!match) return null;
    var raw = match[2];
    var value = Number(raw.replace(/,/g, ""));
    if (!isFinite(value)) return null;
    var dot = raw.indexOf(".");
    return { prefix: match[1], suffix: match[3], value: value,
      decimals: dot < 0 ? 0 : raw.length - dot - 1, grouped: raw.indexOf(",") >= 0 };
  }
  function formatNumber(parsed, value) {
    var fixed = value.toFixed(parsed.decimals);
    if (parsed.grouped) {
      var parts = fixed.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      fixed = parts.join(".");
    }
    return parsed.prefix + fixed + parsed.suffix;
  }
  function compact(value) {
    var abs = Math.abs(value);
    if (abs >= 1e9) return (value / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (abs >= 1e6) return (value / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (abs >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(value * 100) / 100);
  }

  // ---- time ----
  function duration(ms) {
    var minutes = Math.max(0, Math.round(ms / 60000));
    var d = Math.floor(minutes / 1440), hr = Math.floor((minutes % 1440) / 60), m = minutes % 60;
    var u = strings.units;
    if (d > 0) return d + " " + u.d + (hr > 0 ? " " + hr + " " + u.h : "");
    if (hr > 0) return hr + " " + u.h + (m > 0 ? " " + m + " " + u.m : "");
    return m + " " + u.m;
  }
  function clock(date, withDay) {
    try {
      // 24-hour clock everywhere (AM/PM confused the limits view).
      var options = withDay ? { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
      return date.toLocaleString(strings.locale, options);
    } catch (error) {
      return date.toISOString().slice(11, 16);
    }
  }
  function resetParts(iso) {
    var date = new Date(str(iso, 64));
    if (isNaN(date.getTime())) return null;
    var ms = date.getTime() - Date.now();
    return {
      at: strings.resetsAt.split("{time}").join(clock(date, ms > 20 * 3600000)),
      countdown: strings.inTime.split("{time}").join(duration(ms))
    };
  }
  function resetText(iso) {
    var parts = resetParts(iso);
    return parts ? parts.at + " · " + parts.countdown : "";
  }
  // The reset's clock time and a muted countdown under it, refreshed by the timer below.
  function fillReset(el, iso) {
    el.textContent = "";
    el.setAttribute("data-resets-split", str(iso, 64));
    var parts = resetParts(iso);
    if (!parts) return;
    el.appendChild(h("div", "", parts.at));
    el.appendChild(h("div", "limit-at", parts.countdown));
  }

  // ---- ring ----
  function makeRing(stroke) {
    var radius = (100 - stroke) / 2;
    var circumference = 2 * Math.PI * radius;
    var id = "ring" + (++gradientSeq);
    var root = svg("svg", { viewBox: "0 0 100 100" });
    var defs = svg("defs", {});
    var gradient = svg("linearGradient", { id: id, x1: "0", y1: "0", x2: "1", y2: "1" });
    var stop1 = svg("stop", { offset: "0%" });
    var stop2 = svg("stop", { offset: "100%" });
    gradient.appendChild(stop1); gradient.appendChild(stop2); defs.appendChild(gradient);
    root.appendChild(defs);
    root.appendChild(svg("circle", { cx: 50, cy: 50, r: radius, fill: "none", "stroke-width": stroke, "class": "ring-track" }));
    var arc = svg("circle", { cx: 50, cy: 50, r: radius, fill: "none", "stroke-width": stroke,
      "stroke-linecap": "round", "stroke-dasharray": circumference, "stroke-dashoffset": circumference,
      transform: "rotate(-90 50 50)", stroke: "url(#" + id + ")" });
    root.appendChild(arc);
    var state = {};
    return {
      el: root,
      tone: function (pct) {
        var p = palette || {};
        var from = p.accent || "#4373d5", to = p.accentBright || "#c9d6f7";
        if (pct >= 95) { from = p.danger || "#d8847b"; to = from; }
        else if (pct >= 80) { from = p.warning || "#c09664"; to = from; }
        stop1.setAttribute("stop-color", from);
        stop2.setAttribute("stop-color", to);
      },
      set: function (pct, onFrame) {
        this.tone(pct);
        tween(state, "pct", clamp(pct, 0, 100), 1200, function (value) {
          arc.setAttribute("stroke-dashoffset", String(circumference * (1 - value / 100)));
          arc.style.opacity = value < 0.5 ? "0" : "1";
          if (onFrame) onFrame(value);
        });
      }
    };
  }

  // ---- widgets ----
  var widgets = {};

  widgets.stat = function (props) {
    var el = h("div", "panel");
    var label = el.appendChild(h("div", "stat-label"));
    var value = el.appendChild(h("div", "stat-value num"));
    var delta = el.appendChild(h("div", "delta num"));
    var footer = el.appendChild(h("div", "muted small"));
    var state = {};
    function update(p) {
      label.textContent = str(p.label, 80);
      var text = str(p.value, 40);
      value.className = "stat-value num" + (text.length > 11 ? " longer" : text.length > 7 ? " long" : "");
      var parsed = parseNumber(text);
      if (parsed) {
        tween(state, "value", parsed.value, 900, function (v) {
          value.textContent = v === parsed.value ? text : formatNumber(parsed, v);
        });
      } else {
        value.textContent = text;
      }
      var d = p.delta && typeof p.delta === "object" ? p.delta : null;
      delta.textContent = d ? (d.direction === "down" ? "↓ " : "↑ ") + str(d.value, 40) : "";
      delta.className = "delta num " + (d ? (d.good ? "good" : "bad") : "");
      footer.textContent = str(p.footer, 200);
      footer.style.display = footer.textContent ? "" : "none";
    }
    update(props);
    return { el: el, half: true, update: update };
  };

  widgets.progress = function (props) {
    var ringStyle = props.style === "ring";
    var el = h("div", "panel");
    var state = {};
    if (ringStyle) {
      el.className = "panel limit";
      var wrap = el.appendChild(h("div", "ring-wrap"));
      var ring = makeRing(9);
      wrap.appendChild(ring.el);
      var center = wrap.appendChild(h("div", "ring-center"));
      var value = center.appendChild(h("div", "ring-value num"));
      var label = el.appendChild(h("div", "limit-label"));
      var detail = el.appendChild(h("div", "limit-reset"));
      var update = function (p) {
        var pct = clamp(num(p.percent) || 0, 0, 100);
        label.textContent = str(p.label, 80);
        detail.textContent = str(p.detail, 200);
        ring.set(pct, function (v) { value.textContent = Math.round(v) + "%"; });
      };
      update(props);
      return { el: el, half: true, update: update };
    }
    var head = el.appendChild(h("div", "row"));
    var name = head.appendChild(h("div", ""));
    var pctText = head.appendChild(h("div", "muted num"));
    var bar = el.appendChild(h("div", "bar"));
    var fill = bar.appendChild(h("i", ""));
    var note = el.appendChild(h("div", "muted small"));
    function updateBar(p) {
      var pct = clamp(num(p.percent) || 0, 0, 100);
      name.textContent = str(p.label, 80);
      note.textContent = str(p.detail, 200);
      note.style.display = note.textContent ? "" : "none";
      tween(state, "pct", pct, 900, function (v) {
        fill.style.width = v + "%";
        pctText.textContent = Math.round(v) + "%";
      });
    }
    updateBar(props);
    return { el: el, update: updateBar };
  };

  widgets.card = function (props) {
    var el = h("div", "panel card");
    var title = el.appendChild(h("div", "title"));
    var body = el.appendChild(h("div", "card-body"));
    var footer = el.appendChild(h("div", "muted small"));
    function update(p) {
      var kind = ["info", "success", "warning", "error"].indexOf(p.kind) >= 0 ? p.kind : "";
      el.className = "panel card " + kind;
      title.textContent = str(p.title, 120);
      body.textContent = str(p.body, 4000);
      footer.textContent = str(p.footer, 200);
      footer.style.display = footer.textContent ? "" : "none";
      footer.style.marginTop = "10px";
    }
    update(props);
    return { el: el, update: update };
  };

  function isNumericCell(cell) {
    return typeof cell === "number" || (typeof cell === "string" && /^[-+]?[0-9.,\s]+%?$/.test(cell.trim()) && /[0-9]/.test(cell));
  }

  // Grows or trims a row or a table body to that many children of that tag.
  function fit(parent, tag, count) {
    while (parent.children.length > count) parent.removeChild(parent.lastElementChild);
    while (parent.children.length < count) parent.appendChild(h(tag, ""));
  }
  function setCell(cell, cls, text) {
    if (cell.className !== cls) cell.className = cls;
    if (cell.textContent !== text) cell.textContent = text;
  }

  // An update keeps the table and touches only the cells whose text changed, so a 25-row table
  // changes in place in one frame instead of being torn down and drawn again.
  widgets.table = function (props) {
    var el = h("div", "panel");
    var title = el.appendChild(h("div", "title"));
    var scroll = el.appendChild(h("div", "table-scroll"));
    var table = scroll.appendChild(h("table", ""));
    var headRow = table.appendChild(h("thead", "")).appendChild(h("tr", ""));
    var body = table.appendChild(h("tbody", ""));
    function update(p) {
      var titleText = str(p.title, 120);
      if (title.textContent !== titleText) title.textContent = titleText;
      title.style.display = titleText ? "" : "none";
      var columns = arr(p.columns).slice(0, 12);
      var rows = arr(p.rows).slice(0, 200);
      var numeric = columns.map(function (_, index) {
        return rows.length > 0 && rows.every(function (row) {
          var cell = arr(row)[index];
          return cell === undefined || cell === "" || isNumericCell(cell);
        });
      });
      fit(headRow, "th", columns.length);
      columns.forEach(function (column, index) {
        setCell(headRow.children[index], numeric[index] ? "n" : "", str(column, 80));
      });
      fit(body, "tr", rows.length);
      rows.forEach(function (row, rowIndex) {
        var tr = body.children[rowIndex];
        fit(tr, "td", columns.length);
        columns.forEach(function (_, index) {
          setCell(tr.children[index], numeric[index] ? "n" : "", str(arr(row)[index], 400));
        });
      });
    }
    update(props);
    return { el: el, update: update };
  };

  function legend(names, colors) {
    var box = h("div", "legend");
    names.forEach(function (name, index) {
      var item = box.appendChild(h("span", ""));
      var dot = item.appendChild(h("b", ""));
      dot.style.background = colors[index % colors.length];
      item.appendChild(document.createTextNode(name));
    });
    return box;
  }

  function lineChart(target, x, series, colors, animate) {
    var W = 320, H = 170, L = 34, R = 8, T = 8, B = 22;
    var values = [];
    series.forEach(function (s) { values = values.concat(s.values); });
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    if (min > 0) min = 0;
    if (max === min) max = min + 1;
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, "class": "chart" });
    var px = function (i) { return L + (x.length <= 1 ? (W - L - R) / 2 : i * (W - L - R) / (x.length - 1)); };
    var py = function (v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); };
    [min, (min + max) / 2, max].forEach(function (v) {
      root.appendChild(svg("line", { x1: L, x2: W - R, y1: py(v), y2: py(v), "class": "grid" }));
      var label = root.appendChild(svg("text", { x: L - 6, y: py(v) + 3, "text-anchor": "end", "class": "axis" }));
      label.textContent = compact(v);
    });
    xLabels(root, x, px, H - 6);
    var defs = root.appendChild(svg("defs", {}));
    series.forEach(function (s, index) {
      var color = colors[index % colors.length];
      var points = s.values.map(function (v, i) { return px(i) + "," + py(v); });
      if (points.length === 0) return;
      if (index === 0 && points.length > 1) {
        var id = "area" + (++gradientSeq);
        var gradient = defs.appendChild(svg("linearGradient", { id: id, x1: "0", y1: "0", x2: "0", y2: "1" }));
        gradient.appendChild(svg("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.28" }));
        gradient.appendChild(svg("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }));
        var area = root.appendChild(svg("path", {
          d: "M" + px(0) + "," + py(min) + " L" + points.join(" L") + " L" + px(s.values.length - 1) + "," + py(min) + " Z",
          fill: "url(#" + id + ")" }));
        if (animate) area.setAttribute("class", "enter");
      }
      var line = root.appendChild(svg("polyline", { points: points.join(" "), fill: "none", stroke: color,
        "stroke-width": 2.25, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      var last = s.values.length - 1;
      root.appendChild(svg("circle", { cx: px(last), cy: py(s.values[last]), r: 3.5, fill: color }));
      if (animate) drawOn(line);
    });
    target.appendChild(root);
  }

  function drawOn(path) {
    if (reduceMotion) return;
    window.requestAnimationFrame(function () {
      var length = path.getTotalLength ? path.getTotalLength() : 0;
      if (!length) return;
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.getBoundingClientRect();
      path.style.transition = "stroke-dashoffset 1100ms cubic-bezier(.2,.8,.2,1)";
      path.style.strokeDashoffset = "0";
    });
  }

  function xLabels(root, x, px, y) {
    var step = Math.max(1, Math.ceil(x.length / 6));
    x.forEach(function (label, i) {
      if (i % step !== 0 && i !== x.length - 1) return;
      if (i !== x.length - 1 && x.length - 1 - i < step && i !== 0) return;
      var text = root.appendChild(svg("text", { x: px(i), y: y, "text-anchor": "middle", "class": "axis" }));
      text.textContent = label.length > 10 ? label.slice(0, 9) + "…" : label;
    });
  }

  function barChart(target, x, series, colors, stacked, animate) {
    var W = 320, H = 170, L = 34, R = 8, T = 8, B = 22;
    var max = 0, min = 0;
    x.forEach(function (_, i) {
      if (stacked) {
        var pos = 0, neg = 0;
        series.forEach(function (s) { var v = s.values[i] || 0; if (v >= 0) pos += v; else neg += v; });
        max = Math.max(max, pos); min = Math.min(min, neg);
      } else {
        series.forEach(function (s) { var v = s.values[i] || 0; max = Math.max(max, v); min = Math.min(min, v); });
      }
    });
    if (max === min) max = min + 1;
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, "class": "chart" });
    var py = function (v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); };
    [min, (min + max) / 2, max].forEach(function (v) {
      root.appendChild(svg("line", { x1: L, x2: W - R, y1: py(v), y2: py(v), "class": "grid" }));
      var label = root.appendChild(svg("text", { x: L - 6, y: py(v) + 3, "text-anchor": "end", "class": "axis" }));
      label.textContent = compact(v);
    });
    var slot = (W - L - R) / x.length;
    var groupWidth = slot * 0.7;
    var px = function (i) { return L + slot * i + slot / 2; };
    xLabels(root, x, px, H - 6);
    var count = 0;
    x.forEach(function (_, i) {
      var left = L + slot * i + (slot - groupWidth) / 2;
      var pos = 0, neg = 0;
      series.forEach(function (s, k) {
        var v = s.values[i] || 0;
        var y0, y1, xPos, width;
        if (stacked) {
          var base = v >= 0 ? pos : neg;
          y0 = py(base); y1 = py(base + v);
          if (v >= 0) pos += v; else neg += v;
          xPos = left; width = groupWidth;
        } else {
          width = Math.max(2, (groupWidth - (series.length - 1) * 2) / series.length);
          xPos = left + k * (width + 2);
          y0 = py(0); y1 = py(v);
        }
        var rect = root.appendChild(svg("rect", { x: xPos, y: Math.min(y0, y1), width: width,
          height: Math.max(0.5, Math.abs(y1 - y0)), rx: Math.min(3, width / 2), fill: colors[k % colors.length] }));
        if (animate) {
          rect.setAttribute("class", v < 0 ? "grow down" : "grow");
          rect.style.animationDelay = (count++ * 25) + "ms";
        }
      });
    });
    target.appendChild(root);
  }

  function pieChart(target, x, values, colors, animate) {
    var slices = x.map(function (name, i) { return { name: name, value: Math.max(0, values[i] || 0) }; })
      .filter(function (slice) { return slice.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    if (slices.length > 6) {
      var rest = slices.slice(5).reduce(function (sum, slice) { return sum + slice.value; }, 0);
      slices = slices.slice(0, 5).concat([{ name: "other", value: rest }]);
    }
    var total = slices.reduce(function (sum, slice) { return sum + slice.value; }, 0) || 1;
    var wrap = target.appendChild(h("div", "ring-wrap"));
    var root = wrap.appendChild(svg("svg", { viewBox: "0 0 100 100" }));
    var radius = 38, circumference = 2 * Math.PI * radius, offset = 0;
    root.appendChild(svg("circle", { cx: 50, cy: 50, r: radius, fill: "none", "stroke-width": 16, "class": "ring-track" }));
    slices.forEach(function (slice, i) {
      var length = circumference * slice.value / total;
      var arc = root.appendChild(svg("circle", { cx: 50, cy: 50, r: radius, fill: "none", "stroke-width": 16,
        stroke: colors[i % colors.length], transform: "rotate(-90 50 50)",
        "stroke-dasharray": (animate ? 0 : length) + " " + circumference, "stroke-dashoffset": -offset }));
      offset += length;
      if (animate) {
        window.setTimeout(function () {
          arc.style.transition = "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)";
          arc.setAttribute("stroke-dasharray", Math.max(0, length - 0.6) + " " + circumference);
        }, 60 + i * 90);
      }
    });
    target.appendChild(legend(slices.map(function (slice) {
      return slice.name + " · " + Math.round(slice.value / total * 100) + "%";
    }), colors));
  }

  widgets.chart = function (props) {
    var el = h("div", "panel");
    var drawn = false;
    function update(p) {
      var animate = !drawn && !reduceMotion;
      drawn = true;
      el.textContent = "";
      var titleText = str(p.title, 120);
      if (titleText) el.appendChild(h("div", "title", titleText));
      var x = arr(p.x).map(function (label) { return str(label, 40); }).slice(0, 60);
      var series = arr(p.series).slice(0, 6).map(function (s) {
        return { name: str(s && s.name, 40), values: arr(s && s.values).slice(0, x.length).map(function (v) { return num(v) || 0; }) };
      });
      if (x.length === 0 || series.length === 0) { el.appendChild(h("div", "muted", strings.noData)); return; }
      var colors = seriesColors();
      if (p.kind === "pie") pieChart(el, x, series[0].values, colors, animate);
      else if (p.kind === "bar") barChart(el, x, series, colors, p.stacked === true, animate);
      else lineChart(el, x, series, colors, animate);
      if (p.kind !== "pie" && series.length > 1) {
        el.appendChild(legend(series.map(function (s) { return s.name; }), colors));
      }
      var unit = str(p.yLabel, 20);
      if (unit && p.kind !== "pie") el.appendChild(h("div", "muted small", unit));
    }
    update(props);
    return { el: el, update: update };
  };

  function windowLabel(usageWindow) {
    return strings.windowLabels[usageWindow.id] || str(usageWindow.label, 60);
  }

  widgets.limits = function (props, status) {
    var el = h("div", "");
    var rings = el.appendChild(h("div", "limits-rings"));
    var more = el.appendChild(h("div", "panel limits-more"));
    var foot = el.appendChild(h("div", "muted small limits-foot"));
    var slots = [];
    function slot() {
      var box = rings.appendChild(h("div", "panel limit"));
      var wrap = box.appendChild(h("div", "ring-wrap"));
      var ring = makeRing(9);
      wrap.appendChild(ring.el);
      var center = wrap.appendChild(h("div", "ring-center"));
      var value = center.appendChild(h("div", "ring-value num"));
      var caption = center.appendChild(h("div", "ring-caption", strings.used));
      var label = box.appendChild(h("div", "limit-label"));
      var reset = box.appendChild(h("div", "limit-reset num"));
      return { box: box, ring: ring, value: value, caption: caption, label: label, reset: reset };
    }
    function pickPrimary(sources) {
      for (var i = 0; i < sources.length; i++) if (sources[i] && sources[i].sourceId === "claude") return sources[i];
      for (var j = 0; j < sources.length; j++) if (arr(sources[j] && sources[j].windows).length > 0) return sources[j];
      return sources[0] || null;
    }
    function update(p, st) {
      var sources = arr(p.sources);
      var loading = st === "running" && sources.length === 0;
      var primary = pickPrimary(sources);
      var windows = primary ? arr(primary.windows) : [];
      var heroes = windows.filter(function (w) { return w && (w.id === "five_hour" || w.id === "weekly"); });
      if (heroes.length === 0) heroes = windows.slice(0, 2);
      var rest = windows.filter(function (w) { return heroes.indexOf(w) < 0; });
      if (loading) heroes = [{ id: "five_hour" }, { id: "weekly" }];
      while (slots.length < heroes.length) slots.push(slot());
      while (slots.length > heroes.length) { var gone = slots.pop(); rings.removeChild(gone.box); }
      rings.style.gridTemplateColumns = heroes.length === 1 ? "1fr" : "1fr 1fr";
      heroes.forEach(function (w, i) {
        var s = slots[i];
        // Steady while loading: no pulse, the rings wait still (pulsing read as flashing).
        s.box.className = "panel limit" + (loading ? " loading" : "");
        s.label.textContent = windowLabel(w);
        var pct = num(w.usedPct);
        s.caption.style.display = loading || pct === null ? "none" : "";
        if (loading || pct === null) {
          s.value.textContent = "–";
          s.reset.textContent = loading ? strings.loading : "";
          s.ring.set(0);
          return;
        }
        s.ring.set(pct, function (v) { s.value.innerHTML = ""; s.value.appendChild(document.createTextNode(String(Math.round(v)))); s.value.appendChild(h("small", "", "%")); });
        fillReset(s.reset, w.resetsAt);
      });
      more.textContent = "";
      var extra = rest.map(function (w) { return { label: windowLabel(w), w: w }; });
      sources.forEach(function (source) {
        if (!source || source === primary) return;
        arr(source.windows).forEach(function (w) {
          extra.push({ label: str(source.sourceLabel, 40) + " · " + windowLabel(w), w: w });
        });
      });
      extra.forEach(function (item) {
        var row = more.appendChild(h("div", ""));
        var head = row.appendChild(h("div", "row"));
        head.appendChild(h("div", "small", item.label));
        var pct = num(item.w.usedPct);
        head.appendChild(h("div", "muted small num", pct === null ? "–" : Math.round(pct) + "%"));
        var bar = row.appendChild(h("div", "bar"));
        var fill = bar.appendChild(h("i", ""));
        var resets = row.appendChild(h("div", "muted small num"));
        resets.setAttribute("data-resets", str(item.w.resetsAt, 64));
        resets.textContent = resetText(item.w.resetsAt);
        var state = {};
        tween(state, "pct", clamp(pct || 0, 0, 100), 900, function (v) { fill.style.width = v + "%"; });
      });
      more.style.display = extra.length > 0 ? "" : "none";
      var footParts = [];
      if (primary && primary.sourceLabel) footParts.push(str(primary.sourceLabel, 40));
      if (primary && primary.plan) footParts.push(str(primary.plan, 40));
      if (primary && primary.fetchedAt) {
        var fetched = new Date(str(primary.fetchedAt, 64));
        if (!isNaN(fetched.getTime())) footParts.push(strings.updated.split("{time}").join(clock(fetched, false)));
      }
      if (primary && primary.error && windows.length === 0) footParts = [str(primary.error, 300)];
      if (!loading && !primary) footParts = [strings.noData];
      foot.textContent = footParts.join(" · ");
    }
    update(props, status);
    return { el: el, update: update };
  };

  // ---- windows ----
  function buildWidget(widget, index, animate) {
    var factory = widgets[widget.kind];
    var entry;
    try {
      if (!factory) throw new Error("unknown widget " + widget.kind);
      entry = factory(widget.props || {}, widget.status);
    } catch (error) {
      send({ type: "show.error", message: String(error && error.message || error) });
      entry = { el: h("div", "panel muted small", strings.widgetError), update: function () {} };
    }
    var holder = h("div", "w" + (entry.half ? " half" : ""));
    holder.appendChild(entry.el);
    if (animate && !reduceMotion) {
      holder.classList.add("enter");
      if (index > 0) holder.style.animationDelay = (Math.min(index, 2) * 20) + "ms";
      // A node put back into the document replays its CSS animation from opacity 0, so the
      // entrance class goes once it has played.
      holder.addEventListener("animationend", function (event) {
        if (event.target !== holder) return;
        holder.classList.remove("enter");
        holder.style.animationDelay = "";
      });
    }
    return { holder: holder, update: entry.update, kind: widget.kind, props: JSON.stringify(widget.props || {}) + "|" + widget.status };
  }

  function renderEmpty(win) {
    if (win.widgets.length === 0 && !win.el.querySelector(".empty")) {
      win.el.appendChild(h("div", "empty muted", strings.empty));
    } else if (win.widgets.length > 0) {
      var empty = win.el.querySelector(".empty");
      if (empty) empty.remove();
    }
  }

  function mountWindow(data, direction, animate) {
    var el = h("div", "window");
    var win = { id: data.id, el: el, widgets: new Map(), order: [] };
    data.widgets.forEach(function (widget, index) {
      var built = buildWidget(widget, index, animate);
      win.widgets.set(widget.id, built);
      el.appendChild(built.holder);
    });
    win.order = data.widgets.map(function (w) { return w.id; });
    renderEmpty({ el: el, widgets: data.widgets });
    if (animate && !reduceMotion && direction !== 0 && el.animate) {
      el.animate([{ transform: "translateX(" + (direction * 32) + "px)" }, { transform: "none" }],
        { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    stage.appendChild(el);
    return win;
  }

  function unmountWindow(win, direction) {
    var el = win.el;
    if (reduceMotion || !el.animate) { el.remove(); return; }
    el.classList.add("leaving");
    var anim = el.animate([
      { opacity: 1, transform: "none", filter: "blur(0)" },
      { opacity: 0, transform: "translateX(" + (-direction * 32) + "px) scale(.98)", filter: "blur(6px)" }
    ], { duration: 180, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    anim.onfinish = function () { el.remove(); };
  }

  function patchWindow(win, data) {
    var seen = {};
    data.widgets.forEach(function (widget) {
      seen[widget.id] = true;
      var existing = win.widgets.get(widget.id);
      var signature = JSON.stringify(widget.props || {}) + "|" + widget.status;
      if (existing && existing.kind === widget.kind) {
        if (existing.props !== signature) {
          try { existing.update(widget.props || {}, widget.status); }
          catch (error) { send({ type: "show.error", message: String(error && error.message || error) }); }
          existing.props = signature;
        }
      } else {
        var built = buildWidget(widget, 0, true);
        if (existing) existing.holder.replaceWith(built.holder); else win.el.appendChild(built.holder);
        win.widgets.set(widget.id, built);
      }
    });
    win.widgets.forEach(function (built, id) {
      if (seen[id]) return;
      win.widgets.delete(id);
      built.holder.remove();
    });
    // Keep DOM order equal to the window's widget order, moving only a widget out of place:
    // re-inserting a node restarts its animations (every update of the assistant's table re-ran
    // the fade-in of each widget in the window, so it sat dimmed while streaming).
    var next = win.el.firstElementChild;
    data.widgets.forEach(function (widget) {
      var built = win.widgets.get(widget.id);
      if (!built) return;
      if (built.holder === next) next = next.nextElementSibling;
      else win.el.insertBefore(built.holder, next);
    });
    renderEmpty({ el: win.el, widgets: data.widgets });
  }

  function render(data, direction) {
    lastWindow = data;
    if (!data) {
      if (current) { unmountWindow(current, direction); current = null; }
      return;
    }
    if (current && current.id === data.id) { patchWindow(current, data); return; }
    if (current) unmountWindow(current, direction || 1);
    current = mountWindow(data, direction, true);
    document.scrollingElement && (document.scrollingElement.scrollTop = 0);
  }

  function rebuild() {
    if (!lastWindow) return;
    if (current) current.el.remove();
    current = mountWindow(lastWindow, 0, false);
  }

  function isWindow(value) {
    return value && typeof value === "object" && typeof value.id === "string" && Array.isArray(value.widgets);
  }

  function receive(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "show.theme") {
      if (message.palette && typeof message.palette === "object") { palette = message.palette; applyPalette(palette); }
      if (message.strings && typeof message.strings === "object") strings = message.strings;
      rebuild();
      return;
    }
    if (message.type === "show.render") {
      var index = typeof message.index === "number" ? message.index : 0;
      var direction = currentIndex === null || index === currentIndex ? 0 : (index > currentIndex ? 1 : -1);
      currentIndex = index;
      render(isWindow(message.window) ? message.window : null, direction);
    }
  }

  window.__hizuriShow = function (message) {
    try { receive(message); } catch (error) { send({ type: "show.error", message: String(error && error.message || error) }); }
  };
  if (!isNative) {
    window.addEventListener("message", function (event) {
      if (event.source !== window.parent) return;
      window.__hizuriShow(event.data);
    });
  }
  window.addEventListener("error", function (event) {
    send({ type: "show.error", message: String(event.message || "error") });
  });
  window.setInterval(function () {
    var nodes = document.querySelectorAll("[data-resets]");
    for (var i = 0; i < nodes.length; i++) {
      var iso = nodes[i].getAttribute("data-resets");
      if (iso) nodes[i].textContent = resetText(iso);
    }
    var splits = document.querySelectorAll("[data-resets-split]");
    for (var j = 0; j < splits.length; j++) {
      var splitIso = splits[j].getAttribute("data-resets-split");
      if (splitIso) fillReset(splits[j], splitIso);
    }
  }, 30000);
  send({ type: "show.ready" });
})();
`;

export const SHOW_PAGE_HTML = [
  "<!doctype html>",
  '<html><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
  `<meta http-equiv="Content-Security-Policy" content="${SHOW_PAGE_CSP}">`,
  `<style>${SHOW_PAGE_STYLE}</style>`,
  '</head><body><main id="stage"></main>',
  `<script>${SHOW_PAGE_SCRIPT}</script>`,
  "</body></html>",
].join("\n");
