/* MetricPoint Live · satélite GOES-19 (infrarrojo, visible y vapor de agua) sobre Salta, Jujuy, Tucumán y Catamarca.
   Se agrega al módulo Radar: elegís la banda, se dibuja debajo del radar y se anima con los últimos cuadros.
   Si el backend no responde, el radar queda como estaba. Requiere que index.html tenga el mapa del radar (mapRadar) y #radar-anim. */
(function () {
  "use strict";
  var BACK = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com");
  var BANDAS = { ir: "Infrarrojo", vis: "Visible", va: "Vapor de agua" };
  var DESC = {
    ir: "Temperatura del tope de las nubes: cuanto más frío (blanco, rojo, violeta), más alto el tope. Sirve de día y de noche.",
    vis: "Imagen como la vería el ojo desde el espacio. Solo hay de día; el brillo muestra el espesor de las nubes.",
    va: "Humedad en la media y alta troposfera (6,2 µm): zonas claras = aire húmedo o nubes altas; zonas oscuras = aire seco."
  };
  var S = { banda: null, cuadros: [], i: 0, capa: null, meta: null, play: false, timer: null, refresco: null, opac: 0.8, cache: {} };
  var $ = function (id) { return document.getElementById(id); };
  function hora(epoch) { return new Date(epoch * 1000).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }); }
  function mapa() { try { return (typeof mapRadar !== "undefined") ? mapRadar : null; } catch (e) { return null; } }

  function panel() {
    var d = document.createElement("div");
    d.id = "goes-panel"; d.className = "mt-1 border-t border-slate-700/50 pt-2";
    d.innerHTML =
      '<span class="text-[10px] text-slate-400 uppercase tracking-wider block mb-1"><i class="fa-solid fa-satellite mr-1"></i> Satélite GOES-19</span>' +
      '<div id="goes-btns" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px"></div>' +
      '<p id="goes-desc" class="text-[10px] leading-snug text-slate-400 mt-1.5"></p>' +
      '<div id="goes-ctl" style="display:none">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">' +
          '<button id="goes-play" type="button" style="width:30px;height:30px;border-radius:8px;background:#0f172a;border:1px solid #475569;color:#e2e8f0;font-size:12px">▶</button>' +
          '<input id="goes-sl" type="range" min="0" max="0" value="0" style="flex:1;accent-color:#38bdf8">' +
          '<span id="goes-hora" style="font:700 11px monospace;color:#e2e8f0;min-width:42px;text-align:right">--:--</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span class="text-[10px] text-slate-400">Opacidad</span>' +
          '<input id="goes-op" type="range" min="20" max="100" value="80" style="flex:1;accent-color:#38bdf8"></div>' +
        '<div id="goes-leg" style="margin-top:8px"></div>' +
      '</div>' +
      '<p id="goes-msg" class="text-[10px] leading-snug mt-1.5" style="color:#fbbf24"></p>';
    return d;
  }
  function botones() {
    var h = '', k, act;
    [["", "Apagar"]].concat(Object.keys(BANDAS).map(function (b) { return [b, BANDAS[b]]; })).forEach(function (p) {
      act = (S.banda || "") === p[0];
      h += '<button type="button" data-b="' + p[0] + '" style="padding:7px 2px;font-size:10px;line-height:1.1;border-radius:6px;font-weight:' + (act ? 800 : 700) + ';' +
        'background:' + (act ? '#0ea5e9' : 'transparent') + ';color:' + (act ? '#0f172a' : '#94a3b8') + ';border:1px solid ' + (act ? '#0ea5e9' : '#334155') + '">' + p[1] + '</button>';
    });
    $("goes-btns").innerHTML = h;
    Array.prototype.forEach.call($("goes-btns").querySelectorAll("button"), function (b) { b.onclick = function () { elegir(b.getAttribute("data-b") || null); }; });
  }

  function detener() { S.play = false; if (S.timer) { clearInterval(S.timer); S.timer = null; } var p = $("goes-play"); if (p) p.textContent = "▶"; }
  function quitarCapa() { var m = mapa(); if (S.capa && m) { try { m.removeLayer(S.capa); } catch (e) {} } S.capa = null; }
  function mensaje(t) { var e = $("goes-msg"); if (e) e.textContent = t || ""; }

  function leyenda() {
    var m = S.meta, e = $("goes-leg"); if (!m || !e) return;
    var st = m.leyenda || []; if (!st.length) { e.innerHTML = ""; return; }
    var lo = st[0][0], hi = st[st.length - 1][0], g = st.map(function (s) { return s[1] + " " + ((s[0] - lo) / (hi - lo) * 100).toFixed(1) + "%"; }).join(",");
    var marcas = "";
    if (S.banda === "vis") marcas = '<span>oscuro</span><span>brillante</span>';
    else for (var v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) marcas += '<span>' + v + '</span>';
    e.innerHTML = '<div style="height:10px;border-radius:5px;background:linear-gradient(to right,' + g + ')"></div>' +
      '<div style="display:flex;justify-content:space-between;font:10px monospace;color:#94a3b8;margin-top:2px">' + marcas + '</div>' +
      '<div style="font-size:10px;color:#94a3b8;margin-top:2px">' + (m.nombre || BANDAS[S.banda]) + (m.unidad ? " · " + m.unidad : "") + '</div>';
  }

  function mostrar(i) {
    var m = mapa(), c = S.cuadros[i]; if (!m || !c) return;
    S.i = i; var url = BACK + c.url, b = S.meta.bounds;
    if (!S.capa) {
      if (!m.getPane("goesPane")) { m.createPane("goesPane").style.zIndex = 240; m.getPane("goesPane").style.pointerEvents = "none"; }
      S.capa = L.imageOverlay(url, b, { pane: "goesPane", opacity: S.opac, interactive: false }).addTo(m);
    } else S.capa.setUrl(url);
    $("goes-sl").value = i; $("goes-hora").textContent = hora(c.epoch);
    var min = Math.round((Date.now() / 1000 - c.epoch) / 60);
    mensaje(i === S.cuadros.length - 1 && min > 45 ? "El último cuadro tiene " + min + " min de antigüedad." : "");
  }
  function precargar() { S.cuadros.forEach(function (c) { if (!S.cache[c.url]) { var im = new Image(); im.src = BACK + c.url; S.cache[c.url] = im; } }); }

  async function cargar(banda, conservar) {
    try {
      var r = await fetch(BACK + "/api/goes/" + banda + "/lista"); var j = await r.json();
      if (S.banda !== banda) return;
      S.cuadros = j.cuadros || []; S.meta = j.meta || {};
      if (!S.cuadros.length || !S.meta.bounds) {
        quitarCapa(); $("goes-ctl").style.display = "none";
        mensaje(banda === "vis" ? "Todavía no hay cuadros del visible (solo se generan de día)." : "Todavía no hay cuadros de esta banda.");
        return;
      }
      $("goes-ctl").style.display = "block"; $("goes-sl").max = S.cuadros.length - 1; leyenda(); precargar();
      var ult = S.cuadros[S.cuadros.length - 1].epoch;
      if (banda === "vis" && (Date.now() / 1000 - ult) > 3 * 3600) mensaje("El visible solo hay de día. Último cuadro: " + hora(ult) + ".");
      mostrar(conservar && S.i < S.cuadros.length ? S.i : S.cuadros.length - 1);
    } catch (e) {
      if (S.banda === banda) { quitarCapa(); $("goes-ctl").style.display = "none"; mensaje("No se pudo cargar el satélite ahora. Probá de nuevo en un momento."); }
    }
  }
  function elegir(b) {
    detener(); if (S.refresco) { clearInterval(S.refresco); S.refresco = null; }
    S.banda = b; botones(); quitarCapa(); mensaje(""); $("goes-ctl").style.display = "none";
    $("goes-desc").textContent = b ? DESC[b] : "Imagen del satélite debajo del radar. Elegí una banda.";
    if (!b) return;
    mensaje("Cargando…"); cargar(b, false);
    S.refresco = setInterval(function () { if (S.banda && !S.play) cargar(S.banda, false); }, 5 * 60000);
  }

  function iniciar() {
    var cont = $("radar-anim"), m = mapa();
    if (!cont || !m || $("goes-panel") || typeof L === "undefined") return false;
    var host = cont.parentNode, p = panel(); host.parentNode.insertBefore(p, host.nextSibling);
    botones(); $("goes-desc").textContent = "Imagen del satélite debajo del radar. Elegí una banda.";
    $("goes-sl").oninput = function () { detener(); mostrar(+this.value); };
    $("goes-op").oninput = function () { S.opac = this.value / 100; if (S.capa) S.capa.setOpacity(S.opac); };
    $("goes-play").onclick = function () {
      if (S.play) { detener(); return; }
      if (S.cuadros.length < 2) return;
      S.play = true; this.textContent = "❚❚";
      S.timer = setInterval(function () { var n = S.i + 1; if (n >= S.cuadros.length) n = 0; mostrar(n); }, 500);
    };
    return true;
  }
  var t = setInterval(function () { if (iniciar()) clearInterval(t); }, 700);
})();
