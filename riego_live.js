/* RIEGO INTELIGENTE dentro de MetricPoint Live: botón flotante que abre el módulo en un panel. Agregar en index.html:
   <script src="riego_live.js?v=1" defer></script>   (riego.html debe estar en la misma carpeta) */
(function () {
  if (window.__riegoLive) return; window.__riegoLive = true;
  var URL = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^\/]*$/, "") : "") + "riego.html";
  function ini() {
    var b = document.createElement("button");
    b.textContent = "💧 Riego inteligente";
    b.style.cssText = "position:fixed;right:12px;bottom:70px;z-index:9998;background:#0ea5e9;color:#032230;font:600 14px system-ui;border:0;border-radius:22px;padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer";
    var p = document.createElement("div");
    p.style.cssText = "display:none;position:fixed;inset:0;z-index:9999;background:#0f1a17";
    p.innerHTML = '<button style="position:absolute;right:10px;top:8px;z-index:2;background:#16251f;color:#e8f1ec;border:1px solid #27403a;border-radius:8px;padding:6px 12px;cursor:pointer">Cerrar</button><iframe style="width:100%;height:100%;border:0" title="Riego inteligente"></iframe>';
    var fr = p.querySelector("iframe");
    b.onclick = function () { if (!fr.src) fr.src = URL; p.style.display = "block"; };
    p.querySelector("button").onclick = function () { p.style.display = "none"; };
    document.body.appendChild(b); document.body.appendChild(p);
  }
  if (document.body) ini(); else document.addEventListener("DOMContentLoaded", ini);
})();
