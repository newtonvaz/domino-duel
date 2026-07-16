/* ---------- API (MySQL) ---------- */
const API_URL = window.location.protocol.startsWith('http') ? 'api/index.php' : 'https://dominoduelpro.freedev.app/api/index.php';
const STORAGE_KEY = 'duelo_domino_data_v1';
let data = {players:[], matches:[], settings:{}};

async function api(method, body){
  try{
    const res = await fetch(`${API_URL}?action=${method}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined
    });
    return await res.json();
  }catch(e){
    console.warn('API error:', e);
    return null;
  }
}

function loadLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) data = JSON.parse(raw);
  }catch(e){}
  if(!data.settings) data.settings = {};
}

function saveLocal(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){}
}

const SYNC_FLAG_KEY = 'duelo_sync_needed';
function markSyncNeeded() { localStorage.setItem(SYNC_FLAG_KEY, '1'); updateSyncUI(); }
function clearSyncNeeded() { localStorage.removeItem(SYNC_FLAG_KEY); updateSyncUI(); }
function isSyncNeeded() { return localStorage.getItem(SYNC_FLAG_KEY) === '1'; }
function updateSyncUI() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (isSyncNeeded()) {
    el.textContent = ' ⏳ Pendente';
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

async function saveData(){
  try {
    saveLocal();
    const playersRes = await api('savePlayers', {players: data.players.filter(p => p.id)});
    const matchesRes = await api('saveMatches', {matches: data.matches.filter(m => m.id)});
    
    if (playersRes?.success !== false && matchesRes?.success !== false) {
      await api('saveBackup', {players: data.players, matches: data.matches});
      clearSyncNeeded();
      return true;
    } else {
      markSyncNeeded();
      return false;
    }
  } catch (e) {
    markSyncNeeded();
    return false;
  }
}

async function retrySync(){
  if (!isSyncNeeded()) return;
  const playersRes = await api('savePlayers', {players: data.players.filter(p => p.id)});
  const matchesRes = await api('saveMatches', {matches: data.matches.filter(m => m.id)});
  if (playersRes && playersRes.ok && matchesRes && matchesRes.ok) {
    api('saveBackup', {players: data.players, matches: data.matches});
    clearSyncNeeded();
  }
}

async function deleteMatchServer(id){
  data.matches = data.matches.filter(m => m.id !== id);
  await saveData();
  renderHistory();
}

async function deletePlayerServer(id){
  if(!user || user.role !== 'admin') return;
  if(!confirm('Remover este jogador? O hist\u00f3rico de partidas ser\u00e1 mantido.')) return;
  data.players = data.players.filter(p=>p.id!==id);
  await saveData();
  renderPlayers();
}

let user = null;
let matchState = null;
let pendingPhoto = null;
let editingPlayerId = null;
let rankingPeriod = 'week';
let periodOffset = 0;
let pollTimer = null;

/* ---------- HELPERS ---------- */
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
function escapeHtml(str){
  return String(str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function hashHue(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = str.charCodeAt(i) + ((h<<5)-h); }
  return Math.abs(h) % 360;
}
function playerById(id){ return data.players.find(p=>p.id===id); }
function playerName(id){ const p = playerById(id); return p ? p.name : 'Jogador removido'; }
function avatarHTML(player, size){
  size = size || 44;
  if(player && player.photo){
    return `<img class="avatar" style="width:${size}px;height:${size}px" src="${player.photo}" alt="${escapeHtml(player.name)}">`;
  }
  const name = (player && player.name) || '?';
  const hue = hashHue(name);
  const initials = name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<div class="avatar avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px;background:hsl(${hue} 55% 28%);color:hsl(${hue} 70% 82%)">${initials}</div>`;
}
function pipsHTML(n, small){
  const map = {0:[],1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
  const active = new Set(map[n] || []);
  let cells = '';
  for(let i=1;i<=9;i++){ cells += `<span class="pip-cell ${active.has(i)?'on':''}"></span>`; }
  return `<div class="pip-grid${small?' small':''}">${cells}</div>`;
}
function fmtDate(iso){
  if(!iso) return '--';
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('pt-BR');
}
function fmtDuration(sec){
  if(!sec && sec !== 0) return '--';
  const m = Math.floor(sec/60), s = sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/* ---------- LOGO ---------- */
document.getElementById('logoTile').innerHTML =
  Array.from({length:9},(_,i)=>`<span style="background:${[1,3,4,6,7,9].includes(i+1)?'#1a1f2b':'transparent'}"></span>`).join('');

/* ---------- PASSWORD TOGGLE ---------- */
function togglePw(btn){
  const wrap = btn.closest('.pw-wrap');
  const inp = wrap.querySelector('input');
  const svg = btn.querySelector('svg');
  if(inp.type==='password'){
    inp.type='text';
    svg.innerHTML='<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>';
  } else {
    inp.type='password';
    svg.innerHTML='<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>';
  }
}

/* ---------- NAV ---------- */
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>showView(btn.dataset.view));
});
function showView(id){
  if(id==='match' && !user) return;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
  if(id==='home') renderHome();
  if(id==='players') renderPlayers();
  if(id==='match') renderMatchSetup();
  if(id==='history'){ updateHistoryTabs(); renderHistory(); }
  if(id==='ranking') renderRanking();
}

/* ---------- ADMIN (API) ---------- */
function checkSession(){
  const raw = localStorage.getItem('duelo_user');
  if(raw) user = JSON.parse(raw);
  else user = null;
  updateAuthUI();
}

function updateAuthUI(){
  document.body.classList.remove('is-admin', 'is-user');
  if(user){
    document.body.classList.add('is-' + user.role);
  }
  document.getElementById('adminBtnLabel').textContent = user ? 'Sair' : 'Login';
  document.getElementById('adminToggleBtn').firstChild.textContent = user ? '\u{1F513} ' : '\u{1F512} ';
}

document.getElementById('adminToggleBtn').addEventListener('click', ()=>{
  if(user){
    logout();
  } else {
    openAdminModal();
  }
});

function openAdminModal(){
  document.getElementById('adminError').textContent = '';
  document.getElementById('adminRegError').textContent = '';
  document.getElementById('adminEmailInput').value = '';
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('adminRegEmailInput').value = '';
  document.getElementById('adminRegPasswordInput').value = '';
  document.getElementById('adminRegConfirmInput').value = '';
  document.getElementById('logoutBtn').style.display = 'none';
  if(user){
    document.getElementById('adminModalTitle').textContent = user.email;
    document.getElementById('adminModalSub').textContent = '';
    document.getElementById('adminLoginForm').style.display = 'none';
    document.getElementById('adminRegisterForm').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
  } else {
    showAdminLogin();
  }
  document.getElementById('adminModalOverlay').classList.add('open');
  if(!user) setTimeout(()=>document.getElementById('adminEmailInput').focus(), 50);
}
function closeAdminModal(){
  document.getElementById('adminModalOverlay').classList.remove('open');
  document.getElementById('logoutBtn').style.display = 'none';
  showAdminLogin();
}

function showAdminLogin(){
  document.getElementById('adminLoginForm').style.display = 'block';
  document.getElementById('adminRegisterForm').style.display = 'none';
  document.getElementById('adminModalTitle').textContent = 'Login do Usu\u00e1rio';
  document.getElementById('adminModalSub').textContent = 'Entre com o seu e-mail e senha ou crie uma conta.';
  document.getElementById('adminError').textContent = '';
}
function showAdminRegister(){
  document.getElementById('adminLoginForm').style.display = 'none';
  document.getElementById('adminRegisterForm').style.display = 'block';
  document.getElementById('adminModalTitle').textContent = 'Criar Conta Admin';
  document.getElementById('adminModalSub').textContent = 'Crie seu acesso de administrador.';
  document.getElementById('adminRegError').textContent = '';
}

async function submitLogin(){
  const email = document.getElementById('adminEmailInput').value.trim();
  const pass = document.getElementById('adminPasswordInput').value;
  const err = document.getElementById('adminError');
  if(!email || !pass){ err.textContent = 'Preencha e-mail e senha.'; return; }
  const creds = JSON.parse(localStorage.getItem('duelo_credentials') || '{}');
  if(creds.email === email && creds.password === pass){
    user = {email: creds.email, role: creds.role};
    localStorage.setItem('duelo_user', JSON.stringify(user));
    updateAuthUI();
    closeAdminModal();
    renderPlayers();
    startPolling();
    if(user.role === 'admin') renderPendingUsers();
    return;
  }
  const res = await api('login', {email, password: pass});
  if(res && res.ok){
    user = {email: res.email, role: res.role};
    localStorage.setItem('duelo_user', JSON.stringify(user));
    localStorage.setItem('duelo_credentials', JSON.stringify({email, password: pass, role: res.role}));
    updateAuthUI();
    closeAdminModal();
    renderPlayers();
    startPolling();
    if(res.role === 'admin'){
      renderPendingUsers();
    }
  } else {
    err.textContent = (res && res.error) || 'E-mail ou senha incorretos.';
    shakeElement(document.getElementById('adminModalOverlay').querySelector('.modal-box'));
  }
}

async function submitRegister(){
  const email = document.getElementById('adminRegEmailInput').value.trim();
  const pass = document.getElementById('adminRegPasswordInput').value;
  const confirm = document.getElementById('adminRegConfirmInput').value;
  const err = document.getElementById('adminRegError');
  if(!email || !pass || !confirm){ err.textContent = 'Preencha todos os campos.'; return; }
  if(!email.includes('@')){ err.textContent = 'Informe um e-mail v\u00e1lido.'; return; }
  if(pass.length < 4){ err.textContent = 'Senha deve ter ao menos 4 caracteres.'; return; }
  if(pass !== confirm){ err.textContent = 'Senhas n\u00e3o conferem.'; return; }
  const res = await api('register', {email, password: pass});
  if(res && res.ok){
    if(res.role === 'admin'){
      user = {email: res.email, role: 'admin'};
      localStorage.setItem('duelo_user', JSON.stringify(user));
      updateAuthUI();
      closeAdminModal();
      renderPlayers();
      startPolling();
    } else {
      err.textContent = 'Conta criada! Aguarde aprova\u00e7\u00e3o do admin.';
      err.style.color = 'var(--green)';
    }
  } else {
    err.textContent = (res && res.error) || 'Erro ao criar conta.';
  }
}

function shakeElement(el){
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}

async function approveUser(id){
  await api('approveUser', {id});
  renderPendingUsers();
}

async function rejectUser(id){
  await api('rejectUser', {id});
  renderPendingUsers();
}

function logout(){
  stopPolling();
  user = null;
  localStorage.removeItem('duelo_user');
  try { closeAdminModal(); } catch(e) {}
  location.reload();
}

async function refreshFromServer(){
  const [playersRemote, matchesRemote, settingsRemote] = await Promise.all([
    api('listPlayers'), api('listMatches'), api('listSettings')
  ]);
  if(playersRemote && Array.isArray(playersRemote)){
    data.players = playersRemote.map(p => ({id:p.id, name:p.name, photo:p.photo}));
  }
  if(matchesRemote && Array.isArray(matchesRemote)){
    data.matches = matchesRemote.map(m => ({
      id: m.id, date: m.date,
      teamA: m.team_a || m.teamA,
      teamB: m.team_b || m.teamB,
      scoreA: m.score_a ?? m.scoreA,
      scoreB: m.score_b ?? m.scoreB,
      winner: m.winner,
      buchuda: m.buchuda,
      buchudaDeRe: m.buchuda_de_re ?? m.buchudaDeRe,
      durationSec: m.duration_sec ?? m.durationSec
    }));
  }
  if(settingsRemote && settingsRemote.modo_buchuda !== undefined){
    modoBuchuda = settingsRemote.modo_buchuda;
    localStorage.setItem('modo_buchuda', modoBuchuda ? '1' : '0');
    updateBuchudaUI();
    updateHistoryTabs();
  }
  const activeView = document.querySelector('.view.active');
  if(activeView){
    switch(activeView.id.replace('view-','')){
      case 'home': renderHome(); break;
      case 'players': renderPlayers(); break;
      case 'history': renderHistory(); break;
      case 'ranking': renderRanking(); break;
    }
  }
}

function startPolling(){
  stopPolling();
  pollTimer = setInterval(async () => {
    await refreshFromServer();
    renderPendingUsers();
    if (isSyncNeeded()) retrySync();
  }, 5000);
}

function stopPolling(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
}

/* ---------- HOME ---------- */
function renderHome(){
  document.getElementById('homeTotalMatches').textContent = data.matches.length;
  document.getElementById('statPlayers').textContent = data.players.length;
  document.getElementById('statBuchudas').textContent = data.matches.filter(m=>m.buchuda).length;
  document.getElementById('statRe').textContent = data.matches.filter(m=>m.buchudaDeRe).length;

  const wrap = document.getElementById('recentMatchesCard');
  const recent = [...data.matches].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  if(recent.length===0){
    wrap.innerHTML = `<div class="empty-state" style="padding:16px 6px;"><p>Nenhuma partida registrada ainda.</p></div>`;
    return;
  }
  wrap.innerHTML = recent.map(m=>{
    const teamAName = `${playerName(m.teamA[0])} &amp; ${playerName(m.teamA[1])}`;
    const teamBName = `${playerName(m.teamB[0])} &amp; ${playerName(m.teamB[1])}`;
    return `<div class="recent-item">
      <span class="teams">${m.winner==='A'?'\u{0001f451} ':''}${teamAName} <span style="color:var(--text-muted)">vs</span> ${m.winner==='B'?'\u{0001f451} ':''}${teamBName}</span>
      <span class="score">${m.scoreA}x${m.scoreB}</span>
    </div>`;
  }).join('');
  renderPendingUsers();
}

function renderPendingUsers(){
  const sec = document.getElementById('pendingSection');
  const list = document.getElementById('pendingUsersList');
  if(!sec || !list) return;
  if(!user || user.role !== 'admin'){
    sec.style.display = 'none';
    return;
  }
  api('listUsers').then(res => {
    if(!Array.isArray(res)) return;
    const pending = res.filter(u => u.status === 'pending');
    if(pending.length === 0){
      sec.style.display = 'none';
      return;
    }
    sec.style.display = 'block';
    list.innerHTML = pending.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);">
        <span>${escapeHtml(u.email)}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" style="padding:6px 14px;font-size:13px;" onclick="approveUser('${u.id}')">\u2713</button>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:13px;" onclick="rejectUser('${u.id}')">\u2717</button>
        </div>
      </div>
    `).join('');
  });
}

/* ---------- PLAYERS ---------- */
function renderPlayers(){
  const list = document.getElementById('playersList');
  if(data.players.length===0){
    list.innerHTML = `<div class="empty-state">
      <div class="big-emoji">\u{0001f0a0}</div>
      <p>Nenhum jogador cadastrado.${user?' Adicione o primeiro jogador para come\u00e7ar.':' Pe\u00e7a ao admin para cadastrar os jogadores.'}</p>
      <button class="btn btn-primary role-hidden" style="width:auto;padding:12px 20px;display:inline-flex;" onclick="openPlayerModal()">+ Adicionar Jogador</button>
    </div>`;
    return;
  }
  list.innerHTML = data.players.map(p=>`
    <div class="player-card">
      ${avatarHTML(p,46)}
      <div class="player-info">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">Jogador</div>
      </div>
      <div class="player-actions flex">
        <button class="icon-btn role-hidden" onclick="openPlayerModal('${p.id}')" title="Editar">\u270e</button>
        <button class="icon-btn admin-only" onclick="deletePlayer('${p.id}')" title="Remover">\u{0001f5d1}</button>
      </div>
    </div>
  `).join('');
}

function openPlayerModal(id){
  if(!user) return;
  editingPlayerId = id || null;
  pendingPhoto = null;
  document.getElementById('playerFormError').textContent = '';
  document.getElementById('photoInput').value = '';
  if(id){
    const p = playerById(id);
    document.getElementById('playerModalTitle').textContent = 'Editar Jogador';
    document.getElementById('playerName').value = p.name || '';
    pendingPhoto = p.photo || null;
    document.getElementById('photoPreview').innerHTML = p.photo ? `<img src="${p.photo}">` : '\u{0001f4f7}';
  } else {
    document.getElementById('playerModalTitle').textContent = 'Novo Jogador';
    document.getElementById('playerName').value = '';
    document.getElementById('photoPreview').innerHTML = '\u{0001f4f7}';
  }
  document.getElementById('playerModalOverlay').classList.add('open');
}
function closePlayerModal(){ document.getElementById('playerModalOverlay').classList.remove('open'); }

document.getElementById('photoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const img = new Image();
    img.onload = ()=>{
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size/img.width, size/img.height);
      const w = img.width*scale, h = img.height*scale;
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      pendingPhoto = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('photoPreview').innerHTML = `<img src="${pendingPhoto}">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

async function savePlayer(){
  if(!user) return;
  const name = document.getElementById('playerName').value.trim();
  if(!name){ document.getElementById('playerFormError').textContent = 'Informe o nome do jogador.'; return; }
  if(data.players.some(p => p.id !== editingPlayerId && p.name.toLowerCase() === name.toLowerCase())){
    document.getElementById('playerFormError').textContent = 'Este jogador j\u00e1 existe.';
    return;
  }
  const btn = document.querySelector('#playerModalOverlay .btn-primary');
  btn.disabled = true; btn.textContent = 'Salvando...';
  if(editingPlayerId){
    const p = playerById(editingPlayerId);
    p.name = name; p.photo = pendingPhoto;
  } else {
    data.players.push({id:uid('pl'), name, photo: pendingPhoto});
  }
  await saveData();
  closePlayerModal();
  renderPlayers();
}
function deletePlayer(id){
  if(!user || user.role !== 'admin') return;
  deletePlayerServer(id);
}

/* ---------- MATCH SETUP ---------- */
function renderMatchSetup(){
  document.getElementById('matchSetupWrap').style.display = matchState ? 'none' : 'block';
  document.getElementById('liveMatchWrap').style.display = matchState ? 'block' : 'none';
  document.getElementById('matchSetupError').textContent = '';
  if(matchState){ renderLiveMatch(); return; }

  if(data.players.length < 4){
    document.getElementById('matchSetupWrap').innerHTML = `<div class="empty-state">
      <div class="big-emoji">\u{0001f0e2}</div>
      <p>\u00c9 preciso ao menos 4 jogadores cadastrados para iniciar um duelo (2 contra 2).</p>
      <button class="btn btn-secondary" style="width:auto;padding:12px 20px;display:inline-flex;" onclick="showView('players')">Ver Jogadores</button>
    </div>`;
    return;
  }

  const today = new Date().toISOString().slice(0,10);
  const dateInput = document.getElementById('matchDate');
  if(dateInput){
    dateInput.max = today;
    if(!dateInput.value) dateInput.value = today;
  }

  const inputs = ['selA1','selA2','selB1','selB2'];
  inputs.forEach(id => initSearchInput(id));
}

function initSearchInput(id){
  const input = document.getElementById(id);
  if(!input) return;
  const dd = input.parentElement.querySelector('.player-dd');
  if(!dd) return;
  const old = input._ddHandler;
  if(old){ input.removeEventListener('focus', old.onFocus); input.removeEventListener('input', old.onInput); document.removeEventListener('click', old.onDocClick); }

  function showDd(filter){
    dd.innerHTML = data.players
      .filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()))
      .map(p => `<div class="dd-item" data-id="${p.id}">${escapeHtml(p.name)}</div>`)
      .join('');
    dd.classList.toggle('show', dd.children.length > 0);
  }
  function hideDd(){ dd.classList.remove('show'); }

  const onFocus = () => showDd('');
  const onInput = () => { const v = input.value.trim(); showDd(v); };
  const onDocClick = e => { if(!input.parentElement.contains(e.target)) hideDd(); };

  input.addEventListener('focus', onFocus);
  input.addEventListener('input', onInput);
  document.addEventListener('click', onDocClick);
  dd.addEventListener('click', e => {
    const item = e.target.closest('.dd-item');
    if(item){ input.value = item.textContent; hideDd(); input.dispatchEvent(new Event('input')); }
  });
  input._ddHandler = {onFocus, onInput, onDocClick};
}

function resolvePlayer(name){
  const p = data.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
  return p ? p.id : null;
}

function startMatch(){
  if(!user){ document.getElementById('matchSetupError').textContent = 'Fa\u00e7a login para iniciar uma partida.'; return; }
  const raw = ['selA1','selA2','selB1','selB2'].map(id => document.getElementById(id).value);
  const err = document.getElementById('matchSetupError');
  if(raw.some(x=>!x.trim())){ err.textContent = 'Selecione os 4 jogadores.'; return; }
  const ids = raw.map(r => resolvePlayer(r));
  if(ids.some(id => !id)){ err.textContent = 'Jogador n\u00e3o encontrado. Verifique o nome digitado.'; return; }
  if(new Set(ids).size !== 4){ err.textContent = 'Cada jogador s\u00f3 pode aparecer uma vez.'; return; }
  const names = ids.map(id => playerById(id)?.name?.toLowerCase());
  if(names[0] === names[2] || names[0] === names[3] || names[1] === names[2] || names[1] === names[3]){
    err.textContent = 'Jogadores com o mesmo nome n\u00e3o podem estar em duplas opostas.';
    return;
  }
  err.textContent = '';
  const dateInput = document.getElementById('matchDate');
  matchState = {
    teamA:[ids[0],ids[1]], teamB:[ids[2],ids[3]],
    scoreA:0, scoreB:0,
    history:[[0,0]],
    startTime: Date.now(),
    finished:false,
    result:null,
    selectedDate: dateInput ? dateInput.value || new Date().toISOString().slice(0,10) : new Date().toISOString().slice(0,10)
  };
  renderMatchSetup();
}

function renderLiveMatch(){
  const wrap = document.getElementById('liveMatchWrap');
  const teamAName = `${playerName(matchState.teamA[0])} &amp; ${playerName(matchState.teamA[1])}`;
  const teamBName = `${playerName(matchState.teamB[0])} &amp; ${playerName(matchState.teamB[1])}`;

  let resultHTML = '';
  if(matchState.finished){
    const r = matchState.result;
    const winName = r.winner==='A' ? teamAName : teamBName;
    const bActive = matchState._buchuda;
    const reActive = matchState._buchudaDeRe;
    const isShutout = (matchState.scoreA===6 && matchState.scoreB===0) || (matchState.scoreB===6 && matchState.scoreA===0);
    const loserScore = matchState.scoreA===6 ? matchState.scoreB : matchState.scoreA;
    const buchudaDeRePossible = loserScore === 5;
    resultHTML = `
      <div class="result-panel">
        <div class="win-tag">\u{0001f451} ${winName} venceu!</div>
        <div class="badges">
          ${isShutout ? `<span class="badge ${bActive?'buchuda':'toggle-off'}" onclick="toggleResultFlag('buchuda')" style="cursor:pointer;">\u{0001f0e2} Buchuda${bActive?' \u2713':''}</span>` : `<span class="badge toggle-off" style="opacity:.3;">\u{0001f0e2} Buchuda</span>`}
          ${buchudaDeRePossible ? `<span class="badge ${reActive?'re':'toggle-off'}" onclick="toggleResultFlag('buchudaDeRe')" style="cursor:pointer;">\u{0001f0e2} Buchuda de r\u00e9${reActive?' \u2713':''}</span>` : `<span class="badge toggle-off" style="opacity:.3;">\u{0001f0e2} Buchuda de r\u00e9</span>`}
        </div>
        <p class="subtle" style="text-align:center;margin:4px 0 12px;">Clique nos selos acima para marcar/desmarcar</p>
        <div class="btn-row">
          <button class="btn btn-secondary" onclick="discardMatch()">Descartar</button>
          <button class="btn btn-primary" onclick="saveMatch()">Salvar Resultado</button>
        </div>
      </div>`;
  }

  wrap.innerHTML = `
    <div class="placar-overlay">
      <button class="placar-close" onclick="exitPlacarMode()" title="Sair do Modo Placar">&#x2715;</button>
      <div class="live-board">
        <div class="live-team">
          <div class="who"><div class="label">Dupla A</div><div class="names">${teamAName}</div></div>
          <div class="score-editor">
            <button class="score-adj" onclick="adjustScore('A',-1)" ${matchState.scoreA<=0?'disabled':''}>&minus;</button>
            <span class="score-num" id="scoreNumA" onclick="editScore('A')">${matchState.scoreA}</span>
            <button class="score-adj" onclick="adjustScore('A',1)" ${matchState.scoreA>=6?'disabled':''}>+</button>
            ${pipsHTML(matchState.scoreA, true)}
          </div>
        </div>
        <div class="vs-divider">&mdash; &times; &mdash;</div>
        <div class="live-team">
          <div class="who"><div class="label">Dupla B</div><div class="names">${teamBName}</div></div>
          <div class="score-editor">
            <button class="score-adj" onclick="adjustScore('B',-1)" ${matchState.scoreB<=0?'disabled':''}>&minus;</button>
            <span class="score-num" id="scoreNumB" onclick="editScore('B')">${matchState.scoreB}</span>
            <button class="score-adj" onclick="adjustScore('B',1)" ${matchState.scoreB>=6?'disabled':''}>+</button>
            ${pipsHTML(matchState.scoreB, true)}
          </div>
        </div>
      </div>
      ${resultHTML}
    </div>
    <div class="normal-controls">
      <div class="btn-row">
        <button class="btn btn-secondary" onclick="undoPoint()">&#x21ba; Desfazer</button>
        <button class="btn btn-danger" onclick="cancelMatch()">Cancelar Partida</button>
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn btn-placar" onclick="togglePlacarMode()">Modo Placar</button>
      </div>
    </div>
  `;
}

/* ---------- ORIENTATION MANAGER ---------- */
const OrientationMgr = (function(){
  let _placarActive = false;

  function _lockPortrait(){
    if(screen.orientation && screen.orientation.lock){
      screen.orientation.lock('portrait').catch(()=>{});
    }
  }

  function _unlock(){
    if(screen.orientation && screen.orientation.unlock){
      try { screen.orientation.unlock(); } catch(e){}
    }
  }

  function init(){
    // Normal mode starts locked to portrait
    _lockPortrait();
    
    // Re-enforce portrait if the user rotates device while not in placar mode
    if(screen.orientation){
      screen.orientation.addEventListener('change', () => {
        if(!_placarActive) _lockPortrait();
      });
    }
    const mql = window.matchMedia('(orientation: landscape)');
    if(mql.addEventListener){
      mql.addEventListener('change', (e) => {
        if(e.matches && !_placarActive) _lockPortrait();
      });
    }
  }

  function enterPlacar(){
    _placarActive = true;
    document.body.classList.add('placar-mode');
    // Allow user to freely rotate device to landscape for the big scoreboard
    _unlock();
  }

  function exitPlacar(){
    if(!_placarActive) return;
    _placarActive = false;
    document.body.classList.remove('placar-mode');
    // Lock back to portrait when exiting
    _lockPortrait();
  }

  return { init, enterPlacar, exitPlacar };
})();

function togglePlacarMode(){
  if(document.body.classList.contains('placar-mode')){
    OrientationMgr.exitPlacar();
  } else {
    OrientationMgr.enterPlacar();
  }
}

function exitPlacarMode(){
  OrientationMgr.exitPlacar();
}

document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && document.body.classList.contains('placar-mode')) exitPlacarMode();
});

