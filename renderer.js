
let localStream = null;
let peers = {};
let ws = null;
let myId = 'peer-' + Math.random().toString(36).slice(2,8);
let room = null;

const qs = (s)=>document.querySelector(s);
const hostBtn = qs('#hostBtn');
const joinBtn = qs('#joinBtn');
const hostInfo = qs('#hostInfo');
const roomTitle = qs('#roomTitle');
const startStreamBtn = qs('#startStreamBtn');
const tiles = ['#tile1','#tile2','#tile3','#tile4'].map(qs);
const systemMsg = qs('#systemMsg');

function logSys(msg){ systemMsg.innerText = msg; console.log(msg); }

hostBtn.addEventListener('click', async ()=>{
  const port = parseInt(qs('#port').value || '3000', 10);
  const roomName = (qs('#roomName').value || 'room1').trim();
  const res = await window.electronAPI.startServer({ port, room: roomName });
  if (res.success) {
    hostInfo.innerText = `Hosting on port ${port}. Peers join: YOUR_PUBLIC_IP:${port}`;
    logSys('Hosting started. Ensure Windows Firewall allows FoxComm.');
    joinRoom(`ws://127.0.0.1:${port}`, roomName);
  } else {
    logSys('Could not start server: ' + res.message);
  }
});

joinBtn.addEventListener('click', ()=>{
  const val = qs('#joinCode').value.trim();
  if (!val) return alert('Enter host-ip:port');
  const url = val.startsWith('ws://') ? val : ('ws://' + val);
  const roomName = (qs('#roomName').value || 'room1').trim();
  joinRoom(url, roomName);
});

async function joinRoom(signalingUrl, roomName){
  room = roomName;
  roomTitle.innerText = 'Room: ' + roomName;
  ws = new WebSocket(signalingUrl);
  ws.addEventListener('open', ()=>{
    ws.send(JSON.stringify({ type:'join', room, from: myId }));
    logSys('Connected to signaling at ' + signalingUrl);
  });
  ws.addEventListener('message', async (ev)=>{
    const data = JSON.parse(ev.data);
    if (data.type === 'signal') {
      const { payload, from } = data;
      handleSignal(payload, from);
    } else if (data.type === 'peer-joined') {
      createOffer();
    } else if (data.type === 'peer-left') {
      logSys('Peer left');
    }
  });
  ws.addEventListener('close', ()=>{ logSys('Signaling closed'); });
  ws.addEventListener('error', (e)=>{ console.error(e); logSys('Signaling error'); });
}

async function handleSignal(payload, from){
  let pc = peers[from];
  if (payload.sdp) {
    if (payload.sdp.type === 'offer') {
      pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({ sdp: pc.localDescription });
    } else if (payload.sdp.type === 'answer') {
      pc = peers[from];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    }
  } else if (payload.candidate) {
    pc = peers[from];
    if (pc) {
      try { await pc.addIceCandidate(payload.candidate); } catch(e) {console.warn(e);}
    }
  }
}

function sendSignal(payload){
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type:'signal', room, payload, from: myId }));
}

async function createOffer(){
  const id = 'peer-' + Math.random().toString(36).slice(2,8);
  const pc = createPeerConnection(id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ sdp: pc.localDescription });
}

function createPeerConnection(id){
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  peers[id] = pc;
  pc.onicecandidate = (e)=>{ if (e.candidate) sendSignal({ candidate: e.candidate }); };
  pc.ontrack = (e)=>{ attachRemoteStream(e.streams[0]); };
  if (localStream) {
    for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
  }
  return pc;
}

function attachRemoteStream(stream){
  for (const t of tiles){
    if (!t.querySelector('video')){
      const v = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.srcObject = stream;
      t.innerHTML = ''; t.appendChild(v);
      return;
    }
  }
  console.warn('No tile available');
}

