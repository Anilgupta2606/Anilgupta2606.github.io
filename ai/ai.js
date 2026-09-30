"use strict";
/* =========================================================
   MONEY AI — one AI for every app on anilgupta2606.github.io: Money Home, Trip Vault,
   the 16-Year Ledger and the Expense Tracker.
   · Keys live in one place, the AI hub (/ai/), in this browser. Keys already entered in
     any of the apps are found and used too, so nothing needs entering twice.
   · The best service answers first (free ones first, this computer's Ollama next, paid
     Claude last), and each service tries its best model first: the strongest for "smart"
     work, a quick one for "fast" checks - the model that answered last time goes first.
     A service out of free quota rests 15 minutes while the next one answers.
   · Keys go only to the AI services themselves, straight from this browser.
   ========================================================= */
const MoneyAI = (function(){
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } };
  const lsSet = (k, v) => { try{ if(v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

  /* The Expense Tracker's AI settings in this browser (read only; a missing database is never created). */
  async function expenseTracker(){
    try{
      if(!window.indexedDB) return null;
      if(indexedDB.databases && !(await indexedDB.databases()).some(d=>d.name === 'expense-tracker')) return null;
      const db = await new Promise((res, rej)=>{ const r = indexedDB.open('expense-tracker'); r.onupgradeneeded = ()=>{ try{ r.transaction.abort(); }catch(e){} }; r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
      try{
        if(!db.objectStoreNames.contains('kv')) return null;
        const s = await new Promise((res, rej)=>{ const r = db.transaction('kv').objectStore('kv').get('state'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
        const st = (s && s.settings) || {};
        return {ai: {keys: Object.assign({}, st.aiKeys || {}, st.geminiKey ? {gemini: st.geminiKey} : {}), order: st.aiOrder || [], off: st.aiOff || [], model: st.aiModel || {}}};
      } finally { db.close(); }
    }catch(e){ return null; }
  }

  const PROVIDERS = [
    {id:'gemini', name:'Google Gemini', signupUrl:'https://aistudio.google.com/apikey', placeholder:'AIza…', models:['gemini-flash-latest','gemini-flash-lite-latest'], vision:true, search:true},
    {id:'groq', name:'Groq', signupUrl:'https://console.groq.com/keys', placeholder:'gsk_…', models:['openai/gpt-oss-120b','llama-3.3-70b-versatile','openai/gpt-oss-20b']},
    {id:'cerebras', name:'Cerebras', signupUrl:'https://cloud.cerebras.ai', placeholder:'csk-…', models:['gpt-oss-120b','llama-3.3-70b','llama3.1-8b']},
    {id:'mistral', name:'Mistral', signupUrl:'https://console.mistral.ai/api-keys', placeholder:'key', models:['mistral-small-latest','mistral-medium-latest']},
    {id:'openrouter', name:'OpenRouter', signupUrl:'https://openrouter.ai/keys', placeholder:'sk-or-…', models:['openrouter/free','meta-llama/llama-3.3-70b-instruct:free']},
    {id:'ollama', name:'Local (Ollama)', signupUrl:'https://ollama.com', placeholder:'http://localhost:11434', models:['gemma3:4b'], keyless:true},
    {id:'anthropic', name:'Anthropic Claude (paid)', signupUrl:'https://console.anthropic.com/settings/keys', placeholder:'sk-ant-…', models:['claude-haiku-4-5-20251001'], vision:true},
  ];
  const OPENAI_BASE = {groq:'https://api.groq.com/openai/v1', cerebras:'https://api.cerebras.ai/v1', mistral:'https://api.mistral.ai/v1', openrouter:'https://openrouter.ai/api/v1'};
  const SYNCED_AI = 'tripvault-ai-synced';          // keys that came from another device through Trip Vault's encrypted sync
  /* The keys this device uses, to carry to your other devices inside the encrypted sync (not Ollama: it is this computer's). */
  function shareableAi(){
    const s = aiSettings(), keys = {};
    Object.entries(s.keys).forEach(([id, k])=>{ if(id !== 'ollama' && s.from[id] !== 'synced') keys[id] = k; });
    return {keys, order: s.order, model: s.model};
  }
  /* Keys from another device: kept as a source, and added to the hub for any service it has no key for. */
  function takeSyncedAi(a){
    lsSet(SYNCED_AI, a && a.keys ? a : undefined);
    if(!a || !a.keys) return;
    const hub = aiLocal(); hub.keys = hub.keys || {};
    let added = false;
    Object.entries(a.keys).forEach(([id, k])=>{ if(k && !hub.keys[id] && id !== 'ollama'){ hub.keys[id] = k; added = true; } });
    if(added) saveAiLocal(hub);
  }
  const AI_KEY = 'money-ai', REST_KEY = 'money-ai-rest', MODELS_KEY = 'money-ai-models';
  const aiLocal = () => lsGet(AI_KEY, {keys:{}, order:[], off:[]});
  const saveAiLocal = s => lsSet(AI_KEY, s);
  let etAi = null;
  async function loadAi(){ const et = await expenseTracker(); etAi = et ? et.ai : null; return aiSettings(); }
  /* Keys found in the apps' own settings, for services the hub has no key for (first visit, or a key added in an app). */
  function adoptAppKeys(){
    const s = aiSettings(), hub = aiLocal(); hub.keys = hub.keys || {};
    let added = 0;
    Object.entries(s.keys).forEach(([id, k])=>{ if(!hub.keys[id] && s.from[id] !== 'hub' && id !== 'ollama'){ hub.keys[id] = k; added++; } });
    if(added) saveAiLocal(hub);
    return added;
  }
  /* Keys: the hub's first, then any app's own (Trip Vault, the Expense Tracker, the Ledger), then another device's. */
  function aiSettings(){
    const own = aiLocal(), et = etAi || {keys:{}, order:[], off:[], model:{}}, led = lsGet('ledger-ai', {keys:{}, order:[], off:[]});
    const tv = lsGet('tripvault-ai', {keys:{}}), synced = lsGet(SYNCED_AI, {keys:{}});
    const keys = {}, from = {};
    const sources = [['hub', own], ['trip-vault', tv], ['expense-tracker', et], ['ledger', led], ['synced', synced]];
    PROVIDERS.forEach(p=>{
      for(const [name, src] of sources){
        const k = String(((src || {}).keys || {})[p.id] || '').trim();
        if(k){ keys[p.id] = k; from[p.id] = name; break; }
      }
    });
    // the order: free services first, then this computer's, then the paid one (as ATS does) - or the Expense Tracker's own order
    let order = (own.order && own.order.length ? own.order : et.order || []).filter(id=>PROVIDERS.some(p=>p.id === id));
    PROVIDERS.forEach(p=>{ if(order.indexOf(p.id) < 0) order.push(p.id); });
    const off = own.order && own.order.length ? (own.off || []) : (et.off || []);
    // "which goes first": auto, or one picked by hand; the others follow only if fallback is on
    const first = own.first && own.first !== 'auto' && PROVIDERS.some(p=>p.id === own.first) ? own.first : 'auto';
    const fallback = own.fallback !== false;
    if(first !== 'auto') order = [first].concat(order.filter(id=>id !== first));
    return {keys, from, order, off, first, fallback, model: Object.assign({}, et.model || {}, own.model || {})};
  }
  const usable = s => { const u = s.order.filter(id=>s.off.indexOf(id) < 0 && s.keys[id]); return s.first !== 'auto' && !s.fallback ? u.filter(id=>id === s.first) : u; };
  const aiAvailable = () => usable(aiSettings()).length > 0;
  const aiNames = () => usable(aiSettings()).map(id=>PROVIDERS.find(p=>p.id === id).name);
  const canSee = () => usable(aiSettings()).some(id=>PROVIDERS.find(p=>p.id === id).vision);
  const canSearch = () => usable(aiSettings()).indexOf('gemini') >= 0;

  const restMap = () => lsGet(REST_KEY, {});
  function resting(id){ const r = restMap()[id]; return r && r.until > Date.now() ? r : null; }
  const changed = () => { try{ window.dispatchEvent(new CustomEvent('moneyai-change')); }catch(e){} };
  function rest(id, why){ const m = restMap(); m[id] = {until: Date.now() + 15 * 60000, why}; lsSet(REST_KEY, m); changed(); }
  function wake(id){ const m = restMap(); delete m[id]; lsSet(REST_KEY, m); }

  function Unavailable(message, status, limit){ const e = new Error(message); e.unavailable = true; e.status = status; e.limit = !!limit; return e; }
  async function post(url, headers, body, signal, wait){
    const ctl = new AbortController(), timer = setTimeout(()=>ctl.abort(), wait || 120000);
    if(signal) signal.addEventListener('abort', ()=>ctl.abort());
    try{ return await fetch(url, {method:'POST', headers:Object.assign({'Content-Type':'application/json'}, headers), body:JSON.stringify(body), signal:ctl.signal}); }
    catch(e){
      if(signal && signal.aborted){ const c = new Error('Stopped.'); c.code = 'cancelled'; throw c; }
      if(e.name === 'AbortError') throw Unavailable('No answer in time.', 504);
      throw Unavailable('Could not reach the service (offline, or it blocked the request).', 503);
    } finally { clearTimeout(timer); }
  }
  async function failure(name, res){
    const body = await res.text().catch(()=>'');
    if(res.status === 401 || res.status === 403 || (res.status === 400 && /api[ _-]?key|unauthori[sz]ed|invalid.*key/i.test(body))) throw new Error(name + ' rejected the API key.');
    if(res.status === 429 || /quota|rate.?limit|exhausted|too many/i.test(body)) throw Unavailable(name + ': free limit reached for now.', 429, true);
    if(res.status === 402) throw Unavailable(name + ': no credit left on this account.', 402, true);
    if(res.status === 404) throw Unavailable(name + ': model not available to this key.', 404);
    if(res.status === 400 && /image|vision|multimodal|content type/i.test(body)) throw Unavailable(name + ' cannot read images with this model.', 400);
    if(res.status >= 500) throw Unavailable(name + ' is busy right now.', res.status);
    throw Unavailable(name + ' returned an error (' + res.status + ').', res.status);
  }
  /* opts.images: [{mime, b64}] (only services that can see get them); opts.search: Gemini looks on the web.
     -> {text, sources:[{title, url}]} */
  async function callOne(id, key, model, system, turns, opts, signal){
    const name = PROVIDERS.find(p=>p.id === id).name;
    const images = opts.images || [];
    if(id === 'gemini'){
      const contents = turns.map((t, i)=>({role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{text: t.content}].concat(i === turns.length - 1 ? images.map(im=>({inline_data:{mime_type: im.mime, data: im.b64}})) : [])}));
      const body = {systemInstruction:{parts:[{text:system}]}, contents, generationConfig:{temperature:0.2, maxOutputTokens:8192}};
      if(opts.search) body.tools = [{google_search:{}}];
      const res = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key), {}, body, signal);
      if(!res.ok) await failure(name, res);
      const d = await res.json();
      const cand = (d.candidates || [])[0] || {};
      const text = ((cand.content || {}).parts || []).map(p=>p.text || '').join('');
      if(!text) throw Unavailable('Gemini returned an empty answer.', 502);
      const sources = (((cand.groundingMetadata || {}).groundingChunks) || []).map(c=>c.web).filter(Boolean).map(w=>({title: w.title, url: w.uri}));
      return {text, sources};
    }
    if(id === 'anthropic'){
      const messages = turns.map((t, i)=>({role: t.role, content: i === turns.length - 1 && images.length
        ? images.map(im=>im.mime === 'application/pdf' ? {type:'document', source:{type:'base64', media_type:im.mime, data:im.b64}} : {type:'image', source:{type:'base64', media_type:im.mime, data:im.b64}}).concat([{type:'text', text:t.content}])
        : t.content}));
      const res = await post('https://api.anthropic.com/v1/messages', {'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'},
        {model, max_tokens:8192, temperature:0.2, system, messages}, signal);
      if(!res.ok) await failure(name, res);
      const d = await res.json();
      return {text: (d.content || []).map(c=>c.text || '').join(''), sources: []};
    }
    if(id === 'ollama'){
      // Ollama's own API, with "thinking" off: reasoning models otherwise think for minutes on a laptop
      const res = await post(key.replace(/\/+$/, '') + '/api/chat', {},
        {model, stream:false, think:false, options:{temperature:0.2, num_ctx:8192}, messages:[{role:'system', content:system}].concat(turns)}, signal, 600000);
      if(!res.ok) await failure(name, res);
      const d = await res.json();
      const text = ((d.message || {}).content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
      if(!text) throw Unavailable(name + ' returned an empty answer.', 502);
      return {text, sources: []};
    }
    const base = OPENAI_BASE[id];
    const headers = {Authorization:'Bearer ' + key};
    if(id === 'openrouter'){ headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Trip Vault'; }
    const res = await post(base + '/chat/completions', headers,
      {model, temperature:0.2, max_tokens:8192, messages:[{role:'system', content:system}].concat(turns)}, signal);
    if(!res.ok) await failure(name, res);
    const d = await res.json();
    const text = ((((d.choices || [])[0] || {}).message) || {}).content || '';
    if(!text) throw Unavailable(name + ' returned an empty answer.', 502);
    return {text: text.replace(/<think>[\s\S]*?<\/think>/g, ''), sources: []};     // reasoning models think out loud first
  }

  const NOT_CHAT = /embed|tts|whisper|audio|speech|transcribe|image-gen|imagen|veo|lyria|dall|guard|moderation|rerank|live|realtime|robotics|computer-use|omni|customtools|aqa|learnlm|compound|playai|safeguard/i;
  const PREFER = ['gpt-oss-120b','kimi-k2','qwen3-235b','qwen-3-235b','llama-4-maverick','deepseek-v3','llama-3.3-70b','mistral-large','mistral-medium','qwen3-32b','qwen-3-32b','llama-4-scout','mistral-small','gpt-oss-20b','gemma-3-27b','ministral-8b','llama-3.1-8b','llama3.1-8b'];
  const sizeB = m => Number((m.match(/(\d+(?:\.\d+)?)b\b/i) || [])[1] || 0);
  const verOf = m => Number((m.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0);
  // for quick tasks: the mid-size models ATS found answer fastest and still well
  const FAST_PREFER = ['gpt-oss-20b','ministral-3b','ministral-8b','qwen3-32b','qwen-3-32b','llama-3.1-8b','llama3.1-8b','gemma-3-27b','mistral-small','llama-4-scout','llama-3.3-70b','gpt-oss-120b'];
  const prefIdx = (m, list) => { list = list || PREFER; const i = list.findIndex(p=>m.toLowerCase().indexOf(p) >= 0); return i < 0 ? list.length : i; };
  /* The best models first, for a kind of task: "smart" (reading documents, planning, news) wants the strongest,
     "fast" (a flight check) a quick one - the same split ATS makes. */
  function rankModels(id, names, tier){
    const fast = tier === 'fast';
    const uniq = Array.from(new Set(names)).filter(m=>!NOT_CHAT.test(m));
    if(id === 'gemini'){
      const g = uniq.filter(m=>/^gemini/.test(m) && !/gemma|nano|tuning|image|tts|embedding|live|audio|robotics|computer|deep-research|antigravity/.test(m));
      const kind = m => /lite/.test(m) ? 'lite' : /flash/.test(m) ? 'flash' : /pro/.test(m) ? 'pro' : 'other';
      const RANK = fast ? {lite: 0, flash: 1, pro: 3, other: 4} : {flash: 0, pro: 1, lite: 2, other: 4};
      const alias = m => /-latest$/.test(m), preview = m => /preview|exp/.test(m) ? 1 : 0;
      const newest = k => Math.max.apply(null, [0].concat(g.filter(m=>!alias(m) && kind(m) === k).map(verOf)));
      const ver = m => alias(m) ? newest(kind(m)) : verOf(m);
      // newest version first; at the same version a named model before the -latest alias, and a stable one before a preview
      const score = m => [RANK[kind(m)], -ver(m), alias(m) ? 1 : 0, preview(m)];
      return g.sort((a, b)=>{ const x = score(a), y = score(b); for(let i = 0; i < x.length; i++) if(x[i] !== y[i]) return x[i] - y[i]; return a.localeCompare(b); });
    }
    if(id === 'anthropic'){ const t = m => /haiku/.test(m) ? (fast ? 0 : 1) : /sonnet/.test(m) ? (fast ? 1 : 0) : 2; return uniq.filter(m=>/^claude/.test(m) && !/opus/.test(m)).sort((a, b)=>t(a) - t(b) || b.localeCompare(a)); }
    // a model on this computer: the smallest good one first (a laptop runs a 4B model in seconds, an 8B one in minutes)
    if(id === 'ollama'){ const LOCAL = ['gemma3:4b', 'llama3.2:3b', 'qwen2.5:3b', 'phi4-mini', 'qwen3:4b', 'gemma3:1b'];
      const li = m => { const i = LOCAL.findIndex(x=>m.toLowerCase().indexOf(x) === 0); return i < 0 ? LOCAL.length : i; };
      return uniq.sort((a, b)=>li(a) - li(b) || (sizeB(a) || 99) - (sizeB(b) || 99)); }
    let list = uniq;
    if(id === 'openrouter') list = uniq.filter(m=>/:free$/.test(m) || m === 'openrouter/free');
    const ranked = list.filter(m=>m !== 'openrouter/free').sort(fast
      ? (a, b)=>prefIdx(a, FAST_PREFER) - prefIdx(b, FAST_PREFER) || (sizeB(a) || 50) - (sizeB(b) || 50)
      : (a, b)=>prefIdx(a) - prefIdx(b) || sizeB(b) - sizeB(a) || a.localeCompare(b));
    return id === 'openrouter' && list.indexOf('openrouter/free') >= 0 ? ranked.slice(0, 3).concat(['openrouter/free'], ranked.slice(3)) : ranked;
  }
  async function listModels(id, key){
    let res;
    if(id === 'gemini') res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key));
    else if(id === 'anthropic') res = await fetch('https://api.anthropic.com/v1/models', {headers:{'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'}});
    else if(id === 'ollama') res = await fetch(key.replace(/\/+$/, '') + '/api/tags');
    else res = await fetch(OPENAI_BASE[id] + '/models', {headers:{Authorization:'Bearer ' + key}});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if(id === 'gemini') return (d.models || []).filter(m=>(m.supportedGenerationMethods || []).indexOf('generateContent') >= 0).map(m=>m.name.replace(/^models\//, ''));
    if(id === 'ollama') return (d.models || []).map(m=>m.name);
    return (d.data || []).map(m=>m.id);
  }
  /* What a key can use (asked once a day), ranked for the task. */
  async function bestModels(id, key, tier){
    const cache = lsGet(MODELS_KEY, {}), c = cache[id], tag = key.slice(-6);
    let names = c && c.key === tag && Date.now() - c.at < 86400000 && c.names && c.names.length ? c.names : null;
    if(!names){
      try{ names = await listModels(id, key); if(names.length){ cache[id] = {at: Date.now(), key: tag, names}; lsSet(MODELS_KEY, cache); } }catch(e){ names = null; }
    }
    const ranked = names ? rankModels(id, names, tier) : [];
    return ranked.length ? ranked : PROVIDERS.find(p=>p.id === id).models;
  }
  /* Which model answered last, per service and kind of task (tried first next time), and models a key cannot use (skipped for a day). */
  const WORKING_KEY = 'money-ai-working', BAD_KEY = 'money-ai-bad';
  function remember(id, tier, model){ const w = lsGet(WORKING_KEY, {}); w[id] = Object.assign({}, w[id], {[tier]: model, at: Date.now()}, {last: tier}); lsSet(WORKING_KEY, w); lsSet(WORKING_KEY + '-now', {id, model, at: Date.now()}); changed(); }
  function markBad(id, model){ const b = lsGet(BAD_KEY, {}); b[id + '|' + model] = Date.now() + 86400000; lsSet(BAD_KEY, b); }
  const isBad = (id, model) => (lsGet(BAD_KEY, {})[id + '|' + model] || 0) > Date.now();
  /* What answers now, for the settings: [{id, name, model, resting}] in the order they are tried. */
  function aiStatus(){
    const s = aiSettings(), w = lsGet(WORKING_KEY, {});
    return usable(s).map(id=>({id, name: PROVIDERS.find(p=>p.id === id).name, model: (w[id] || {}).smart || '', resting: resting(id)}));
  }
  /* -> {text, sources, provider, model}. The best service first and its best model first (the one that answered
     last time, else the strongest the key can use), then the next model, then the next service - the way ATS picks.
     A service out of free quota rests 15 minutes. opts.tier: 'smart' (default) or 'fast'.
     opts.images: only services that can see are tried. opts.search: only Gemini (Google Search) is tried. */
  async function chat(system, turns, opts, signal){
    opts = opts || {};
    // opts.onProgress(text, id): each step as it happens - which AI is asked, which is skipped and why
    const tell = (t, id) => { try{ if(opts.onProgress) opts.onProgress(t, id); }catch(e){} };
    const tier = opts.tier === 'fast' ? 'fast' : 'smart';
    const s = aiSettings();
    let order = usable(s);
    if(opts.images && opts.images.length) order = order.filter(id=>PROVIDERS.find(p=>p.id === id).vision);
    if(opts.search) order = order.filter(id=>PROVIDERS.find(p=>p.id === id).search);
    // a web search that is only nice to have: when no AI that can search is free, the next AI answers without it
    if(opts.search && opts.searchOptional){
      const free = order.filter(id=>!resting(id));
      if(!free.length) return Object.assign(await chat(system, turns, Object.assign({}, opts, {search: false, searchOptional: false}), signal), {noSearch: true});
    }
    if(!order.length) throw new Error(opts.search ? 'Web search needs a Google Gemini key (free) — add one in Settings → AI.'
      : opts.images ? 'Reading a picture needs a Gemini or Claude key.' : 'Add a free AI key in Settings → AI (or in the Expense Tracker).');
    const skipped = []; let lastError = null;
    const working = lsGet(WORKING_KEY, {});
    for(const id of order){
      const r = resting(id);
      const pname = PROVIDERS.find(p=>p.id === id).name;
      if(r){ skipped.push(pname + ' is resting (' + r.why + ')'); tell(pname + ' is at its free limit — skipping'); continue; }
      const key = s.keys[id];
      const pinned = s.model[id] && s.model[id] !== 'auto' ? [s.model[id]] : [];
      const last = id === 'ollama' ? null : (working[id] || {})[tier];     // on this computer: always the light model first, not the one that last answered
      const models = Array.from(new Set(pinned.concat(last ? [last] : [], await bestModels(id, key, tier), PROVIDERS.find(p=>p.id === id).models)))
        .filter(m=>pinned.indexOf(m) >= 0 || !isBad(id, m)).slice(0, 5);
      for(const model of models){
        try{
          tell('Asking ' + pname + ' · ' + model + (opts.search ? ' (with a web search)' : '') + '…', id);
          const out = await callOne(id, key, model, system, turns, opts, signal);
          remember(id, tier, model); wake(id);
          return Object.assign(out, {provider: PROVIDERS.find(p=>p.id === id).name, model});
        }catch(e){
          if(e.code === 'cancelled') throw e;
          lastError = e;
          if(e.unavailable) tell(e.message + ' — trying the next');
          if(!e.unavailable){ skipped.push(e.message); tell(e.message + ' — trying the next'); break; }        // the key itself was refused
          if(e.status === 404) markBad(id, model);                      // this key cannot use that model
          if(e.limit){ rest(id, e.message); break; }                    // out of free quota: next service
        }
      }
    }
    if(opts.search && opts.searchOptional)                     // the searching AI failed: the next one answers without searching
      return Object.assign(await chat(system, turns, Object.assign({}, opts, {search: false, searchOptional: false}), signal), {noSearch: true});
    const why = skipped.concat(lastError && lastError.unavailable ? [lastError.message] : []);
    throw new Error('No AI service could answer' + (why.length ? ': ' + why.join('; ') : '') + '. Try again later or add another free key.');
  }
  /* The JSON inside an AI answer (it may wrap it in prose or ``` fences). */
  function json(text){
    const t = String(text || '').replace(/```(?:json)?/gi, '');
    const s = t.search(/[\[{]/);
    if(s < 0) throw new Error('The AI did not answer in the expected form.');
    const open = t[s], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for(let i = s; i < t.length; i++){
      const c = t[i];
      if(inStr){ if(esc) esc = false; else if(c === '\\') esc = true; else if(c === '"') inStr = false; continue; }
      if(c === '"') inStr = true;
      else if(c === open) depth++;
      else if(c === close && --depth === 0) return JSON.parse(t.slice(s, i + 1));
    }
    throw new Error('The AI answer was cut off. Try again.');
  }


  /* A tiny question to one service: does this key work? -> {ok, model, ms, error} */
  async function test(id){
    const s = aiSettings(), key = s.keys[id];
    if(!key) return {ok: false, error: 'No key.'};
    const t = Date.now();
    try{
      const models = await bestModels(id, key, 'fast');
      const out = await callOne(id, key, models[0], 'Answer with one word.', [{role: 'user', content: 'Say OK.'}], {}, null);
      return {ok: /ok/i.test(out.text), model: models[0], ms: Date.now() - t};
    }catch(e){ return {ok: false, error: e.message}; }
  }
  const setModel = (id, m) => { const h = aiLocal(); h.model = Object.assign({}, h.model, {[id]: m}); saveAiLocal(h); };

  return {PROVIDERS, loadAi, aiSettings, aiLocal, saveAiLocal, adoptAppKeys, aiStatus, rankModels, shareableAi, takeSyncedAi,
          aiAvailable, aiNames, canSee, canSearch, resting, wake, chat, json, test, setModel, listModels};
})();

/* =========================================================
   MONEY SHARED — set up once, for every app on the site:
   · one sign-in: the Expense Tracker's username and password, carried (as its hash, encrypted) to
     your other devices, so the phone opens with the same password as the laptop,
   · one sync setup: the GitHub token and passphrase are given to Trip Vault, the Ledger and the
     Expense Tracker at once (each keeps its own private, encrypted gist),
   · the AI keys and choices (the AI hub) travel in one small encrypted "settings" gist.
   ========================================================= */
const MoneyShared = (function(){
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } };
  const lsSet = (k, v) => { try{ if(v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
  const AUTH = 'money-auth', CFG = 'money-setup', FILE = 'money-home.settings.json';
  /* each app's own sync settings in this browser */
  const APPS = [
    {id: 'trip', name: 'Trip Vault', key: 'tripvault-sync-config', url: '/tripManangement/'},
    {id: 'led', name: '16-Year Ledger', key: 'ledger-sync-config', url: '/InvestmentPlan/'},
    {id: 'exp', name: 'Expense Tracker', key: 'sync-config', url: '/expenseTracker/'},
  ];

  async function sha256(text){
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), b=>b.toString(16).padStart(2, '0')).join('');
  }
  async function etAuth(){
    try{
      if(!window.indexedDB || (indexedDB.databases && !(await indexedDB.databases()).some(d=>d.name === 'expense-tracker'))) return null;
      const db = await new Promise((res, rej)=>{ const r = indexedDB.open('expense-tracker'); r.onupgradeneeded = ()=>{ try{ r.transaction.abort(); }catch(e){} }; r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
      try{
        if(!db.objectStoreNames.contains('kv')) return null;
        const s = await new Promise((res, rej)=>{ const r = db.transaction('kv').objectStore('kv').get('state'); r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error); });
        return s && s.auth && s.auth.passwordHash ? {user: s.auth.username, hash: s.auth.passwordHash, scheme: 'et'} : null;
      } finally { db.close(); }
    }catch(e){ return null; }
  }
  const verify = async (a, u, p) => u.toLowerCase() === String(a.user || '').toLowerCase() &&
    await sha256(a.scheme === 'et' ? 'expense-tracker|' + u.toLowerCase() + '|' + p : u.toLowerCase() + ':' + p) === a.hash;
  /* The sign-in, for every app: the Expense Tracker's here, else the one your other device carried over,
     else the app's own (Ledger / Trip Vault), else admin / admin on a fresh device. -> true / false */
  async function checkLogin(user, pass, own){
    const u = String(user || '').trim();
    const et = await etAuth();
    if(et) return verify(et, u, pass);
    const carried = lsGet(AUTH, null);
    if(carried && carried.hash) return verify(carried, u, pass);
    const plan = lsGet('ledger-draft-v2', null) || lsGet('ledger-state-v2', null);
    if(plan && plan.auth && plan.auth.hash) return verify({user: plan.auth.user, hash: plan.auth.hash}, u, pass);
    if(own && own.hash) return verify({user: own.user, hash: own.hash}, u, pass);
    return u.toLowerCase() === 'admin' && pass === 'admin';
  }
  async function loginSource(){
    if(await etAuth()) return 'expense-tracker';
    if((lsGet(AUTH, null) || {}).hash) return 'carried';
    const plan = lsGet('ledger-draft-v2', null) || lsGet('ledger-state-v2', null);
    return plan && plan.auth && plan.auth.hash ? 'ledger' : 'default';
  }

  /* ---- encryption, the same scheme as the apps' own sync */
  const b64 = bytes => { let s = ''; for(let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
  async function keyFor(pass, salt){
    const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256'}, raw, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, pass){
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await keyFor(pass, salt), new TextEncoder().encode(JSON.stringify(obj))));
    return {app: 'money-settings', v: 1, savedAt: Date.now(), salt: b64(salt), iv: b64(iv), data: b64(data)};
  }
  async function unseal(env, pass){
    try{ return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(env.iv)}, await keyFor(pass, unb64(env.salt)), unb64(env.data)))); }
    catch(e){ throw new Error('The passphrase does not match the one your other device used.'); }
  }
  async function gh(token, path, init){
    init = init || {};
    let res;
    try{ res = await fetch('https://api.github.com' + path, Object.assign({}, init, {cache: 'no-store', headers: Object.assign({Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28'}, init.body ? {'Content-Type': 'application/json'} : {})})); }
    catch(e){ throw new Error('Could not reach GitHub (offline?).'); }
    if(res.status === 401) throw new Error('GitHub refused the token (expired, or mistyped?).');
    if(res.status === 403 || res.status === 404) throw new Error('The token needs the “Gists: read and write” permission.');
    if(!res.ok) throw new Error('GitHub error ' + res.status + '.');
    return res;
  }

  const config = () => lsGet(CFG, null);
  const markChanged = () => lsSet(CFG + '-changed', Date.now());
  /* What travels: the AI hub's keys and choices (not Ollama: it is this computer's) and the sign-in. */
  async function mine(){
    const hub = MoneyAI.aiLocal(), shared = MoneyAI.shareableAi();
    return {ai: {keys: shared.keys, first: hub.first || 'auto', fallback: hub.fallback !== false, model: hub.model || {}, off: hub.off || []},
            auth: (await etAuth()) || lsGet(AUTH, null), updatedAt: lsGet(CFG + '-changed', 0)};
  }

  /* Bring the settings gist and this device together: keys either has are kept (the more recently changed
     side wins a clash), and the sign-in comes from the device that has the Expense Tracker. */
  async function sync(){
    const cfg = config();
    if(!cfg) throw new Error('Not set up on this device yet.');
    if(!cfg.gistId){
      for(let page = 1; page <= 5 && !cfg.gistId; page++){
        const list = await (await gh(cfg.token, '/gists?per_page=100&page=' + page)).json();
        const hit = list.find(g=>g.files && FILE in g.files);
        if(hit) cfg.gistId = hit.id;
        if(list.length < 100) break;
      }
    }
    let remote = null;
    if(cfg.gistId){
      const g = await (await gh(cfg.token, '/gists/' + cfg.gistId)).json();
      const f = g.files && g.files[FILE];
      if(f) remote = await unseal(JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content), cfg.pass);
    }
    const here = await mine(), hasEt = !!(await etAuth());
    let out = here;
    if(remote){
      const newer = (remote.updatedAt || 0) > (here.updatedAt || 0);
      const a = newer ? remote.ai : here.ai, b = newer ? here.ai : remote.ai;
      out = {ai: Object.assign({}, b, a, {keys: Object.assign({}, b.keys, a.keys), model: Object.assign({}, b.model, a.model)}),
             auth: hasEt ? here.auth : (remote.auth || here.auth), updatedAt: Math.max(remote.updatedAt || 0, here.updatedAt || 0)};
      // this device takes the result (its own Ollama address stays)
      const hub = MoneyAI.aiLocal();
      hub.keys = Object.assign({}, out.ai.keys, (hub.keys || {}).ollama ? {ollama: hub.keys.ollama} : {});
      hub.first = out.ai.first; hub.fallback = out.ai.fallback; hub.model = out.ai.model; hub.off = out.ai.off;
      MoneyAI.saveAiLocal(hub);
      if(out.auth && !hasEt) lsSet(AUTH, out.auth);
    }
    const files = {}; files[FILE] = {content: JSON.stringify(await seal(out, cfg.pass))};
    if(cfg.gistId) await gh(cfg.token, '/gists/' + cfg.gistId, {method: 'PATCH', body: JSON.stringify({files})});
    else cfg.gistId = (await (await gh(cfg.token, '/gists', {method: 'POST', body: JSON.stringify({description: 'Money Home settings (encrypted)', public: false, files})})).json()).id;
    cfg.syncedAt = Date.now(); cfg.lastError = undefined;
    lsSet(CFG, cfg);
    return {pulled: !!remote, keys: Object.keys(out.ai.keys).length, signIn: !!out.auth};
  }

  /* Set up this device once: the token and passphrase for the settings and for every app's sync. */
  async function setUp(token, pass){
    if(!token || !pass) throw new Error('Enter both the token and the passphrase.');
    if(pass.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
    await gh(token, '/gists?per_page=1');                       // the token works
    lsSet(CFG, {token, pass});
    APPS.forEach(a=>{ const c = lsGet(a.key, null); if(!c || !c.token) lsSet(a.key, {token, pass}); });
    return sync();
  }
  /* The sync settings some app on this device already has, to offer instead of typing them again. */
  const existing = () => { for(const a of [{key: CFG}].concat(APPS)){ const c = lsGet(a.key, null); if(c && c.token && c.pass) return {token: c.token, pass: c.pass}; } return null; };
  function status(){
    const cfg = config();
    return {setup: cfg ? {syncedAt: cfg.syncedAt, lastError: cfg.lastError} : null,
            apps: APPS.map(a=>{ const c = lsGet(a.key, null); return Object.assign({}, a, {on: !!(c && c.token), syncedAt: c && c.syncedAt, lastError: c && c.lastError}); })};
  }
  function forget(){ lsSet(CFG, undefined); }
  /* Quietly bring the settings in, at most every 10 minutes (the apps call it as they open). */
  async function quiet(){
    const c = config();
    if(!c || (c.syncedAt && Date.now() - c.syncedAt < 600000)) return null;
    try{ return await sync(); }catch(e){ lsSet(CFG, Object.assign(c, {lastError: e.message})); return null; }
  }
  return {checkLogin, loginSource, setUp, sync, quiet, status, existing, forget, markChanged, APPS};
})();

/* =========================================================
   The AI switch, in every app's top bar (as in ATS): which AI is answering, and a choice of
   Auto (the best one that answers) or one AI first. The choice is the same in every app.
   MoneyAI.widget(element, {chipClass}) puts it in the element.
   ========================================================= */
MoneyAI.widget = (function(){
  const css = `
.mai{position:relative;display:inline-flex}
.mai-chip{display:inline-flex;align-items:center;gap:7px;font:600 13px/1 inherit;font-family:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:999px;padding:7px 11px;cursor:pointer;white-space:nowrap;max-width:260px}
.mai-chip:hover{border-color:color-mix(in srgb,currentColor 45%,transparent)}
.mai-chip:focus-visible{outline:2px solid #0A7C8C;outline-offset:2px}
.mai-chip b{font-weight:700;overflow:hidden;text-overflow:ellipsis}
.mai-chip .mai-m{opacity:.7;font-weight:500;overflow:hidden;text-overflow:ellipsis}
.mai-dot{width:8px;height:8px;border-radius:50%;flex:none;background:#9aa7b4}
.mai-dot.good{background:#1FB36B;box-shadow:0 0 0 3px rgb(31 179 107 / .2)}
.mai-dot.lim{background:#F2A516;box-shadow:0 0 0 3px rgb(242 165 22 / .2)}
.mai-dot.bad{background:#E5484D}
.mai-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:1000;width:320px;max-width:calc(100vw - 24px);background:#fff;color:#0B2545;border:1px solid #D5E0EB;border-radius:16px;box-shadow:0 18px 44px -12px rgb(11 37 69 / .35);padding:14px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}
.mai-pop[hidden]{display:none}
.mai-pop.mai-up{top:auto;bottom:calc(100% + 8px)}
.mai-pop.mai-left{right:auto;left:0}
.mai-pop h4{margin:0 0 2px;font-size:15px}
.mai-pop .mai-sub{margin:0 0 10px;font-size:12.5px;color:#5B6F86}
.mai-opt{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:11px;cursor:pointer;border:1px solid transparent}
.mai-opt:hover{background:#EEF4FA}
.mai-opt.on{background:#E3F4F4;border-color:#9FD6D8}
.mai-opt input{margin:0;accent-color:#0A7C8C}
.mai-opt span.t{flex:1;min-width:0}
.mai-opt b{display:block;font-size:14px}
.mai-opt small{display:block;color:#5B6F86;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mai-now{font-size:11.5px;font-weight:700;color:#0A7C8C;background:#E3F4F4;border-radius:999px;padding:2px 8px;white-space:nowrap}
.mai-fb{display:flex;gap:8px;align-items:center;margin:10px 2px 8px;font-size:13px;cursor:pointer}
.mai-fb input{accent-color:#0A7C8C}
.mai-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #E1E9F1;padding-top:10px;font-size:13px}
.mai-foot a{color:#0A7C8C;font-weight:600;text-decoration:none}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .mai-pop{background:#0F2440;color:#EEF4FB;border-color:#2C4F77}
  :root:not([data-theme="light"]) .mai-pop .mai-sub, :root:not([data-theme="light"]) .mai-opt small{color:#9FB3CA}
  :root:not([data-theme="light"]) .mai-opt:hover{background:#15304F} :root:not([data-theme="light"]) .mai-opt.on{background:#12394A;border-color:#1F6B72}
  :root:not([data-theme="light"]) .mai-now{background:#12394A;color:#3CCFCF} :root:not([data-theme="light"]) .mai-foot{border-color:#1E3A5C} :root:not([data-theme="light"]) .mai-foot a{color:#3CCFCF} }
:root[data-theme="dark"] .mai-pop{background:#0F2440;color:#EEF4FB;border-color:#2C4F77}
:root[data-theme="dark"] .mai-pop .mai-sub, :root[data-theme="dark"] .mai-opt small{color:#9FB3CA}
:root[data-theme="dark"] .mai-opt:hover{background:#15304F} :root[data-theme="dark"] .mai-opt.on{background:#12394A;border-color:#1F6B72}
:root[data-theme="dark"] .mai-now{background:#12394A;color:#3CCFCF} :root[data-theme="dark"] .mai-foot{border-color:#1E3A5C} :root[data-theme="dark"] .mai-foot a{color:#3CCFCF}
/* the host app's own form styles must not reach inside the panel */
.mai .mai-pop label.mai-opt, .mai .mai-pop label.mai-fb{display:flex;flex-direction:row;align-items:center;font-weight:400;color:inherit;margin:0}
.mai .mai-pop label.mai-fb{margin:10px 2px 8px}
.mai .mai-pop input[type=radio], .mai .mai-pop input[type=checkbox]{width:16px;height:16px;min-height:0;min-width:0;padding:0;margin:0;flex:none;border:0;box-shadow:none;background:none}
.mai .mai-pop h4, .mai .mai-pop p{letter-spacing:normal;text-transform:none}
@media (max-width:640px){ .mai-chip .mai-m{display:none} .mai-chip{max-width:150px}
  .mai-pop, .mai-pop.mai-up, .mai-pop.mai-left{position:fixed;left:12px;right:12px;top:72px;bottom:auto;width:auto;max-width:none;max-height:calc(100vh - 160px);overflow:auto} }`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const short = n => String(n || '').replace(/ \(.*\)/, '').replace(/^Google /, '').replace(/^Anthropic /, '');
  const mshort = m => String(m || '').split('/').pop().replace(/:free$/, '');
  const lsGet = (k, d) => { try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } };
  const mounts = [];
  function state(){
    const s = MoneyAI.aiSettings(), w = lsGet('money-ai-working', {});
    const answering = MoneyAI.aiStatus();                      // the ones that will be asked, in order
    const inUse = answering.find(x=>!x.resting) || null;       // who answers the next question
    // every AI that is set up, to pick from (not only the ones asked now)
    const list = s.order.filter(id=>s.keys[id] && s.off.indexOf(id) < 0)
      .map(id=>({id, name: MoneyAI.PROVIDERS.find(p=>p.id === id).name, model: (w[id] || {}).smart || '', resting: MoneyAI.resting(id)}));
    return {s, list, inUse};
  }
  function chip(st){
    const {list, inUse} = st;
    const dot = !list.length ? '' : inUse ? 'good' : 'lim';
    const name = !list.length ? 'set up' : inUse ? short(inUse.name) : 'resting';
    const model = inUse && inUse.model ? mshort(inUse.model) : '';
    const title = !list.length ? 'No AI set up yet — add a key in Setup'
      : inUse ? `Answering: ${inUse.name}${inUse.model ? ' · ' + inUse.model : ''} (${st.s.first === 'auto' ? 'Auto — the best one available' : 'your choice'})` +
        (list.length > 1 ? `\nStandby: ${list.filter(x=>x !== inUse).map(x=>short(x.name)).join(', ')}` : '') + '\nClick to switch'
      : 'Every AI is at its free limit — they try again in a few minutes';
    return {dot, name, model, title};
  }
  function popHTML(st){
    const {s, list, inUse} = st;
    const opt = (value, on, title, sub, dot, now) => `<label class="mai-opt${on ? ' on' : ''}"><input type="radio" name="mai-first-${value === 'auto' ? 'a' : 'p'}" data-first="${value}" ${on ? 'checked' : ''}>
      ${dot !== null ? `<span class="mai-dot ${dot}"></span>` : ''}<span class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${now ? '<span class="mai-now">in use</span>' : ''}</label>`;
    const rows = list.map(x=>opt(x.id, s.first === x.id, x.name, x.resting ? 'at its free limit — resting' : (x.model ? mshort(x.model) : 'best model picked on first use'), x.resting ? 'lim' : 'good', inUse && inUse.id === x.id));
    return `<h4>Which AI answers</h4><p class="mai-sub">The same in all your apps.</p>
      ${list.length ? opt('auto', s.first === 'auto', 'Auto', 'The best one that answers — free ones first', null, false) + rows.join('')
        : '<p class="mai-sub">No AI set up yet.</p>'}
      ${list.length > 1 ? `<label class="mai-fb"><input type="checkbox" data-fallback ${s.fallback ? 'checked' : ''}> If it fails or runs out, try the others</label>` : ''}
      <div class="mai-foot"><a href="/setup/#ai">Keys and models — in Setup</a></div>`;
  }
  function draw(m){
    const st = state(), c = chip(st);
    m.btn.innerHTML = `<span class="mai-dot ${c.dot}"></span>AI <b>${esc(c.name)}</b>${c.model ? `<span class="mai-m">· ${esc(c.model)}</span>` : ''}`;
    m.btn.title = c.title;
    if(!m.pop.hidden) drawPop(m, st);
  }
  function drawPop(m, st){
    m.pop.innerHTML = popHTML(st || state());
    m.pop.querySelectorAll('[data-first]').forEach(r=>r.onchange = ()=>{
      const h = MoneyAI.aiLocal(); h.first = r.dataset.first;
      if(h.first !== 'auto') MoneyAI.wake(h.first);            // picked by hand: try it now
      MoneyAI.saveAiLocal(h); if(typeof MoneyShared !== 'undefined') MoneyShared.markChanged();
      window.dispatchEvent(new CustomEvent('moneyai-change'));
    });
    const fb = m.pop.querySelector('[data-fallback]');
    if(fb) fb.onchange = ()=>{ const h = MoneyAI.aiLocal(); h.fallback = fb.checked; MoneyAI.saveAiLocal(h); if(typeof MoneyShared !== 'undefined') MoneyShared.markChanged(); window.dispatchEvent(new CustomEvent('moneyai-change')); };
  }
  function close(m){ m.pop.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); }
  window.addEventListener('moneyai-change', ()=>mounts.forEach(draw));
  window.addEventListener('storage', e=>{ if(/^money-ai/.test(e.key || '')) mounts.forEach(draw); });   // changed in another tab
  document.addEventListener('click', e=>mounts.forEach(m=>{ if(!m.root.contains(e.target)) close(m); }));
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') mounts.forEach(close); });
  setInterval(()=>mounts.forEach(draw), 60000);               // a resting service wakes up
  return function(el, opts){
    if(!el) return;
    opts = opts || {};
    if(!document.getElementById('mai-css')){ const st = document.createElement('style'); st.id = 'mai-css'; st.textContent = css; document.head.appendChild(st); }
    el.innerHTML = '';
    const root = document.createElement('div'); root.className = 'mai';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mai-chip' + (opts.chipClass ? ' ' + opts.chipClass : '');
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    const pop = document.createElement('div'); pop.className = 'mai-pop' + (opts.up ? ' mai-up' : '') + (opts.left ? ' mai-left' : ''); pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Which AI answers');
    root.append(btn, pop); el.appendChild(root);
    const m = {root, btn, pop};
    btn.onclick = ()=>{ const open = pop.hidden; mounts.forEach(close); if(open){ pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); drawPop(m); } };
    for(let i = mounts.length - 1; i >= 0; i--) if(!document.contains(mounts[i].root)) mounts.splice(i, 1);   // the page redrew
    mounts.push(m);
    draw(m);
    MoneyAI.loadAi().then(()=>draw(m)).catch(()=>{});
    return m;
  };
})();

// also as window properties, for bundled apps (the Expense Tracker) that cannot see script-level names
if(typeof window !== 'undefined'){ window.MoneyAI = MoneyAI; window.MoneyShared = MoneyShared; }
if(typeof module !== 'undefined'){ module.exports = MoneyAI; module.exports.MoneyShared = MoneyShared; }
