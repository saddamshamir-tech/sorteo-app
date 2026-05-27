// lottery.js – RIFON
const token    = localStorage.getItem('token');
const correo   = localStorage.getItem('correo') || '';
const nombre   = localStorage.getItem('nombre')  || '';
const apellido = localStorage.getItem('apellido') || '';
// isAdmin: read from body class (set by inline guard before this script runs)
// Falls back to localStorage. Both are set by the inline guard in main.html.
const isAdmin  = document.body.classList.contains('admin-mode') ||
                 localStorage.getItem('isAdmin') === '1';

if (!token) { window.location.replace('/'); }

const fullName = [nombre, apellido].filter(Boolean).join(' ') || correo;
document.getElementById('user-name').textContent = fullName;
if (isAdmin) document.getElementById('admin-btn').style.display = 'flex';

// ── STATE ──────────────────────────────────────────────────────────────────────
let currentSorteo  = null;
let numbersStatus  = {};
let selectedNums   = {};   // { num: cantidad }
let freeNum        = null;
let freeAmount     = 5;
let freeMode       = false;
let freePlayUsed   = false;
let freePlayEnabled = true;
let isLocked       = false;
let lastTicketInfo = null;

buildGrid();
fetchDrawState();
setInterval(fetchDrawState, 15000);

function logout() { localStorage.clear(); window.location.href = '/'; }