function adjustScore(team, delta){
  if(!user) return;
  if(!matchState) return;
  const key = team==='A' ? 'scoreA' : 'scoreB';
  const newVal = matchState[key] + delta;
  if(newVal < 0 || newVal > 6) return;
  matchState[key] = newVal;
  matchState.history.push([matchState.scoreA, matchState.scoreB]);
  if(matchState.scoreA===6 || matchState.scoreB===6){
    matchState.finished = true;
    matchState.result = computeResult();
  } else {
    matchState.finished = false;
    matchState.result = null;
  }
  renderLiveMatch();
}

function editScore(team){
  if(!user) return;
  if(!matchState) return;
  const key = team==='A' ? 'scoreA' : 'scoreB';
  const current = matchState[key];
  const input = prompt(`Placar da Dupla ${team} (0-6):`, current);
  if(input === null) return;
  const val = parseInt(input, 10);
  if(isNaN(val) || val < 0 || val > 6){ alert('Valor inv\u00e1lido. Digite um n\u00famero de 0 a 6.'); return; }
  matchState[key] = val;
  if(team==='A' && matchState.scoreB===6){
    matchState.finished = true;
    matchState.result = computeResult();
  } else if(team==='B' && matchState.scoreA===6){
    matchState.finished = true;
    matchState.result = computeResult();
  } else if(val===6){
    matchState.finished = true;
    matchState.result = computeResult();
  } else {
    matchState.finished = false;
    matchState.result = null;
  }
  matchState.history.push([matchState.scoreA, matchState.scoreB]);
  renderLiveMatch();
}

