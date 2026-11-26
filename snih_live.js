/* MetricPoint Live · estaciones oficiales del SNIH (meteorológicas y alturas de ríos) cargadas desde el backend.
   Se carga DESPUÉS de eeaoc_live.js. Solo SUMA estaciones y mejora el dato; si el backend no responde, el Live queda como estaba. */
(function () {
  "use strict";
  var BACK = (window.METRIC_BACKEND || "https://metricmoisture-backend.onrender.com");
  var PROV = { "tucumán": "tucuman", "tucuman": "tucuman", "salta": "salta", "catamarca": "catamarca" };
  // Fuera de Tiempo Real: Toma Los Reales (sin datos desde 1900), Seco y Simoca (no devuelven nada), La Punilla, Cabra Corral, El Encón y Cachi.
  var EXCLUIR = ["280486", "10471", "10475", "10611", "10622", "10701", "10646"];
  // Fuera de Cauces de Ríos: Seco y Simoca. La Punilla, Cabra Corral, El Encón y Cachi siguen en Cauces.
  var EXCLUIR_RIO = ["10471", "10475"];
  function excluida(id) { return EXCLUIR.indexOf(String(id)) > -1; }
  function $(id) { return document.getElementById(id); }
  function prov(p) { return PROV[String(p || "").toLowerCase()] || null; }
  function num(v, d) { return (v === null || v === undefined || isNaN(v)) ? "--" : Number(v).toFixed(d); }

  /* ---------- 1) Estaciones meteorológicas SNIH en Tiempo Real ---------- */
  if (typeof estacionesData !== "undefined" && typeof window.cargarDatosActuales === "function" && typeof window.cambiarProvincia === "function") {
    var cargarOrig = window.cargarDatosActuales, quitadas = 0;
    Object.keys(estacionesData).forEach(function (p) {          // saca las que estaban cargadas a mano en el index
      var antes = estacionesData[p].length;
      estacionesData[p] = estacionesData[p].filter(function (x) { return !excluida(x.val.split("|")[0]); });
      quitadas += antes - estacionesData[p].length;
    });

    window.cargarDatosActuales = async function (id, fuente, nombre) {
      if (fuente !== "SNIH") return cargarOrig.apply(this, arguments);
      var sb = $("status-box");
      try {
        if (sb) { sb.className = "text-xs text-center text-amber-300 bg-amber-950/80 border border-amber-500/30 py-2 px-3 rounded-xl shadow-lg"; sb.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-1"></i> Sincronizando...'; }
        var r = await fetch(BACK + "/api/lluvia/snih/actual/" + encodeURIComponent(id));
        var d = await r.json();
        if (!r.ok || d.status !== "online") throw new Error("offline");
        $("val-temp").innerText = num(d.temp, 1);
        $("val-hum").innerText = d.humedad === null || d.humedad === undefined ? "--" : Math.round(d.humedad);
        $("val-pres").innerText = num(d.presion, 1);
        $("val-wind").innerText = num(d.viento, 1);
        $("val-precip").innerText = num(d.lluvia, 1);
        if ($("val-winddir")) $("val-winddir").innerText = "Dir: " + (d.direccion === null || d.direccion === undefined ? "--" : Math.round(d.direccion) + "°");
        var viejo = d.edad_min !== null && d.edad_min !== undefined && d.edad_min > 360;
        if (sb) {
          sb.className = "text-xs text-center " + (viejo ? "text-red-300 bg-red-950/80 border border-red-500/30" : "text-amber-300 bg-amber-950/80 border border-amber-500/30") + " py-2 px-3 rounded-xl shadow-lg transition";
          sb.innerHTML = '<i class="fa-solid fa-building-columns mr-1"></i> <b>' + nombre + "</b> • SNIH Oficial (sin validar) • " + d.hora + (viejo ? " ⚠ dato atrasado" : "");
        }
      } catch (e) {
        return cargarOrig.apply(this, arguments);           // si falla, queda el camino de siempre
      }
    };

    fetch(BACK + "/api/lluvia/estaciones").then(function (r) { return r.json(); }).then(function (j) {
      var lista = (j && j.estaciones) || [], cambios = quitadas;
      lista.forEach(function (e) {
        if (excluida(e.id)) return;
        if (e.fuente !== "SNIH" || e.lat == null || e.lon == null) return;
        var p = prov(e.provincia);
        if (!p || !estacionesData[p]) return;
        var arr = estacionesData[p], i = -1;
        arr.forEach(function (x, k) { if (x.val.indexOf(e.id + "|") === 0) i = k; });
        if (i > -1) {                                          // ya estaba cargada a mano: se corrigen las coordenadas con las oficiales
          var t = arr[i].val.split("|");
          if (+t[1] !== +e.lat || +t[2] !== +e.lon) { t[1] = e.lat; t[2] = e.lon; arr[i].val = t.join("|"); cambios++; }
          return;
        }
        if (!e.ultimo_dato) return;                            // sin ninguna lectura todavía: no se muestra
        arr.push({ val: e.id + "|" + e.lat + "|" + e.lon + "|" + e.nombre + "|SNIH", txt: e.nombre });
        cambios++;
      });
      if (!cambios) return;
      try {                                                    // redibuja el mapa sin cambiar la estación elegida
        var pv = "tucuman"; ["salta", "catamarca"].forEach(function (q) { var b = $("tab-" + q); if (b && b.className.indexOf("bg-emerald-500") > -1) pv = q; });
        if (typeof telemetriaMarkers !== "undefined" && telemetriaMarkers.length && estacionActualVal === estacionesData[pv][0].val) window.cambiarProvincia(pv);
      } catch (e) {}
    }).catch(function () {});
  }

  /* ---------- 2) Alturas de ríos (SNIH) en Cauces de Ríos ---------- */
  if (typeof caucesData !== "undefined" && typeof window.fetchCauceData === "function") {
    var fetchOrig = window.fetchCauceData, ficha = {};

    window.fetchCauceData = async function (id, fuente) {
      if (fuente !== "HIDRO") return fetchOrig.apply(this, arguments);
      var sb = $("status-cauces");
      sb.className = "text-xs text-center text-blue-300 bg-blue-950/80 border border-blue-500/30 py-2 px-3 rounded-xl shadow-lg backdrop-blur-md";
      sb.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-1"></i> Consultando SNIH...';
      try {
        var r = await fetch(BACK + "/api/lluvia/rios/" + encodeURIComponent(id) + "?horas=240");
        var d = await r.json();
        if (typeof cauceActualVal === "undefined" || !cauceActualVal || String(cauceActualVal.id) !== String(id)) return;
        if (!r.ok || !d.serie || !d.serie.length) throw new Error("sin datos recientes");
        var f = ficha[id] || {}, s = d.serie, ult = s[s.length - 1];
        var alt = ult.altura_m, fecha = new Date(ult.ts);
        var hace = (Date.now() - fecha.getTime()) / 3600000;
        var var24 = f.var_24h_m;
        $("val-cauce-nivel").innerText = alt.toFixed(2);
        $("val-cauce-tendencia").innerText = var24 === null || var24 === undefined ? "--" :
          (var24 > 0.05 ? "▲ Creciente" : (var24 < -0.05 ? "▼ Descendente" : "■ Estable")) + " (" + (var24 > 0 ? "+" : "") + var24.toFixed(2) + " m/24 h)";
        $("val-cauce-precedente").innerText = var24 === null || var24 === undefined ? "--" : (alt - var24).toFixed(2);
        $("cauce-fecha").innerText = fecha.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
        renderGraficoCauce(s.map(function (p) { return [p.ts, p.altura_m]; }), null, null);
        renderAlertaCauce(null);
        var viejo = hace > 6;
        sb.className = "text-xs text-center " + (viejo ? "text-amber-300 bg-amber-950/80 border border-amber-500/30" : "text-cyan-300 bg-cyan-950/80 border border-cyan-500/30") + " py-2 px-3 rounded-xl shadow-lg transition";
        sb.innerHTML = '<i class="fa-solid ' + (viejo ? "fa-triangle-exclamation" : "fa-circle-check") + ' mr-1"></i> <b>' + cauceActualVal.txt + "</b> • SNIH sin validar • hace " +
          (hace < 1 ? Math.round(hace * 60) + " min" : hace.toFixed(1) + " h") + (viejo ? " ⚠ dato atrasado" : "");
      } catch (e) {
        if (typeof cauceActualVal === "undefined" || !cauceActualVal || String(cauceActualVal.id) !== String(id)) return;
        limpiarPanelCauce();
        sb.className = "text-xs text-center text-red-300 bg-red-950/80 border border-red-500/30 py-2 px-3 rounded-xl shadow-lg transition";
        sb.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> <b>' + cauceActualVal.txt + "</b> • sin datos recientes del SNIH";
      }
    };

    fetch(BACK + "/api/lluvia/rios").then(function (r) { return r.json(); }).then(function (j) {
      var lista = (j && j.estaciones) || [], cambios = 0;
      lista.forEach(function (e) {
        var p = prov(e.provincia);
        if (EXCLUIR_RIO.indexOf(String(e.id)) > -1 || !p || !caucesData[p] || e.altura_m === null || e.altura_m === undefined) return;
        ficha[e.id] = e;
        var arr = caucesData[p], ex = null;
        arr.forEach(function (x) { if (String(x.id) === String(e.id)) ex = x; });
        if (ex) { if (ex.lat !== e.lat || ex.lon !== e.lon) { ex.lat = e.lat; ex.lon = e.lon; cambios++; } return; }   // ya estaba: solo coordenadas oficiales
        var nombre = (e.rio && e.nombre.toLowerCase().indexOf(String(e.rio).toLowerCase()) === -1) ? e.rio + " - " + e.nombre : e.nombre;
        arr.push({ id: e.id, fuente: "HIDRO", lat: e.lat, lon: e.lon, txt: nombre });
        cambios++;
      });
      if (!cambios) return;
      try { if (typeof cargarCauces === "function" && cauceActualVal === caucesINA[0]) cargarCauces(); } catch (e) {}   // redibuja si todavía no eligieron otro río
    }).catch(function () {});
  }
})();
