// Self-contained HTML for the PDF viewer WebView
// Communicates with React Native via injectJavaScript + postMessage

export default function getPdfViewerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<style>
  :root {
    --cream: #f0f4f8; --brown: #0a1628; --rust: #2563eb;
    --gold: #3b82f6; --sage: #64748b; --ink: #0f172a;
    --paper: #e8eef4; --border: #cbd5e1;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #334155;
    font-family: 'Georgia', 'Times New Roman', serif;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  #pdfArea {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 6px;
    gap: 12px;
    min-height: 100vh;
  }
  .pdf-page-wrapper {
    position: relative;
    box-shadow: 2px 2px 12px rgba(0,0,0,0.4);
  }
  .pdf-page-wrapper canvas { display: block; }
  .annotation-layer {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none;
  }
  .annotation-layer.draw-mode {
    pointer-events: all; cursor: crosshair; touch-action: none;
  }
  .highlight-rect {
    position: absolute; pointer-events: none; border-radius: 1px;
    mix-blend-mode: multiply;
  }
  .highlight-preview {
    position: absolute; pointer-events: none; border-radius: 1px;
    border: 2px dashed rgba(37,99,235,0.5);
  }
  .annotation-note {
    position: absolute;
    background: #dbeafe;
    border: 2px solid var(--gold);
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 12px;
    color: var(--ink);
    max-width: 150px;
    word-break: break-word;
    box-shadow: 2px 2px 0 rgba(0,0,0,0.15);
    pointer-events: all;
    z-index: 10;
    min-width: 60px;
    white-space: pre-wrap;
    line-height: 1.4;
  }
  .note-delete {
    position: absolute; top: -10px; right: -10px;
    width: 20px; height: 20px;
    background: var(--rust); color: white;
    border: none; border-radius: 50%;
    font-size: 11px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .empty-msg {
    color: var(--cream); text-align: center; padding: 60px 20px;
    font-size: 16px; letter-spacing: 1px; opacity: 0.7;
  }
  .loading-msg {
    color: var(--cream); text-align: center; padding: 60px 20px;
    font-size: 14px; letter-spacing: 1px;
  }
</style>
</head>
<body>
<div id="pdfArea">
  <div class="empty-msg" id="emptyMsg">Select a project and load a PDF pattern</div>
</div>

<script>
var COLORS = {
  yellow: 'rgba(255,208,60,0.42)',
  pink: 'rgba(255,128,128,0.38)',
  green: 'rgba(96,200,120,0.38)',
  blue: 'rgba(96,160,220,0.38)'
};
var NOTE_BG = { yellow:'#fef9c3', pink:'#fce7f3', green:'#d1fae5', blue:'#dbeafe' };

var state = {
  pdfDoc: null,
  zoom: 1.0,
  activeTool: null,
  activeColor: 'yellow',
  annotations: [],
  currentPage: 1,
  isDrawing: false,
  drawStart: null
};

var pdfArea = document.getElementById('pdfArea');
var emptyMsg = document.getElementById('emptyMsg');
var renderedPages = new Set();

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sendToRN(type, data) {
  var msg = JSON.stringify({ type: type, data: data });
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(msg);
  } else if (window.parent !== window) {
    window.parent.postMessage(msg, '*');
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global handler called via injectJavaScript from React Native
window.handleRNMessage = function(msgObj) {
  try {
    switch(msgObj.type) {
      case 'loadPdf': loadPdf(msgObj.data); break;
      case 'setTool': state.activeTool = msgObj.data; rerenderAnnotations(); break;
      case 'setColor': state.activeColor = msgObj.data; break;
      case 'setAnnotations': state.annotations = msgObj.data || []; rerenderAnnotations(); break;
      case 'setZoom':
        state.zoom = msgObj.data;
        if (state.pdfDoc) { renderedPages = new Set(); renderAllPages(); }
        break;
      case 'goToPage':
        state.currentPage = msgObj.data;
        var el = pdfArea.querySelector('[data-page="' + msgObj.data + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });        sendToRN('pageChanged', { page: msgObj.data, total: state.pdfDoc ? state.pdfDoc.numPages : 0 });        break;
      case 'addNote':
        state.annotations.push(msgObj.data);
        rerenderAnnotations();
        sendToRN('annotationsChanged', state.annotations);
        break;
    }
  } catch(err) { console.error('handleRNMessage error:', err); }
};

// Also listen for postMessage (fallback for web iframe)
window.addEventListener('message', function(e) {
  try { if (typeof e.data === 'string') window.handleRNMessage(JSON.parse(e.data)); } catch(err) {}
});
document.addEventListener('message', function(e) {
  try { if (typeof e.data === 'string') window.handleRNMessage(JSON.parse(e.data)); } catch(err) {}
});

async function loadPdf(base64) {
  emptyMsg.style.display = 'none';
  pdfArea.innerHTML = '<div class="loading-msg">Loading pattern...</div>';
  renderedPages = new Set();
  try {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    state.pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    state.currentPage = 1;
    await renderAllPages();
    sendToRN('pdfLoaded', { numPages: state.pdfDoc.numPages });
  } catch(e) {
    pdfArea.innerHTML = '<div class="empty-msg">Could not load PDF: ' + esc(e.message) + '</div>';
  }
}

async function renderAllPages() {
  if (!state.pdfDoc) return;
  renderedPages = new Set();
  pdfArea.innerHTML = '';
  var total = state.pdfDoc.numPages;
  var firstPage = await state.pdfDoc.getPage(1);
  var baseVp = firstPage.getViewport({ scale: 1.0 });
  var screenW = window.innerWidth - 24;
  var fitScale = screenW / baseVp.width;
  var finalScale = fitScale * state.zoom;

  for (var pn = 1; pn <= total; pn++) {
    await renderSinglePage(pn, finalScale);
  }
  sendToRN('pageChanged', { page: state.currentPage, total: total });
}

async function renderSinglePage(pn, scale) {
  if (renderedPages.has(pn)) return;
  renderedPages.add(pn);
  var page = await state.pdfDoc.getPage(pn);
  var vp = page.getViewport({ scale: scale });
  var wrapper = document.createElement('div');
  wrapper.className = 'pdf-page-wrapper';
  wrapper.dataset.page = pn;
  wrapper.style.width = vp.width + 'px';
  var canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  var annLayer = document.createElement('div');
  annLayer.className = 'annotation-layer';
  annLayer.dataset.page = pn;
  annLayer.style.height = vp.height + 'px';
  wrapper.appendChild(canvas);
  wrapper.appendChild(annLayer);
  pdfArea.appendChild(wrapper);
  renderAnnotationsForPage(pn, annLayer, vp.width, vp.height);
  setupPageInteraction(annLayer, pn, vp.width, vp.height);
}

function renderAnnotationsForPage(pn, layer, w, h) {
  state.annotations.filter(function(a) { return a.page === pn; }).forEach(function(a) {
    renderAnnotation(a, layer, w, h);
  });
}

function renderAnnotation(ann, layer, w, h) {
  if (ann.type === 'highlight') {
    var el = document.createElement('div');
    el.className = 'highlight-rect';
    el.dataset.annId = ann.id;
    el.style.cssText = 'left:' + (ann.x*w) + 'px;top:' + (ann.y*h) + 'px;width:' + (ann.w*w) + 'px;height:' + (ann.h*h) + 'px;background:' + (COLORS[ann.color]||COLORS.yellow) + ';';
    if (state.activeTool === 'eraser') {
      el.style.pointerEvents = 'all'; el.style.cursor = 'pointer';
      el.onclick = function() { deleteAnnotation(ann.id); };
    }
    layer.appendChild(el);
  } else if (ann.type === 'note') {
    var el = document.createElement('div');
    el.className = 'annotation-note';
    el.dataset.annId = ann.id;
    el.style.left = (ann.x*w) + 'px';
    el.style.top = (ann.y*h) + 'px';
    el.style.background = NOTE_BG[ann.color] || '#dbeafe';
    el.innerHTML = '<button class="note-delete">x</button>' + esc(ann.text);
    el.querySelector('.note-delete').onclick = function(e) {
      e.stopPropagation(); deleteAnnotation(ann.id);
    };
    makeDraggable(el, ann, w, h);
    layer.appendChild(el);
  }
}

function deleteAnnotation(id) {
  state.annotations = state.annotations.filter(function(a) { return a.id !== id; });
  sendToRN('annotationsChanged', state.annotations);
  rerenderAnnotations();
}

function rerenderAnnotations() {
  pdfArea.querySelectorAll('.annotation-layer').forEach(function(layer) {
    var pn = parseInt(layer.dataset.page, 10);
    var canvas = layer.previousElementSibling;
    if (!canvas) return;
    layer.innerHTML = '';
    renderAnnotationsForPage(pn, layer, canvas.width, canvas.height);
    setupPageInteraction(layer, pn, canvas.width, canvas.height);
  });
}

function makeDraggable(el, ann, w, h) {
  var ox, oy, sx, sy;
  el.ontouchstart = function(e) {
    if (e.target.classList.contains('note-delete')) return;
    e.stopPropagation();
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
    var move = function(ev) {
      ev.preventDefault();
      var ct = ev.touches[0];
      el.style.left = (ox + ct.clientX - sx) + 'px';
      el.style.top = (oy + ct.clientY - sy) + 'px';
      ann.x = parseInt(el.style.left) / w;
      ann.y = parseInt(el.style.top) / h;
    };
    var up = function() {
      sendToRN('annotationsChanged', state.annotations);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', up);
    };
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
  };
  el.onmousedown = function(e) {
    if (e.target.classList.contains('note-delete')) return;
    sx = e.clientX; sy = e.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
    var move = function(ev) {
      el.style.left = (ox + ev.clientX - sx) + 'px';
      el.style.top = (oy + ev.clientY - sy) + 'px';
      ann.x = parseInt(el.style.left) / w;
      ann.y = parseInt(el.style.top) / h;
    };
    var up = function() {
      sendToRN('annotationsChanged', state.annotations);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  };
}

function getEventPos(e, layer) {
  var r = layer.getBoundingClientRect();
  if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX - r.left, y: e.changedTouches[0].clientY - r.top };
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function setupPageInteraction(layer, pn, w, h) {
  layer.onmousedown = null; layer.onmousemove = null; layer.onmouseup = null;
  layer.onclick = null; layer.ontouchstart = null; layer.ontouchmove = null; layer.ontouchend = null;
  layer.classList.remove('draw-mode');

  if (state.activeTool === 'highlight') {
    layer.classList.add('draw-mode');
    var rect = null;
    var onStart = function(e) {
      e.preventDefault();
      var pos = getEventPos(e, layer);
      state.isDrawing = true; state.drawStart = pos;
      rect = document.createElement('div');
      rect.className = 'highlight-preview';
      rect.style.background = COLORS[state.activeColor];
      layer.appendChild(rect);
    };
    var onMove = function(e) {
      if (!state.isDrawing || !rect) return;
      e.preventDefault();
      var pos = getEventPos(e, layer);
      rect.style.left = Math.min(pos.x, state.drawStart.x) + 'px';
      rect.style.top = Math.min(pos.y, state.drawStart.y) + 'px';
      rect.style.width = Math.abs(pos.x - state.drawStart.x) + 'px';
      rect.style.height = Math.abs(pos.y - state.drawStart.y) + 'px';
    };
    var onEnd = function(e) {
      if (!state.isDrawing) return;
      e.preventDefault();
      state.isDrawing = false;
      var pos = getEventPos(e, layer);
      var x = Math.min(pos.x, state.drawStart.x) / w;
      var y = Math.min(pos.y, state.drawStart.y) / h;
      var rw = Math.abs(pos.x - state.drawStart.x) / w;
      var rh = Math.abs(pos.y - state.drawStart.y) / h;
      if (rw > 0.01 && rh > 0.005) {
        var ann = { id: 'a_' + Date.now(), type: 'highlight', page: pn, x: x, y: y, w: rw, h: rh, color: state.activeColor };
        state.annotations.push(ann);
        sendToRN('annotationsChanged', state.annotations);
      }
      if (rect) rect.remove(); rect = null;
      rerenderAnnotations();
    };
    layer.ontouchstart = onStart; layer.ontouchmove = onMove; layer.ontouchend = onEnd;
    layer.onmousedown = function(e) { if (e.button !== 0) return; onStart(e); };
    layer.onmousemove = onMove; layer.onmouseup = onEnd;
  } else if (state.activeTool === 'note') {
    layer.classList.add('draw-mode');
    layer.ontouchend = function(e) {
      if (e.target !== layer) return;
      var pos = getEventPos(e, layer);
      sendToRN('requestNote', { x: pos.x / w, y: pos.y / h, page: pn });
    };
    layer.onclick = function(e) {
      if (e.target !== layer) return;
      var pos = getEventPos(e, layer);
      sendToRN('requestNote', { x: pos.x / w, y: pos.y / h, page: pn });
    };
  } else if (state.activeTool === 'eraser') {
    layer.querySelectorAll('.highlight-rect').forEach(function(el) {
      el.style.pointerEvents = 'all'; el.style.cursor = 'pointer';
      el.onclick = function() { deleteAnnotation(el.dataset.annId); };
    });
  }
}

// Track scroll for page indicator
var scrollTimer = null;
document.addEventListener('scroll', function(){
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(function() {
    var wrappers = pdfArea.querySelectorAll('.pdf-page-wrapper');
    var closest = 1, minDist = Infinity;
    wrappers.forEach(function(w) {
      var d = Math.abs(w.getBoundingClientRect().top);
      if (d < minDist) { minDist = d; closest = parseInt(w.dataset.page, 10); }
    });
    if (closest !== state.currentPage) {
      state.currentPage = closest;
      sendToRN('pageChanged', { page: closest, total: state.pdfDoc ? state.pdfDoc.numPages : 0 });
    }
  }, 150);
}, true);

// Signal ready to React Native
sendToRN('webviewReady', {});
<\/script>
</body>
</html>`;
}