function undoPoint(){
  if(!matchState || matchState.history.length<=1) return;
  matchState.history.pop();
  const last = matchState.history[matchState.history.length-1];
  matchState.scoreA = last[0]; matchState.scoreB = last[1];
  if(matchState.scoreA===6 || matchState.scoreB===6){
    matchState.finished = true;
    matchState.result = computeResult();
  } else {
    matchState.finished = false;
    matchState.result = null;
    matchState._buchuda = false; matchState._buchudaDeRe = false; matchState._buchudaAuto = false; matchState._buchudaDeReAuto = false;
  }
  renderLiveMatch();
}
function cancelMatch(){
  if(!confirm('Cancelar esta partida sem salvar?')) return;
  exitPlacarMode();
  matchState = null;
  renderMatchSetup();
}
function discardMatch(){
  if(!user) return;
  exitPlacarMode();
  matchState = null;
  renderMatchSetup();
}
function computeResult(){
  const winner = matchState.scoreA===6 ? 'A' : 'B';
  const loserScore = winner==='A' ? matchState.scoreB : matchState.scoreA;
  const buchuda = loserScore===0;
  let buchudaDeRe = false;
  if(winner==='A' && matchState.scoreB===5){
    buchudaDeRe = matchState.history.some(([a,b])=>a===1 && b===5);
  } else if(winner==='B' && matchState.scoreA===5){
    buchudaDeRe = matchState.history.some(([a,b])=>a===5 && b===1);
  }
  matchState._buchuda = buchuda;
  matchState._buchudaDeRe = buchudaDeRe;
  matchState._buchudaAuto = buchuda;
  matchState._buchudaDeReAuto = buchudaDeRe;
  return {winner, buchuda, buchudaDeRe};
}

