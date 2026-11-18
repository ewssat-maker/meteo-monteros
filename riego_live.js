/* RIEGO INTELIGENTE dentro de MetricPoint Live: tarjeta del menú, debajo de PRONÓSTICO, que abre el módulo en un panel.
   En index.html:  <script src="riego_live.js?v=2" defer></script>   (riego.html va en la misma carpeta) */
(function () {
  if (window.__riegoLive) return; window.__riegoLive = true;
  var BASE = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^\/]*$/, "") : "");
  var URL = BASE + "riego.html", panel, fr;

  function abrir(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!panel) {
      panel = document.createElement("div");
      panel.style.cssText = "display:none;position:fixed;inset:0;z-index:99999;background:#0f1a17";
      panel.innerHTML = '<button style="position:absolute;right:10px;top:8px;z-index:2;background:#16251f;color:#e8f1ec;border:1px solid #27403a;border-radius:8px;padding:6px 12px;cursor:pointer">Cerrar</button><iframe style="width:100%;height:100%;border:0" title="Riego inteligente"></iframe>';
      fr = panel.querySelector("iframe");
      panel.querySelector("button").onclick = function () { panel.style.display = "none"; };
      document.body.appendChild(panel);
    }
    if (!fr.src) fr.src = URL;
    panel.style.display = "block";
  }

  function hoja(el, txt) {            // elemento más interno cuyo texto propio es `txt`
    var all = el.querySelectorAll("*"), r = null;
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.children.length === 0 && n.textContent.trim().toLowerCase() === txt.toLowerCase()) r = n;
    }
    return r;
  }

  function tarjeta() {
    var cands = document.querySelectorAll("*"), t = null;
    for (var i = 0; i < cands.length; i++) {
      var n = cands[i];
      if (n.children.length === 0 && /modelos predictivos a 72/i.test(n.textContent)) { t = n; break; }
    }
    if (!t) return null;
    var c = t;                         // sube hasta la tarjeta: la que tiene como hermana anterior la de RADAR 3D
    while (c && c !== document.body) {
      var prev = c.previousElementSibling;
      if (prev && /radar 3d/i.test(prev.textContent)) return c;
      c = c.parentElement;
    }
    return null;
  }

  function ini() {
    if (document.getElementById("riegoLiveCard") || document.getElementById("riegoLiveFlot")) return true;
    var p = tarjeta();
    if (!p) return false;
    var k = p.cloneNode(true);
    [k].concat([].slice.call(k.querySelectorAll("*"))).forEach(function (n) {
      n.removeAttribute("onclick"); n.removeAttribute("id"); n.removeAttribute("href"); n.removeAttribute("data-i18n");
    });
    k.id = "riegoLiveCard";
    var tit = hoja(k, "PRONÓSTICO"), sub = hoja(k, "Modelos predictivos a 72hs");
    if (tit) tit.textContent = "RIEGO INTELIGENTE";
    if (sub) sub.textContent = "Balance hídrico y decisión de riego";
    k.style.borderLeftColor = "#0ea5e9";
    k.style.cursor = "pointer";
    var ico = k.querySelector("svg, i, img");
    if (ico) { var s = document.createElement("span"); s.textContent = "💧"; s.style.cssText = "font-size:26px;line-height:1"; ico.parentNode.replaceChild(s, ico); }
    k.addEventListener("click", abrir, true);
    p.parentNode.insertBefore(k, p.nextSibling);
    return true;
  }

  function flotante() {               // respaldo si no se encuentra el menú
    if (document.getElementById("riegoLiveCard") || document.getElementById("riegoLiveFlot")) return;
    var b = document.createElement("button");
    b.id = "riegoLiveFlot"; b.textContent = "💧 Riego inteligente";
    b.style.cssText = "position:fixed;right:12px;bottom:70px;z-index:9998;background:#0ea5e9;color:#032230;font:600 14px system-ui;border:0;border-radius:22px;padding:10px 16px;cursor:pointer";
    b.onclick = abrir; document.body.appendChild(b);
  }

  function arrancar() {
    if (ini()) return;
    var intentos = 0, mo = new MutationObserver(function () { if (ini()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    var iv = setInterval(function () { intentos++; if (ini() || intentos > 20) { clearInterval(iv); if (intentos > 20) { mo.disconnect(); flotante(); } } }, 500);
  }
  if (document.body) arrancar(); else document.addEventListener("DOMContentLoaded", arrancar);
})();