// ── FETCH DRAW ─────────────────────────────────────────────────────────────────
async function fetchDrawState() {
  try {
    const r = await fetch('/api/draw/current', { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401) { logout(); return; }
    const data = await r.json();
    currentSorteo    = data.sorteo;
    numbersStatus    = data.numbersStatus || {};
    isLocked         = data.isLocked || data.isClosedDay;
    freePlayUsed     = data.freePlayUsed || false;
    freePlayEnabled  = data.freePlayEnabled !== false;
    updateDrawBanner(data);
    updateFreeBanner();
    updateGrid();
    updateLockedOverlay(data);
  } catch(e) { console.error(e); }
}

// ── DRAW BANNER ────────────────────────────────────────────────────────────────
function updateDrawBanner(data) {
  if (!data.sorteo) return;
  const s = data.sorteo;
  document.getElementById('draw-name').textContent = `Sorteo #${s.numero_sorteo} – ${data.drawLabel}`;
  document.getElementById('draw-date').textContent = `${formatDateHN(s.fecha)}  |  ${formatTimeHN(s.hora_sorteo)}`;
  const el = document.getElementById('draw-status');
  if (data.isClosedDay) {
    el.className = 'draw-status locked';
    el.innerHTML = '<div class="pulse"></div><span>Sorteos del día completados</span>';
  } else if (data.isLocked) {
    el.className = 'draw-status locked';
    el.innerHTML = '<div class="pulse"></div><span>Bloqueado durante sorteo</span>';
  } else {
    el.className = 'draw-status open';
    el.innerHTML = '<div class="pulse"></div><span>Abierto para participar</span>';
  }
}

function updateFreeBanner() {
  const badge = document.getElementById('free-status-badge');
  const wrap  = document.getElementById('free-toggle-wrap');
  if (!freePlayEnabled) {
    badge.className = 'free-badge off'; badge.textContent = 'No disponible hoy';
    wrap.style.display = 'none';
    if (freeMode) { freeMode = false; freeNum = null; document.getElementById('free-chk').checked = false; renderList(); updateTotal(); }
  } else if (freePlayUsed) {
    badge.className = 'free-badge used'; badge.textContent = 'Ya usaste el de hoy';
    wrap.style.display = 'none';
    if (freeMode) { freeMode = false; freeNum = null; document.getElementById('free-chk').checked = false; renderList(); updateTotal(); }
  } else {
    badge.className = 'free-badge'; badge.textContent = 'Disponible hoy';
    wrap.style.display = 'block';
  }
}

function updateLockedOverlay(data) {
  const ov = document.getElementById('locked-overlay');
  // Admin never sees the lock screen – always has full access
  if (isAdmin) {
    ov.classList.remove('show');
    return;
  }
  if (data.isClosedDay) {
    ov.classList.add('show');
    document.getElementById('locked-msg').textContent = 'Los sorteos de hoy terminaron. Vuelve mañana a las 11:00 AM.';
  } else if (data.isLocked) {
    ov.classList.add('show');
    document.getElementById('locked-msg').textContent = 'La selección está suspendida durante el sorteo. Se habilitará 5 minutos después.';
  } else {
    ov.classList.remove('show');
  }
}

// ── GRID ───────────────────────────────────────────────────────────────────────
function buildGrid() {
  const g = document.getElementById('number-grid');
  g.innerHTML = '';
  for (let i = 0; i < 100; i++) {
    const b = document.createElement('button');
    b.className = 'num-btn'; b.id = `num-${i}`;
    b.textContent = pad(i);
    b.onclick = () => toggleNumber(i);
    g.appendChild(b);
  }
}

function updateGrid() {
  for (let i = 0; i < 100; i++) {
    const b = document.getElementById(`num-${i}`); if (!b) continue;
    const used = numbersStatus[i] || 0;
    const full = used >= 300;
    const selNormal = selectedNums.hasOwnProperty(i);
    const selFree   = freeNum === i;
    b.disabled = (isLocked && !isAdmin) || (full && !selNormal && !selFree);
    b.className = 'num-btn' +
      (selFree   ? ' free-sel' :
       selNormal ? ' selected'  :
       full      ? ' full'       : '');
    b.title = full ? `N° ${i} – Sin cupo` : `N° ${i} – Cupo: ${300 - used}`;
  }
}

function toggleNumber(num) {
  if (isLocked && !isAdmin) { showToast('Selección bloqueada durante el sorteo'); return; }
  if (freeMode) {
    freeNum = freeNum === num ? null : num;
    showToast(freeNum === num ? `N° ${pad(num)} – jugada gratis` : `N° ${pad(num)} eliminado`);
    updateGrid(); renderList(); updateTotal(); return;
  }
  if ((numbersStatus[num]||0) >= 300) { showToast(`El número ${pad(num)} ya no tiene cupo`); return; }
  if (selectedNums.hasOwnProperty(num)) {
    delete selectedNums[num]; showToast(`N° ${pad(num)} eliminado`);
  } else {
    selectedNums[num] = 5; showToast(`N° ${pad(num)} seleccionado`);
  }
  updateGrid(); renderList(); updateTotal();
}

function toggleFreeMode() {
  if (freePlayUsed || !freePlayEnabled) return;
  const chk = document.getElementById('free-chk');
  freeMode = !freeMode; chk.checked = freeMode;
  if (!freeMode) { freeNum = null; }
  showToast(freeMode ? 'Modo gratis activado – elige 1 número' : 'Modo gratis desactivado');
  updateGrid(); renderList(); updateTotal();
}

// ── SELECTED LIST ──────────────────────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('selected-list');
  const normalNums = Object.keys(selectedNums);
  if (!normalNums.length && freeNum === null) {
    list.innerHTML = '<div class="empty-state"><span>👆</span>Selecciona números en la grilla</div>';
    return;
  }
  list.innerHTML = '';
  normalNums.forEach(n => {
    const num = Number(n), cant = selectedNums[num], prize = cant*70;
    const used = numbersStatus[num] || 0;
    const maxAvail = Math.min(300 - used + cant, 300);
    let opts = '';
    for (let v = 5; v <= maxAvail; v += 5)
      opts += `<option value="${v}" ${v===cant?'selected':''}>L. ${v}</option>`;
    const d = document.createElement('div');
    d.className = 'sel-item'; d.id = `item-${num}`;
    d.innerHTML = `
      <div class="sel-num">${pad(num)}</div>
      <div class="sel-info"><p>Premio posible</p><div class="sel-prize" id="prize-${num}">L. ${prize.toFixed(2)}</div></div>
      <div class="sel-controls"><label>Monto:</label><select onchange="changeAmount(${num},this.value)">${opts}</select></div>
      <button class="btn-rm" onclick="toggleNumber(${num})"><i class="fa fa-trash"></i></button>`;
    list.appendChild(d);
  });
  if (freeNum !== null) {
    const prize = freeAmount * 70;
    let opts = '';
    for (let v = 5; v <= 10; v += 5) opts += `<option value="${v}" ${v===freeAmount?'selected':''}>L. ${v}</option>`;
    const d = document.createElement('div');
    d.className = 'sel-item gratis';
    d.innerHTML = `
      <div class="sel-num gratis">${pad(freeNum)}</div>
      <div class="sel-info"><p>Premio posible</p><div class="sel-prize" id="prize-free">L. ${prize.toFixed(2)}</div><div class="gbadge">GRATIS</div></div>
      <div class="sel-controls"><label>Monto:</label><select onchange="changeFreeAmount(this.value)">${opts}</select></div>
      <button class="btn-rm" onclick="removeFreeNum()"><i class="fa fa-trash"></i></button>`;
    list.appendChild(d);
  }
}