function toggleResultFlag(flag){
  if(!user) return;
  if(!matchState || !matchState.finished) return;
  const loserScore = matchState.scoreA===6 ? matchState.scoreB : matchState.scoreA;
  if(flag === 'buchuda' && loserScore !== 0) return;
  if(flag === 'buchudaDeRe' && loserScore !== 5) return;
  if(matchState['_'+flag] && matchState['_'+flag+'Auto']) return;
  matchState['_'+flag] = !matchState['_'+flag];
  renderLiveMatch();
}
async function saveMatch(){
  if(!user) return;
  const r = matchState.result;
  const btn = document.querySelector('#liveMatchWrap .btn-primary');
  btn.disabled = true; btn.textContent = 'Salvando...';
  data.matches.push({
    id: uid('m'),
    date: matchState.selectedDate || new Date().toISOString().slice(0,10),
    teamA: matchState.teamA,
    teamB: matchState.teamB,
    scoreA: matchState.scoreA,
    scoreB: matchState.scoreB,
    winner: r.winner,
    buchuda: !!matchState._buchuda,
    buchudaDeRe: !!matchState._buchudaDeRe,
    durationSec: Math.round((Date.now()-matchState.startTime)/1000)
  });
  await saveData();
  exitPlacarMode();
  matchState = null;
  showView('history');
}

