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
  var estado = { overlay: null, marcas: null, horas: 24, activo: false, datos: null, timer: null };

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
          '<div id="mpLluviaEstado" style="margin-top:4px;color:#52606d"></div>' +
          '<div id="mpLluviaLeyenda" style="margin-top:4px"></div></div>';
        L.DomEvent.disableClickPropagation(d);
        return d;
      }
    });
    new Ctl().addTo(map);
    var chk = document.getElementById("mpLluviaChk"), sel = document.getElementById("mpLluviaHoras");
    chk.addEventListener("change", function () { chk.checked ? activar(map) : desactivar(map); });
    sel.addEventListener("change", function () { estado.horas = +sel.value; if (estado.activo) cargar(map); });
    map.on("click", function (e) { if (estado.activo) consultarPunto(map, e.latlng); });
  }

  function msg(t) { var e = document.getElementById("mpLluviaEstado"); if (e) e.textContent = t; }

  function activar(map) {
    estado.activo = true;
    document.getElementById("mpLluviaOpc").style.display = "block";
    cargar(map);
    estado.timer = setInterval(function () { cargar(map); }, 5 * 60 * 1000);
  }

  function desactivar(map) {
    estado.activo = false;
    clearInterval(estado.timer);
    if (estado.overlay) { map.removeLayer(estado.overlay); estado.overlay = null; }
    if (estado.marcas) { map.removeLayer(estado.marcas); estado.marcas = null; }
    document.getElementById("mpLluviaOpc").style.display = "none";
  }

  function pedir(url) {
    return fetch(url).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }

  function cargar(map) {
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
