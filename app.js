
(function(){
  const $ = (sel)=>document.querySelector(sel);

  const toggleBtn = $("#toggleBtn");
  const timerEl = $("#timer");
  const statusMsg = $("#statusMsg");
  const validCountEl = $("#validCount");
  const prodCountEl = $("#prodCount");
  const lastIntervalEl = $("#lastInterval");
  const historyBody = $("#historyBody");
  const clearBtn = $("#clearBtn");
  const exportBtn = $("#exportBtn");
  const installBtn = $("#btnInstall");
  const yearEl = $("#year");

  yearEl.textContent = new Date().getFullYear();

  // ---- State ----
  let ticking = false;
  let startAt = null;
  let tickInterval = null;
  const LS_KEY = "nascertime.history.v1";

  /** Load & persist */
  function loadHistory(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }catch(e){
      console.warn("history parse fail", e);
      return [];
    }
  }
  function saveHistory(list){
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  let history = loadHistory(); // [{start, end, durationSec, type:'valid'|'prodromal'}]

  // ---- Helpers ----
  function fmtSec(s){
    const m = Math.floor(s/60);
    const r = Math.floor(s%60);
    return String(m).padStart(2,'0')+":"+String(r).padStart(2,'0');
  }
  function renderTimer(){
    if(!ticking){ timerEl.textContent = "00:00"; return; }
    const s = Math.max(0, (Date.now()-startAt)/1000);
    timerEl.textContent = fmtSec(s);
  }

  function computeType(durationSec){
    return durationSec >= 60 ? "valid" : "prodromal";
  }

  function getValidOnly(list){
    return list.filter(x=>x.type==="valid");
  }

  /** Compute interval (in minutes) between last two VALID contractions,
   * ignoring any prodromal in between. */
  function lastValidIntervalMinutes(list){
    const v = getValidOnly(list);
    if(v.length < 2) return null;
    const a = v[v.length-2];
    const b = v[v.length-1];
    const minutes = (b.start - a.start)/60000; // start-to-start interval
    return minutes;
  }

  /** Heuristics for alerts:
   * A) 10 válidas totais -> alerta simples
   * B) 3-1-1: últimas 60min com >= 15 válidas, duração >=60s
   *    e mediana do intervalo entre 2.5 e 3.5 min
   */
  function checkAlerts(list){
    const valid = getValidOnly(list);
    let msg = null;
    let level = "ok";

    if(valid.length >= 10){
      msg = "Sinal de alerta: você registrou 10 contrações válidas. Considere ir à maternidade conforme orientação.";
      level = "danger";
    }

    const now = Date.now();
    const last60 = valid.filter(x => (now - x.end) <= 60*60*1000);
    if(last60.length >= 15){
      // build intervals between consecutive valids in this window
      let intervals = [];
      for(let i=1;i<last60.length;i++){
        intervals.push((last60[i].start - last60[i-1].start)/60000);
      }
      if(intervals.length){
        const sorted = intervals.slice().sort((a,b)=>a-b);
        const median = sorted[Math.floor(sorted.length/2)];
        if(median >= 2.5 && median <= 3.5){
          msg = "Regra 3‑1‑1 atendida: contrações ~a cada 3min, ≥1min, por ~1h. Procure a maternidade.";
          level = "danger";
        } else if(!msg && valid.length >= 5){
          msg = "Ritmo crescente. Mantenha-se hidratada, respire, caminhe. Observe se as próximas seguem ~3/3 por 1h.";
          level = "warn";
        }
      }
    } else if(!msg && valid.length >= 5){
      msg = "Você tem 5+ contrações válidas. Se o intervalo se aproximar de 3/3 por ~1h, prepare a ida.";
      level = "warn";
    }

    if(!msg){
      msg = "Aguardando padrão consistente. Registre com calma.";
      level = "ok";
    }
    return {msg, level};
  }

  function syncUI(){
    // Counts
    const valid = getValidOnly(history);
    const prods = history.filter(x=>x.type==="prodromal");
    validCountEl.textContent = String(valid.length);
    prodCountEl.textContent = String(prods.length);

    // Interval
    const iv = lastValidIntervalMinutes(history);
    lastIntervalEl.textContent = iv ? iv.toFixed(1) + " min" : "—";

    // Status
    const {msg, level} = checkAlerts(history);
    statusMsg.textContent = msg;
    statusMsg.className = "status " + level;

    // History table
    historyBody.innerHTML = "";
    history.forEach((item, idx)=>{
      const tr = document.createElement("tr");
      const dur = fmtSec(item.durationSec);
      const typeLabel = item.type === "valid" ? "Real" : "Pródromo";
      const typeClass = item.type === "valid" ? "type-valid" : "type-prod";

      // Compute interval up to *this* valid, relative to previous valid
      let ivToThis = "—";
      if(item.type === "valid"){
        const v = getValidOnly(history.slice(0, idx+1));
        if(v.length >= 2){
          const a = v[v.length-2];
          const b = v[v.length-1];
          ivToThis = ((b.start - a.start)/60000).toFixed(1) + " min";
        }
      }

      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${new Date(item.start).toLocaleTimeString()}</td>
        <td>${new Date(item.end).toLocaleTimeString()}</td>
        <td>${dur}</td>
        <td class="${typeClass}">${typeLabel}</td>
        <td>${ivToThis}</td>
      `;
      historyBody.appendChild(tr);
    });
  }

  function startTick(){
    ticking = true;
    startAt = Date.now();
    timerEl.setAttribute("aria-live","polite");
    toggleBtn.textContent = "Parar contração";
    toggleBtn.classList.remove("primary");
    tickInterval = setInterval(renderTimer, 200);
  }
  function stopTick(){
    ticking = false;
    clearInterval(tickInterval);
    tickInterval = null;
    toggleBtn.textContent = "Iniciar contração";
    toggleBtn.classList.add("primary");

    const endAt = Date.now();
    const duration = (endAt - startAt)/1000;
    const type = computeType(duration);

    const entry = { start: startAt, end: endAt, durationSec: Math.round(duration), type };

    // push to history
    history.push(entry);

    // Persist
    saveHistory(history);

    // UI
    renderTimer();
    syncUI();
  }

  toggleBtn.addEventListener("click", ()=>{
    if(!ticking) startTick();
    else stopTick();
  });

  clearBtn.addEventListener("click", ()=>{
    if(confirm("Limpar todo o histórico local? Isso não pode ser desfeito.")){
      history = [];
      saveHistory(history);
      syncUI();
    }
  });

  exportBtn.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(history, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nascertime-historico.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---- Install prompt handling ----
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async ()=>{
    installBtn.hidden = true;
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
  });

  // ---- SW registration ----
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    });
  }

  // initial render
  renderTimer();
  syncUI();
})();