let modoBuchuda = false;

function toggleModoBuchuda(){
  if(!user || user.role !== 'admin') return;
  modoBuchuda = !modoBuchuda;
  localStorage.setItem('modo_buchuda', modoBuchuda ? '1' : '0');
  updateBuchudaUI();
  api('saveSettings', {modo_buchuda: modoBuchuda});
  const activeView = document.querySelector('.view.active');
  if(activeView){
    const id = activeView.id.replace('view-','');
    if(id === 'history'){ updateHistoryTabs(); renderHistory(); }
    if(id === 'ranking') renderRanking();
  }
}

function updateBuchudaUI(){
  const ball = document.getElementById('buchudaBall');
  const banner = document.getElementById('buchudaBanner');
  if(!ball || !banner) return;
  ball.style.background = modoBuchuda ? '#d1495b' : 'var(--text-muted)';
  ball.style.display = '';
  banner.style.display = modoBuchuda ? 'block' : 'none';
}

/* ---------- HISTORY ---------- */
let historyFilter = 'all';

function updateHistoryTabs(){
  const filterBar = document.getElementById('historyFilterBar');
  if(!filterBar) return;
  const allTab = filterBar.querySelector('[data-filter="all"]');
  if(allTab){
    allTab.style.display = modoBuchuda ? 'none' : '';
    if(modoBuchuda && historyFilter === 'all') setHistoryFilter('buchuda');
    if(!modoBuchuda && historyFilter !== 'all') setHistoryFilter('all');
  }
}

