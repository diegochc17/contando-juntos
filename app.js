'use strict';

const byId = (id)=>document.getElementById(id);
const on = (target, type, handler)=>{ if(target && typeof target.addEventListener==='function'){ target.addEventListener(type, handler) } };

// Textos UI
const T = {
  es:{ready:"Listo para comenzar", start:"Iniciar", pause:"Pausar", reset:"Reiniciar", fullscreen:"Pantalla completa", back:"Quitar", clear:"Limpiar", goBack:"Volver", announceStart:n=>`Iniciamos ${n}.`, announceEnd:n=>`${n} terminó.`, announceOne:"Queda 1 minuto.",
      optsTitle:"Opciones", empathy:"Hecho con empatía. 🧩", tip:"Consejo: escribe con el teclado (0–9), Backspace borra, Espacio inicia/pausa.", ttsLabel:"Anuncios por voz", cuesLabel:"Efectos de sonido", voiceTitle:"Voz" },
  en:{ready:"Ready to start", start:"Start", pause:"Pause", reset:"Reset", fullscreen:"Fullscreen", back:"Delete", clear:"Clear", goBack:"Back", announceStart:n=>`Starting ${n}.`, announceEnd:n=>`${n} finished.`, announceOne:"1 minute left.",
      optsTitle:"Options", empathy:"Made with empathy. 🧩", tip:"Tip: type with the keyboard (0–9), Delete removes, Space starts/pauses.", ttsLabel:"Voice announcements", cuesLabel:"Sound effects", voiceTitle:"Voice" }
};
let lang = localStorage.getItem('cj_lang')||'es';

const state = { running:false, total:300, remaining:300, buf:"000000", activity:'Actividad', announcements:(localStorage.getItem('cj_ann')??'true')==='true', tickId:null, focus:false, cuesOn:(localStorage.getItem('cj_cues_on')??'true')==='true', cue25:75, cue10p:30, alarmId:null };

