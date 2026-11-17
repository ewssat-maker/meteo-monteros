/* MetricPoint Live – "Lluvia acumulada (radar)". Archivo independiente: si algo falla, no afecta al resto de la página.
   El panel se ubica arriba del mapa de radar (no dentro del mapa). */
(function () {
  "use strict";
  var API = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com") + "/api/lluvia";
  var DEBUG = /[?&]lluviadebug=1/.test(location.search);
  var cartel = null;
  function diag(texto, error) {
    try {
      if (window.console) (error ? console.warn : console.debug)("Lluvia: " + texto);
      if (!DEBUG) return;
      if (!cartel) {
        cartel = document.createElement("div");
        cartel.style.cssText = "position:fixed;top:4px;left:4px;z-index:99999;font:11px/1.3 system-ui,sans-serif;padding:3px 7px;border-radius:6px;max-width:80vw;pointer-events:none";
        (document.body || document.documentElement).appendChild(cartel);
      }
      cartel.style.background = error ? "#b42318" : "#0b6b3a";
      cartel.style.color = "#fff";
      cartel.textContent = "Lluvia: " + texto;
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    if (ev && ev.filename && /lluvia_live/.test(ev.filename)) diag("error de script: " + ev.message, true);
  });

  // Contornos de respaldo (aproximados, [lat, lon]); los reales y los departamentos se piden al servidor (/provincias).
  var CONT = {
    tucuman: { nombre: "Tucumán", deptos: [], poli: [[-26.15,-65.90],[-26.05,-65.45],[-26.30,-64.95],[-26.60,-64.55],[-27.20,-64.55],[-27.60,-64.90],[-27.85,-65.10],[-27.95,-65.55],[-27.60,-65.95],[-27.10,-66.15],[-26.60,-66.05]] },
    salta: { nombre: "Salta", deptos: [], poli: [[-22.10,-65.10],[-22.10,-62.40],[-23.30,-62.30],[-24.50,-62.60],[-25.30,-62.80],[-25.80,-63.60],[-26.10,-64.40],[-26.10,-65.40],[-26.30,-66.20],[-26.10,-67.60],[-25.50,-68.60],[-24.00,-68.00],[-24.10,-66.90],[-24.30,-65.60],[-23.90,-64.70],[-23.20,-64.45],[-22.40,-64.55]] }
  };
  var estado = { contorno: null, overlay: null, marcas: null, horas: 24, activo: false, datos: null, timer: null, hist: false, prov: null };

  function buscarMapa() {
    try { if (typeof mapRadar !== "undefined" && mapRadar) return mapRadar; } catch (e) {}
    return window.mapRadar || null;
  }
  var intentos = 0;
  function esperarMapa() {
    var m = buscarMapa();
    if (m && window.L && m.addLayer) {
      try { iniciar(m); diag("panel listo"); }
      catch (e) { diag("no se pudo crear el panel: " + (e && e.message), true); }
      return;
    }
    intentos++;
    diag("esperando el mapa de radar (" + intentos + ")");
    setTimeout(esperarMapa, 1000);
  }

  function color(mm, niv, col) {
    if (mm == null || mm < niv[0]) return "#9aa5b1";
    var k = 0;
    for (var i = 0; i < niv.length; i++) if (mm >= niv[i]) k = i;
    return col[k];
  }
  function $(id) { return document.getElementById(id); }
  function msg(t) { var e = $("mpLluviaEstado"); if (e) e.textContent = t; }
  function histMsg(t) { var e = $("mpHistEstado"); if (e) e.textContent = t; }
  function pedir(url) {
    return fetch(url).then(function (r) {
      return r.json().then(function (j) { j._status = r.status; return j; }, function () {
        return { error: "El servidor respondió " + r.status + (r.status === 404 ? ": falta actualizar el backend (mod_lluvia.py y provincias_geo.py)" : "; probá de nuevo en un minuto") + ".", _status: r.status };
      });
    });
  }

  var CSS =
    ".mp-pan{background:rgba(15,23,42,.78);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-left:4px solid #0ea5e9;border-radius:16px;padding:12px 14px;margin-bottom:12px;color:#e2e8f0;font:12px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 10px 25px -5px rgba(0,0,0,.5)}" +
    ".mp-pan .mp-t{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8}" +
    ".mp-pan .mp-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}" +
    ".mp-pan .mp-lab{color:#94a3b8;min-width:64px}" +
    ".mp-pan button,.mp-pan select,.mp-pan input[type=date]{font:12px system-ui,sans-serif;color:#cbd5e1;background:rgba(30,41,59,.85);border:1px solid #334155;border-radius:999px;padding:5px 12px;color-scheme:dark}" +
    ".mp-pan select,.mp-pan input[type=date]{border-radius:10px}" +
    ".mp-pan button{cursor:pointer}" +
    ".mp-pan button.on{background:#0369a1;border-color:#38bdf8;color:#fff}" +
    ".mp-pan button.go{background:#047857;border-color:#34d399;color:#fff}" +
    ".mp-pan .mp-sw{position:relative;width:42px;height:24px;flex:none}" +
    ".mp-pan .mp-sw input{opacity:0;position:absolute;inset:0;margin:0;cursor:pointer;z-index:2}" +
    ".mp-pan .mp-sw i{position:absolute;inset:0;background:#334155;border-radius:12px;transition:background .2s}" +
    ".mp-pan .mp-sw i:after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#e2e8f0;transition:transform .2s}" +
    ".mp-pan .mp-sw input:checked+i{background:#0ea5e9}" +
    ".mp-pan .mp-sw input:checked+i:after{transform:translateX(18px)}" +
    ".mp-pan .mp-sub{color:#94a3b8;font-size:11px;margin-top:6px}" +
    ".mp-pan hr{border:0;border-top:1px solid rgba(148,163,184,.2);margin:12px 0 4px}";

  function iniciar(map) {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var p = document.createElement("div");
    p.id = "mpLluviaPanel"; p.className = "mp-pan";
    p.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<div><div class="mp-t">Lluvia acumulada · radar</div><div class="mp-sub" style="margin-top:2px">Estimada con RMA11 y RMA20, ajustada con pluviómetros cuando hay datos</div></div>' +
        '<label class="mp-sw" title="Mostrar en el mapa"><input type="checkbox" id="mpLluviaChk"><i></i></label>' +
      '</div>' +
      '<div id="mpLluviaOpc" style="display:none">' +
        '<div class="mp-row"><span class="mp-lab">Período</span>' +
          '<button type="button" class="mpH" data-h="3">3 h</button><button type="button" class="mpH" data-h="6">6 h</button><button type="button" class="mpH" data-h="12">12 h</button><button type="button" class="mpH on" data-h="24">24 h</button></div>' +
        '<div class="mp-row"><span class="mp-lab">Zona</span>' +
          '<button type="button" class="mpProv" data-p="todo">Todo el mapa</button><button type="button" class="mpProv" data-p="tucuman">Tucumán</button><button type="button" class="mpProv" data-p="salta">Salta</button><button type="button" class="mpProv" data-p="ambas">Ambas</button></div>' +
        '<div id="mpLluviaLeyenda" style="margin-top:10px"></div>' +
        '<div id="mpLluviaEstado" class="mp-sub"></div>' +
      '</div>' +
      '';
    var cont = map.getContainer(), caja = cont.parentNode;                 // el mapa va dentro de una caja con borde: el panel se pone antes de esa caja
    (caja.parentNode || document.body).insertBefore(p, caja);
    var p2 = document.createElement("div");                                 // consulta de días pasados: va debajo del mapa
    p2.id = "mpHistPanel"; p2.className = "mp-pan"; p2.style.marginTop = "12px";
    p2.innerHTML =
      '<div class="mp-t">Mapa de un día pasado</div>' +
      '<div class="mp-sub" style="margin-top:2px">Lluvia acumulada de un día calendario (00:00 a 24:00, hora de Argentina) en Tucumán y/o Salta. Se ve en el mapa de arriba o se descarga como imagen con un resumen del día.</div>' +
      '<div class="mp-row"><input type="date" id="mpHistFecha"><select id="mpHistProv"><option value="ambas">Tucumán y Salta</option><option value="tucuman">Tucumán</option><option value="salta">Salta</option></select>' +
        '<select id="mpHistDias"><option value="1">1 día (24 h)</option><option value="2">2 días seguidos</option><option value="3">3 días seguidos</option></select></div>' +
      '<div class="mp-row"><button type="button" id="mpHistVer" class="go">Ver en el mapa</button><button type="button" id="mpHistBaj">Descargar imagen</button><button type="button" id="mpHistVolver" style="display:none">Volver a las últimas horas</button></div>' +
      '<div id="mpHistEstado" class="mp-sub"></div>' +
      '<details id="mpSerie" style="margin-top:10px"><summary style="cursor:pointer;color:#7dd3fc;font-weight:700">Días y meses guardados</summary>' +
        '<div id="mpSerieCuerpo" class="mp-sub">Tocá para cargar…</div></details>';
    var padre = caja.parentNode || document.body;                           // el panel va siempre al final: mapa → escala → días pasados
    var alFinal = function () { if (p2.parentNode !== padre || padre.lastElementChild !== p2) { try { obs.disconnect(); } catch (e) {} padre.appendChild(p2); try { obs.observe(padre, { childList: true }); } catch (e) {} } };
    var obs = (typeof MutationObserver === "function") ? new MutationObserver(alFinal) : { observe: function () {}, disconnect: function () {} };
    alFinal(); setTimeout(alFinal, 1500); setTimeout(alFinal, 5000);

    var chk = $("mpLluviaChk");
    chk.addEventListener("change", function () { chk.checked ? activar(map) : desactivar(map); });
    Array.prototype.forEach.call(p.querySelectorAll(".mpH"), function (b) {
      b.addEventListener("click", function () { setHoras(+b.getAttribute("data-h")); estado.hist = false; ocultarVolver(); if (estado.activo) cargar(map); else chk.click(); });
    });
    Array.prototype.forEach.call(p.querySelectorAll(".mpProv"), function (b) {
      b.addEventListener("click", function () { verProvincia(map, b.getAttribute("data-p")); });
    });
    map.on("click", function (e) { if (estado.activo || estado.hist) consultarPunto(map, e.latlng); });
    pedir(API + "/provincias").then(function (j) { if (j && !j.error && j.tucuman && j.salta) CONT = j; }).catch(function () {});
    iniciarHist(map);
  }

  function setHoras(h) {
    estado.horas = h;
    Array.prototype.forEach.call(document.querySelectorAll(".mpH"), function (b) { b.classList.toggle("on", +b.getAttribute("data-h") === h); });
  }
  function ocultarVolver() { var v = $("mpHistVolver"); if (v) v.style.display = "none"; }
  function marcarZona(clave) {
    Array.prototype.forEach.call(document.querySelectorAll(".mpProv"), function (b) { b.classList.toggle("on", b.getAttribute("data-p") === clave); });
  }

  function activar(map) {
    estado.activo = true;
    $("mpLluviaOpc").style.display = "block";
    $("mpLluviaChk").checked = true;
    cargar(map);
    clearInterval(estado.timer);
    estado.timer = setInterval(function () { cargar(map); }, 5 * 60 * 1000);
  }
  function quitarCapas(map) {
    if (estado.overlay) { map.removeLayer(estado.overlay); estado.overlay = null; }
    if (estado.marcas) { map.removeLayer(estado.marcas); estado.marcas = null; }
  }
  function desactivar(map) {
    estado.activo = false; estado.hist = false;
    clearInterval(estado.timer);
    quitarCapas(map);
    dibujarContorno(map, null);
    marcarZona(null); ocultarVolver();
    $("mpLluviaOpc").style.display = "none";
  }

  // Contorno de provincia (línea blanca) y departamentos (líneas finas).
  function dibujarContorno(map, claves) {
    if (estado.contorno) { map.removeLayer(estado.contorno); estado.contorno = null; }
    if (!claves) return;
    estado.contorno = L.layerGroup();
    claves.forEach(function (k) {
      (CONT[k].deptos || []).forEach(function (d) { L.polygon(d, { color: "#e2e8f0", weight: 0.7, opacity: 0.45, fill: false, interactive: false }).addTo(estado.contorno); });
    });
    claves.forEach(function (k) { L.polygon(CONT[k].poli, { color: "#f8fafc", weight: 2.5, opacity: 0.95, fill: false, interactive: false }).addTo(estado.contorno); });
    estado.contorno.addTo(map);
  }
  function cajaDe(claves) {
    var pts = []; claves.forEach(function (k) { pts = pts.concat(CONT[k].poli); });
    var la = pts.map(function (q) { return q[0]; }), lo = pts.map(function (q) { return q[1]; });
    return [[Math.min.apply(null, la) - 0.1, Math.min.apply(null, lo) - 0.1], [Math.max.apply(null, la) + 0.1, Math.max.apply(null, lo) + 0.1]];
  }

  // Botones de zona: mismo mapa de lluvia, encuadrado en la provincia (o en todo el mapa) y con su contorno.
  function verProvincia(map, clave) {
    estado.hist = false; ocultarVolver();
    marcarZona(clave);
    if (!estado.activo) activar(map); else cargar(map);
    if (clave === "todo") { dibujarContorno(map, null); map.setView([-26.83, -65.20], 7); return; }
    var claves = clave === "ambas" ? ["tucuman", "salta"] : [clave];
    dibujarContorno(map, claves);
    map.fitBounds(cajaDe(claves));
  }

  function pintarMarcas(map, ests, m, etiqueta) {
    if (estado.marcas) map.removeLayer(estado.marcas);
    estado.marcas = L.layerGroup();
    (ests || []).forEach(function (s) {
      if (s.lat == null || s.mm == null || s.sospechosa) return;               // sin dato, o sensor que marca 0 al lado de otro con mucha lluvia
      var c = color(s.mm, m.niveles, m.colores);
      var ic = L.divIcon({ className: "", iconSize: [34, 16], iconAnchor: [17, 8],
        html: '<div style="background:#fff;border:2px solid ' + c + ';border-radius:8px;font:11px/12px system-ui;text-align:center;color:#1f2933" title="' + s.nombre + '">' + s.mm.toFixed(1) + "</div>" });
      L.marker([s.lat, s.lon], { icon: ic, pane: "markerPane", keyboard: false }).bindTooltip(s.nombre + ": " + s.mm.toFixed(1) + " mm (pluviómetro, " + etiqueta + ")").addTo(estado.marcas);
    });
    estado.marcas.addTo(map);
  }
  function ponerCapa(map, m, opacidad) {
    if (estado.overlay) map.removeLayer(estado.overlay);
    if (!map.getPane("lluviaPane")) { map.createPane("lluviaPane"); map.getPane("lluviaPane").style.zIndex = 260; map.getPane("lluviaPane").style.pointerEvents = "none"; }
    estado.overlay = L.imageOverlay(m.png, m.bounds, { opacity: opacidad, pane: "lluviaPane", interactive: false }).addTo(map);
  }

  function cargar(map) {
    if (estado.hist) return;                       // mientras se mira un día pasado no se pisa con las últimas horas
    msg("Cargando…");
    var h = estado.horas;
    Promise.all([pedir(API + "/radar/mapa?horas=" + h), pedir(API + "/estaciones?horas=" + h).catch(function () { return null; })]).then(function (r) {
      var m = r[0], e = r[1];
      if (!estado.activo || estado.hist) return;
      if (m.error) { msg(m.error); return; }
      estado.datos = m;
      ponerCapa(map, m, 0.8);
      pintarMarcas(map, e && e.estaciones, m, h + " h");
      var cob = Object.keys(m.radares).map(function (k) { return k + " " + m.radares[k].cobertura_pct + "%"; }).join(" · ");
      var q = m.mm_max_en;
      msg("Últimas " + h + " h · máx. " + m.mm_max + " mm" + (q && q.localidad ? " (a " + q.km + " km de " + q.localidad + (q.en_el_tope ? ", es el tope del ajuste" : "") + ")" : "") + " · cobertura " + cob + ". Tocá el mapa para ver un punto.");
      leyenda(m);
    }).catch(function () { msg("Sin conexión con el servidor."); });
  }

  function leyenda(m) {
    var h = '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;border:1px solid rgba(148,163,184,.3)">';
    m.colores.forEach(function (c) { h += '<span style="flex:1;background:' + c + '"></span>'; });
    h += '</div><div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:2px"><span>' + m.niveles[0] + '</span><span>' + m.niveles[5] + '</span><span>' + m.niveles[m.niveles.length - 1] + ' mm</span></div>' +
      '<div class="mp-sub" style="margin-top:4px">' + (m.ajustado ? 'Radar ajustado con pluviómetros de estaciones.' : 'Radar sin ajustar con estaciones' + (m.ajuste && m.ajuste.motivo ? ' (' + m.ajuste.motivo.replace(/\.$/, '').toLowerCase() + ')' : '') + '.') + '</div>';
    $("mpLluviaLeyenda").innerHTML = h;
  }

  // ---- Mapa de un día pasado: se ve en el mapa o se descarga como imagen PNG (mapa base + capa de lluvia + contorno + mm de pluviómetros)
  function histUrl() {
    var f = $("mpHistFecha").value;
    if (!f) { histMsg("Elegí una fecha."); return null; }
    return API + "/radar/historico?fecha=" + f + "&provincia=" + $("mpHistProv").value + "&dias=" + $("mpHistDias").value;
  }
  function fmtF(iso) { var d = iso.slice(0, 10).split("-"); return d[2] + "/" + d[1]; }
  function resumenHist(m) {
    var dg = m.diagnostico || {};
    var t = Object.keys(m.por_provincia).map(function (k) { var q = m.por_provincia[k]; return q.nombre + ": máx. " + q.mm_max + " mm, promedio " + q.mm_media + " mm"; }).join(" · ");
    if (dg.desde) t = "Del " + fmtF(dg.desde) + " 00:00 al " + fmtF(dg.hasta) + " 00:00 (hora de Argentina) · " + t;
    var q = dg.mm_max_en;
    if (q) t += " · el máximo (" + q.mm + " mm) está " + (q.localidad ? "a " + q.km + " km de " + q.localidad : "en " + q.lat + ", " + q.lon) + (q.en_el_tope ? " y es el tope de seguridad del ajuste, no una medición" : "");
    return t + (m.ajustado ? " · ajustado con pluviómetros" : " · radar sin ajustar");
  }
  function iniciarHist(map) {
    var ahora = new Date(Date.now() - 3 * 3600 * 1000), ayer = new Date(ahora.getTime() - 24 * 3600 * 1000);
    var inp = $("mpHistFecha");
    inp.max = ahora.toISOString().slice(0, 10); inp.value = ayer.toISOString().slice(0, 10);
    pedir(API + "/estado").then(function (j) {                          // la fecha más antigua es el primer día con radar guardado
      var hr = (j && j.base && j.base.horas_radar) || {}, min = null;
      Object.keys(hr).forEach(function (k) { if (hr[k].desde && (!min || hr[k].desde < min)) min = hr[k].desde; });
      if (!min) return;
      var d = new Date(new Date(min).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      inp.min = d; if (inp.value < d) inp.value = d;
      histMsg("Hay radar guardado desde el " + d.split("-").reverse().join("/") + ".");
    }).catch(function () {});

    var serieOk = false;
    function dibujarSerie(j) {
      var cu = $("mpSerieCuerpo"), f = function (v) { return v == null ? "–" : (Math.round(v * 10) / 10).toString().replace(".", ","); };
      var MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
      if (!j.dias || !j.dias.length) { cu.textContent = "Todavía no hay días guardados. Se guardan solos cada día cerrado."; return; }
      var h = '<table style="width:100%;border-collapse:collapse;margin-top:4px;color:#e2e8f0;font-size:11px"><tr style="color:#94a3b8;text-align:right"><td style="text-align:left">Mes</td><td>Tucumán mm</td><td>Salta mm</td><td>Días con lluvia (T / S)</td></tr>';
      j.meses.forEach(function (m) {
        var t = m.tucuman || {}, sa = m.salta || {}, p = m.mes.split("-");
        h += '<tr style="text-align:right;border-top:1px solid rgba(148,163,184,.2)"><td style="text-align:left">' + MES[+p[1] - 1] + " " + p[0] + "</td><td>" + f(t.mm_media_acumulada) + "</td><td>" + f(sa.mm_media_acumulada) + "</td><td>" + (t.dias_con_lluvia || 0) + " / " + (sa.dias_con_lluvia || 0) + "</td></tr>";
      });
      h += "</table><div style='margin-top:8px;color:#94a3b8'>Días (tocá uno para verlo; el número es la lluvia media de Tucumán / Salta):</div><div style='display:flex;flex-wrap:wrap;gap:5px;margin-top:5px'>";
      j.dias.slice().reverse().forEach(function (d) {
        var t = d.tucuman && d.tucuman.mm_media, sa = d.salta && d.salta.mm_media, llu = (t || 0) >= 1 || (sa || 0) >= 1;
        h += '<button type="button" class="mpDia" data-f="' + d.fecha + '" style="padding:3px 8px;border-radius:9px;border:1px solid ' + (llu ? "#0ea5e9" : "rgba(148,163,184,.3)") + ";background:" + (llu ? "rgba(14,165,233,.18)" : "transparent") + ';color:#e2e8f0;font-size:11px;cursor:pointer">' + d.fecha.slice(8) + "/" + d.fecha.slice(5, 7) + " · " + f(t) + " / " + f(sa) + "</button>";
      });
      cu.innerHTML = h + "</div>";
      Array.prototype.forEach.call(cu.querySelectorAll(".mpDia"), function (b) {
        b.addEventListener("click", function () { $("mpHistFecha").value = b.getAttribute("data-f"); $("mpHistDias").value = "1"; $("mpHistVer").click(); });
      });
    }
    $("mpSerie").addEventListener("toggle", function () {
      if (!this.open || serieOk) return;
      pedir(API + "/historico/serie?dias=120").then(function (j) { serieOk = true; dibujarSerie(j); }).catch(function () { $("mpSerieCuerpo").textContent = "No se pudo cargar la lista de días."; });
    });

    $("mpHistVer").addEventListener("click", function () {
      var u = histUrl(); if (!u) return;
      histMsg("Cargando…");
      pedir(u).then(function (m) {
        if (m.error) { histMsg(m.error); return; }
        estado.hist = true;
        estado.histParams = { fecha: m.fecha, dias: m.dias };
        CONT = mezclar(CONT, m.contornos);
        ponerCapa(map, m, 0.8);
        pintarMarcas(map, m.estaciones, m, "día");
        dibujarContorno(map, m.provincias);
        map.fitBounds(m.bounds);
        histMsg(resumenHist(m));
        if (estado.activo) leyenda(m);
        $("mpHistVolver").style.display = "inline-block";
      }).catch(function () { histMsg("Sin conexión con el servidor."); });
    });
    $("mpHistBaj").addEventListener("click", function () {
      var u = histUrl(); if (!u) return;
      histMsg("Preparando el mapa…");
      pedir(u).then(function (m) {
        if (m.error) { histMsg(m.error); return; }
        return dibujarDescarga(map, m).then(function (c) {
          c.toBlob(function (b) {
            if (!b) { histMsg("No se pudo generar la imagen."); return; }
            var a = document.createElement("a"); a.href = URL.createObjectURL(b);
            a.download = "lluvia_" + m.provincias.join("-") + "_" + m.fecha + (m.dias > 1 ? "_" + m.dias + "d" : "") + ".png";
            document.body.appendChild(a); a.click(); a.remove(); histMsg("Mapa descargado. " + resumenHist(m));
          }, "image/png");
        });
      }).catch(function (e) { histMsg((e && e.message) || "No se pudo descargar."); });
    });
    $("mpHistVolver").addEventListener("click", function () {
      estado.hist = false; ocultarVolver(); histMsg("");
      if (estado.activo) cargar(map); else { quitarCapas(map); dibujarContorno(map, null); }
    });
  }
  function mezclar(base, nuevo) {
    var r = {}; Object.keys(base).forEach(function (k) { r[k] = base[k]; });
    Object.keys(nuevo || {}).forEach(function (k) { r[k] = nuevo[k]; });
    return r;
  }

  // Imagen descargable.
  function capaBase(map) {
    var u = null;
    map.eachLayer(function (l) { if (!u && l instanceof L.TileLayer && l._url) u = l; });
    return u;
  }
  function cargarImg(src, cors) {
    return new Promise(function (ok) {
      var im = new Image(); if (cors) im.crossOrigin = "anonymous";
      im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src;
    });
  }
  function dibujarDescarga(map, m) {
    var s = m.bounds[0][0], w = m.bounds[0][1], n = m.bounds[1][0], e = m.bounds[1][1];
    var z = 6; while (z < 12 && ((e - w) / 360) * 256 * Math.pow(2, z + 1) <= 1500) z++;
    var T = 256 * Math.pow(2, z);
    function X(lon) { return (lon + 180) / 360 * T; }
    function Y(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * T; }
    var x0 = X(w), y0 = Y(n), W = Math.round(X(e) - x0), H = Math.round(Y(s) - y0);
    var CAB = 60, PIE = 78, BLOQ = 330, RES = m.resumen && m.resumen.provincias ? m.resumen : null;
    var RESH = RES ? m.provincias.length * BLOQ + 44 : 0;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H + CAB + PIE + RESH;
    var c = cv.getContext("2d");
    c.fillStyle = "#0f172a"; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(0, CAB); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    c.fillStyle = "#1e293b"; c.fillRect(0, 0, W, H);
    var capa = capaBase(map), pedidos = [];
    if (capa) {
      var sub = capa.options.subdomains || "abc"; if (typeof sub === "string") sub = sub.split("");
      var tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x0 + W) / 256), ty0 = Math.floor(y0 / 256), ty1 = Math.floor((y0 + H) / 256);
      for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) (function (tx, ty) {
        var url = capa._url.replace("{s}", sub[(tx + ty) % sub.length]).replace("{z}", z).replace("{x}", tx).replace("{y}", ty).replace("{r}", "");
        pedidos.push(cargarImg(url, true).then(function (im) { if (im) c.drawImage(im, tx * 256 - x0, ty * 256 - y0, 256, 256); return !!im; }));
      })(tx, ty);
    }
    return Promise.all(pedidos.concat([cargarImg(m.png, false)])).then(function (r) {
      var imgLluvia = r[r.length - 1], conBase = r.slice(0, -1).some(Boolean);
      if (imgLluvia) { c.globalAlpha = 0.8; c.imageSmoothingEnabled = true; c.drawImage(imgLluvia, 0, 0, W, H); c.globalAlpha = 1; }
      function trazo(poli) { c.beginPath(); poli.forEach(function (q, i) { var px = X(q[1]) - x0, py = Y(q[0]) - y0; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); c.stroke(); }
      var cont = m.contornos || {};
      c.strokeStyle = "rgba(226,232,240,.5)"; c.lineWidth = 0.8;
      m.provincias.forEach(function (k) { ((cont[k] && cont[k].deptos) || []).forEach(trazo); });
      c.strokeStyle = "#f8fafc"; c.lineWidth = 2.5;
      m.provincias.forEach(function (k) { if (cont[k]) trazo(cont[k].poli); });
      c.font = "bold 12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      (m.estaciones || []).forEach(function (st) {
        var px = X(st.lon) - x0, py = Y(st.lat) - y0, t = st.mm.toFixed(1), tw = c.measureText(t).width + 10;
        c.fillStyle = "#fff"; c.strokeStyle = color(st.mm, m.niveles, m.colores); c.lineWidth = 2;
        c.beginPath(); if (c.roundRect) c.roundRect(px - tw / 2, py - 8, tw, 16, 8); else c.rect(px - tw / 2, py - 8, tw, 16); c.fill(); c.stroke();
        c.fillStyle = "#1f2933"; c.fillText(t, px, py + 1);
      });
      c.restore();
      var nombres = m.provincias.map(function (k) { return m.por_provincia[k].nombre; }).join(" y ");
      var dg = m.diagnostico || {}, f = m.fecha.split("-"), fecha = f[2] + "/" + f[1] + "/" + f[0];
      c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillStyle = "#f1f5f9"; c.font = "bold 20px system-ui,sans-serif";
      c.fillText("Lluvia acumulada " + (m.dias * 24) + " h · " + nombres, 14, 27);
      c.font = "13px system-ui,sans-serif"; c.fillStyle = "#94a3b8";
      c.fillText((dg.desde ? "Del " + fmtF(dg.desde) + " 00:00 al " + fmtF(dg.hasta) + " 00:00 (hora de Argentina)" : fecha) + " · " + m.provincias.map(function (k) { var q = m.por_provincia[k]; return q.nombre + ": máx. " + q.mm_max + " mm"; }).join(" · "), 14, 48);
      var lx = 14, ly = CAB + H + 12, ancho = Math.min(520, W - 28), seg = ancho / m.colores.length;
      m.colores.forEach(function (col, i) { c.fillStyle = col; c.fillRect(lx + i * seg, ly, seg, 12); });
      c.fillStyle = "#cbd5e1"; c.font = "11px system-ui,sans-serif";
      m.niveles.forEach(function (v, i) { c.fillText(String(v), lx + i * seg, ly + 26); });
      c.fillText("mm", lx + ancho + 6, ly + 10);
      c.fillStyle = "#94a3b8";
      c.fillText((m.ajustado ? "Radar ajustado con pluviómetros" : "Radar sin ajustar con pluviómetros") + " · recuadros con número: mm medidos en estaciones", lx, ly + 44);
      c.fillText("MetricPoint" + (conBase ? " · mapa base: Esri, Maxar, Earthstar Geographics" : ""), lx, ly + 58);
      if (RES) dibujarResumen(c, m, RES, CAB + H + PIE, W, BLOQ);
      return cv;
    });
  }

  // Resumen de variables del período, debajo del mapa (una tarjeta de datos por provincia + gráfico por hora).
  function dibujarResumen(c, m, RES, y0, W, BLOQ) {
    var F = "system-ui,sans-serif";
    c.strokeStyle = "rgba(148,163,184,.3)"; c.lineWidth = 1; c.beginPath(); c.moveTo(14, y0 - 6); c.lineTo(W - 14, y0 - 6); c.stroke();
    c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillStyle = "#f1f5f9"; c.font = "bold 16px " + F;
    c.fillText("Resumen del período · variables principales", 14, y0 + 20);
    m.provincias.forEach(function (k, n) {
      var y = y0 + 34 + n * BLOQ, rs = RES.provincias[k] || {}, st = m.por_provincia[k] || {}, nom = st.nombre || k;
      c.fillStyle = "#38bdf8"; c.font = "bold 15px " + F; c.fillText(nom + (rs.estaciones ? " · " + rs.estaciones + " estaciones" : ""), 14, y + 16);
      var tp = rs.temperatura, hm = rs.humedad, im = rs.intensidad_max, hl = rs.hora_mas_lluviosa, top = (rs.pluviometros_top || [])[0];
      var radar = RES.radar;
      var T = [
        ["Lluvia estimada por radar", st.mm_max != null ? "máx. " + st.mm_max + " mm" : "s/d", st.mm_media != null ? "promedio " + st.mm_media + " mm" : ""],
        ["Superficie con lluvia", (st.km2_con_lluvia != null ? st.km2_con_lluvia.toLocaleString("es-AR") : "s/d") + " km²", "más de 25 mm: " + (st.km2_25mm != null ? st.km2_25mm.toLocaleString("es-AR") : "s/d") + " km²"],
        ["Pluviómetro con más lluvia", top ? top.mm + " mm" : "s/d", top ? top.nombre : "sin datos"],
        ["Mayor intensidad en 1 h", im ? im.mm_en_1h + " mm" : "s/d", im ? im.estacion + " · " + im.hora : ""],
        ["Hora más lluviosa", hl ? hl.hora.slice(6) + " h" : "s/d", hl ? "promedio " + hl.mm_medio + " mm/h" : ""],
        ["Temperatura", tp ? "máx. " + tp.max + " °C" : "s/d", tp ? "mín. " + tp.min + " °C · media " + tp.media + " °C" : ""],
        ["Humedad relativa", hm ? hm.min + " a " + hm.max + " %" : "s/d", hm ? "media " + hm.media + " %" : ""],
        ["Eco máximo de radar", radar ? radar.dbz_max + " dBZ" : "s/d", radar ? radar.radar + " · " + radar.hora + " (todo el radar)" : ""]
      ];
      var tw = (W - 28 - 3 * 10) / 4, th = 62;
      T.forEach(function (t, i) {
        var x = 14 + (i % 4) * (tw + 10), yy = y + 26 + Math.floor(i / 4) * (th + 8);
        c.fillStyle = "rgba(30,41,59,.9)"; c.fillRect(x, yy, tw, th);
        c.fillStyle = "#94a3b8"; c.font = "11px " + F; c.fillText(t[0], x + 8, yy + 16);
        c.fillStyle = "#f8fafc"; c.font = "bold 17px " + F; c.fillText(t[1], x + 8, yy + 38);
        c.fillStyle = "#94a3b8"; c.font = "11px " + F; c.fillText(t[2].length > 46 ? t[2].slice(0, 45) + "…" : t[2], x + 8, yy + 54);
      });
      // gráfico por hora: barras = lluvia media de los pluviómetros, línea = temperatura media
      var gy = y + 26 + 2 * (th + 8) + 6, gh = 92, gx = 14, gw = W - 28, ph = rs.por_hora || [], nh = ph.length || 1;
      c.fillStyle = "rgba(30,41,59,.9)"; c.fillRect(gx, gy, gw, gh + 36);
      c.fillStyle = "#94a3b8"; c.font = "11px " + F; c.fillText("Por hora: barras = lluvia media de los pluviómetros (mm), línea = temperatura media (°C)", gx + 8, gy + 14);
      var mx = Math.max.apply(null, ph.map(function (p) { return p && p.mm_medio ? p.mm_medio : 0; }).concat([1]));
      var ts = ph.map(function (p) { return p && p.temp != null ? p.temp : null; }).filter(function (v) { return v != null; });
      var t0 = ts.length ? Math.min.apply(null, ts) : 0, t1 = ts.length ? Math.max.apply(null, ts) : 1; if (t1 - t0 < 4) { t1 += 2; t0 -= 2; }
      var bw = (gw - 16) / nh, by = gy + 22, bh = gh - 8;
      ph.forEach(function (p, i) {
        var v = p && p.mm_medio ? p.mm_medio : 0, hh = v / mx * bh;
        c.fillStyle = "#38bdf8"; c.fillRect(gx + 8 + i * bw + 1, by + bh - hh, Math.max(1, bw - 2), hh);
      });
      c.strokeStyle = "#fbbf24"; c.lineWidth = 2; c.beginPath(); var ini = false;
      ph.forEach(function (p, i) {
        if (!p || p.temp == null) return;
        var px = gx + 8 + i * bw + bw / 2, py = by + bh - (p.temp - t0) / (t1 - t0) * bh;
        ini ? c.lineTo(px, py) : c.moveTo(px, py); ini = true;
      });
      c.stroke();
      c.fillStyle = "#94a3b8"; c.font = "10px " + F; c.textAlign = "center";
      for (var i = 0; i < nh; i += 3) c.fillText(("0" + (i % 24)).slice(-2) + " h", gx + 8 + i * bw + bw / 2, gy + gh + 28);
      c.textAlign = "right"; c.fillText(mx.toFixed(1) + " mm", gx + gw - 8, gy + 14);
      c.textAlign = "left";
    });
    c.fillStyle = "#64748b"; c.font = "11px " + F;
    c.fillText(RES.nota || "", 14, y0 + 34 + m.provincias.length * BLOQ + 4);
  }

  function consultarPunto(map, ll) {
    var hp = estado.hist && estado.histParams, h = hp ? hp.dias * 24 : estado.horas;
    var per = hp ? "el día " + fmtF(hp.fecha) + (hp.dias > 1 ? " (+" + (hp.dias - 1) + ")" : "") : h + " h";
    pedir(API + "/radar/punto?lat=" + ll.lat.toFixed(4) + "&lon=" + ll.lng.toFixed(4) + "&horas=" + h + (hp ? "&fecha=" + hp.fecha + "&dias=" + hp.dias : "")).then(function (j) {
      var t;
      if (j.mm == null) t = "<b>Sin estimación</b><br>" + (j.motivo || j.error || "");
      else {
        t = "<b>" + j.mm.toFixed(1) + " mm</b> en " + per + " (radar " + j.radar + (j.ajustado ? ", ajustado" : "") + ")<br>Cobertura de imágenes: " + Math.round(j.cobertura_pct) + "%" + (j.ajustado && j.mm_sin_ajustar != null ? "<br><small>Radar sin ajustar: " + j.mm_sin_ajustar.toFixed(1) + " mm</small>" : "");
        if (j.estaciones_cercanas && j.estaciones_cercanas.length)
          t += "<br><small>Estaciones cerca: " + j.estaciones_cercanas.map(function (s) { return s.nombre + " " + (s.mm == null ? "s/d" : s.mm + " mm") + " (" + s.distancia_km + " km)"; }).join("; ") + "</small>";
      }
      L.popup().setLatLng(ll).setContent('<div style="font:12px/1.4 system-ui">' + t + "</div>").openOn(map);
    }).catch(function () {});
  }

  try { diag("script cargado"); esperarMapa(); } catch (e) { diag("error al iniciar: " + (e && e.message), true); }
})();