function setHistoryFilter(filter){
  historyFilter = filter;
  document.querySelectorAll('#view-history .period-tab').forEach(t=>t.classList.toggle('active', t.dataset.filter===filter));
  renderHistory();
}

function renderHistory(skipReRender){
  if(!skipReRender && document.querySelector('.date-edit:focus')) return;
  const list = document.getElementById('historyList');
  let matches = [...data.matches].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(modoBuchuda) {
    matches = matches.filter(m => m.buchuda || m.buchudaDeRe);
  }
  if(historyFilter === 'buchuda') matches = matches.filter(m => m.buchuda);
  if(historyFilter === 're') matches = matches.filter(m => m.buchudaDeRe);
  if(matches.length===0){
    const msg = historyFilter !== 'all'
      ? `Nenhuma partida com ${historyFilter === 'buchuda' ? 'buchuda' : 'buchuda de r\u00e9'} no hist\u00f3rico.`
      : 'Nenhuma partida no hist\u00f3rico ainda. Jogue um duelo para come\u00e7ar a registrar.';
    list.innerHTML = `<div class="empty-state"><div class="big-emoji">\u{0001f4dc}</div><p>${msg}</p></div>`;
    return;
  }
  list.innerHTML = matches.map(m=>{
    const teamAName = `${playerName(m.teamA[0])} &amp; ${playerName(m.teamA[1])}`;
    const teamBName = `${playerName(m.teamB[0])} &amp; ${playerName(m.teamB[1])}`;
    const dateStr = m.date ? m.date.slice(0,10) : '';
    const dateHtml = user && user.role === 'admin'
      ? `<input type="date" class="date-edit" value="${dateStr}" data-match-id="${m.id}" onchange="updateMatchDate(this)" max="${new Date().toISOString().slice(0,10)}">`
      : `<span>${fmtDate(m.date)}</span>`;
    return `<div class="hist-card">
      <div class="date-row">
        <span>${dateHtml}</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <button class="icon-btn admin-only" onclick="deleteMatch('${m.id}')" title="Remover duelo" style="width:28px;height:28px;font-size:12px;">\u{0001f5d1}</button>
        </span>
      </div>
      <div class="match-row">
        <div class="side ${m.winner==='A'?'winner':''}">${m.winner==='A'?'\u{0001f451} ':''}${teamAName}</div>
        <div class="mid-score">${m.scoreA} x ${m.scoreB}</div>
        <div class="side right ${m.winner==='B'?'winner':''}">${teamBName}${m.winner==='B'?' \u{0001f451}':''}</div>
      </div>
      ${(m.buchuda || m.buchudaDeRe) ? `<div class="badges">
        ${m.buchuda?'<span class="badge buchuda">\u{0001f0e2} Buchuda</span>':''}
        ${m.buchudaDeRe?'<span class="badge re">\u{0001f0e2} Buchuda de r\u00e9</span>':''}
      </div>` : ''}
    </div>`;
  }).join('');
}

async function updateMatchDate(input){
  const id = input.dataset.matchId;
  const match = data.matches.find(m => m.id === id);
  if(!match || !input.value) return;
  const today = new Date().toISOString().slice(0,10);
  if(input.value > today) return;
  match.date = input.value;
  await saveData();
  renderHistory(true);
}

async function deleteMatch(id){
  if(!user || user.role !== 'admin'){ alert('Apenas admin pode remover duelos.'); return; }
  const match = data.matches.find(m=>m.id===id);
  if(!match) return;
  const teamAName = `${playerName(match.teamA[0])} & ${playerName(match.teamA[1])}`;
  const teamBName = `${playerName(match.teamB[0])} & ${playerName(match.teamB[1])}`;
  if(!confirm(`Remover este duelo?\n${teamAName} ${match.scoreA}x${match.scoreB} ${teamBName}`)) return;
  data.matches = data.matches.filter(m=>m.id!==id);
  await saveData();
  renderHistory();
}

/* ---------- RANKING ---------- */
document.querySelectorAll('.period-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    rankingPeriod = tab.dataset.period;
    periodOffset = 0;
    document.querySelectorAll('.period-tab').forEach(t=>t.classList.toggle('active', t===tab));
    renderRanking();
  });
});
document.querySelector('.period-tab[data-period="week"]').classList.add('active');