// PTT + quality controls
let pttKey = 'v'; let pttEnabled = true; let micMuted = false;
function setMicMuted(m){ micMuted = m; if (!localStream) return; localStream.getAudioTracks().forEach(t => t.enabled = !m); logSys(m?'Mic muted':'Mic live'); }
document.addEventListener('keydown', (e)=>{ if (!pttEnabled) return; if (e.key.toLowerCase() === pttKey) setMicMuted(false); });
document.addEventListener('keyup', (e)=>{ if (!pttEnabled) return; if (e.key.toLowerCase() === pttKey) setMicMuted(true); });
document.getElementById('muteBtn').addEventListener('click', ()=> setMicMuted(!micMuted));
async function setLocalQuality({ maxBitrateKbps = 20000, scaleDown = 1 }){
  for (const id in peers){
    const pc = peers[id];
    const senders = pc.getSenders().filter(s => s.track && s.track.kind === 'video');
    for (const s of senders){
      const params = s.getParameters();
      params.encodings = params.encodings || [{}];
      params.encodings[0].maxBitrate = maxBitrateKbps * 1000;
      params.encodings[0].scaleResolutionDownBy = scaleDown;
      try { await s.setParameters(params); } catch(e){ console.warn('setParameters failed', e); }
    }
  }
  logSys(`Quality set: ~${maxBitrateKbps}kbps, scale x${scaleDown}`);
}
const qualityMenu = document.createElement('div');
qualityMenu.style.position='fixed'; qualityMenu.style.right='20px'; qualityMenu.style.bottom='80px';
qualityMenu.style.background='#0d0e13'; qualityMenu.style.border='1px solid rgba(255,255,255,0.08)';
qualityMenu.style.borderRadius='10px'; qualityMenu.style.padding='8px'; qualityMenu.style.display='flex'; qualityMenu.style.gap='6px';
qualityMenu.innerHTML = `
  <button id="q4k">4K (~25Mbps)</button>
  <button id="q1440">1440p (~16Mbps)</button>
  <button id="q1080">1080p (~8Mbps)</button>
`;
document.body.appendChild(qualityMenu);
document.getElementById('q4k').onclick = ()=> setLocalQuality({ maxBitrateKbps: 25000, scaleDown: 1 });
document.getElementById('q1440').onclick = ()=> setLocalQuality({ maxBitrateKbps: 16000, scaleDown: 1.33 });
document.getElementById('q1080').onclick = ()=> setLocalQuality({ maxBitrateKbps: 8000, scaleDown: 2 });

// Settings logic (audio processing + theme)
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const aecToggle = document.getElementById('aecToggle');
const nsToggle = document.getElementById('nsToggle');
const agcToggle = document.getElementById('agcToggle');
const accentPicker = document.getElementById('accentPicker');
const bgPicker = document.getElementById('bgPicker');
const panelPicker = document.getElementById('panelPicker');

(function loadTheme(){
  const saved = JSON.parse(localStorage.getItem('foxcomm_theme') || '{}');
  if (saved.accent) document.documentElement.style.setProperty('--accent', saved.accent), accentPicker.value = saved.accent;
  if (saved.bg) document.documentElement.style.setProperty('--bg', saved.bg), bgPicker.value = saved.bg;
  if (saved.panel) document.documentElement.style.setProperty('--panel', saved.panel), panelPicker.value = saved.panel;
})();
function saveTheme(){
  const theme = { accent: accentPicker.value, bg: bgPicker.value, panel: panelPicker.value };
  localStorage.setItem('foxcomm_theme', JSON.stringify(theme));
}
accentPicker.addEventListener('change', ()=>{ document.documentElement.style.setProperty('--accent', accentPicker.value); saveTheme(); });
bgPicker.addEventListener('change', ()=>{ document.documentElement.style.setProperty('--bg', bgPicker.value); saveTheme(); });
panelPicker.addEventListener('change', ()=>{ document.documentElement.style.setProperty('--panel', panelPicker.value); saveTheme(); });

settingsBtn.addEventListener('click', ()=> settingsPanel.classList.toggle('hidden'));
closeSettings.addEventListener('click', ()=> settingsPanel.classList.add('hidden'));

(function loadAudioToggles(){
  const saved = JSON.parse(localStorage.getItem('foxcomm_audio') || '{}');
  if ('aec' in saved) aecToggle.checked = !!saved.aec;
  if ('ns' in saved) nsToggle.checked = !!saved.ns;
  if ('agc' in saved) agcToggle.checked = !!saved.agc;
})();
function saveAudioToggles(){
  localStorage.setItem('foxcomm_audio', JSON.stringify({ aec: aecToggle.checked, ns: nsToggle.checked, agc: agcToggle.checked }));
}
[aecToggle, nsToggle, agcToggle].forEach(el => el.addEventListener('change', saveAudioToggles));