function changeAmount(num, val) {
  selectedNums[num] = Number(val);
  const p = document.getElementById(`prize-${num}`);
  if (p) p.textContent = `L. ${(selectedNums[num]*70).toFixed(2)}`;
  updateTotal();
}
function changeFreeAmount(val) {
  freeAmount = Number(val);
  const p = document.getElementById('prize-free');
  if (p) p.textContent = `L. ${(freeAmount*70).toFixed(2)}`;
  updateTotal();
}
function removeFreeNum() { freeNum = null; updateGrid(); renderList(); updateTotal(); }

function updateTotal() {
  const n = Object.values(selectedNums).reduce((s,v)=>s+v,0);
  const f = freeNum !== null ? freeAmount : 0;
  document.getElementById('total-disp').textContent = `L. ${(n+f).toFixed(2)}`;
}

// ── CONFIRM MODAL ──────────────────────────────────────────────────────────────
function openConfirmModal() {
  if (isLocked && !isAdmin) { showToast('El sorteo está bloqueado temporalmente'); return; }
  if (!Object.keys(selectedNums).length && freeNum === null) { showToast('Selecciona al menos un número'); return; }
  const s     = currentSorteo;
  const total = Object.values(selectedNums).reduce((a,b)=>a+b,0) + (freeNum!==null?freeAmount:0);
  let numsHtml = '';
  Object.entries(selectedNums).forEach(([n,c]) => {
    numsHtml += `<div class="chip"><strong>${pad(Number(n))}</strong>  L.${c} → <span class="prize">L.${(c*70).toFixed(2)}</span></div>`;
  });
  if (freeNum !== null) {
    numsHtml += `<div class="chip" style="border-color:rgba(46,204,112,.3)"><strong style="color:var(--vg)">${pad(freeNum)}</strong>  L.${freeAmount} → <span class="prize">L.${(freeAmount*70).toFixed(2)}</span> <span style="color:var(--vg);font-size:10px">[GRATIS]</span></div>`;
  }
  document.getElementById('modal-bd').innerHTML = `
    <div class="srow"><span>Sorteo</span><span>#${s.numero_sorteo}</span></div>
    <div class="srow"><span>Fecha</span><span>${formatDateHN(s.fecha)}</span></div>
    <div class="srow"><span>Hora</span><span>${formatTimeHN(s.hora_sorteo)}</span></div>
    <div class="srow"><span>Usuario</span><span>${fullName}</span></div>
    <div class="srow"><span>Total apostado</span><span style="color:var(--am);font-weight:700">L. ${total.toFixed(2)}</span></div>
    <div style="margin:12px 0 6px;font-size:12px;color:var(--gr)">Números seleccionados</div>
    <div class="chips">${numsHtml}</div>
    <div style="margin-top:14px;padding:11px 13px;background:rgba(240,196,0,.07);border:1px solid rgba(240,196,0,.18);border-radius:10px;font-size:12px;color:rgba(240,240,240,.7);line-height:1.6">
      Al confirmar se generará tu ticket. Recuerda que debes enviar tu comprobante de pago por WhatsApp para activar tu participación.
    </div>`;
  document.getElementById('confirm-modal').classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'confirm-modal') {
    document.getElementById('btn-send').disabled = false;
    document.getElementById('btn-send').innerHTML = '<i class="fa fa-check"></i> Confirmar';
  }
}

