/* MetricPoint · cambio obligatorio de la clave temporal (primer ingreso).
   Se agrega UNA línea en la página de ingreso:  <script src="cambio_clave.js"></script>
   No toca el código de ingreso: cuando /api/login responde "debe_cambiar_clave", muestra una pantalla
   para elegir la clave nueva y recién después deja continuar al sistema. */
(function () {
  if (window.__mpCambioClave) return; window.__mpCambioClave = true;
  var orig = window.fetch.bind(window);

  function pedirClave(base, token, temporal) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.92);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,sans-serif';
      ov.innerHTML =
        '<form style="width:100%;max-width:380px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:22px;color:#e2e8f0">' +
        '<h2 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#fff">Elegí tu clave</h2>' +
        '<p style="margin:0 0 14px;font-size:13px;line-height:1.45;color:#94a3b8">Ingresaste con una clave temporal. Para continuar, creá una clave propia (mínimo 8 caracteres).</p>' +
        '<label style="font-size:12px;color:#cbd5e1">Clave nueva</label>' +
        '<input id="mpc-1" type="password" autocomplete="new-password" minlength="8" required style="width:100%;box-sizing:border-box;margin:4px 0 10px;padding:10px;border-radius:10px;border:1px solid #475569;background:#1e293b;color:#fff;font-size:14px">' +
        '<label style="font-size:12px;color:#cbd5e1">Repetila</label>' +
        '<input id="mpc-2" type="password" autocomplete="new-password" minlength="8" required style="width:100%;box-sizing:border-box;margin:4px 0 10px;padding:10px;border-radius:10px;border:1px solid #475569;background:#1e293b;color:#fff;font-size:14px">' +
        '<p id="mpc-msg" role="alert" style="min-height:16px;margin:0 0 8px;font-size:12px;color:#fca5a5"></p>' +
        '<button id="mpc-ok" style="width:100%;padding:11px;border:0;border-radius:10px;background:#059669;color:#fff;font-weight:800;font-size:14px;cursor:pointer">Guardar y entrar</button>' +
        '<button type="button" id="mpc-no" style="width:100%;margin-top:8px;padding:8px;border:0;background:none;color:#94a3b8;font-size:12px;text-decoration:underline;cursor:pointer">Salir</button>' +
        '</form>';
      document.body.appendChild(ov);
      var f = ov.querySelector('form'), a = ov.querySelector('#mpc-1'), b = ov.querySelector('#mpc-2'), m = ov.querySelector('#mpc-msg'), ok = ov.querySelector('#mpc-ok');
      a.focus();
      ov.querySelector('#mpc-no').onclick = function () { ov.remove(); resolve(false); };
      f.onsubmit = function (e) {
        e.preventDefault(); m.textContent = '';
        if (a.value.length < 8) { m.textContent = 'Usá al menos 8 caracteres.'; return; }
        if (a.value !== b.value) { m.textContent = 'Las dos claves no coinciden.'; return; }
        ok.disabled = true; ok.textContent = 'Guardando…';
        orig(base + '/api/cambiar_clave', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, actual: temporal, nueva: a.value }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (x) {
            if (x.ok) { ov.remove(); resolve(true); }
            else { m.textContent = x.d.error || 'No se pudo cambiar la clave.'; ok.disabled = false; ok.textContent = 'Guardar y entrar'; }
          })
          .catch(function () { m.textContent = 'Sin conexión con el servidor. Intentá de nuevo.'; ok.disabled = false; ok.textContent = 'Guardar y entrar'; });
      };
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var esLogin = /\/api\/login(\?|$)/.test(url);
    var p = orig(input, init);
    if (!esLogin) return p;
    return p.then(function (res) {
      if (!res.ok) return res;
      return res.clone().json().then(function (d) {
        if (!d || !d.debe_cambiar_clave || !d.token) return res;
        var temporal = ''; try { temporal = JSON.parse(init && init.body).password || ''; } catch (e) { }
        var base = url.replace(/\/api\/login.*$/, '');
        return pedirClave(base, d.token, temporal).then(function (hecho) {
          if (hecho) return res;                       // el ingreso continúa con normalidad
          return new Response(JSON.stringify({ error: 'Para continuar tenés que elegir una clave propia.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } });
        });
      }).catch(function () { return res; });
    });
  };
})();
