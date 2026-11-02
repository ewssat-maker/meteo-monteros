/* MetricPoint · animación de las últimas 6 imágenes del radar + clasificación + seguimiento de la celda más convectiva.
 * Se usa igual en index.html y weather_forecast.html:
 *
 *   const RA = RadarAnim.crear({
 *     map, pane: 'radarPane', contenedor: document.getElementById('radar-anim'),
 *     backend: 'https://metricmoisture-backend.onrender.com/api/radar', webmet: 'https://webmet.ohmc.ar',
 *     activos: () => ['RMA11'],            // radares encendidos
 *     campo: () => 'COLMAX',               // campo elegido
 *     opacidad: () => 0.7,
 *     ocultarSimple: (code, ocultar) => {}  // para esconder la capa de "última imagen" cuando la animación la reemplaza
 *   });
 *   RA.sincronizar();                       // llamar al encender/apagar radares, cambiar de campo o refrescar
 */
(function () {
  const PALETA = [[10,'#439cb3'],[12.5,'#3be580'],[15,'#37dd70'],[17.5,'#2ccc64'],[20,'#22bd5a'],[22.5,'#16ae50'],[25,'#10a144'],[27.5,'#54bc2e'],[30,'#93d61b'],[32.5,'#cbdf0b'],[35,'#f4b701'],[37.5,'#e66003'],[40,'#c72503'],[42.5,'#960701'],[45,'#5d0313'],[47.5,'#650056'],[50,'#9f0089'],[52.5,'#68005b'],[55,'#18586e'],[57.5,'#00c4c4'],[60,'#086a6a'],[62.5,'#7a9e9e'],[65,'#a0a4a4'],[67.5,'#545454'],[70,'#636369']];
  const PAL_RGB = PALETA.map(([v, c]) => [v, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  const CLASES = {                      // color con que se pinta cada clase en el modo "Clasificar"
    debil:   { txt: 'Eco débil',        rgb: [148, 163, 184], a: 70 },
    lluvia:  { txt: 'Lluvia',           rgb: [34, 197, 94],   a: 200 },
    tormenta:{ txt: 'Tormenta',         rgb: [245, 158, 11],  a: 225 },
    severa:  { txt: 'Tormenta severa',  rgb: [239, 68, 68],   a: 240 },
    granizo: { txt: 'Granizo posible',  rgb: [217, 70, 239],  a: 250 }
  };
  const COLOR_CLASE = { debil: '#94a3b8', lluvia: '#22c55e', tormenta: '#f59e0b', tormenta_severa: '#ef4444' };

  function hora(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '--:--';
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function crear(cfg) {
    const map = cfg.map;
    const E = {
      hist: {},          // code -> {campo, obs[]}
      capas: {},         // code -> [tileLayer por observación]
      seg: {},           // code -> resultado de /seguimiento
      back: 0,           // 0 = última imagen; 5 = la más vieja
      playing: false, timer: null,
      clasificar: false, filtro: 'todo', seguir: true, claseCapa: null,
      umbrales: { lluvia: 20, tormenta: 40, severa: 50, granizo: 55 },
      overlay: L.layerGroup().addTo(map), ver: 0, ultimaClave: ''
    };

    // ---------- interfaz ----------
    const raiz = cfg.contenedor;
    raiz.innerHTML = `
      <div style="border-top:1px solid rgba(100,116,139,.35);padding-top:8px;margin-top:4px">
        <div style="display:flex;align-items:center;gap:8px">
          <button data-ra="play" aria-label="Reproducir" style="width:34px;height:34px;border-radius:9px;background:#0ea5e9;color:#0f172a;font-weight:900;border:0;cursor:pointer">▶</button>
          <input data-ra="slider" type="range" min="0" max="5" value="5" style="flex:1;accent-color:#0ea5e9" aria-label="Imagen del radar">
          <span data-ra="hora" style="font:700 11px ui-monospace,monospace;color:#e2e8f0;min-width:84px;text-align:right">--:--</span>
        </div>
        <div data-ra="estado" style="font-size:10px;color:#94a3b8;margin-top:3px"></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:#e2e8f0">
          <label style="display:flex;align-items:center;gap:5px">Mostrar
            <select data-ra="clas" style="background:#0f172a;color:#e2e8f0;border:1px solid #0ea5e9;border-radius:6px;padding:2px 4px;font-size:11px">
              <option value="todo">Todo</option><option value="lluvia">Solo lluvia</option><option value="tormenta">Solo tormenta</option><option value="severa">Solo tormenta severa</option>
            </select></label>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input data-ra="seg" type="checkbox" checked style="accent-color:#0ea5e9"> Seguir la celda más intensa</label>
        </div>
        <div data-ra="leyenda" style="display:none;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:10px;color:#cbd5e1"></div>
        <div data-ra="panel" style="display:none;margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(15,23,42,.75);border:1px solid rgba(245,158,11,.4);font-size:11px;line-height:1.45;color:#e2e8f0"></div>
      </div>`;
    const q = k => raiz.querySelector(`[data-ra="${k}"]`);
    const ui = { play: q('play'), slider: q('slider'), hora: q('hora'), estado: q('estado'), clas: q('clas'), seg: q('seg'), leyenda: q('leyenda'), panel: q('panel') };

    // ---------- utilidades ----------
    const activos = () => (cfg.activos() || []).filter(c => E.hist[c] && E.hist[c].obs.length);
    const obsActual = code => { const o = E.hist[code] && E.hist[code].obs; return o && o.length ? o[Math.max(0, o.length - 1 - E.back)] : null; };
    const maxBack = () => Math.max(0, ...activos().map(c => E.hist[c].obs.length - 1));
    const absUrl = u => (u.startsWith('http') ? u : cfg.webmet + u);
    const urlProxy = (id, z, x, y) => `${cfg.backend}/tile/${id}/${z}/${x}/${y}.png`;

    async function json(url) {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    // ---------- capas de animación ----------
    function limpiarCapas(code) {
      (E.capas[code] || []).forEach(l => map.removeLayer(l));
      E.capas[code] = [];
    }
    function armarCapas(code) {
      limpiarCapas(code);
      const h = E.hist[code];
      E.capas[code] = h.obs.map(o => {
        const bb = o.bbox;
        const capa = L.tileLayer(absUrl(o.tile_url), {
          pane: cfg.pane, opacity: 0, minZoom: 4, maxNativeZoom: 10, maxZoom: 18,
          bounds: L.latLngBounds([bb.min_lat, bb.min_lon], [bb.max_lat, bb.max_lon])
        });
        // si WebMet ya no entrega una imagen vieja, se pide a través del servidor propio
        capa.on('tileerror', e => {
          if (e.tile && !e.tile.dataset.fb) { e.tile.dataset.fb = '1'; e.tile.src = urlProxy(o.id, e.coords.z, e.coords.x, e.coords.y); }
        });
        return capa.addTo(map);
      });
    }
    function mostrar() {
      const op = cfg.opacidad();
      const hay = activos();
      Object.keys(E.capas).forEach(code => {
        const lista = E.capas[code] || [];
        const idxVisible = lista.length ? lista.length - 1 - Math.min(E.back, lista.length - 1) : -1;
        lista.forEach((l, i) => l.setOpacity(!E.clasificar && i === idxVisible && hay.includes(code) ? op : 0));
      });
      if (E.clasificar) pintarClases();
      const refs = hay.map(obsActual).filter(Boolean);
      if (refs.length) {
        const ult = refs[0];
        const dif = Math.round((Date.now() - new Date(ult.observation_time)) / 60000);
        ui.hora.textContent = hora(ult.observation_time);
        ui.estado.textContent = E.back === 0 ? `Última imagen · hace ${dif} min` : `Imagen ${hay.length ? E.hist[hay[0]].obs.length - E.back : ''} de ${E.hist[hay[0]].obs.length} · hace ${dif} min`;
      }
    }

    // ---------- clasificación (se repinta cada tesela por clase) ----------
    const memoClase = new Map();
    function dbzDeColor(r, g, b) {
      const k = (r << 16) | (g << 8) | b;
      if (memoClase.has(k)) return memoClase.get(k);
      let mejor = null, md = 1e9;
      for (const [v, pr, pg, pb] of PAL_RGB) {
        const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (d < md) { md = d; mejor = v; }
      }
      const res = md <= 48 * 48 ? mejor : null;
      memoClase.set(k, res);
      return res;
    }
    function enBanda(v, f) {
      const u = E.umbrales;
      if (f === 'lluvia') return v >= u.lluvia && v < u.tormenta;
      if (f === 'tormenta') return v >= u.tormenta && v < u.severa;
      if (f === 'severa') return v >= u.severa;
      return true;
    }
    function claseDe(dbz) {
      const u = E.umbrales;
      if (dbz >= u.granizo) return CLASES.granizo;
      if (dbz >= u.severa) return CLASES.severa;
      if (dbz >= u.tormenta) return CLASES.tormenta;
      if (dbz >= u.lluvia) return CLASES.lluvia;
      return CLASES.debil;
    }
    const CapaClases = L.GridLayer.extend({
      initialize: function (obsId, opts, filtro) { this._obsId = obsId; this._filtro = filtro; L.GridLayer.prototype.initialize.call(this, opts); },
      createTile: function (c, done) {
        const filtro = this._filtro;
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
            const im = ctx.getImageData(0, 0, 256, 256), d = im.data;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] < 40) { d[i + 3] = 0; continue; }
              const v = dbzDeColor(d[i], d[i + 1], d[i + 2]);
              if (v === null) { d[i + 3] = 0; continue; }
              if (!enBanda(v, filtro)) d[i + 3] = 0;          // se conserva el color original de WebMet
            }
            ctx.putImageData(im, 0, 0);
          } catch (e) { /* sin permiso de lectura: tesela vacía */ }
          done(null, cv);
        };
        img.onerror = () => done(null, cv);
        img.src = urlProxy(this._obsId, c.z, c.x, c.y);
        return cv;
      }
    });
    function pintarClases() {
      const claves = E.filtro + ':' + activos().map(code => { const o = obsActual(code); return o ? o.id : ''; }).join('|');
      if (E.claseCapa && E.claseCapa.clave === claves) return;
      quitarClases();
      E.claseCapa = { clave: claves, capas: [] };
      activos().forEach(code => {
        const o = obsActual(code); if (!o) return;
        const bb = o.bbox;
        const l = new CapaClases(o.id, { pane: cfg.pane, opacity: cfg.opacidad(), maxNativeZoom: 10, minZoom: 4, maxZoom: 18,
          bounds: L.latLngBounds([bb.min_lat, bb.min_lon], [bb.max_lat, bb.max_lon]) }, E.filtro);
        l.addTo(map); E.claseCapa.capas.push(l);
      });
    }
    function quitarClases() {
      if (E.claseCapa) E.claseCapa.capas.forEach(l => map.removeLayer(l));
      E.claseCapa = null;
    }

    function leyendaClases() {
      const u = E.umbrales;
      const txt = { lluvia: `Solo lluvia: ${u.lluvia}–${u.tormenta} dBZ`, tormenta: `Solo tormenta: ${u.tormenta}–${u.severa} dBZ`, severa: `Solo tormenta severa: ${u.severa} dBZ o más (≥ ${u.granizo}: granizo posible)` }[E.filtro];
      ui.leyenda.style.display = E.clasificar ? 'flex' : 'none';
      ui.leyenda.textContent = txt ? txt + ' · colores de la escala WebMet' : '';
    }

    // ---------- seguimiento de la celda ----------
    function dibujarSeguimiento() {
      E.overlay.clearLayers();
      ui.panel.style.display = 'none';
      if (!E.seguir) return;
      let mejor = null;
      activos().forEach(code => {
        const s = E.seg[code]; if (!s) return;
        (s.ecos_fijos || []).forEach(e => L.circleMarker([e.lat, e.lon], { radius: 6, color: '#94a3b8', weight: 2, dashArray: '2 3', fillOpacity: 0, pane: 'markerPane' })
          .bindTooltip(`Eco fijo · ${e.max_dbz} dBZ<br>${esc(e.nota)}`).addTo(E.overlay));
        (s.otras_celdas || []).forEach(c => L.circleMarker([c.lat, c.lon], { radius: 5, color: COLOR_CLASE[c.clase] || '#f59e0b', weight: 2, fillOpacity: .2 })
          .bindTooltip(`Otra celda · ${c.max_dbz} dBZ`).addTo(E.overlay));
        if (s.celda && (!mejor || s.celda.max_dbz > mejor.celda.max_dbz)) mejor = { code, celda: s.celda, s };
        if (!s.celda) return;
        const c = s.celda, col = COLOR_CLASE[c.clase] || '#f59e0b';
        const pts = c.trayectoria.map(p => [p.lat, p.lon]);
        if (pts.length > 1) L.polyline(pts, { color: '#fff', weight: 3, opacity: .9 }).addTo(E.overlay);
        c.trayectoria.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: i === c.trayectoria.length - 1 ? 0 : 3, color: '#fff', weight: 1, fillColor: col, fillOpacity: 1 })
          .bindTooltip(`${hora(p.hora)} · ${p.max_dbz} dBZ`).addTo(E.overlay));
        const fut = [[c.lat, c.lon]].concat((c.pronostico || []).map(p => [p.lat, p.lon]));
        if (fut.length > 1) L.polyline(fut, { color: col, weight: 3, dashArray: '7 6', opacity: .95 }).addTo(E.overlay);
        (c.pronostico || []).forEach(p => {
          L.circle([p.lat, p.lon], { radius: p.incertidumbre_km * 1000, color: col, weight: 1, fillColor: col, fillOpacity: .12, dashArray: '3 4' }).addTo(E.overlay);
          L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0],
            html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:800 10px system-ui;color:#fff;background:${col};padding:1px 5px;border-radius:8px;box-shadow:0 1px 3px #0008">+${p.min}′</span>` }),
            interactive: false }).addTo(E.overlay);
        });
        L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', iconSize: [0, 0],
          html: `<span style="position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:3px solid #fff;background:${col};box-shadow:0 0 0 4px ${col}55,0 0 12px #000a;display:block"></span>` }) })
          .bindTooltip(`${CLASES[c.clase === 'tormenta_severa' ? 'severa' : c.clase].txt} · ${c.max_dbz} dBZ`).addTo(E.overlay);
      });
      if (!mejor) {
        const msg = activos().map(c => E.seg[c] && E.seg[c].mensaje).filter(Boolean)[0];
        if (msg) { ui.panel.style.display = 'block'; ui.panel.style.borderColor = 'rgba(148,163,184,.4)'; ui.panel.textContent = msg; }
        return;
      }
      const c = mejor.celda, col = COLOR_CLASE[c.clase] || '#f59e0b';
      const filas = [];
      filas.push(`<b style="color:${col}">${esc(mejor.code)} · ${esc(CLASES[c.clase === 'tormenta_severa' ? 'severa' : c.clase].txt)} · ${c.max_dbz} dBZ</b>${c.granizo_posible ? ' <span style="color:#e879f9">· granizo posible</span>' : ''}`);
      filas.push(`Desplazamiento: <b>${c.velocidad_kmh} km/h</b>, ${esc(c.rumbo_texto)}${c.tendencia ? ' · ' + esc(c.tendencia) : ''}`);
      filas.push(`<span style="color:#94a3b8">Calculado con ${c.puntos_usados} imágenes · confianza ${esc(c.confianza)}</span>`);
      if ((c.podria_alcanzar || []).length) filas.push('Podría alcanzar: ' + c.podria_alcanzar.map(l => `<b>${esc(l.localidad)}</b> (~${l.en_min} min)`).join(', '));
      else if ((c.pronostico || []).length) filas.push('En la próxima hora no se prevé que alcance una localidad de la lista.');
      filas.push(`<span style="color:#94a3b8;font-size:10px">${esc(mejor.s.aviso || '')}</span>`);
      ui.panel.style.display = 'block';
      ui.panel.style.borderColor = col + '99';
      ui.panel.innerHTML = filas.join('<br>');
    }

    // ---------- carga de datos ----------
    async function cargarUmbrales() {
      try {
        const u = await json(`${cfg.backend}/umbrales`);
        E.umbrales = { lluvia: u.lluvia.desde_dbz, tormenta: u.tormenta.desde_dbz, severa: u.tormenta_severa.desde_dbz, granizo: u.granizo_posible_desde_dbz };
        leyendaClases();
      } catch (e) { /* se usan los valores por defecto */ }
    }
    async function sincronizar() {
      const ver = ++E.ver;
      const lista = cfg.activos() || [], campo = cfg.campo();
      // apaga lo de radares que ya no están activos
      Object.keys(E.capas).forEach(code => { if (!lista.includes(code)) { limpiarCapas(code); delete E.hist[code]; delete E.seg[code]; cfg.ocultarSimple(code, false); } });
      await Promise.all(lista.map(async code => {
        try {
          const h = await json(`${cfg.backend}/${code}/historial?campo=${campo}`);
          if (ver !== E.ver) return;
          const previo = E.hist[code];
          const clave = h.observaciones.map(o => o.id).join(',');
          if (!previo || previo.campo !== campo || previo.clave !== clave) {
            E.hist[code] = { campo, clave, obs: h.observaciones, completo: h.completo };
            if (h.observaciones.length >= 2) armarCapas(code); else limpiarCapas(code);
          }
          cfg.ocultarSimple(code, h.observaciones.length >= 2);
        } catch (e) { console.warn('Radar animación', code, e.message); cfg.ocultarSimple(code, false); }
        try { const s = await json(`${cfg.backend}/${code}/seguimiento`); if (ver === E.ver) E.seg[code] = s; } catch (e) { /* sin seguimiento */ }
      }));
      if (ver !== E.ver) return;
      const n = maxBack();
      ui.slider.max = n; ui.slider.disabled = n < 1; ui.play.disabled = n < 1;
      ui.play.style.opacity = n < 1 ? .4 : 1;
      if (E.back > n) E.back = n;
      if (!E.playing) { E.back = Math.min(E.back, n); }
      ui.slider.value = n - E.back;
      const h0 = activos()[0];
      if (!h0) ui.estado.textContent = lista.length ? 'Cargando imágenes…' : 'Encendé un radar para ver la animación.';
      else if (n < 1) ui.estado.textContent = 'El servidor recién empieza a guardar imágenes: la animación estará lista en unos minutos.';
      else if (E.hist[h0].obs.length < 6) ui.estado.textContent = `Hay ${E.hist[h0].obs.length} de 6 imágenes guardadas (se suma una cada ~8 min).`;
      mostrar();
      if (n >= 1 && E.hist[h0] && E.hist[h0].obs.length >= 2 && E.back === 0 && !E.playing) { /* queda en la última */ }
      dibujarSeguimiento();
    }

    // ---------- controles ----------
    function irA(back) { E.back = Math.max(0, Math.min(maxBack(), back)); ui.slider.value = maxBack() - E.back; mostrar(); }
    function parar() { E.playing = false; clearTimeout(E.timer); E.timer = null; ui.play.textContent = '▶'; }
    function reproducir() {
      if (maxBack() < 1) return;
      E.playing = true; ui.play.textContent = '⏸';
      if (E.back === 0) irA(maxBack());
      clearTimeout(E.timer);
      const paso = () => {
        if (!E.playing) return;
        if (E.back <= 0) { E.timer = setTimeout(() => { if (E.playing) { irA(maxBack()); E.timer = setTimeout(paso, 700); } }, 1500); return; }
        irA(E.back - 1);
        E.timer = setTimeout(paso, 700);
      };
      E.timer = setTimeout(paso, 700);
    }
    ui.play.onclick = () => (E.playing ? parar() : reproducir());
    ui.slider.oninput = () => { parar(); irA(maxBack() - Number(ui.slider.value)); };
    ui.clas.onchange = () => {
      E.filtro = ui.clas.value; E.clasificar = E.filtro !== 'todo'; leyendaClases();
      if (!E.clasificar) quitarClases();
      mostrar();
    };
    ui.seg.onchange = () => { E.seguir = ui.seg.checked; dibujarSeguimiento(); };

    cargarUmbrales();
    return { sincronizar, setOpacidad: mostrar, parar, estado: () => E };
  }

  window.RadarAnim = { crear };
})();