let rankingMode = 'duo';
function switchRankMode(mode){
  rankingMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active', t.dataset.mode===mode));
  renderRanking();
}
function shiftPeriod(dir){
  periodOffset += dir;
  if(periodOffset > 0) periodOffset = 0;
  renderRanking();
}

function getWeekRange(offset){
  const now = new Date();
  const day = (now.getDay()+6)%7;
  const monday = new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-day+offset*7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  return [monday, sunday];
}
function getMonthRange(offset){
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth()+offset, 1, 0,0,0,0);
  const last = new Date(now.getFullYear(), now.getMonth()+offset+1, 0, 23,59,59,999);
  return [first, last];
}
function periodLabelText(range){
  const opts = {day:'2-digit',month:'2-digit'};
  if(rankingPeriod==='week'){
    return `${range[0].toLocaleDateString('pt-BR',opts)} \u2013 ${range[1].toLocaleDateString('pt-BR',opts)}${periodOffset===0?' (atual)':''}`;
  }
  return range[0].toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}

function renderRanking(){
  const navEl = document.getElementById('periodNav');
  let matches = data.matches;
  if(rankingPeriod!=='all'){
    const range = rankingPeriod==='week' ? getWeekRange(periodOffset) : getMonthRange(periodOffset);
    navEl.style.display = 'flex';
    document.getElementById('periodLabel').textContent = periodLabelText(range);
    matches = data.matches.filter(m=>{
      const d = new Date(m.date);
      return d >= range[0] && d <= range[1];
    });
  } else {
    navEl.style.display = 'none';
  }

  if(modoBuchuda) matches = matches.filter(m => m.buchuda || m.buchudaDeRe);

  const list = document.getElementById('rankingList');
  if(matches.length===0){
    const msg = modoBuchuda ? 'Nenhuma partida com buchuda neste per\u00edodo.' : 'Nenhuma partida registrada neste per\u00edodo.';
    list.innerHTML = `<div class="empty-state"><div class="big-emoji">\u{0001f3c6}</div><p>${msg}</p></div>`;
    return;
  }

  function renderRankRow(r, i, avatarLeft, nameHtml, statsHtml){
    return `<div class="rank-row">
      <div class="pos">${i+1}</div>
      ${avatarLeft}
      <div class="rinfo">
        <div class="name">${nameHtml}</div>
        <div class="sub">${statsHtml}</div>
      </div>
    </div>`;
  }

  if(rankingMode==='individual'){
    const indStats = {};
    function ensureInd(id){
      if(!indStats[id]) indStats[id] = {id, jogos:0, vitorias:0, derrotas:0, pontosPro:0, pontosContra:0, buchudasFeitas:0, buchudasSofridas:0, buchudaDeRe:0};
      return indStats[id];
    }
    matches.forEach(m=>{
      const idsA = m.teamA, idsB = m.teamB;
      idsA.forEach(id=>{ const s=ensureInd(id); s.jogos++; s.pontosPro+=m.scoreA; s.pontosContra+=m.scoreB; });
      idsB.forEach(id=>{ const s=ensureInd(id); s.jogos++; s.pontosPro+=m.scoreB; s.pontosContra+=m.scoreA; });
      if(m.winner==='A'){
        idsA.forEach(id=>{ const s=ensureInd(id); s.vitorias++; if(m.buchuda) s.buchudasFeitas++; if(m.buchudaDeRe) s.buchudaDeRe++; });
        idsB.forEach(id=>{ const s=ensureInd(id); s.derrotas++; if(m.buchuda) s.buchudasSofridas++; });
      } else {
        idsB.forEach(id=>{ const s=ensureInd(id); s.vitorias++; if(m.buchuda) s.buchudasFeitas++; if(m.buchudaDeRe) s.buchudaDeRe++; });
        idsA.forEach(id=>{ const s=ensureInd(id); s.derrotas++; if(m.buchuda) s.buchudasSofridas++; });
      }
    });
    const sortFn = modoBuchuda
      ? (a,b) => b.buchudasFeitas - a.buchudasFeitas || b.buchudaDeRe - a.buchudaDeRe || a.buchudasSofridas - b.buchudasSofridas
      : (a,b) => b.vitorias - a.vitorias || (a.saldo||0) - (b.saldo||0) || b.buchudasFeitas - a.buchudasFeitas || b.buchudaDeRe - a.buchudaDeRe;
    const rows = Object.values(indStats).map(s=>({...s, saldo:s.pontosPro-s.pontosContra}))
      .sort(sortFn);
    list.innerHTML = rows.map((r,i)=>{
      const p = playerById(r.id);
      const name = p ? p.name : 'Jogador removido';
      const extras = [];
      if(r.buchudasFeitas) extras.push(`\u{0001f0e2} ${r.buchudasFeitas} buchuda${r.buchudasFeitas>1?'s':''}`);
      if(r.buchudaDeRe) extras.push(`\u{0001f0e2} ${r.buchudaDeRe} de r\u00e9`);
      if(r.buchudasSofridas) extras.push(`\u{0001f62c} ${r.buchudasSofridas} sofrida${r.buchudasSofridas>1?'s':''}`);
      if(modoBuchuda){
        const statsHtml = extras.join(' \u00b7 ') || (r.jogos+' jogo'+(r.jogos>1?'s':''));
        return renderRankRow(r, i, avatarHTML(p, 30), escapeHtml(name), statsHtml);
      }
      const winPct = r.jogos ? Math.round((r.vitorias/r.jogos)*100) : 0;
      const statsHtml = `${extras.join(' \u00b7 ') || (r.jogos+' jogo'+(r.jogos>1?'s':''))}`;
      return `<div class="rank-row">
        <div class="pos">${i+1}</div>
        ${avatarHTML(p, 30)}
        <div class="rinfo">
          <div class="name">${escapeHtml(name)}</div>
          <div class="sub">${statsHtml}</div>
        </div>
        <div class="wl"><b>${r.vitorias}V</b> <span style="color:var(--red);font-weight:700;">${r.derrotas}D</span> \u00b7 ${r.saldo >= 0 ? '+' : ''}${r.saldo} \u00b7 ${winPct}%</div>
      </div>`;
    }).join('');
    return;
  }

  const stats = {};
  function duoKey(ids){ return [...ids].sort().join('|'); }
  function ensureDuo(key){
    if(!stats[key]) stats[key] = {ids:key.split('|'), jogos:0, vitorias:0, derrotas:0, pontosPro:0, pontosContra:0, buchudasFeitas:0, buchudasSofridas:0, buchudaDeRe:0};
    return stats[key];
  }
  matches.forEach(m=>{
    const kA = duoKey(m.teamA);
    const kB = duoKey(m.teamB);
    const dA = ensureDuo(kA); dA.jogos++;
    const dB = ensureDuo(kB); dB.jogos++;
    dA.pontosPro += m.scoreA; dA.pontosContra += m.scoreB;
    dB.pontosPro += m.scoreB; dB.pontosContra += m.scoreA;
    if(m.winner==='A'){
      dA.vitorias++; if(m.buchuda) dA.buchudasFeitas++; if(m.buchudaDeRe) dA.buchudaDeRe++;
      dB.derrotas++; if(m.buchuda) dB.buchudasSofridas++;
    } else {
      dB.vitorias++; if(m.buchuda) dB.buchudasFeitas++; if(m.buchudaDeRe) dB.buchudaDeRe++;
      dA.derrotas++; if(m.buchuda) dA.buchudasSofridas++;
    }
  });

  const sortFn = modoBuchuda
    ? (a,b) => b.buchudasFeitas - a.buchudasFeitas || b.buchudaDeRe - a.buchudaDeRe || a.buchudasSofridas - b.buchudasSofridas
    : (a,b) => b.vitorias - a.vitorias || (a.saldo||0) - (b.saldo||0) || b.buchudasFeitas - a.buchudasFeitas || b.buchudaDeRe - a.buchudaDeRe;
  const rows = Object.keys(stats).map(key=>{
    const s = stats[key];
    s.saldo = s.pontosPro - s.pontosContra;
    return {key, ...s};
  }).sort(sortFn);

  list.innerHTML = rows.map((r,i)=>{
    const p1 = playerById(r.ids[0]);
    const p2 = playerById(r.ids[1]);
    const name1 = p1 ? p1.name : 'Jogador removido';
    const name2 = p2 ? p2.name : 'Jogador removido';
    const extras = [];
    if(r.buchudasFeitas) extras.push(`\u{0001f0e2} ${r.buchudasFeitas} buchuda${r.buchudasFeitas>1?'s':''} feita${r.buchudasFeitas>1?'s':''}`);
    if(r.buchudaDeRe) extras.push(`\u{0001f0e2} ${r.buchudaDeRe} buchuda${r.buchudaDeRe>1?'s':''} de r\u00e9`);
    if(r.buchudasSofridas) extras.push(`\u{0001f62c} ${r.buchudasSofridas} sofrida${r.buchudasSofridas>1?'s':''}`);
    if(modoBuchuda){
      const statsHtml = extras.join(' \u00b7 ');
      const avatarLeft = `<div style="display:flex;align-items:center;gap:6px;">${avatarHTML(p1, 30)}<span style="font-size:11px;color:var(--text-muted);">&amp;</span>${avatarHTML(p2, 30)}</div>`;
      const nameHtml = `${escapeHtml(name1)} &amp; ${escapeHtml(name2)}`;
      return renderRankRow(r, i, avatarLeft, nameHtml, statsHtml);
    }
    const winPct = r.jogos ? Math.round((r.vitorias/r.jogos)*100) : 0;
    const statsHtml = extras.join(' \u00b7 ') || (r.jogos+' jogo'+(r.jogos>1?'s':''));
    return `<div class="rank-row">
      <div class="pos">${i+1}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${avatarHTML(p1, 30)}<span style="font-size:11px;color:var(--text-muted);">&amp;</span>${avatarHTML(p2, 30)}
      </div>
      <div class="rinfo">
        <div class="name" style="font-size:13px;">${escapeHtml(name1)} &amp; ${escapeHtml(name2)}</div>
        <div class="sub">${statsHtml}</div>
      </div>
      <div class="wl"><b>${r.vitorias}V</b> <span style="color:var(--red);font-weight:700;">${r.derrotas}D</span> \u00b7 ${r.saldo >= 0 ? '+' : ''}${r.saldo} \u00b7 ${winPct}%</div>
    </div>`;
  }).join('');
}

