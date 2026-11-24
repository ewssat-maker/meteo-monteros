/* MetricPoint · Formulario "Solicitar acceso" (Pronóstico inteligente y Riego inteligente).
   Uso:  PedidoAcceso.abrir({ modulo: "pronostico" | "riego", api: "https://…onrender.com", correo: "" })
   Tipos de usuario: Particular, Productor (campos) y Organismo (estatal o privado).
   Se carga con una línea:  <script src="pedido_acceso.js"></script>   (usa Leaflet si está cargado). */
(function () {
  if (window.PedidoAcceso) return;

  var CULTIVOS = { cana: "Caña de azúcar", soja: "Soja", maiz: "Maíz", poroto: "Poroto", citricos: "Cítricos (limón, naranja, pomelo)", trigo: "Trigo" };
  var SISTEMAS = { secano: "Sin riego (secano)", goteo: "Goteo", microaspersion: "Microaspersión", aspersion: "Aspersión", pivote: "Pivote central", canon: "Cañón / enrollador", surco: "Surco / gravedad", melga: "Melgas / manto" };
  var INTERESES = ["Lluvia", "Tormentas y granizo", "Heladas", "Viento", "Calor"];
  var MAX = 20;
  var BBOX = { pronostico: [-56, -20, -76, -52], riego: [-28.5, -21.5, -68.5, -62] };

  var CSS = '.pa-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.88);overflow-y:auto;padding:12px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6eefc}' +
    '.pa-box{max-width:640px;margin:10px auto;background:#0d1626;border:1px solid #1c2a42;border-radius:16px;padding:18px}' +
    '.pa-box h2{margin:0 0 4px;font-size:18px;color:#fff}.pa-box h3{margin:16px 0 6px;font-size:14px;color:#fff}' +
    '.pa-mu{color:#8197b8;font-size:12px;margin:2px 0 8px}' +
    '.pa-box label{display:block;font-size:12px;color:#a9bbd6;margin:8px 0 0}' +
    '.pa-box input,.pa-box select,.pa-box textarea{width:100%;margin-top:3px;background:#0a121f;color:#e6eefc;border:1px solid #1c2a42;border-radius:9px;padding:8px 10px;font:inherit}' +
    '.pa-box input:focus,.pa-box select:focus,.pa-box textarea:focus{outline:2px solid #22d3ee;outline-offset:1px}' +
    '.pa-g{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}@media(max-width:520px){.pa-g{grid-template-columns:1fr}}' +
    '.pa-tipos{display:grid;gap:8px;margin-top:8px}' +
    '.pa-tipo{display:block;margin:0!important;padding:10px 12px;border:1px solid #1c2a42;border-radius:12px;background:#0a121f;cursor:pointer;color:#e6eefc!important;font-size:14px!important}' +
    '.pa-tipo input{width:auto;margin:0 8px 0 0}.pa-tipo small{display:block;color:#8197b8;font-size:12px;margin:2px 0 0 24px}' +
    '.pa-tipo.on{border-color:#22d3ee;box-shadow:0 0 0 1px #22d3ee inset}' +
    '.pa-chk{display:inline-flex!important;align-items:center;gap:6px;margin:6px 12px 0 0!important;color:#e6eefc!important;font-size:13px!important}.pa-chk input{width:auto;margin:0}' +
    '.pa-map{height:250px;border-radius:12px;border:1px solid #1c2a42;margin:8px 0}' +
    '.pa-s{border:1px solid #1c2a42;border-radius:12px;padding:10px;margin:8px 0;background:#0a121f}.pa-s.on{border-color:#22d3ee}' +
    '.pa-s .top{display:flex;justify-content:space-between;align-items:center;gap:8px}.pa-s .n{font-weight:700;color:#fff}' +
    '.pa-ok{color:#34d399}.pa-no{color:#f59e0b}' +
    '.pa-b{background:#22d3ee;color:#03222b;border:0;border-radius:9px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}' +
    '.pa-b.sec{background:#0a121f;color:#e6eefc;border:1px solid #1c2a42;font-weight:500}.pa-b.sm{padding:5px 9px;font-size:12px}.pa-b[disabled]{opacity:.6;cursor:default}' +
    '.pa-err{color:#fca5a5;font-size:13px;min-height:18px;margin:10px 0 0}.pa-fin{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}' +
    '.pa-bus{display:flex;gap:8px}.pa-bus input{margin:0}' +
    '.pa-pin{background:#22d3ee;color:#03222b;border-radius:50%;width:22px;height:22px;line-height:22px;text-align:center;font-weight:800;font-size:12px;border:2px solid #fff}';

  var S = null, root = null, mapa = null, capa = null;
  var $ = function (id) { return root.querySelector("#" + id); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  function nuevoSitio() { return { nombre: "", tipo: "campo", cultivo: "", fecha_siembra: "", sistema: "", ha: "", lat: null, lon: null }; }

  function abrir(op) {
    cerrar();
    op = op || {};
    S = { modulo: op.modulo === "riego" ? "riego" : "pronostico", api: op.api || "", perfil: null, sitios: [nuevoSitio()], activo: 0, hecho: false };
    if (!document.getElementById("pa-css")) { var st = document.createElement("style"); st.id = "pa-css"; st.textContent = CSS; document.head.appendChild(st); }
    root = document.createElement("div"); root.className = "pa-ov"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "pa-t");
    root.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(); });
    document.body.appendChild(root);
    dibujar(op.correo || "");
  }

  function cerrar() {
    if (mapa) { try { mapa.remove(); } catch (e) { } mapa = null; capa = null; }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function tiposDisponibles() {
    var t = [];
    if (S.modulo === "pronostico") t.push(["particular", "Particular", "Pronóstico de la estación meteorológica más cercana a tu celular."]);
    t.push(["campo", "Productor / campo", "Uno o más campos, con su ubicación exacta en el mapa."]);
    t.push(["organismo", "Organismo (estatal o privado)", "Instituciones y empresas con varios sitios para seguir."]);
    return t;
  }

  function dibujar(correo) {
    var nm = S.modulo === "riego" ? "Riego inteligente" : "Pronóstico inteligente";
    root.innerHTML = '<form class="pa-box" novalidate><h2 id="pa-t">Solicitar acceso · ' + nm + '</h2>' +
      '<p class="pa-mu">El acceso es por invitación. Completá el formulario y te creamos la cuenta con una clave temporal.</p>' +
      '<h3>¿Qué tipo de usuario sos?</h3><div class="pa-tipos" id="pa-tipos">' +
      tiposDisponibles().map(function (t) { return '<label class="pa-tipo" data-p="' + t[0] + '"><input type="radio" name="pa-perfil" value="' + t[0] + '"><b>' + t[1] + '</b><small>' + t[2] + '</small></label>'; }).join("") + '</div>' +
      '<div id="pa-resto" hidden>' +
      '<h3>Tus datos</h3><div class="pa-g">' +
      '<label id="l-nombre">Nombre y apellido<input id="pa-nombre" autocomplete="name" maxlength="120"></label>' +
      '<label>Correo (será tu usuario)<input id="pa-email" type="email" autocomplete="email" value="' + esc(correo) + '"></label>' +
      '<label>Teléfono (WhatsApp)<input id="pa-tel" type="tel" autocomplete="tel" maxlength="40" placeholder="Ej. 381 555 1234"></label>' +
      '<label id="l-loc">Localidad (opcional)<input id="pa-loc" maxlength="120"></label></div>' +
      '<div id="pa-org" hidden><h3>El organismo</h3><div class="pa-g">' +
      '<label>Nombre del organismo o empresa<input id="pa-emp" maxlength="120"></label>' +
      '<label>Tipo<select id="pa-torg"><option value="">Elegí…</option><option value="estatal">Estatal</option><option value="privado">Privado</option></select></label>' +
      '<label>CUIT (opcional)<input id="pa-cuit" maxlength="40" inputmode="numeric"></label>' +
      '<label>Tu cargo (opcional)<input id="pa-cargo" maxlength="80"></label></div></div>' +
      '<div id="pa-part" hidden><h3>¿Qué te interesa?</h3><p class="pa-mu">Opcional. Tu ubicación la toma tu celular cuando abrís la app y no se guarda.</p>' +
      INTERESES.map(function (i) { return '<label class="pa-chk"><input type="checkbox" class="pa-int" value="' + i + '">' + i + '</label>'; }).join("") + '</div>' +
      '<div id="pa-sit" hidden><h3>' + (S.modulo === "riego" ? "Tus campos y lotes" : "Tus campos o sitios") + '</h3>' +
      '<p class="pa-mu">Marcá cada campo en el mapa (tocá el punto exacto) o escribí las coordenadas. Con el campo elegido en la lista, el próximo toque mueve su punto. Los campos que quedan habilitados los acordamos con MetricPoint.</p>' +
      '<div class="pa-bus"><input id="pa-bus" placeholder="Buscar localidad o camino (ej. Monteros, Tucumán)" aria-label="Buscar en el mapa"><button type="button" class="pa-b sec" id="pa-busb">Buscar</button></div>' +
      '<div class="pa-map" id="pa-mapa"></div><div id="pa-lista"></div>' +
      '<button type="button" class="pa-b sec" id="pa-add">+ Agregar otro campo</button></div>' +
      '<label>Algo más que quieras contarnos (opcional)<textarea id="pa-msg" rows="2" maxlength="600"></textarea></label>' +
      '</div><p class="pa-err" id="pa-err" role="alert"></p>' +
      '<div class="pa-fin"><button type="button" class="pa-b sec" id="pa-cerrar">Cancelar</button><button class="pa-b" id="pa-enviar" disabled>Enviar solicitud</button></div></form>';

    $("pa-cerrar").onclick = cerrar;
    root.querySelector("form").onsubmit = enviar;
    root.querySelectorAll('input[name="pa-perfil"]').forEach(function (r) { r.onchange = function () { elegirPerfil(r.value); }; });
    $("pa-add").onclick = function () {
      if (S.sitios.length >= MAX) { $("pa-err").textContent = "Podés pedir hasta " + MAX + " campos en el formulario; si necesitás más, escribinos."; return; }
      S.sitios.push(nuevoSitio()); S.activo = S.sitios.length - 1; lista();
    };
    $("pa-busb").onclick = buscar;
    $("pa-bus").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
  }

  function elegirPerfil(p) {
    S.perfil = p;
    root.querySelectorAll(".pa-tipo").forEach(function (l) { l.classList.toggle("on", l.dataset.p === p); });
    $("pa-resto").hidden = false;
    $("pa-enviar").disabled = false;
    $("pa-org").hidden = p !== "organismo";
    $("pa-part").hidden = p !== "particular";
    $("pa-sit").hidden = p === "particular";
    $("l-nombre").firstChild.textContent = p === "organismo" ? "Responsable (nombre y apellido)" : "Nombre y apellido";
    $("pa-tel").closest("label").firstChild.textContent = p === "particular" ? "Teléfono (WhatsApp, opcional)" : "Teléfono (WhatsApp)";
    if (p !== "particular") { iniciarMapa(); lista(); }
    $("pa-err").textContent = "";
  }

  // ---------------------------------------------------------------- mapa y lista de campos
  function iniciarMapa() {
    if (mapa || typeof L === "undefined") { if (mapa) setTimeout(function () { mapa.invalidateSize(); }, 80); return; }
    mapa = L.map($("pa-mapa"), { scrollWheelZoom: false }).setView([-26.9, -65.3], 7);
    L.layerGroup([L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri" }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })]).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);
    mapa.on("click", function (e) { poner(S.activo, e.latlng.lat, e.latlng.lng); });
    setTimeout(function () { mapa.invalidateSize(); }, 120);
  }

  function dentro(lat, lon) {
    var b = BBOX[S.modulo];
    return lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3];
  }

  function poner(i, lat, lon, centrar) {
    var s = S.sitios[i]; if (!s) return;
    if (!dentro(lat, lon)) {
      $("pa-err").textContent = "Ese punto está fuera de " + (S.modulo === "riego" ? "Salta y Tucumán" : "Argentina") + ". Revisá la ubicación.";
      return;
    }
    $("pa-err").textContent = "";
    s.lat = Math.round(lat * 1e6) / 1e6; s.lon = Math.round(lon * 1e6) / 1e6;
    lista(); if (centrar && mapa) mapa.setView([s.lat, s.lon], Math.max(mapa.getZoom(), 14));
  }

  function lista() {
    var h = "";
    S.sitios.forEach(function (s, i) {
      var tiene = s.lat != null && s.lon != null;
      h += '<div class="pa-s' + (i === S.activo ? " on" : "") + '" data-i="' + i + '"><div class="top"><span class="n">Campo ' + (i + 1) + '</span><span>' +
        (tiene ? '<span class="pa-ok">✔ punto marcado</span>' : '<span class="pa-no">⚠ falta marcar el punto</span>') +
        (S.sitios.length > 1 ? ' <button type="button" class="pa-b sec sm" data-q="' + i + '">Quitar</button>' : "") + '</span></div>' +
        '<div class="pa-g"><label>Nombre del campo<input class="f-nombre" maxlength="80" value="' + esc(s.nombre) + '" placeholder="Ej. Finca La Esperanza"></label>' +
        (S.modulo === "riego"
          ? '<label>Cultivo<select class="f-cultivo"><option value="">Elegí…</option>' + Object.keys(CULTIVOS).map(function (k) { return '<option value="' + k + '"' + (s.cultivo === k ? " selected" : "") + '>' + CULTIVOS[k] + '</option>'; }).join("") + '</select></label>' +
            '<label>Fecha de siembra o plantación<input class="f-fecha" type="date" value="' + esc(s.fecha_siembra) + '"></label>' +
            '<label>Sistema de riego<select class="f-sistema"><option value="">Elegí…</option>' + Object.keys(SISTEMAS).map(function (k) { return '<option value="' + k + '"' + (s.sistema === k ? " selected" : "") + '>' + SISTEMAS[k] + '</option>'; }).join("") + '</select></label>'
          : '<label>Tipo<select class="f-tipo"><option value="campo"' + (s.tipo === "campo" ? " selected" : "") + '>Campo / finca</option><option value="mina"' + (s.tipo === "mina" ? " selected" : "") + '>Mina / obra</option></select></label>' +
            '<label>Cultivo o actividad (opcional)<input class="f-cultivoL" maxlength="60" value="' + esc(s.cultivo) + '"></label>') +
        '<label>Hectáreas (opcional)<input class="f-ha" type="number" min="0" step="any" value="' + esc(s.ha) + '"></label>' +
        '<label>Latitud<input class="f-lat" inputmode="decimal" value="' + (tiene ? s.lat : "") + '" placeholder="-27.1234"></label>' +
        '<label>Longitud<input class="f-lon" inputmode="decimal" value="' + (tiene ? s.lon : "") + '" placeholder="-65.4321"></label></div>' +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="pa-b sec sm" data-g="' + i + '">Estoy en el campo: usar mi ubicación</button>' +
        '<button type="button" class="pa-b sec sm" data-v="' + i + '">Elegir este campo en el mapa</button></div>' +
        '<label>O pegá las coordenadas de Google Maps<input class="f-pegar" placeholder="-27.1234, -65.4321"></label></div>';
    });
    $("pa-lista").innerHTML = h;
    if (capa) {
      capa.clearLayers();
      var pts = [];
      S.sitios.forEach(function (s, i) {
        if (s.lat != null) { pts.push([s.lat, s.lon]); L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "", html: '<div class="pa-pin">' + (i + 1) + '</div>', iconSize: [22, 22] }) }).addTo(capa); }
      });
      if (pts.length === 1 && mapa && mapa.getZoom() < 11) mapa.setView(pts[0], 14);
    }
    $("pa-lista").querySelectorAll(".pa-s").forEach(function (box) {
      var i = +box.dataset.i, s = S.sitios[i];
      var on = function (sel, ev, fn) { var el = box.querySelector(sel); if (el) el.addEventListener(ev, fn); };
      on(".f-nombre", "input", function (e) { s.nombre = e.target.value; });
      on(".f-cultivo", "change", function (e) { s.cultivo = e.target.value; });
      on(".f-cultivoL", "input", function (e) { s.cultivo = e.target.value; });
      on(".f-fecha", "change", function (e) { s.fecha_siembra = e.target.value; });
      on(".f-sistema", "change", function (e) { s.sistema = e.target.value; });
      on(".f-tipo", "change", function (e) { s.tipo = e.target.value; });
      on(".f-ha", "input", function (e) { s.ha = e.target.value; });
      var coords = function () {
        var la = parseFloat(String(box.querySelector(".f-lat").value).replace(",", ".")), lo = parseFloat(String(box.querySelector(".f-lon").value).replace(",", "."));
        if (isFinite(la) && isFinite(lo)) poner(i, la, lo, true);
      };
      on(".f-lat", "change", coords); on(".f-lon", "change", coords);
      on(".f-pegar", "input", function (e) {
        var m = e.target.value.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
        if (m) poner(i, parseFloat(m[1].replace(",", ".")), parseFloat(m[2].replace(",", ".")), true);
      });
      box.addEventListener("click", function (e) { if (e.target.closest("input,select,button,label")) { if (S.activo !== i) { S.activo = i; marcarActivo(); } } });
    });
    $("pa-lista").querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { S.sitios.splice(+b.dataset.q, 1); S.activo = Math.min(S.activo, S.sitios.length - 1); lista(); }; });
    $("pa-lista").querySelectorAll("[data-v]").forEach(function (b) { b.onclick = function () { S.activo = +b.dataset.v; marcarActivo(); if (mapa) { var s = S.sitios[S.activo]; if (s.lat != null) mapa.setView([s.lat, s.lon], 15); root.querySelector("#pa-mapa").scrollIntoView({ block: "center", behavior: "smooth" }); } }; });
    $("pa-lista").querySelectorAll("[data-g]").forEach(function (b) {
      b.onclick = function () {
        if (!navigator.geolocation) { $("pa-err").textContent = "Este dispositivo no informa su ubicación. Marcá el punto en el mapa."; return; }
        b.disabled = true; b.textContent = "Buscando tu ubicación…";
        navigator.geolocation.getCurrentPosition(function (p) { S.activo = +b.dataset.g; poner(+b.dataset.g, p.coords.latitude, p.coords.longitude, true); },
          function () { $("pa-err").textContent = "No pudimos obtener tu ubicación (revisá el permiso del navegador). Marcá el punto en el mapa."; lista(); }, { enableHighAccuracy: true, timeout: 15000 });
      };
    });
  }

  function marcarActivo() {
    $("pa-lista").querySelectorAll(".pa-s").forEach(function (b) { b.classList.toggle("on", +b.dataset.i === S.activo); });
  }

  function buscar() {
    var q = $("pa-bus").value.trim();
    if (!q || !mapa) return;
    fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (r) { if (r[0]) mapa.setView([+r[0].lat, +r[0].lon], 13); else $("pa-err").textContent = "No encontré ese lugar. Probá con otro nombre."; })
      .catch(function () { $("pa-err").textContent = "La búsqueda no está disponible ahora. Movete por el mapa a mano."; });
  }

  // ---------------------------------------------------------------- envío
  function enviar(e) {
    e.preventDefault();
    var err = $("pa-err"); err.textContent = "";
    var p = S.perfil;
    if (!p) { err.textContent = "Elegí qué tipo de usuario sos."; return; }
    var email = $("pa-email").value.trim(), nombre = $("pa-nombre").value.trim(), tel = $("pa-tel").value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Escribí un correo válido."; $("pa-email").focus(); return; }
    if (!nombre) { err.textContent = p === "organismo" ? "Escribí el nombre del responsable." : "Escribí tu nombre."; $("pa-nombre").focus(); return; }
    if (p !== "particular" && tel.replace(/\D/g, "").length < 6) { err.textContent = "Escribí un teléfono de contacto (WhatsApp)."; $("pa-tel").focus(); return; }
    var body = { email: email, modulo: S.modulo, perfil: p, nombre: nombre, telefono: tel, localidad: $("pa-loc").value.trim(), mensaje: $("pa-msg").value.trim() };
    if (p === "organismo") {
      body.empresa = $("pa-emp").value.trim(); body.tipo_organismo = $("pa-torg").value; body.cuit = $("pa-cuit").value.trim(); body.cargo = $("pa-cargo").value.trim();
      if (!body.empresa) { err.textContent = "Escribí el nombre del organismo o empresa."; $("pa-emp").focus(); return; }
      if (!body.tipo_organismo) { err.textContent = "Indicá si el organismo es estatal o privado."; $("pa-torg").focus(); return; }
    }
    if (p === "particular") body.intereses = Array.prototype.map.call(root.querySelectorAll(".pa-int:checked"), function (c) { return c.value; });
    else {
      body.sitios = [];
      for (var i = 0; i < S.sitios.length; i++) {
        var s = S.sitios[i], rot = "«" + (s.nombre || "Campo " + (i + 1)) + "»";
        if (!s.nombre.trim()) { err.textContent = "El campo " + (i + 1) + " necesita un nombre."; S.activo = i; marcarActivo(); return; }
        if (s.lat == null) { err.textContent = rot + ": marcá el punto en el mapa o escribí la latitud y la longitud."; S.activo = i; marcarActivo(); return; }
        if (S.modulo === "riego" && !s.cultivo) { err.textContent = rot + ": elegí el cultivo."; S.activo = i; marcarActivo(); return; }
        body.sitios.push({ nombre: s.nombre.trim(), tipo: s.tipo, cultivo: s.cultivo, fecha_siembra: s.fecha_siembra, sistema: s.sistema, ha: s.ha === "" ? null : s.ha, lat: s.lat, lon: s.lon });
      }
    }
    var btn = $("pa-enviar"); btn.disabled = true; btn.textContent = "Enviando…";
    fetch(S.api + "/api/solicitar_prueba", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) { err.textContent = x.j.error || "No pudimos enviar la solicitud. Probá de nuevo."; btn.disabled = false; btn.textContent = "Enviar solicitud"; return; }
        root.innerHTML = '<div class="pa-box"><h2 id="pa-t">¡Listo! Recibimos tu solicitud</h2><p>Te escribimos a <b>' + esc(email) + '</b> para darte acceso. Cuando tengamos todo, te mandamos tu usuario y una clave temporal.</p>' +
          '<div class="pa-fin"><button class="pa-b" id="pa-ok">Cerrar</button></div></div>';
        $("pa-ok").onclick = cerrar; $("pa-ok").focus();
      })
      .catch(function () { err.textContent = "Sin conexión con el servidor. Probá de nuevo en un momento."; btn.disabled = false; btn.textContent = "Enviar solicitud"; });
  }

  window.PedidoAcceso = { abrir: abrir, cerrar: cerrar };
})();
