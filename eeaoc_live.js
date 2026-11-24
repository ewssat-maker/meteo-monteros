/* MetricPoint Live · estaciones de la Obispo Colombres (EEAOC) en el mapa de Tiempo Real.
   Se carga DESPUÉS del script principal del index. No toca nada de WU ni SNIH: solo suma estaciones moradas con sus datos. */
(function () {
  "use strict";
  var BACK = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com");
  var COLOR = "#a855f7";
  var cambiarOrig = window.cambiarProvincia, selOrig = window.seleccionarEstacion, cargarOrig = window.cargarDatosActuales;
  if (typeof cambiarOrig !== "function" || typeof selOrig !== "function" || typeof cargarOrig !== "function" || typeof estacionesData === "undefined") return;

  function $(id) { return document.getElementById(id); }
  function esEE(v) { return typeof v === "string" && v.indexOf("|EEAOC") > -1; }
  function pintar() {
    try {
      telemetriaMarkers.forEach(function (it) {
        if (esEE(it.val) && it.val !== estacionActualVal) it.marker.setStyle({ fillColor: COLOR, weight: 2, color: "#ffffff", fillOpacity: 0.85 });
      });
    } catch (e) {}
  }

  window.cambiarProvincia = function () { var r = cambiarOrig.apply(this, arguments); pintar(); return r; };
  window.seleccionarEstacion = function () { var r = selOrig.apply(this, arguments); pintar(); return r; };

  function num(v, d) { return (v === null || v === undefined || isNaN(v)) ? "--" : Number(v).toFixed(d); }
  function caja(clase, html) { var sb = $("status-box"); if (sb) { sb.className = clase; sb.innerHTML = html; } }

  window.cargarDatosActuales = async function (id, fuente, nombre) {
    if (fuente !== "EEAOC") return cargarOrig.apply(this, arguments);
    caja("text-xs text-center text-purple-300 bg-purple-950/80 border border-purple-500/30 py-2 px-3 rounded-xl shadow-lg", '<i class="fa-solid fa-spinner animate-spin mr-1"></i> Sincronizando...');
    try {
      var r = await fetch(BACK + "/api/lluvia/eeaoc/actual/" + encodeURIComponent(id));
      var d = await r.json();
      if (!r.ok || d.status !== "online") throw new Error("offline");
      $("val-temp").innerText = num(d.temp, 1);
      $("val-hum").innerText = d.humedad === null || d.humedad === undefined ? "--" : Math.round(d.humedad);
      $("val-pres").innerText = num(d.presion, 1);
      $("val-wind").innerText = num(d.viento, 1);
      $("val-precip").innerText = num(d.lluvia, 1);
      if ($("val-winddir")) $("val-winddir").innerText = "Dir: " + (d.direccion || "--");
      caja("text-xs text-center text-purple-300 bg-purple-950/80 border border-purple-500/30 py-2 px-3 rounded-xl shadow-lg transition",
           '<i class="fa-solid fa-seedling mr-1"></i> <b>' + nombre + "</b> • EEAOC Obispo Colombres • " + d.hora);
    } catch (e) {
      caja("text-xs text-center text-red-300 bg-red-950/80 border border-red-500/30 py-2 px-3 rounded-xl shadow-lg transition",
           '<i class="fa-solid fa-triangle-exclamation mr-1"></i> <b>' + nombre + "</b> • Sensor Offline");
      ["val-temp", "val-hum", "val-pres", "val-wind", "val-precip"].forEach(function (k) { if ($(k)) $(k).innerText = "--"; });
    }
  };

  function leyenda() {
    var caja_ = document.querySelector("#vista-telemetria .absolute.bottom-2");
    if (!caja_ || caja_.querySelector(".mp-ee")) return;
    var d = document.createElement("div");
    d.className = "flex items-center gap-1.5 mp-ee";
    d.innerHTML = '<span class="w-2.5 h-2.5 rounded-full border border-white" style="background:' + COLOR + '"></span><span class="text-[9px] text-slate-300 font-bold">Agromet (EEAOC)</span>';
    caja_.appendChild(d);
  }

  fetch(BACK + "/api/lluvia/eeaoc/estaciones").then(function (r) { return r.json(); }).then(function (j) {
    var lista = (j && j.estaciones) || [], nuevas = 0;
    lista.forEach(function (e) {
      var prov = e.provincia === "Tucumán" ? "tucuman" : (e.provincia === "Salta" ? "salta" : (e.provincia === "Catamarca" ? "catamarca" : null));
      if (!prov || !estacionesData[prov]) return;
      if (estacionesData[prov].some(function (x) { return x.val.indexOf(e.id + "|") === 0; })) return;
      estacionesData[prov].push({ val: e.id + "|" + e.lat + "|" + e.lon + "|" + e.nombre + " (EEAOC)|EEAOC", txt: e.nombre + " (EEAOC)" });
      nuevas++;
    });
    leyenda();
    if (!nuevas) return;
    try {                                                    // si el mapa ya estaba dibujado, se redibuja sin cambiar la estación elegida
      var prov = "tucuman"; ["salta", "catamarca"].forEach(function (q) { var b = $("tab-" + q); if (b && b.className.indexOf("bg-emerald-500") > -1) prov = q; });
      if (telemetriaMarkers.length && estacionActualVal === estacionesData[prov][0].val) window.cambiarProvincia(prov);
      else pintar();
    } catch (e) {}
  }).catch(function () {});
})();
