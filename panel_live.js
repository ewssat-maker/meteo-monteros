/* MetricPoint Live · Tiempo real: resumen provincial arriba, gráfico de 24 h y extremos del día debajo de la estación.
   Se carga DESPUÉS de eeaoc_live.js:  <script src="panel_live.js?v=1" defer></script>  */
(function () {
  "use strict";
  if (window.__panelLive) return; window.__panelLive = true;
  var BACK = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com");
  var COL = { temp: "#fb923c", hum: "#60a5fa", lluvia: "#22d3ee" };
  var S = { prov: "tucuman", ext: null, est: null, serie: null, vari: "temp", cache: {}, redes: { WU: true, SNIH: true, EEAOC: true } };
  var REDES = [["WU", "Estándar (WU)", "#3b82f6"], ["SNIH", "Oficial (SNIH)", "#f59e0b"], ["EEAOC", "Agromet (EEAOC)", "#a855f7"]];
  try { var g = JSON.parse(localStorage.getItem("mp_redes") || "null"); if (g) REDES.forEach(function (r) { if (g[r[0]] === false) S.redes[r[0]] = false; }); } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function f(v, d) { return (v === null || v === undefined || isNaN(v)) ? "--" : Number(v).toFixed(d).replace(".", ","); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CSS = '.mp-bloque{background:rgba(15,23,42,.82);border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:12px 14px;color:#e2e8f0;font-family:inherit}' +
    '.mp-tit{display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px}' +
    '.mp-tit b{color:#34d399;font-weight:800}.mp-fila{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.mp-fila::-webkit-scrollbar{display:none}' +
    '.mp-card{flex:1 1 0;min-width:0;background:rgba(30,41,59,.9);border:1px solid rgba(148,163,184,.15);border-left:3px solid var(--c);border-radius:12px;padding:8px 10px;cursor:pointer}' +
    '.mp-card span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}.mp-card strong{display:block;font-size:22px;font-weight:900;line-height:1.15;color:#fff;font-variant-numeric:tabular-nums}' +
    '.mp-card em{display:block;font-style:normal;font-size:10px;color:var(--c);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}' +
    '.mp-chips{display:flex;gap:6px}.mp-chip{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#94a3b8;cursor:pointer}' +
    '.mp-chip.on{background:var(--c);border-color:var(--c);color:#0f172a}' +
    '.mp-var{margin-top:10px}.mp-var h4{margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}' +
    '.mp-it{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(148,163,184,.12);font-size:13px;cursor:pointer}' +
    '.mp-it:last-child{border-bottom:0}.mp-it b{font-variant-numeric:tabular-nums;color:#fff;white-space:nowrap}.mp-it small{color:#94a3b8;text-align:right}' +
    '.mp-vacio{font-size:12px;color:#94a3b8;padding:8px 0}.mp-pulso{animation:mpp 1.2s ease-in-out infinite}@keyframes mpp{50%{opacity:.4}}' +
    '.mp-redes{display:flex;gap:6px;flex-wrap:wrap}.mp-red{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.3);background:transparent;color:#94a3b8;cursor:pointer}' +
    '.mp-red i{width:10px;height:10px;border-radius:50%;background:var(--c);border:1px solid #fff;opacity:.35}.mp-red.on{color:#fff;border-color:var(--c);background:rgba(255,255,255,.05)}.mp-red.on i{opacity:1}.mp-red small{color:#94a3b8;font-weight:600}' +
    '.mp-pista{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}.mp-pista::-webkit-scrollbar{display:none}' +
    '.mp-slide{flex:0 0 100%;scroll-snap-align:start;min-width:0}.mp-slide h4{margin:0 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}' +
    '.mp-grande{font-size:38px;font-weight:900;line-height:1.1;color:#fff;font-variant-numeric:tabular-nums}.mp-grande small{font-size:15px;color:#94a3b8;font-weight:700}' +
    '.mp-puntos{display:flex;justify-content:center;gap:6px;margin-top:10px}.mp-puntos i{width:7px;height:7px;border-radius:50%;background:#475569;transition:.2s}.mp-puntos i.on{background:#34d399;width:18px;border-radius:4px}' +
    '.mp-flechas{display:flex;gap:6px}.mp-flechas button{width:26px;height:26px;border-radius:50%;border:1px solid rgba(148,163,184,.3);background:transparent;color:#cbd5e1;cursor:pointer;font-size:13px;line-height:1}' +
    '@media (prefers-reduced-motion:reduce){.mp-pulso{animation:none}.mp-pista{scroll-behavior:auto}}';

  function estilos() { if ($("mpCss")) return; var s = document.createElement("style"); s.id = "mpCss"; s.textContent = CSS; document.head.appendChild(s); }

  function ir(id, fuente, nombre, lat, lon) {
    try {
      var it = telemetriaMarkers.filter(function (x) { return String(x.val).split("|")[0] === id; })[0];
      if (it) { seleccionarEstacion(it.val, it.marker, false); var p = $("panel-datos"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    } catch (e) {}
    try { if (typeof mapTelemetria !== "undefined") mapTelemetria.setView([lat, lon], 12); } catch (e) {}
    try { cargarDatosActuales(id, fuente, nombre); } catch (e) {}
    var q = $("panel-datos"); if (q) q.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.__mpIr = function (k, i) { var e = S.ext && S.ext[k] && S.ext[k][i]; if (e) ir(e.id, e.fuente, e.estacion, e.lat, e.lon); };

  // ---------- resumen provincial (arriba del mapa)
  function pintarResumen() {
    var b = $("mpResumen"); if (!b) return;
    var e = S.ext, nom = S.prov === "salta" ? "Salta" : "Tucumán";
    if (!e) { b.innerHTML = '<div class="mp-tit"><span>Resumen de hoy · ' + nom + '</span></div><div class="mp-vacio mp-pulso">💧 Leyendo las estaciones…</div>'; return; }
    if (e.error) { b.innerHTML = '<div class="mp-tit"><span>Resumen de hoy · ' + nom + '</span></div><div class="mp-vacio">No se pudo cargar el resumen ahora.</div>'; return; }
    var cards = [["temp_max", "Temp. máx.", "°C", 1, "#fb923c"], ["temp_min", "Temp. mín.", "°C", 1, "#38bdf8"], ["lluvia_dia", "Lluvia del día", "mm", 1, "#22d3ee"]];
    var h = cards.map(function (c) {
      var x = e[c[0]] && e[c[0]][0]; if (!x) return "";
      return '<div class="mp-card" style="--c:' + c[4] + '" onclick="__mpIr(\'' + c[0] + '\',0)"><span>' + c[1] + '</span><strong>' + f(x.valor, c[3]) + '<small style="font-size:12px;color:#94a3b8"> ' + c[2] + '</small></strong><em>' + esc(x.estacion) + '</em></div>';
    }).join("");
    if (!h) h = '<div class="mp-vacio">Todavía no hay datos de hoy.</div>';
    b.innerHTML = '<div class="mp-tit"><span>Resumen de hoy · <b>' + nom + '</b></span><span>' + esc(e.con_dato) + '/' + esc(e.estaciones) + ' estaciones · ' + esc(e.actualizado) + '</span></div><div class="mp-fila">' + h + '</div>';
  }

  // ---------- extremos (debajo de la estación): carrusel de 3 diapositivas
  function pintarExtremos() {
    var b = $("mpExtremos"); if (!b) return;
    var e = S.ext, nom = S.prov === "salta" ? "Salta" : "Tucumán";
    var cab = '<div class="mp-tit"><span>Extremos de hoy · <b>' + nom + '</b></span><div class="mp-flechas"><button onclick="__mpCar(-1)" aria-label="Anterior">‹</button><button onclick="__mpCar(1)" aria-label="Siguiente">›</button></div></div>';
    if (!e) { b.innerHTML = cab + '<div class="mp-vacio mp-pulso">Calculando extremos…</div>'; return; }
    if (e.error) { b.innerHTML = cab + '<div class="mp-vacio">No se pudo cargar ahora.</div>'; return; }
    var def = [["temp_max", "🌡 Temperatura máxima", "°C", 1, "#fb923c"], ["temp_min", "🌡 Temperatura mínima", "°C", 1, "#38bdf8"], ["lluvia_dia", "🌧 Lluvia del día", "mm", 1, "#22d3ee"]];
    var slides = def.map(function (v) {
      var l = e[v[0]] || [];
      if (!l.length) return '<div class="mp-slide" style="--c:' + v[4] + '"><h4>' + v[1] + '</h4><div class="mp-vacio">' + (v[0] === "lluvia_dia" ? "Sin lluvia registrada hoy en las redes elegidas." : "Sin datos válidos todavía.") + '</div></div>';
      var x = l[0], resto = l.slice(1).map(function (y, i) {
        return '<div class="mp-it" onclick="__mpIr(\'' + v[0] + '\',' + (i + 1) + ')"><b>' + f(y.valor, v[3]) + ' ' + v[2] + '</b><small>' + esc(y.estacion) + (y.hora ? ' · ' + esc(y.hora) : '') + '</small></div>';
      }).join("");
      var inten = "";
      if (v[0] === "lluvia_dia" && e.intensidad_max && e.intensidad_max[0]) { var q = e.intensidad_max[0]; inten = '<div class="mp-vacio" style="padding-bottom:0">Mayor intensidad en 1 h: <b style="color:#fff">' + f(q.valor, 1) + ' mm</b> · ' + esc(q.estacion) + (q.hora ? ' · ' + esc(q.hora) : '') + '</div>'; }
      return '<div class="mp-slide" style="--c:' + v[4] + '"><h4>' + v[1] + '</h4><div class="mp-it" style="border:0;padding:2px 0" onclick="__mpIr(\'' + v[0] + '\',0)"><span class="mp-grande">' + f(x.valor, v[3]) + ' <small>' + v[2] + '</small></span><small>' + esc(x.estacion) + (x.hora ? '<br>' + esc(x.hora) : '') + '</small></div>' + resto + inten + '</div>';
    }).join("");
    var qc = e.control_calidad && e.control_calidad.descartes ? ' Control de calidad: se descartaron ' + e.control_calidad.descartes + ' valor(es) no naturales.' : '';
    var pie = '<div class="mp-vacio">' + (e.estaciones - e.con_dato > 0 ? (e.estaciones - e.con_dato) + ' de ' + e.estaciones + ' estaciones sin dato en las últimas 3 h.' : '') + qc + ' Deslizá para ver más; tocá un valor para ir a la estación.</div>';
    b.innerHTML = cab + '<div class="mp-pista" id="mpPista">' + slides + '</div><div class="mp-puntos" id="mpPuntos"><i class="on"></i><i></i><i></i></div>' + pie;
    var p = $("mpPista"); if (p) p.addEventListener("scroll", function () { var i = Math.round(p.scrollLeft / Math.max(1, p.clientWidth)); var pt = $("mpPuntos"); if (pt) [].forEach.call(pt.children, function (d, k) { d.className = k === i ? "on" : ""; }); }, { passive: true });
  }
  window.__mpCar = function (d) { var p = $("mpPista"); if (p) p.scrollBy({ left: d * p.clientWidth, behavior: "smooth" }); };

  function cargarExt() {
    var prov = S.prov;
    S.ext = null; pintarResumen(); pintarExtremos();
    fetch(BACK + "/api/lluvia/extremos?provincia=" + prov + redesParam()).then(function (r) { return r.json(); }).then(function (j) {
      if (prov === S.prov) { S.ext = j; pintarResumen(); pintarExtremos(); }
    }).catch(function () { if (prov === S.prov) { S.ext = { error: 1 }; pintarResumen(); pintarExtremos(); } });
  }

  // ---------- redes meteorológicas: qué se ve en el mapa y qué entra en los extremos
  function redesParam() { var on = REDES.filter(function (r) { return S.redes[r[0]]; }).map(function (r) { return r[0]; }); return on.length === REDES.length ? "" : "&redes=" + on.join(","); }
  function fuenteDe(val) { return String(val).split("|")[4] ? String(val).split("|")[4].toUpperCase() : "WU"; }
  function aplicarRedes() {
    try {
      var cuenta = { WU: 0, SNIH: 0, EEAOC: 0 };
      telemetriaMarkers.forEach(function (it) {
        var fu = fuenteDe(it.val); cuenta[fu] = (cuenta[fu] || 0) + 1;
        var ver = S.redes[fu] !== false, en = mapTelemetria.hasLayer(it.marker);
        if (ver && !en) it.marker.addTo(mapTelemetria); else if (!ver && en) mapTelemetria.removeLayer(it.marker);
      });
      REDES.forEach(function (r) { var c = $("mpRedN_" + r[0]); if (c) c.textContent = cuenta[r[0]] || 0; });
    } catch (e) {}
  }
  function pintarRedes() {
    var b = $("mpRedes"); if (!b) return;
    b.innerHTML = '<div class="mp-tit"><span>Redes en el mapa</span></div><div class="mp-redes">' + REDES.map(function (r) {
      return '<button class="mp-red' + (S.redes[r[0]] ? " on" : "") + '" style="--c:' + r[2] + '" onclick="__mpRed(\'' + r[0] + '\')"><i></i>' + r[1] + ' <small id="mpRedN_' + r[0] + '">·</small></button>';
    }).join("") + '</div>';
    aplicarRedes();
  }
  window.__mpRed = function (k) {
    var activas = REDES.filter(function (r) { return S.redes[r[0]]; }).length;
    if (S.redes[k] && activas === 1) return;                       // siempre queda al menos una red
    S.redes[k] = !S.redes[k];
    try { localStorage.setItem("mp_redes", JSON.stringify(S.redes)); } catch (e) {}
    pintarRedes(); cargarExt();
  };

  // ---------- gráfico de 24 h de la estación elegida
  function cargarSerie(id, nombre) {
    S.est = { id: id, nombre: nombre }; S.serie = null; pintarGrafico();
    fetch(BACK + "/api/lluvia/estacion/" + encodeURIComponent(id) + "?horas=24").then(function (r) { return r.json(); }).then(function (j) {
      if (S.est && S.est.id === id) { S.serie = (j && j.serie) || []; pintarGrafico(); }
    }).catch(function () { if (S.est && S.est.id === id) { S.serie = []; pintarGrafico(); } });
  }
  function hora(ms) { var d = new Date(ms - 3 * 3600e3); return ("0" + d.getUTCHours()).slice(-2) + ":00"; }

  function pintarGrafico() {
    var b = $("mpGrafico"); if (!b) return;
    var cab = '<div class="mp-tit"><span>Últimas 24 h · <b>' + esc(S.est ? S.est.nombre : "estación") + '</b></span><div class="mp-chips">' +
      [["temp", "Temp"], ["hum", "Humedad"], ["lluvia", "Lluvia"]].map(function (c) { return '<button class="mp-chip' + (S.vari === c[0] ? " on" : "") + '" style="--c:' + COL[c[0]] + '" onclick="__mpVar(\'' + c[0] + '\')">' + c[1] + '</button>'; }).join("") + '</div></div>';
    if (!S.est) { b.innerHTML = cab + '<div class="mp-vacio">Elegí una estación en el mapa para ver cómo viene el día.</div>'; return; }
    if (S.serie === null) { b.innerHTML = cab + '<div class="mp-vacio mp-pulso">Cargando historial…</div>'; return; }
    var ahora = Date.now(), t0 = ahora - 24 * 3600e3, W = 340, H = 130, L = 30, R = 8, T = 10, B = 20, pw = W - L - R, ph = H - T - B;
    var X = function (ms) { return L + (ms - t0) / (24 * 3600e3) * pw; };
    var svg = "", col = COL[S.vari], resumen = "";
    var ticks = ""; for (var k = 0; k <= 6; k++) { var tm = t0 + k * 4 * 3600e3; ticks += '<text x="' + X(tm) + '" y="' + (H - 5) + '" fill="#64748b" font-size="9" text-anchor="middle">' + hora(tm) + '</text>'; }
    if (S.vari === "lluvia") {
      var hs = {}, tot = 0;
      S.serie.forEach(function (p) { var m = p.mm; if (m == null || m < 0 || m > 200) return; var t = Date.parse(p.ts); var hk = Math.floor(t / 3600e3); hs[hk] = (hs[hk] || 0) + m; tot += m; });
      var ks = Object.keys(hs), mx = Math.max.apply(null, ks.map(function (x) { return hs[x]; }).concat([1]));
      if (!S.serie.length) { b.innerHTML = cab + '<div class="mp-vacio">Esta estación no tiene historial guardado todavía.</div>'; return; }
      ks.forEach(function (k2) { var v = hs[k2], x = X(k2 * 3600e3), h2 = v / mx * ph; svg += '<rect x="' + (x - 4) + '" y="' + (T + ph - h2) + '" width="8" height="' + h2 + '" rx="2" fill="' + col + '"/>'; });
      svg += '<text x="' + (L - 4) + '" y="' + (T + 8) + '" fill="#94a3b8" font-size="9" text-anchor="end">' + f(mx, mx < 10 ? 1 : 0) + '</text><text x="' + (L - 4) + '" y="' + (T + ph) + '" fill="#94a3b8" font-size="9" text-anchor="end">0</text>';
      resumen = 'Total en 24 h: <b style="color:' + col + '">' + f(tot, 1) + ' mm</b> (mm por hora)';
    } else {
      var pts = S.serie.filter(function (p) { var v = S.vari === "temp" ? p.temp : p.hum; return v != null && (S.vari === "temp" ? (v > -30 && v < 55) : (v >= 1 && v <= 100)); })
        .map(function (p) { return [Date.parse(p.ts), S.vari === "temp" ? p.temp : p.hum]; });
      if (pts.length < 2) { b.innerHTML = cab + '<div class="mp-vacio">' + (S.serie.length ? 'Pocos datos para graficar esta variable.' : 'Esta estación no tiene historial guardado todavía.') + '</div>'; return; }
      var vs = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = Math.max(1, (hi - lo) * 0.15);
      lo -= pad; hi += pad;
      var Y = function (v) { return T + ph - (v - lo) / (hi - lo) * ph; };
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ");
      svg += '<path d="' + d + ' L' + X(pts[pts.length - 1][0]).toFixed(1) + ',' + (T + ph) + ' L' + X(pts[0][0]).toFixed(1) + ',' + (T + ph) + 'Z" fill="' + col + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>';
      var ult = pts[pts.length - 1]; svg += '<circle cx="' + X(ult[0]) + '" cy="' + Y(ult[1]) + '" r="3.5" fill="' + col + '" stroke="#fff" stroke-width="1.5"/>';
      var u = S.vari === "temp" ? "°C" : "%", dd = S.vari === "temp" ? 1 : 0;
      svg += '<text x="' + (L - 4) + '" y="' + (T + 8) + '" fill="#94a3b8" font-size="9" text-anchor="end">' + f(hi, dd) + '</text><text x="' + (L - 4) + '" y="' + (T + ph) + '" fill="#94a3b8" font-size="9" text-anchor="end">' + f(lo, dd) + '</text>';
      var mi = Math.min.apply(null, vs), ma = Math.max.apply(null, vs);
      resumen = 'Mín <b style="color:' + col + '">' + f(mi, dd) + u + '</b> · Máx <b style="color:' + col + '">' + f(ma, dd) + u + '</b> · Último <b style="color:' + col + '">' + f(ult[1], dd) + u + '</b>';
    }
    b.innerHTML = cab + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block"><line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="#334155"/>' + svg + ticks + '</svg><div class="mp-vacio" style="padding-bottom:0">' + resumen + '</div>';
  }
  window.__mpVar = function (v) { S.vari = v; pintarGrafico(); };

  // ---------- montaje
  function montar() {
    var tab = $("tab-tucuman"), panel = $("panel-datos");
    if (!tab || !panel || $("mpResumen")) return !!$("mpResumen");
    estilos();
    var barra = tab.parentElement, res = document.createElement("div");
    res.id = "mpResumen"; res.className = "mp-bloque"; barra.parentNode.insertBefore(res, barra.nextSibling);
    var rd = document.createElement("div"); rd.id = "mpRedes"; rd.className = "mp-bloque"; res.parentNode.insertBefore(rd, res.nextSibling);
    try { var lg = document.querySelector("#vista-telemetria .absolute.bottom-2"); if (lg) lg.style.display = "none"; } catch (e) {}
    var grid = panel.nextElementSibling, ancla = grid || panel;
    var gr = document.createElement("div"); gr.id = "mpGrafico"; gr.className = "mp-bloque";
    var ex = document.createElement("div"); ex.id = "mpExtremos"; ex.className = "mp-bloque";
    ancla.parentNode.insertBefore(gr, ancla.nextSibling); gr.parentNode.insertBefore(ex, gr.nextSibling);
    try { S.prov = ($("tab-salta") && $("tab-salta").className.indexOf("bg-emerald-500") > -1) ? "salta" : "tucuman"; } catch (e) {}
    pintarRedes(); pintarGrafico(); cargarExt();
    return true;
  }

  var camb = window.cambiarProvincia, carg = window.cargarDatosActuales;
  if (typeof camb === "function") window.cambiarProvincia = function (p) { S.prov = String(p).toLowerCase().indexOf("salta") > -1 ? "salta" : "tucuman"; S.est = null; S.serie = null; pintarGrafico(); cargarExt(); var r = camb.apply(this, arguments); aplicarRedes(); setTimeout(aplicarRedes, 800); setTimeout(aplicarRedes, 2500); return r; };
  if (typeof carg === "function") window.cargarDatosActuales = function (id, fuente, nombre) { try { cargarSerie(String(id), nombre || String(id)); } catch (e) {} return carg.apply(this, arguments); };

  var n = 0, iv = setInterval(function () { n++; if (montar() || n > 40) clearInterval(iv); }, 500);
  setInterval(function () { if ($("mpResumen")) cargarExt(); }, 5 * 60 * 1000);
  setInterval(function () { if ($("mpRedes")) aplicarRedes(); }, 2000);
})();