startStreamBtn.onclick = async ()=>{
  if (!localStream) {
    try{
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate:60 }, audio: true });
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: aecToggle.checked,
          noiseSuppression: nsToggle.checked,
          autoGainControl: agcToggle.checked,
          channelCount: 2,
          sampleRate: 48000
        }
      });
      const mixed = new MediaStream();
      display.getVideoTracks().forEach(t=>mixed.addTrack(t));
      (mic.getAudioTracks().length ? mic : display).getAudioTracks().forEach(t=>mixed.addTrack(t));
      localStream = mixed;
      const v = document.createElement('video');
      v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = localStream;
      tiles[0].innerHTML=''; tiles[0].appendChild(v);
      for (const id in peers){
        const pc = peers[id];
        for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
      }
      logSys('Local stream started (AEC:' + aecToggle.checked + ', NS:' + nsToggle.checked + ', AGC:' + agcToggle.checked + ')');
    }catch(e){ console.error(e); alert('Could not get display/mic: ' + e.message); }
  } else {
    localStream.getTracks().forEach(t=>t.stop());
    localStream = null;
    tiles[0].innerHTML = '<div class="placeholder">You</div>';
  }
};


// ---- v3.1: safer capture (no display audio), better errors, mic test ----
const testMicBtn = document.getElementById('testMicBtn');

async function safeGetDisplay(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
    throw new Error('Screen capture not supported in this environment. Try Windows 10/11 with updated graphics drivers.');
  }
  // Some Electron/Chromium builds throw NotSupportedError if audio:true is requested for display.
  return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false });
}

async function safeGetMic(aec, ns, agc){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    throw new Error('Microphone capture not supported. Check Windows privacy settings.');
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: !!aec,
      noiseSuppression: !!ns,
      autoGainControl: !!agc,
      channelCount: 2,
      sampleRate: 48000
    }
  });
}

testMicBtn?.addEventListener('click', async ()=>{
  try{
    const mic = await safeGetMic(aecToggle?.checked, nsToggle?.checked, agcToggle?.checked);
    mic.getTracks().forEach(t=>setTimeout(()=>t.stop(), 1500));
    logSys('Mic OK: permission granted and audio track active.');
    alert('✅ Microphone works. You can close this popup.');
  }catch(e){
    console.error(e);
    alert('❌ Mic test failed: ' + (e.message || e.name));
    logSys('Mic error: ' + (e.message || e.name));
  }
});

// Override Start Stream with safer flow & clearer errors
startStreamBtn.onclick = async ()=>{
  if (!localStream) {
    try{
      const display = await safeGetDisplay();
      let mic = null;
      try{
        mic = await safeGetMic(aecToggle.checked, nsToggle.checked, agcToggle.checked);
      }catch(micErr){
        logSys('Mic unavailable (' + (micErr.message||micErr.name) + '). Continuing with screen only.');
      }
      const mixed = new MediaStream();
      display.getVideoTracks().forEach(t=>mixed.addTrack(t));
      if (mic && mic.getAudioTracks().length) {
        mic.getAudioTracks().forEach(t=>mixed.addTrack(t));
      }
      localStream = mixed;
      const v = document.createElement('video');
      v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = localStream;
      tiles[0].innerHTML=''; tiles[0].appendChild(v);
      for (const id in peers){
        const pc = peers[id];
        for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
      }
      logSys('Local stream started.' + (mic?' Mic attached.':' No mic.'));
    }catch(e){
      console.error(e);
      alert('Could not start capture: ' + (e.message || e.name) + '\\n\\nTips:\\n• Make sure you are on Windows 10/11\\n• Update GPU drivers\\n• Check Settings > Privacy > Microphone is ON for desktop apps');
    }
  } else {
    localStream.getTracks().forEach(t=>t.stop());
    localStream = null;
    tiles[0].innerHTML = '<div class="placeholder">You</div>';
  }
};


// ===== Screen/Window Picker (robust) =====
const pickScreenBtn = document.getElementById('pickScreenBtn');
const sourcePickerModal = document.getElementById('sourcePickerModal');
const sourceGrid = document.getElementById('sourceGrid');
const closePicker = document.getElementById('closePicker');

pickScreenBtn?.addEventListener('click', async ()=>{
  try{
    sourceGrid.innerHTML = '<div class="placeholder">Loading sources…</div>';
    sourcePickerModal.classList.remove('hidden');
    const sources = await window.electronAPI.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 250 } });
    sourceGrid.innerHTML = '';
    for (const s of sources){
      const card = document.createElement('div');
      card.className = 'source-card';
      const img = document.createElement('img');
      img.src = s.thumbnail || '';
      const name = document.createElement('div');
      name.className = 'name'; name.textContent = s.name;
      card.appendChild(img); card.appendChild(name);
      card.onclick = ()=> selectSource(s.id);
      sourceGrid.appendChild(card);
    }
  }catch(e){
    alert('Could not enumerate screens/windows: ' + (e.message || e.name));
  }
});
closePicker?.addEventListener('click', ()=> sourcePickerModal.classList.add('hidden'));