/* ---------- INIT ---------- */
(async function init(){
  loadLocal();
  modoBuchuda = localStorage.getItem('modo_buchuda') === '1';
  await checkSession();
  updateBuchudaUI();
  renderHome();
  startPolling();
  await syncFromServer();
  updateBuchudaUI();
  updateHistoryTabs();
  renderHome();
  if (isSyncNeeded()) retrySync();
  window.addEventListener('online', retrySync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshFromServer();
  });
  window.addEventListener('focus', () => {
    refreshFromServer();
  });
  OrientationMgr.init();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.ready.then(reg => {
      setInterval(() => reg.update(), 3000);
    });
  }
})();

checkAppUpdate();
setInterval(checkAppUpdate, 3000);

async function checkAppUpdate(){
  const res = await api('checkAppJs');
  if(!res || !res.size) return;
  const key = 'app_js_v';
  const last = localStorage.getItem(key);
  const cur = res.size + ':' + res.mtime;
  if(last && last !== cur){
    localStorage.setItem(key, cur);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(reg => reg.update());
    } else {
      location.reload();
    }
  } else {
    localStorage.setItem(key, cur);
  }
}

async function syncFromServer(){
  const [playersRemote, matchesRemote, settingsRemote] = await Promise.all([
    api('listPlayers'), api('listMatches'), api('listSettings')
  ]);
  if(playersRemote && Array.isArray(playersRemote) && matchesRemote && Array.isArray(matchesRemote)){
    data.players = playersRemote.map(p => ({id:p.id, name:p.name, photo:p.photo}));
    data.matches = matchesRemote.map(m => ({
      id: m.id, date: m.date,
      teamA: m.team_a || m.teamA,
      teamB: m.team_b || m.teamB,
      scoreA: m.score_a ?? m.scoreA,
      scoreB: m.score_b ?? m.scoreB,
      winner: m.winner,
      buchuda: m.buchuda,
      buchudaDeRe: m.buchuda_de_re ?? m.buchudaDeRe,
      durationSec: m.duration_sec ?? m.durationSec
    }));
    saveLocal();
  }
  const localMb = localStorage.getItem('modo_buchuda');
  if(settingsRemote && settingsRemote.modo_buchuda !== undefined) {
    modoBuchuda = settingsRemote.modo_buchuda;
    localStorage.setItem('modo_buchuda', modoBuchuda ? '1' : '0');
  } else if(localMb !== null) {
    modoBuchuda = localMb === '1';
  }
}