// ── SUBMIT TICKET ──────────────────────────────────────────────────────────────
async function apiPost(payload) {
  const r = await fetch('/api/ticket', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Error del servidor');
  return d;
}

async function submitTicket() {
  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Guardando...';
  const hasNormal = Object.keys(selectedNums).length > 0;
  const hasFree   = freeNum !== null;

  try {
    if (hasNormal) {
      const d = await apiPost({
        sorteo_id: currentSorteo.id,
        numeros: Object.entries(selectedNums).map(([n,c]) => ({ numero: Number(n), cantidad: Number(c) })),
        es_gratis: false
      });
      lastTicketInfo = d.ticketInfo;
    }
    if (hasFree) {
      const d = await apiPost({
        sorteo_id: currentSorteo.id,
        numeros: [{ numero: freeNum, cantidad: freeAmount }],
        es_gratis: true
      });
      if (!lastTicketInfo) lastTicketInfo = d.ticketInfo;
      else {
        lastTicketInfo.numeros.push(...d.ticketInfo.numeros.map(x => ({ ...x, esGratis: true })));
        lastTicketInfo.totalApuesta += d.ticketInfo.totalApuesta;
      }
    }
    closeModal('confirm-modal');
    buildTicketImage(lastTicketInfo);
    document.getElementById('btn-wa-send').onclick = () => sendToWhatsApp(lastTicketInfo);
    document.getElementById('success-modal').classList.add('open');
    selectedNums = {}; freeNum = null; freeMode = false;
    if (document.getElementById('free-chk')) document.getElementById('free-chk').checked = false;
    renderList(); updateTotal(); fetchDrawState();
  } catch(e) {
    console.error(e);
    showToast('Error de conexión. Intenta nuevamente.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Confirmar';
  }
}

// ── TICKET IMAGE ───────────────────────────────────────────────────────────────
function buildTicketImage(info) {
  const canvas  = document.getElementById('ticket-canvas');
  const numeros = info.numeros || [];
  const rowH    = 30;
  const H       = 430 + numeros.length * rowH;
  canvas.width  = 560; canvas.height = H;
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = '#091f11'; ctx.fillRect(0,0,560,H);
  const hg = ctx.createLinearGradient(0,0,560,0);
  hg.addColorStop(0,'#1a6b3a'); hg.addColorStop(1,'#0f4a28');
  ctx.fillStyle = hg; ctx.fillRect(0,0,560,108);
  ctx.fillStyle = '#f0c400'; ctx.fillRect(0,0,560,5);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0c400'; ctx.font = 'bold 30px Montserrat,Arial'; ctx.fillText('RIFON', 280, 46);
  ctx.fillStyle = 'rgba(240,240,240,.7)'; ctx.font = '12px Inter,Arial'; ctx.fillText('Pagos al instante', 280, 66);
  ctx.fillStyle = 'rgba(240,240,240,.5)'; ctx.font = '11px Inter,Arial'; ctx.fillText('Ticket de Participacion', 280, 88);

  // WARNING notice inside ticket
  ctx.fillStyle = 'rgba(240,196,0,.12)'; roundRect(ctx,20,115,520,44,8); ctx.fill();
  ctx.strokeStyle = 'rgba(240,196,0,.3)'; ctx.lineWidth=1; roundRect(ctx,20,115,520,44,8); ctx.stroke();
  ctx.fillStyle = '#f0c400'; ctx.font = 'bold 11px Inter,Arial'; ctx.textAlign='center';
  ctx.fillText('AVISO: Este ticket NO confirma tu participacion.', 280, 132);
  ctx.fillStyle = 'rgba(240,240,240,.6)'; ctx.font = '10px Inter,Arial';
  ctx.fillText('Envia comprobante de pago por WhatsApp al +504 9441-1539 para activar tu jugada.', 280, 150);

  ctx.fillStyle = '#0d3320'; roundRect(ctx,20,168,520,H-190,12); ctx.fill();
  ctx.strokeStyle = 'rgba(240,196,0,.25)'; ctx.lineWidth=1; roundRect(ctx,20,168,520,H-190,12); ctx.stroke();

  const rows = [
    ['Numero de Ticket', `#${info.ticketId}`],
    ['Numero de Sorteo', `#${info.sorteo}`],
    ['Fecha del Sorteo', formatDateHN(info.fecha)],
    ['Hora del Sorteo',  formatTimeHN(info.hora)],
    ['Usuario',          info.nombreCompleto || info.usuario]
  ];
  let y = 200;
  ctx.textAlign = 'left';
  rows.forEach(([lb,val],i) => {
    if (i%2===0) { ctx.fillStyle='rgba(255,255,255,.03)'; ctx.fillRect(30,y-17,500,27); }
    ctx.fillStyle='#8a9a8f'; ctx.font='11px Inter,Arial'; ctx.fillText(lb,42,y);
    ctx.fillStyle='#f0f0f0'; ctx.font='600 13px Inter,Arial'; ctx.fillText(String(val),230,y);
    y += 29;
  });

  y += 6;
  ctx.strokeStyle='rgba(240,196,0,.2)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(42,y); ctx.lineTo(518,y); ctx.stroke();
  y += 15;
  ctx.fillStyle='#f0c400'; ctx.font='bold 12px Montserrat,Arial';
  ctx.fillText('Num',42,y); ctx.fillText('Monto',110,y); ctx.fillText('Premio posible',210,y); ctx.fillText('Tipo',400,y);
  y += 5;
  ctx.strokeStyle='rgba(240,196,0,.13)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(42,y); ctx.lineTo(518,y); ctx.stroke();
  y += 16;

  numeros.forEach((item,i) => {
    if (i%2===0) { ctx.fillStyle='rgba(255,255,255,.03)'; ctx.fillRect(30,y-15,500,25); }
    ctx.fillStyle = item.esGratis ? '#2ecc70' : '#f0c400';
    ctx.beginPath(); ctx.arc(56,y-4,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#0f4a28'; ctx.font='bold 12px Montserrat,Arial'; ctx.textAlign='center';
    ctx.fillText(pad(item.numero),56,y);
    ctx.textAlign='left';
    ctx.fillStyle='#f0f0f0'; ctx.font='600 12px Inter,Arial';
    ctx.fillText(`L. ${item.cantidad}`,110,y);
    ctx.fillStyle='#2ecc70'; ctx.font='bold 12px Inter,Arial';
    ctx.fillText(`L. ${item.premio.toFixed(2)}`,210,y);
    ctx.fillStyle = item.esGratis ? '#2ecc70' : '#f0c400';
    ctx.font='10px Montserrat,Arial';
    ctx.fillText(item.esGratis?'GRATIS':'PAGO',400,y);
    y += rowH;
  });

  y += 6;
  ctx.strokeStyle='rgba(240,196,0,.2)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(42,y); ctx.lineTo(518,y); ctx.stroke();
  y += 18;
  ctx.fillStyle='#8a9a8f'; ctx.font='11px Inter,Arial'; ctx.textAlign='left'; ctx.fillText('Total apostado:',42,y);
  ctx.fillStyle='#f0c400'; ctx.font='bold 14px Montserrat,Arial'; ctx.fillText(`L. ${info.totalApuesta.toFixed(2)}`,200,y);

  ctx.fillStyle='#f0c400'; ctx.fillRect(0,H-5,560,5);
  ctx.fillStyle='rgba(240,240,240,.3)'; ctx.font='10px Inter,Arial'; ctx.textAlign='center';
  ctx.fillText('RIFON – Pagos al instante  |  +504 9441-1539', 280, H-15);

  document.getElementById('ticket-img').src = canvas.toDataURL('image/png');
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

function downloadTicket() {
  const canvas = document.getElementById('ticket-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `rifon-ticket-${lastTicketInfo?.ticketId||'0'}.png`;
  a.click();
}

// ── WHATSAPP ───────────────────────────────────────────────────────────────────
async function sendToWhatsApp(info) {
  const numLines = info.numeros.map(i =>
    `Numero: ${pad(i.numero)} | Monto: L.${i.cantidad} | Premio: L.${i.premio.toFixed(2)}${i.esGratis?' (GRATIS)':''}`
  ).join('\n');

  const msg =
`RIFON - Pagos al instante

Ticket: #${info.ticketId}
Sorteo: #${info.sorteo}
Fecha: ${formatDateHN(info.fecha)}
Hora: ${formatTimeHN(info.hora)}
Usuario: ${info.nombreCompleto || info.usuario}

Selecciones:
${numLines}

Total apostado: L.${info.totalApuesta.toFixed(2)}

PENDIENTE: Adjunto comprobante de pago para confirmar participacion.`;

  const waURL = `https://wa.me/50494411539?text=${encodeURIComponent(msg)}`;
  const canvas = document.getElementById('ticket-canvas');
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Build ticket file from canvas
  let ticketFile = null;
  if (canvas) {
    try {
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      ticketFile = new File([blob], `rifon-ticket-${info.ticketId}.png`, { type: 'image/png' });
    } catch(e) {}
  }

  // Mobile: try Web Share API
  if (isMobile && navigator.share) {
    const shareData = { title:'RIFON – Ticket', text: msg };
    if (ticketFile && navigator.canShare && navigator.canShare({ files:[ticketFile] })) {
      shareData.files = [ticketFile];
    }
    try { await navigator.share(shareData); return; } catch(e) { if (e.name==='AbortError') return; }
  }

  // Desktop: download ticket then open WA
  if (ticketFile) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(ticketFile); a.download = ticketFile.name; a.click();
    URL.revokeObjectURL(a.href);
  }
  setTimeout(() => {
    showDesktopInstructions(waURL);
  }, 500);
}

function showDesktopInstructions(waURL) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(7px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  ov.innerHTML = `
    <div style="background:#0a2614;border:1px solid rgba(240,196,0,.22);border-radius:20px;max-width:420px;width:100%;padding:26px;text-align:center;font-family:Inter,sans-serif;">
      <div style="font-size:44px;margin-bottom:12px">📎</div>
      <h2 style="font-family:Montserrat,sans-serif;font-size:17px;font-weight:800;color:#f0c400;margin-bottom:10px">Ticket descargado</h2>
      <p style="font-size:13px;color:rgba(240,240,240,.7);line-height:1.7;margin-bottom:18px">
        Tu ticket se descargó automáticamente.<br>
        WhatsApp se abrirá con el mensaje listo.<br>
        <strong style="color:#f0c400">Adjunta el ticket descargado y tu comprobante de pago en el chat antes de enviar.</strong>
      </p>
      <button onclick="window.open('${waURL}','_blank');this.closest('div').parentElement.remove();"
        style="width:100%;padding:14px;background:#25d366;color:#fff;font-weight:800;font-size:14px;font-family:Montserrat,sans-serif;border:none;border-radius:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:18px">💬</span> Abrir WhatsApp
      </button>
      <button onclick="this.closest('div').parentElement.remove()"
        style="width:100%;padding:11px;background:transparent;border:1px solid rgba(255,255,255,.15);color:rgba(240,240,240,.6);border-radius:10px;cursor:pointer;font-size:13px;">
        Cancelar
      </button>
    </div>`;
  ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2,'0'); }

function formatDateHN(val) {
  if (!val) return 'Sin fecha';
  const str   = String(val).split('T')[0];
  const parts = str.split('-');
  if (parts.length!==3) return str;
  const y=Number(parts[0]),m=Number(parts[1]),d=Number(parts[2]);
  if (isNaN(y)||isNaN(m)||isNaN(d)) return str;
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const days  =['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const dt = new Date(y,m-1,d);
  return `${days[dt.getDay()]} ${d} de ${months[m-1]} de ${y}`;
}

function formatTimeHN(val) {
  if (!val) return '';
  const p=String(val).split(':'), h=Number(p[0]), min=p[1]||'00';
  return `${h>12?h-12:h===0?12:h}:${min} ${h>=12?'PM':'AM'}`;
}

function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}