async function selectSource(sourceId){
  try{
    sourcePickerModal.classList.add('hidden');
    // Capture chosen source at 60fps (display audio disabled for compatibility)
    const display = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 60
        }
      }
    });
    // Mic (optional)
    let mic = null;
    try{
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: aecToggle?.checked ?? true,
          noiseSuppression: nsToggle?.checked ?? true,
          autoGainControl: agcToggle?.checked ?? true,
          channelCount: 2,
          sampleRate: 48000
        }
      });
    }catch(e){ logSys('Mic unavailable: ' + (e.message||e.name)); }

    const mixed = new MediaStream();
    display.getVideoTracks().forEach(t=>mixed.addTrack(t));
    if (mic) mic.getAudioTracks().forEach(t=>mixed.addTrack(t));
    localStream = mixed;

    const v = document.createElement('video');
    v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = localStream;
    tiles[0].innerHTML=''; tiles[0].appendChild(v);

    for (const id in peers){
      const pc = peers[id];
      for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
    }
    logSys('Streaming selected source.');
  }catch(e){
    console.error(e);
    alert('Could not capture selected source: ' + (e.message || e.name));
  }
}


// ===== Screen/Window Picker (robust) =====
const pickScreenBtn = document.getElementById('pickScreenBtn');
const sourcePickerModal = document.getElementById('sourcePickerModal');
const sourceGrid = document.getElementById('sourceGrid');
const closePicker = document.getElementById('closePicker');

async function enumerateSources(){
  try{
    const api = window.electronAPI;
    if (!api || !api.getSources) return null;
    const sources = await api.getSources({ types: ['screen','window'], thumbnailSize: { width: 400, height: 250 } });
    return sources;
  }catch(e){
    console.warn('getSources failed, will fallback:', e);
    return null;
  }
}

pickScreenBtn?.addEventListener('click', async ()=>{
  let sources = await enumerateSources();
  if (!sources) {
    // Fallback: use native getDisplayMedia picker
    try{
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false });
      await attachChosenDisplay(display);
      logSys('Streaming display via native picker.');
      return;
    }catch(e){
      alert('Could not open screen picker: ' + (e.message || e.name));
      return;
    }
  }

  // Show our modal grid
  try{
    sourceGrid.innerHTML = '<div class="placeholder">Loading sources…</div>';
    sourcePickerModal.classList.remove('hidden');
    sourceGrid.innerHTML = '';
    for (const s of sources){
      const card = document.createElement('div');
      card.className = 'source-card';
      const img = document.createElement('img');
      img.src = s.thumbnail || '';
      const name = document.createElement('div');
      name.className = 'name'; name.textContent = s.name;
      card.appendChild(img); card.appendChild(name);
      card.onclick = ()=> selectSource(s.id);
      sourceGrid.appendChild(card);
    }
  }catch(e){
    alert('Could not enumerate screens/windows: ' + (e.message || e.name));
  }
});

closePicker?.addEventListener('click', ()=> sourcePickerModal.classList.add('hidden'));

async function selectSource(sourceId){
  try{
    sourcePickerModal.classList.add('hidden');
    const display = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 60
        }
      }
    });
    await attachChosenDisplay(display);
    logSys('Streaming selected source.');
  }catch(e){
    console.error(e);
    alert('Could not capture selected source: ' + (e.message || e.name));
  }
}

async function attachChosenDisplay(display){
  // Mic (optional)
  let mic = null;
  try{
    mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: aecToggle?.checked ?? true,
        noiseSuppression: nsToggle?.checked ?? true,
        autoGainControl: agcToggle?.checked ?? true,
        channelCount: 2,
        sampleRate: 48000
      }
    });
  }catch(e){ logSys('Mic unavailable: ' + (e.message||e.name)); }

  const mixed = new MediaStream();
  display.getVideoTracks().forEach(t=>mixed.addTrack(t));
  if (mic) mic.getAudioTracks().forEach(t=>mixed.addTrack(t));
  localStream = mixed;

  const v = document.createElement('video');
  v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = localStream;
  tiles[0].innerHTML=''; tiles[0].appendChild(v);

  for (const id in peers){
    const pc = peers[id];
    for (const t of localStream.getTracks()) pc.addTrack(t, localStream);
  }
}