function formatHMS(s){ const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const r=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}` }

function applyLang(){
  const t=T[lang];
  byId('phase').textContent=t.ready; byId('btnToggle').textContent=t.start; byId('btnReset').textContent=t.reset; byId('btnFullscreen').textContent=t.fullscreen; byId('back').textContent=t.back; byId('clearAll').textContent=t.clear; byId('btnBack').textContent=t.goBack;
  byId('optsTitle').textContent=t.optsTitle; byId('empathy').textContent=t.empathy; byId('tip').textContent=t.tip; byId('ttsLabel').textContent=t.ttsLabel; byId('cuesLabel').textContent=t.cuesLabel; byId('voiceTitle').textContent=t.voiceTitle;
  byId('langES').setAttribute('aria-pressed', lang==='es'); byId('langEN').setAttribute('aria-pressed', lang==='en'); document.documentElement.lang = lang;
  populateVoices(); render();
}

function render(){
  byId('time').textContent = formatHMS(state.remaining);
  const ratio = (state.total>0)? (state.remaining/state.total) : 0; const spent=(1-ratio)*100; const hue = Math.round(158*ratio + 4*(1-ratio)); const pulse=(0.55+0.65*ratio).toFixed(2)+'s'; const screen=document.querySelector('.screen');
  screen.style.setProperty('--hue', hue); screen.style.setProperty('--pct', spent); screen.style.setProperty('--pulse', pulse); byId('fuse').style.width=(spent.toFixed(2))+'%';
}

function enterFocus(){ if(state.focus) return; state.focus=true; document.body.classList.add('focus'); byId('btnBack').classList.remove('hidden'); }
function exitFocus(){ if(!state.focus) return; state.focus=false; document.body.classList.remove('focus'); byId('btnBack').classList.add('hidden'); stopFinalAlarm(); }

// Entrada HHMMSS
function pushDigit(d){ state.buf=(state.buf+d).slice(-6); autoApplyFromBuffer(); }
function popDigit(){ state.buf=("000000"+state.buf).slice(-7,-1); autoApplyFromBuffer(); }
function clearBuffer(){ state.buf="000000"; autoApplyFromBuffer(); }
function bufToSeconds(){ const h=parseInt(state.buf.slice(0,2)); const m=parseInt(state.buf.slice(2,4)); const s=parseInt(state.buf.slice(4,6)); return h*3600+m*60+s }
function autoApplyFromBuffer(){ const secs=bufToSeconds(); if(!state.running){ state.total=Math.max(0,secs); state.remaining=state.total; recalcCueThresholds(); } byId('time').textContent=formatHMS(Math.max(0,secs)); }

// Timer
function startTimer(){ if(state.running) return; ensureAudio(); if(state.remaining<=0) state.remaining=1; state.running=true; enterFocus(); byId('btnToggle').textContent=T[lang].pause; byId('phase').textContent=state.activity; stopFinalAlarm(); if(state.cuesOn) playCue('start'); speak(T[lang].announceStart(state.activity));
  state.tickId=setInterval(()=>{ if(!state.running) return; state.remaining=Math.max(0,state.remaining-1); render(); if(state.remaining===60) speak(T[lang].announceOne); handleCueSchedule(); if(state.remaining===0){ stopTimer(false); speak(T[lang].announceEnd(state.activity)); playCue('end'); startFinalAlarm(); } },1000);
}
function stopTimer(user=true){ if(!state.running) return; state.running=false; clearInterval(state.tickId); state.tickId=null; byId('btnToggle').textContent=T[lang].start; stopFinalAlarm(); if(user) byId('phase').textContent=T[lang].ready; }
function resetTimer(){ stopTimer(); state.remaining=state.total; render(); byId('phase').textContent=T[lang].ready; }

// Audio base
let audioCtx=null; function ensureAudio(){ if(!audioCtx){ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); } if(audioCtx.state==='suspended'){ audioCtx.resume?.(); } }

// TTS
function populateVoices(){ const sel=byId('voice'); if(!sel) return; const all=speechSynthesis.getVoices(); if(!all||all.length===0){ setTimeout(populateVoices,150); return;} sel.innerHTML=''; const wantPrefix=(lang==='es')?'es':'en'; const filtered=all.filter(v=>(v.lang||'').toLowerCase().startsWith(wantPrefix)); const regionLabel=(code)=>{ const lc=(code||'').toLowerCase(); const r=lc.split('-')[1]?lc.split('-')[1].toUpperCase():''; const esMap={ES:'España',MX:'México',AR:'Argentina',CO:'Colombia',PE:'Perú',CL:'Chile',VE:'Venezuela',US:'Estados Unidos'}; const enMap={US:'United States',GB:'United Kingdom',AU:'Australia',CA:'Canada',NZ:'New Zealand',IE:'Ireland',IN:'India',ZA:'South Africa'}; if(lang==='es') return r?(esMap[r]||r):'Internacional'; return r?(enMap[r]||r):'International'; }; const ui=(lang==='es')?'Español':'English'; const labelFor=(v)=>{ const clean=(v.name||'').replace(/Spanish|Español|English/gi,'').trim(); const base=clean||(lang==='es'?'Voz':'Voice'); return `${base} — ${ui} (${regionLabel(v.lang)})` }; const saved=localStorage.getItem('cj_voice'); filtered.forEach(v=>{ const o=document.createElement('option'); o.value=v.name; o.textContent=labelFor(v); if(saved===v.name) o.selected=true; sel.appendChild(o) }); if(!sel.value&&filtered[0]){ sel.value=filtered[0].name; localStorage.setItem('cj_voice', sel.value) } }
function speak(text){ if(!state.announcements) return; const u=new SpeechSynthesisUtterance(text); const voices=speechSynthesis.getVoices(); const target=(lang==='es')?'es':'en'; const selected=voices.find(v=>v.name===localStorage.getItem('cj_voice')); const fallback=voices.find(v=> (v.lang||'').toLowerCase().startsWith(target)); const any=voices[0]; u.voice=selected||fallback||any||null; speechSynthesis.cancel(); speechSynthesis.speak(u) }
// In some browsers voices load asynchronously:
speechSynthesis.onvoiceschanged = ()=>{ try{ populateVoices(); }catch(_){} };

// Idioma
on(byId('langES'),'click', ()=>{ lang='es'; localStorage.setItem('cj_lang','es'); applyLang() });
on(byId('langEN'),'click', ()=>{ lang='en'; localStorage.setItem('cj_lang','en'); applyLang() });

// Controles principales (apagan la alarma al usarlos)
on(byId('btnToggle'),'click', ()=>{ stopFinalAlarm(); state.running?stopTimer():startTimer() });
on(byId('btnReset'),'click', ()=>{ stopFinalAlarm(); resetTimer() });
on(byId('btnFullscreen'),'click', ()=>{ stopFinalAlarm(); const el=document.documentElement; if(!document.fullscreenElement){ el.requestFullscreen?.() } else { document.exitFullscreen?.() } });
on(byId('btnBack'),'click', ()=>{ stopFinalAlarm(); exitFocus() });

// Keypad
document.querySelectorAll('.key[data-k]').forEach(k=> on(k,'click', ()=>{ pushDigit(k.dataset.k) }));
on(byId('back'),'click', popDigit);
on(byId('clearAll'),'click', clearBuffer);

// Opciones
on(byId('announcements'),'change', (e)=>{ state.announcements=e.target.checked; localStorage.setItem('cj_ann', String(state.announcements)) });
on(byId('cuesOn'),'change', (e)=>{ state.cuesOn=e.target.checked; localStorage.setItem('cj_cues_on', String(state.cuesOn)) });

// Teclado global
on(window,'keydown', (e)=>{
  if(e.key>='0' && e.key<='9'){ pushDigit(e.key) }
  else if((e.ctrlKey||e.metaKey) && e.key==='Backspace'){ clearBuffer() }
  else if(e.key==='Backspace' || e.key==='Delete'){ popDigit() }
  else if(e.code==='Space'){ e.preventDefault(); stopFinalAlarm(); state.running?stopTimer():startTimer() }
  else if(e.key==='Escape'){ stopFinalAlarm(); exitFocus() }
});

// ======= Audio Cues =======
function recalcCueThresholds(){ state.cue25=Math.max(1, Math.floor(state.total*0.25)); state.cue10p=Math.max(1, Math.floor(state.total*0.10)) }
function cueGain(){ return 0.22 } // fuerte por defecto
function playToneAt(t, freq, dur=0.14, vol=cueGain(), type='square'){
  ensureAudio();
  const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
  o.type=type; o.frequency.value=freq; g.gain.value=0.0001;
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol), t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.stop(t+dur+0.05);
}
// Tick con timbre/volumen adaptado a cuánta reserva queda
function playTickAdaptive(r){
  const ratio = (state.total>0)? (r/state.total) : 0;
  const freq = ratio>0.66 ? 360 : ratio>0.33 ? 480 : 620;
  const vol  = ratio>0.66 ? 0.12 : ratio>0.33 ? 0.16 : 0.22;
  const type = ratio>0.50 ? 'triangle' : 'square';
  playToneAt(audioCtx.currentTime, freq, 0.08, vol, type);
}
function playCue(kind){
  if(!state.cuesOn) return;
  const t=audioCtx.currentTime;
  if(kind==='start'){ playToneAt(t, 523.25, .22, .20, 'triangle') }
  else if(kind==='tick'){ playTickAdaptive(state.remaining) }
  else if(kind==='mark'){
    playToneAt(t, 493.88, .12, .18, 'sine'); setTimeout(()=> playToneAt(audioCtx.currentTime, 659.25, .10, .18, 'sine'), 120);
  }
  else if(kind==='warn'){ playToneAt(t, 659.25, .16, .24, 'sine') }
  else if(kind==='alert'){ playToneAt(t, 784, .12, .26, 'sine'); setTimeout(()=> playToneAt(audioCtx.currentTime, 784, .12, .22, 'sine'), 120) }
  else if(kind==='end'){ playToneAt(t, 523.25, .26, .28, 'square'); setTimeout(()=> playToneAt(audioCtx.currentTime, 659.25, .24, .26, 'square'), 90); setTimeout(()=> playToneAt(audioCtx.currentTime, 783.99, .22, .24, 'square'), 200) }
}

function handleCueSchedule(){
  if(!state.cuesOn) return; // si está apagado, solo alarma final
  const r = state.remaining; if(r<=0) return;

  // ==== Ritmo adaptativo con mayor contraste ====
  if(r>180 && r % 60 === 0) { playTickAdaptive(r); }
  else if(r>120 && r<=180 && r % 30 === 0) { playTickAdaptive(r); }
  else if(r>60 && r<=120 && r % 15 === 0) { playTickAdaptive(r); }
  else if(r>20 && r<=60 && r % 5 === 0) { playTickAdaptive(r); }
  else if(r>10 && r<=20 && r % 2 === 0) { playTickAdaptive(r); }
  else if(r<=10) {
    playTickAdaptive(r);
    if(r<=5) setTimeout(()=> playToneAt(audioCtx.currentTime, 880, .06, .22, 'square'), 110);
  }

  // Hitos / por porcentaje: 75%, 50%, 25%, 10%
  const p75 = Math.max(1, Math.floor(state.total*0.75));
  const p50 = Math.max(1, Math.floor(state.total*0.50));
  if(r === p75) playCue('mark');
  if(r === p50) playCue('warn');
  if(r === state.cue25) playCue('warn');
  if(r === state.cue10p) playCue('alert');
}

// Alarma final — fuerte, constante y menos estridente
function startFinalAlarm(){
  stopFinalAlarm(); // asegura un solo loop activo
  const loop = ()=>{
    if(!state.alarmId) return;
    const t = audioCtx.currentTime;
    // Patrón un poco más largo (~800ms) antes de repetir.
    playToneAt(t, 660, .22, .30, 'triangle');
    setTimeout(()=> playToneAt(audioCtx.currentTime, 880, .20, .28, 'sine'), 150);
    setTimeout(()=> playToneAt(audioCtx.currentTime, 1046.5, .18, .24, 'sine'), 350);
    setTimeout(()=> playToneAt(audioCtx.currentTime, 880, .12, .26, 'square'), 560);
    state.alarmId = setTimeout(loop, 1000); // repetir cada 900ms
  };
  ensureAudio();
  state.alarmId = setTimeout(loop, 10);
}
function stopFinalAlarm(){ if(state.alarmId){ clearTimeout(state.alarmId); state.alarmId=null } }

// ======= Init seguro (evita entornos sin addEventListener) =======
function init(){
  byId('announcements').checked=state.announcements;
  byId('cuesOn').checked=state.cuesOn;
  recalcCueThresholds();
  applyLang();
}
on(window,'load', init);
if(typeof document!=='undefined' && (document.readyState==='complete' || document.readyState==='interactive')){
  setTimeout(init, 0);
}

// Tests
(function runSelfTests(){
  const tests=[]; const assert=(n,c)=>tests.push({name:n,pass:!!c});
  const snapshot = { total: state.total, remaining: state.remaining, buf: state.buf };
  try{
    assert('helper on() existe', typeof on==='function');
    assert('window.addEventListener disponible', typeof window!=='undefined' && typeof window.addEventListener==='function');
    assert('handleCueSchedule es función', typeof handleCueSchedule==='function');
    assert('10 keys', document.querySelectorAll('.key[data-k]').length===10);
    assert('8 presets', document.querySelectorAll('.preset').length===8);
    const prev=lang; lang='en'; applyLang(); assert('lang en', document.documentElement.lang==='en'); lang=prev; applyLang();
    pushDigit('1'); pushDigit('2'); pushDigit('3'); assert('buf digits', state.buf.endsWith('123'));
    clearBuffer(); assert('buffer cleared', state.buf==='000000');
    enterFocus(); assert('focus on', document.body.classList.contains('focus'));
    exitFocus(); assert('focus off', !document.body.classList.contains('focus'));
    assert('voice select', !!byId('voice'));
    const keep = {total:state.total, remaining:state.remaining};
    state.total=300; for(const r of [299,181,179,121,119,91,74,59,21,19,11,10,5,1]){ state.remaining=r; try{ handleCueSchedule(); assert('cue ok '+r, true) }catch(e){ assert('cue ok '+r, false) } }
    state.total=keep.total; state.remaining=keep.remaining;
    ensureAudio(); startFinalAlarm(); assert('alarm started', !!(state.alarmId)); stopFinalAlarm(); assert('alarm stopped', !state.alarmId);
  }catch(e){ console.error('Self-tests error:', e); }
  state.total = snapshot.total; state.remaining = snapshot.remaining; state.buf = snapshot.buf; render();
  const passed=tests.filter(t=>t.pass).length; console.group('%cContando Juntos — Tests','color:#111;background:#D2E0D3;padding:2px 6px;border-radius:6px'); tests.forEach(t=> console[t.pass?'log':'warn'](`${t.pass?'✅':'❌'} ${t.name}`)); console.log(`Resultado: ${passed}/${tests.length} pasaron`); console.groupEnd();
})();
