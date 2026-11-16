/* MetricPoint Live – capa "Lluvia acumulada (radar)". Archivo independiente: si algo falla, no afecta al resto de la página. */
(function () {
  "use strict";
  var API = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com") + "/api/lluvia";
  // Cartel de diagnóstico (arriba a la izquierda): dice en qué paso está el script. Se borra solo cuando todo salió bien.
  var cartel = null;
  // Silencioso por defecto (solo consola). Para ver el cartel: agregar ?lluviadebug=1 a la dirección de Live.
  var DEBUG = /[?&]lluviadebug=1/.test(location.search);
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
  function quitarCartel(ms) { setTimeout(function () { try { if (cartel) cartel.remove(); cartel = null; } catch (e) {} }, ms); }
  window.addEventListener("error", function (ev) {
    if (ev && ev.filename && /lluvia_live/.test(ev.filename)) diag("error de script: " + ev.message, true);
  });
  // Contornos aproximados (lat, lon) para encuadrar y marcar las provincias.
  var PROV = {
    tucuman: { nombre: "Tucumán", poli: [[-26.15,-65.90],[-26.05,-65.45],[-26.30,-64.95],[-26.60,-64.55],[-27.20,-64.55],[-27.60,-64.90],[-27.85,-65.10],[-27.95,-65.55],[-27.60,-65.95],[-27.10,-66.15],[-26.60,-66.05]] },
    salta: { nombre: "Salta", poli: [[-22.10,-65.10],[-22.10,-62.40],[-23.30,-62.30],[-24.50,-62.60],[-25.30,-62.80],[-25.80,-63.60],[-26.10,-64.40],[-26.10,-65.40],[-26.30,-66.20],[-26.10,-67.60],[-25.50,-68.60],[-24.00,-68.00],[-24.10,-66.90],[-24.30,-65.60],[-23.90,-64.70],[-23.20,-64.45],[-22.40,-64.55]] }
  };
  var estado = { contorno: null, overlay: null, marcas: null, horas: 24, activo: false, datos: null, timer: null, hist: false };

  // En index.html el mapa es `let mapRadar` (no cuelga de window) y se crea recién al abrir la vista de radar: se consulta por nombre y se espera sin límite.
  function buscarMapa() {
    try { if (typeof mapRadar !== "undefined" && mapRadar) return mapRadar; } catch (e) {}
    return window.mapRadar || null;
  }

  var intentos = 0;
  function esperarMapa() {
    var m = buscarMapa();
    if (m && window.L && m.addLayer) {
      diag("mapa encontrado, creando control…");
      try { iniciar(m); diag("control listo (arriba a la derecha del mapa)"); quitarCartel(6000); }
      catch (e) { diag("no se pudo crear el control: " + (e && e.message), true); }
      return;
    }
    intentos++;
    diag("script cargado, esperando el mapa de radar" + (window.L ? "" : " (Leaflet no está)") + " · abrí la vista de radar (" + intentos + ")");
    setTimeout(esperarMapa, 1000);
  }

  function color(mm, niv, col) {
    if (mm == null || mm < niv[0]) return "#9aa5b1";
    var k = 0;
    for (var i = 0; i < niv.length; i++) if (mm >= niv[i]) k = i;
    return col[k];
  }

  function iniciar(map) {
    var Ctl = L.Control.extend({
      options: { position: "topright" },
      onAdd: function () {
        var d = L.DomUtil.create("div", "leaflet-bar mp-lluvia-ctl");
        d.style.cssText = "background:#fff;padding:6px 8px;font:12px/1.3 system-ui,sans-serif;color:#1f2933;min-width:150px;box-shadow:0 1px 4px rgba(0,0,0,.3)";
        d.innerHTML =
          '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="mpLluviaChk"> <b>Lluvia acumulada (radar)</b></label>' +
          '<div id="mpLluviaOpc" style="display:none;margin-top:6px">' +
          '<select id="mpLluviaHoras" style="width:100%"><option value="3">Últimas 3 h</option><option value="6">Últimas 6 h</option><option value="12">Últimas 12 h</option><option value="24" selected>Últimas 24 h</option></select>' +
          '<div style="display:flex;gap:4px;margin-top:6px;align-items:center"><span style="white-space:nowrap">24 h en:</span>' +
          '<button type="button" class="mpProv" data-p="tucuman" style="flex:1">Tucumán</button><button type="button" class="mpProv" data-p="salta" style="flex:1">Salta</button><button type="button" class="mpProv" data-p="ambas" style="flex:1">Ambas</button></div>' +
          '<div id="mpLluviaEstado" style="margin-top:4px;color:#52606d"></div>' +
          '<div id="mpLluviaLeyenda" style="margin-top:4px"></div>' +
          '<details id="mpHist" open style="margin-top:6px;border-top:1px solid #e4e7eb;padding-top:4px"><summary style="cursor:pointer"><b>Lluvia de un día pasado</b></summary>' +
          '<div style="margin-top:4px;display:grid;gap:4px">' +
          '<input type="date" id="mpHistFecha" style="width:100%">' +
          '<select id="mpHistProv" style="width:100%"><option value="ambas">Tucumán y Salta</option><option value="tucuman">Tucumán</option><option value="salta">Salta</option></select>' +
          '<select id="mpHistDias" style="width:100%"><option value="1">1 día</option><option value="2">2 días seguidos</option><option value="3">3 días seguidos</option></select>' +
          '<div style="display:flex;gap:4px"><button type="button" id="mpHistVer" style="flex:1">Ver en el mapa</button><button type="button" id="mpHistBaj" style="flex:1">Descargar</button></div>' +
          '<button type="button" id="mpHistVolver" style="display:none">Volver a las últimas horas</button>' +
          '<div id="mpHistEstado" style="color:#52606d;font-size:11px"></div></div></details></div>';
        L.DomEvent.disableClickPropagation(d);
        return d;
      }
    });
    new Ctl().addTo(map);
    var chk = document.getElementById("mpLluviaChk"), sel = document.getElementById("mpLluviaHoras");
    chk.addEventListener("change", function () { chk.checked ? activar(map) : desactivar(map); });
    sel.addEventListener("change", function () { estado.horas = +sel.value; if (estado.activo) cargar(map); });
    map.on("click", function (e) { if (estado.activo && !estado.hist) consultarPunto(map, e.latlng); });
    iniciarHist(map);
    Array.prototype.forEach.call(document.querySelectorAll(".mpProv"), function (b) {
      b.addEventListener("click", function () { verProvincia(map, b.getAttribute("data-p")); });
    });
  }

  // Botones "24 h en Tucumán / Salta / Ambas": mismo mapa de lluvia del radar, 24 horas, encuadrado en la provincia y con su contorno.
  function verProvincia(map, clave) {
    var claves = clave === "ambas" ? ["tucuman", "salta"] : [clave];
    var pts = []; claves.forEach(function (k) { pts = pts.concat(PROV[k].poli); });
    var la = pts.map(function (p) { return p[0]; }), lo = pts.map(function (p) { return p[1]; });
    var b = [[Math.min.apply(null, la) - 0.15, Math.min.apply(null, lo) - 0.15], [Math.max.apply(null, la) + 0.15, Math.max.apply(null, lo) + 0.15]];
    estado.hist = false;
    var hv = document.getElementById("mpHistVolver"); if (hv) hv.style.display = "none";
    estado.horas = 24; document.getElementById("mpLluviaHoras").value = "24";
    var chk = document.getElementById("mpLluviaChk");
    if (!chk.checked) { chk.checked = true; activar(map); } else { cargar(map); }
    if (estado.contorno) map.removeLayer(estado.contorno);
    estado.contorno = L.layerGroup();
    claves.forEach(function (k) { L.polygon(PROV[k].poli, { color: "#e5e7eb", weight: 2, dashArray: "6 4", fill: false, interactive: false }).addTo(estado.contorno); });
    estado.contorno.addTo(map);
    map.fitBounds(b);
  }

  // ---- Lluvia de un día pasado (por provincia): se ve en el mapa y se descarga como imagen PNG
  function histUrl(formato, extra) {
    var f = document.getElementById("mpHistFecha").value;
    if (!f) { histMsg("Elegí una fecha."); return null; }
    return API + "/radar/historico?fecha=" + f + "&provincia=" + document.getElementById("mpHistProv").value + "&dias=" + document.getElementById("mpHistDias").value + "&formato=" + formato + (extra || "");
  }
  // Imagen descargable: mapa base + la misma capa y paleta del radar + contorno + mm de pluviómetros + escala.
  function tileLayerUrl(map) {
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
    var CAB = 56, PIE = 74;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H + CAB + PIE;
    var c = cv.getContext("2d");
    c.fillStyle = "#e5e7eb"; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.translate(0, CAB); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    var capa = tileLayerUrl(map), pedidos = [];
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
      c.lineWidth = 2; c.strokeStyle = "#374151";
      Object.keys(m.contornos || {}).forEach(function (k) {
        c.beginPath(); m.contornos[k].forEach(function (p, i) { var px = X(p[1]) - x0, py = Y(p[0]) - y0; i ? c.lineTo(px, py) : c.moveTo(px, py); });
        c.closePath(); c.stroke();
      });
      c.font = "bold 12px system-ui,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      (m.estaciones || []).forEach(function (st) {
        var px = X(st.lon) - x0, py = Y(st.lat) - y0, t = st.mm.toFixed(1), tw = c.measureText(t).width + 10;
        c.fillStyle = "#fff"; c.strokeStyle = color(st.mm, m.niveles, m.colores); c.lineWidth = 2;
        c.beginPath(); c.roundRect ? c.roundRect(px - tw / 2, py - 8, tw, 16, 8) : c.rect(px - tw / 2, py - 8, tw, 16); c.fill(); c.stroke();
        c.fillStyle = "#1f2933"; c.fillText(t, px, py + 1);
      });
      c.restore();
      // título y escala
      var nombres = m.provincias.map(function (k) { return m.por_provincia[k].nombre; }).join(" y ");
      var f = m.fecha.split("-"), fecha = f[2] + "/" + f[1] + "/" + f[0];
      c.fillStyle = "#fff"; c.fillRect(0, 0, W, CAB); c.fillRect(0, CAB + H, W, PIE);
      c.textAlign = "left"; c.textBaseline = "alphabetic"; c.fillStyle = "#111827"; c.font = "bold 20px system-ui,sans-serif";
      c.fillText("Lluvia acumulada " + (m.dias * 24) + " h · " + nombres, 14, 26);
      c.font = "13px system-ui,sans-serif"; c.fillStyle = "#4b5563";
      c.fillText(fecha + (m.dias > 1 ? " (" + m.dias + " días desde esa fecha)" : "") + " · " + m.provincias.map(function (k) { var p = m.por_provincia[k]; return p.nombre + ": máx. " + p.mm_max + " mm"; }).join(" · "), 14, 46);
      var lx = 14, ly = CAB + H + 12, ancho = Math.min(520, W - 28), seg = ancho / m.colores.length;
      m.colores.forEach(function (col, i) { c.fillStyle = col; c.fillRect(lx + i * seg, ly, seg, 12); });
      c.fillStyle = "#374151"; c.font = "11px system-ui,sans-serif";
      m.niveles.forEach(function (v, i) { c.fillText(String(v), lx + i * seg, ly + 26); });
      c.fillText("mm", lx + ancho + 6, ly + 10);
      c.fillStyle = "#6b7280";
      c.fillText((m.ajustado ? "Radar ajustado con pluviómetros" : "Radar sin ajustar con pluviómetros") + " · recuadros con número: mm medidos en estaciones", lx, ly + 44);
      c.fillText("Contorno de provincias aproximado" + (conBase ? " · mapa base © OpenStreetMap" : ""), lx, ly + 58);
      return cv;
    });
  }
  function histMsg(t) { var e = document.getElementById("mpHistEstado"); if (e) e.textContent = t; }
  function iniciarHist(map) {
    var ahora = new Date(Date.now() - 3 * 3600 * 1000), ayer = new Date(ahora.getTime() - 24 * 3600 * 1000);
    var inp = document.getElementById("mpHistFecha");
    inp.max = ahora.toISOString().slice(0, 10); inp.value = ayer.toISOString().slice(0, 10);
    // la fecha más antigua que se puede elegir es el primer día con radar guardado
    pedir(API + "/estado").then(function (j) {
      var hr = (j && j.base && j.base.horas_radar) || {}, min = null;
      Object.keys(hr).forEach(function (k) { if (hr[k].desde && (!min || hr[k].desde < min)) min = hr[k].desde; });
      if (!min) return;
      var d = new Date(new Date(min).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      inp.min = d; if (inp.value < d) inp.value = d;
      histMsg("Hay radar guardado desde el " + d.split("-").reverse().join("/") + ".");
    }).catch(function () {});
    document.getElementById("mpHistVer").addEventListener("click", function () {
      var u = histUrl("json"); if (!u) return;
      histMsg("Cargando…");
      pedir(u).then(function (m) {
        if (m.error) { histMsg(m.error); return; }
        estado.hist = true;
        if (estado.overlay) map.removeLayer(estado.overlay);
        if (estado.marcas) map.removeLayer(estado.marcas);
        if (!map.getPane("lluviaPane")) { map.createPane("lluviaPane"); map.getPane("lluviaPane").style.zIndex = 260; map.getPane("lluviaPane").style.pointerEvents = "none"; }
        estado.overlay = L.imageOverlay(m.png, m.bounds, { opacity: 0.8, pane: "lluviaPane", interactive: false }).addTo(map);
        estado.marcas = L.layerGroup();
        (m.estaciones || []).forEach(function (s) {
          var c = color(s.mm, m.niveles, m.colores);
          var ic = L.divIcon({ className: "", iconSize: [34, 16], iconAnchor: [17, 8],
            html: '<div style="background:#fff;border:2px solid ' + c + ';border-radius:8px;font:11px/12px system-ui;text-align:center;color:#1f2933">' + s.mm.toFixed(1) + "</div>" });
          L.marker([s.lat, s.lon], { icon: ic, keyboard: false }).bindTooltip(s.nombre + ": " + s.mm.toFixed(1) + " mm (pluviómetro)").addTo(estado.marcas);
        });
        Object.keys(m.contornos || {}).forEach(function (k) { L.polygon(m.contornos[k], { color: "#374151", weight: 2, fill: false, interactive: false }).addTo(estado.marcas); });
        estado.marcas.addTo(map);
        map.fitBounds(m.bounds);
        histMsg(Object.keys(m.por_provincia).map(function (k) { var p = m.por_provincia[k]; return p.nombre + ": máx. " + p.mm_max + " mm, promedio " + p.mm_media + " mm"; }).join(" · ") + (m.ajustado ? " · ajustado con pluviómetros" : " · radar sin ajustar"));
        leyenda(m);
        document.getElementById("mpHistVolver").style.display = "block";
      }).catch(function () { histMsg("Sin conexión con el servidor."); });
    });
    document.getElementById("mpHistBaj").addEventListener("click", function () {
      var u = histUrl("json"); if (!u) return;
      histMsg("Preparando el mapa…");
      pedir(u).then(function (m) {
        if (m.error) { histMsg(m.error); return; }
        return dibujarDescarga(map, m).then(function (c) {
          c.toBlob(function (b) {
            if (!b) { histMsg("No se pudo generar la imagen."); return; }
            var a = document.createElement("a"); a.href = URL.createObjectURL(b);
            a.download = "lluvia_" + m.provincias.join("-") + "_" + m.fecha + (m.dias > 1 ? "_" + m.dias + "d" : "") + ".png";
            document.body.appendChild(a); a.click(); a.remove(); histMsg("Mapa descargado.");
          }, "image/png");
        });
      }).catch(function (e) { histMsg((e && e.message) || "No se pudo descargar."); });
    });
    document.getElementById("mpHistVolver").addEventListener("click", function () {
      estado.hist = false; this.style.display = "none"; histMsg("");
      if (estado.activo) cargar(map);
    });
  }

  function msg(t) { var e = document.getElementById("mpLluviaEstado"); if (e) e.textContent = t; }

  function activar(map) {
    estado.activo = true;
    document.getElementById("mpLluviaOpc").style.display = "block";
    cargar(map);
    estado.timer = setInterval(function () { cargar(map); }, 5 * 60 * 1000);
  }

  function desactivar(map) {
    estado.activo = false; estado.hist = false;
    if (estado.contorno) { map.removeLayer(estado.contorno); estado.contorno = null; }
    clearInterval(estado.timer);
    if (estado.overlay) { map.removeLayer(estado.overlay); estado.overlay = null; }
    if (estado.marcas) { map.removeLayer(estado.marcas); estado.marcas = null; }
    document.getElementById("mpLluviaOpc").style.display = "none";
  }

  function pedir(url) {
    return fetch(url).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }

  function cargar(map) {
    if (estado.hist) return;                                     // mientras se mira un día pasado no se pisa con las últimas horas
    msg("Cargando…");
    var h = estado.horas;
    Promise.all([pedir(API + "/radar/mapa?horas=" + h), pedir(API + "/estaciones?horas=" + h).catch(function () { return null; })]).then(function (r) {
      var m = r[0], e = r[1];
      if (!estado.activo) return;
      if (m.error) { msg(m.error); return; }
      estado.datos = m;
      if (estado.overlay) map.removeLayer(estado.overlay);
      if (!map.getPane("lluviaPane")) { map.createPane("lluviaPane"); map.getPane("lluviaPane").style.zIndex = 260; map.getPane("lluviaPane").style.pointerEvents = "none"; }
      estado.overlay = L.imageOverlay(m.png, m.bounds, { opacity: 0.8, pane: "lluviaPane", interactive: false }).addTo(map);
      if (estado.marcas) map.removeLayer(estado.marcas);
      estado.marcas = L.layerGroup();
      if (e && e.estaciones) e.estaciones.forEach(function (s) {
        if (s.lat == null || s.mm == null) return;
        var c = color(s.mm, m.niveles, m.colores);
        var ic = L.divIcon({ className: "", iconSize: [34, 16], iconAnchor: [17, 8],
          html: '<div style="background:#fff;border:2px solid ' + c + ';border-radius:8px;font:11px/12px system-ui;text-align:center;color:#1f2933" title="' + s.nombre + '">' + s.mm.toFixed(1) + "</div>" });
        L.marker([s.lat, s.lon], { icon: ic, pane: "markerPane", keyboard: false })
          .bindTooltip(s.nombre + ": " + s.mm.toFixed(1) + " mm (pluviómetro, " + h + " h)").addTo(estado.marcas);
      });
      estado.marcas.addTo(map);
      var cob = Object.keys(m.radares).map(function (k) { return k + " " + m.radares[k].cobertura_pct + "%"; }).join(" · ");
      msg("Máx. " + m.mm_max + " mm · cobertura " + cob);
      leyenda(m);
    }).catch(function () { msg("Sin conexión con el servidor."); });
  }

  function leyenda(m) {
    var h = '<div style="display:flex;height:10px;border:1px solid #cbd2d9">';
    m.colores.forEach(function (c) { h += '<span style="flex:1;background:' + c + '"></span>'; });
    h += '</div><div style="display:flex;justify-content:space-between;font-size:10px;color:#52606d"><span>' + m.niveles[0] + '</span><span>' + m.niveles[5] + '</span><span>' + m.niveles[m.niveles.length - 1] + ' mm</span></div>' +
      '<div style="font-size:10px;color:#52606d;margin-top:2px">' + (m.ajustado ? 'Radar ajustado con pluviómetros de estaciones.' : 'Radar sin ajustar con estaciones' + (m.ajuste && m.ajuste.motivo ? ' (' + m.ajuste.motivo.replace(/\.$/, '').toLowerCase() + ')' : '') + '.') + ' Click en el mapa para ver un punto.</div>';
    document.getElementById("mpLluviaLeyenda").innerHTML = h;
  }

  function consultarPunto(map, ll) {
    var h = estado.horas;
    pedir(API + "/radar/punto?lat=" + ll.lat.toFixed(4) + "&lon=" + ll.lng.toFixed(4) + "&horas=" + h).then(function (j) {
      var t;
      if (j.mm == null) t = "<b>Sin estimación</b><br>" + (j.motivo || "");
      else {
        t = "<b>" + j.mm.toFixed(1) + " mm</b> en " + h + " h (radar " + j.radar + (j.ajustado ? ", ajustado" : "") + ")<br>Cobertura de imágenes: " + Math.round(j.cobertura_pct) + "%" + (j.ajustado && j.mm_sin_ajustar != null ? "<br><small>Radar sin ajustar: " + j.mm_sin_ajustar.toFixed(1) + " mm</small>" : "");
        if (j.estaciones_cercanas && j.estaciones_cercanas.length)
          t += "<br><small>Estaciones cerca: " + j.estaciones_cercanas.map(function (s) { return s.nombre + " " + (s.mm == null ? "s/d" : s.mm + " mm") + " (" + s.distancia_km + " km)"; }).join("; ") + "</small>";
      }
      L.popup().setLatLng(ll).setContent('<div style="font:12px/1.4 system-ui">' + t + "</div>").openOn(map);
    }).catch(function () {});
  }

  try { diag("script cargado"); esperarMapa(); } catch (e) { diag("error al iniciar: " + (e && e.message), true); }
})();
