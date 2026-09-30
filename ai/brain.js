"use strict";
/* =========================================================
   MONEY BRAIN — the site's own thinking and learning, shared by every app
   (Money Home, Trip Vault, the Ledger, the Expense Tracker). No AI model:
   plain code that
   · LEARNS from what you do (an edit, a delete, a lock, a correction): each
     lesson grows with every repeat, fades when it stops happening, and can
     be seen, edited or forgotten in Setup → What it has learned;
   · KNOWS facts from the internet, cached with where and when they came from;
   · THINKS with exact tools: distances and travel times, opening hours,
     a scheduler that searches for the best day, and explains each choice;
   · UNDERSTANDS plain requests ("too packed", "we are vegetarian", "no
     temples", "meeting on the 14th at 3 pm") without asking an AI.
   Nothing here leaves the device except inside the encrypted settings sync.
   Loads in the browser (window.MoneyBrain) and in node (tests).
   ========================================================= */
const MoneyBrain = (function(){
  const KEY = 'money-brain', HALF_LIFE_DAYS = 120, MIN_CONFIDENCE = 0.6;
  const store = () => { try{ return typeof localStorage !== 'undefined' ? localStorage : null; }catch(e){ return null; } };
  const read = () => { try{ const s = store(); return JSON.parse((s && s.getItem(KEY)) || 'null') || {v: 1, lessons: {}}; }catch(e){ return {v: 1, lessons: {}}; } };
  let mem = read();
  function write(){
    mem.updatedAt = Date.now();
    try{ const s = store(); if(s) s.setItem(KEY, JSON.stringify(mem)); }catch(e){}
    try{ if(typeof MoneyShared !== 'undefined' && MoneyShared.markChanged) MoneyShared.markChanged(); }catch(e){}
    try{ if(typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('moneybrain-change')); }catch(e){}
  }
  const now = () => Date.now();
  const fade = (w, since) => w * Math.pow(0.5, Math.max(0, now() - since) / (HALF_LIFE_DAYS * 86400000));

  /* ================================================================ memory: lessons
     A lesson is one belief about you: app + topic + key -> value, with the evidence for it.
       choice  (votes for each value: "Swiggy" -> Food 12, Groceries 1; "museum" -> like 3, dislike 1)
       number  (a running average: lunch at about 13:30)
     learn() adds evidence; recall() answers only when the evidence is clear enough. */
  const idOf = (app, topic, key) => app + ':' + topic + ':' + String(key).toLowerCase();
  function learn(app, topic, key, value, o){
    o = o || {};
    if(key === undefined || key === null || key === '' || value === undefined || value === null || value === '') return null;
    const id = idOf(app, topic, key), w = o.weight === undefined ? 1 : o.weight;
    const L = mem.lessons[id] || {id, app, topic, key: String(key), kind: typeof value === 'number' ? 'number' : 'choice', votes: {}, n: 0, first: now()};
    if(L.pinned && !o.force) return L;
    if(L.kind === 'number'){
      const old = fade(L.w || 0, L.last || now());
      L.mean = old + w > 0 ? ((L.mean || 0) * old + value * w) / (old + w) : value;
      L.w = old + w;
    } else {
      Object.keys(L.votes).forEach(v=>{ L.votes[v] = fade(L.votes[v], L.last || now()); });
      L.votes[value] = (L.votes[value] || 0) + w;
    }
    L.n += 1; L.last = now();
    if(o.label) L.label = o.label;
    if(o.why) L.why = String(o.why).slice(0, 160);
    L.examples = [String(o.example || o.why || '').slice(0, 100)].concat(L.examples || []).filter(Boolean).slice(0, 3);
    mem.lessons[id] = L;
    write();
    return L;
  }
  /* -> {value, confidence (0-1), n, lesson} or null when it has not learned enough (or you switched it off) */
  function recall(app, topic, key, o){
    const L = mem.lessons[idOf(app, topic, key)];
    if(!L || L.off) return null;
    if(L.kind === 'number'){
      const w = L.pinned ? 9 : fade(L.w || 0, L.last);
      const confidence = L.pinned ? 1 : Math.min(1, w / 3);
      if(confidence < ((o && o.min) || 0.3)) return null;
      return {value: L.mean, confidence, n: L.n, lesson: L};
    }
    const votes = Object.entries(L.votes).map(([v, w])=>[v, L.pinned ? w : fade(w, L.last)]).sort((a, b)=>b[1] - a[1]);
    if(!votes.length) return null;
    const total = votes.reduce((s, x)=>s + x[1], 0), top = votes[0];
    // confidence: how one-sided the votes are, times how much evidence there is
    const confidence = L.pinned ? 1 : (top[1] / total) * Math.min(1, total / 3);
    if(confidence < ((o && o.min) || MIN_CONFIDENCE)) return null;
    return {value: top[0], confidence, n: L.n, lesson: L};
  }
  const lessons = f => Object.values(mem.lessons).filter(L=>!f || ((!f.app || L.app === f.app) && (!f.topic || L.topic === f.topic)))
    .sort((a, b)=>(b.last || 0) - (a.last || 0));
  function forget(id){ delete mem.lessons[id]; (mem.forgotten = mem.forgotten || {})[id] = now(); write(); }
  function forgetAll(){ Object.keys(mem.lessons).forEach(id=>{ (mem.forgotten = mem.forgotten || {})[id] = now(); }); mem.lessons = {}; write(); }
  function switchOff(id, off){ const L = mem.lessons[id]; if(L){ L.off = !!off; L.last = now(); write(); } }
  /* You say what is right: the lesson is fixed to it (learning does not move it any more) */
  function pin(id, value){
    const L = mem.lessons[id];
    if(!L) return;
    if(L.kind === 'number') L.mean = +value; else L.votes = {[value]: 9};
    L.pinned = true; L.off = false; L.last = now(); write();
  }
  /* For the encrypted settings sync: every lesson, and which were forgotten. */
  const exportAll = () => JSON.parse(JSON.stringify({lessons: mem.lessons, forgotten: mem.forgotten || {}, updatedAt: mem.updatedAt || 0}));
  /* Another device's memory: the lesson changed last wins; forgetting sticks unless it was learned again after. */
  function merge(other){
    if(!other || !other.lessons) return false;
    let changed = false;
    const forgotten = Object.assign({}, other.forgotten || {}, mem.forgotten || {});
    Object.values(other.lessons).forEach(L=>{
      const mine = mem.lessons[L.id];
      if((forgotten[L.id] || 0) >= (L.last || 0)) return;
      if(!mine || (L.last || 0) > (mine.last || 0)){ mem.lessons[L.id] = L; changed = true; }
    });
    Object.keys(mem.lessons).forEach(id=>{ if((forgotten[id] || 0) >= (mem.lessons[id].last || 0)){ delete mem.lessons[id]; changed = true; } });
    mem.forgotten = forgotten;
    if(changed) write();
    return changed;
  }
  /* In words, for the "What it has learned" page */
  function describe(L){
    if(L.label) return L.label;
    if(L.kind === 'number') return L.topic + ' ' + L.key + ': about ' + Math.round(L.mean * 10) / 10;
    const top = Object.entries(L.votes).sort((a, b)=>b[1] - a[1])[0];
    return L.key + ' → ' + (top ? top[0] : '?');
  }
  function confidenceOf(L){
    if(L.pinned) return 1;
    if(L.kind === 'number') return Math.min(1, fade(L.w || 0, L.last) / 3);
    const v = Object.values(L.votes).map(w=>fade(w, L.last)), t = v.reduce((s, x)=>s + x, 0);
    return t ? (Math.max.apply(null, v) / t) * Math.min(1, t / 3) : 0;
  }

  /* ================================================================ facts from the internet
     get(key, fetcher, {ttl}) -> the cached value while fresh, else fetcher() (and remembered with where/when) */
  const FACTS = 'money-brain-facts', facts = {};
  function factStore(){ try{ const s = store(); return JSON.parse((s && s.getItem(FACTS)) || '{}'); }catch(e){ return {}; } }
  async function fact(key, fetcher, o){
    o = o || {};
    const ttl = (o.ttl || 24 * 3600) * 1000;
    const hit = facts[key] || factStore()[key];
    if(hit && now() - hit.at < ttl) return hit.value;
    const value = await fetcher();
    facts[key] = {value, at: now(), source: o.source || ''};
    if(o.keep){ try{ const all = factStore(); all[key] = facts[key]; const keys = Object.keys(all); if(keys.length > 200) delete all[keys[0]]; store().setItem(FACTS, JSON.stringify(all)); }catch(e){} }
    return value;
  }

  /* ================================================================ reasoning tools */
  /* Distance in km between {lat, lng} points */
  function km(a, b){
    if(!a || !b || a.lat == null || b.lat == null) return null;
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /* Minutes from a to b in a city: walking when it is close, else a cab (with the wait) - rounded to 5 */
  function travelMin(a, b, o){
    const d = km(a, b);
    if(d === null) return (o && o.unknown) || 25;
    const road = d * 1.3;                                  // streets are not straight lines
    const m = road < 1.2 ? road / 4.5 * 60 : 8 + road / ((o && o.kmh) || 24) * 60;
    return Math.max(5, Math.round(m / 5) * 5);
  }

  /* Opening hours in plain words -> {days: {0..6: [[openMin, closeMin]]}} or null when it cannot tell.
     "Sa-Th 8:30AM-8:30PM, Fr 2:30PM-8:30PM", "daily 9AM-10PM", "10:00-22:00", "Sun–Wed 10AM–10PM, Thu–Sat 10–midnight",
     "24 hours", "9AM-5PM, closed Mondays" */
  const DAY = {su: 0, sun: 0, sunday: 0, mo: 1, mon: 1, monday: 1, tu: 2, tue: 2, tues: 2, tuesday: 2, we: 3, wed: 3, wednesday: 3,
    th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4, fr: 5, fri: 5, friday: 5, sa: 6, sat: 6, saturday: 6};
  const DAYW = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|su|mo|tu|we|th|fr|sa)';
  function parseHours(text){
    let t = String(text || '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+to\s+/g, '-').replace(/noon/g, '12pm').replace(/(\d)\s*\.\s*(\d\d)/g, '$1:$2');
    if(!t.trim()) return null;
    const all = [0, 1, 2, 3, 4, 5, 6], days = {};
    if(/24\s*(hours|hrs|\/7|x7)|open 24|always open/.test(t)){ all.forEach(d=>{ days[d] = [[0, 1440]]; }); return {days}; }
    const closed = [];
    t = t.replace(new RegExp('closed(?: on)?\\s+' + DAYW + 's?(?:\\s*(?:and|&|,)\\s*' + DAYW + 's?)*', 'g'), m=>{ (m.match(new RegExp(DAYW, 'g')) || []).forEach(d=>{ if(DAY[d] !== undefined) closed.push(DAY[d]); }); return ' '; });
    const timeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*-\s*(\d{1,2}|midnight)(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/;
    let found = false, everyDay = false;
    t.split(/[,;]|\band\b(?=[^\d]*\d)/).forEach(part=>{
      const m = timeRe.exec(part);
      if(!m) return;
      const mer = x => x ? x.replace(/\./g, '') : '';
      let o = +m[1], om = +(m[2] || 0), c = m[4] === 'midnight' ? 24 : +m[4], cm = +(m[5] || 0);
      const oa = mer(m[3]), ca = mer(m[6]);
      if(ca === 'pm' && c < 12) c += 12;
      if(ca === 'am' && c === 12) c = 0;
      if(oa === 'pm' && o < 12) o += 12;
      if(oa === 'am' && o === 12) o = 0;
      if(!oa && ca === 'pm' && o + 12 <= c && o < 12 && o >= 1 && o < 6) o += 12;        // "2-8pm"
      let open = o * 60 + om, close = c * 60 + cm;
      if(!ca && !oa && c <= 12 && close <= open) close += 12 * 60;                        // "10-8" read as 10am-8pm
      if(close <= open) close = Math.min(1440, close + 1440);
      if(close === 0) close = 1440;
      // which days: a range "sat-thu", a list "mon, wed" or nothing (every day)
      const before = part.slice(0, m.index);
      const range = new RegExp(DAYW + '\\s*-\\s*' + DAYW).exec(before);
      let ds = all, named = true;
      if(range){ const a = DAY[range[1]], b = DAY[range[2]]; ds = []; for(let d = a; ; d = (d + 1) % 7){ ds.push(d); if(d === b || ds.length > 7) break; } }
      else { const list = (before.match(new RegExp('\\b' + DAYW + '\\b', 'g')) || []).map(d=>DAY[d]).filter(d=>d !== undefined); if(list.length) ds = list; else named = false; }
      if(!named) everyDay = true;
      ds.forEach(d=>{ (days[d] = days[d] || []).push([open, close]); });
      found = true;
    });
    if(!found) return null;
    // hours given for named days only ("Sa-Th 9-5"): the days not named are closed
    if(!everyDay) all.forEach(d=>{ if(!days[d]) days[d] = []; });
    closed.forEach(d=>{ days[d] = []; });
    return {days};
  }
  /* Is it open for the whole of [from, to] (minutes) on that date? true / false / null (not known) */
  function openDuring(hours, dateISO, from, to){
    if(!hours) return null;
    const d = new Date(dateISO + 'T00:00:00Z').getUTCDay(), w = hours.days[d];
    if(w === undefined) return null;
    return w.some(([o, c])=>from >= o && to <= c);
  }

  /* The best day: which candidates, in which order, at what times - by searching, not guessing.
     o: {window: {from, until} (minutes), start: {lat, lng}, busy: [{s, e, lat, lng, title}] (fixed items, meals),
         candidates: [{id, name, lat, lng, minutes, value, hours, flex}], date, max, buffer, valueAt(c, start) -> extra value}
     -> {stops: [{c, s, e, travel, why: []}], score}
     A beam search: at each step the few best partial days are kept and grown by every candidate that fits
     (open then, before the next fixed item, inside the day), scored by value minus travel and waiting. */
  function planDay(o){
    const buffer = o.buffer === undefined ? 20 : o.buffer, width = o.width || 8, max = o.max || 3;
    const busy = (o.busy || []).slice().sort((a, b)=>a.s - b.s);
    const cands = (o.candidates || []).filter(c=>c.value > -5);
    // the free stretches of the day between fixed items
    const free = [];
    let from = o.window.from;
    busy.forEach(b=>{ if(b.s - buffer > from) free.push([from, b.s - buffer, b]); from = Math.max(from, b.e + buffer); });
    if(o.window.until > from) free.push([from, o.window.until, null]);
    const posAt = (seq, t) => { const last = seq[seq.length - 1]; let p = last ? last.c : o.start, pt = last ? last.e : -1;
      busy.forEach(b=>{ if(b.e <= t && b.e > pt && b.lat != null){ p = b; pt = b.e; } }); return p; };
    let beam = [{seq: [], score: 0, t: o.window.from}];
    for(let depth = 0; depth < max; depth++){
      const next = [];
      beam.forEach(st=>{
        const used = new Set(st.seq.map(x=>x.c.id));
        cands.forEach(c=>{
          if(used.has(c.id)) return;
          const pos = posAt(st.seq, st.t);
          const trav = travelMin(pos, c);
          let s = st.t + (st.seq.length ? buffer : 0) + trav;
          // the first free stretch where it fits
          let placed = null;
          for(const [a, b] of free){
            const start = Math.max(s, a + (a > o.window.from ? trav : 0));
            let len = c.minutes;
            if(start + len > b && c.flex && b - start >= c.flex) len = b - start;       // a shorter visit still fits
            if(start + len <= b){
              const open = openDuring(c.hours, o.date, start, start + len);
              if(open === false){
                // open later that day? start then
                const d = c.hours && c.hours.days[new Date(o.date + 'T00:00:00Z').getUTCDay()];
                const later = (d || []).map(([oo, cc])=>[Math.max(oo, start), cc]).find(([oo, cc])=>oo + len <= Math.min(cc, b));
                if(later){ placed = {s: later[0], e: later[0] + len, open: true}; break; }
                continue;
              }
              placed = {s: start, e: start + len, open};
              break;
            }
          }
          if(!placed) return;
          const wait = Math.max(0, placed.s - s);
          // variety: a second place of the same kind the same day (two viewing decks, three museums) is worth less
          const same = c.category ? st.seq.filter(x=>x.c.category === c.category).length : 0;
          const gain = c.value + (o.valueAt ? o.valueAt(c, placed.s) : 0) - trav * 0.012 - wait * 0.002 - (placed.open === null ? 0.08 : 0) - same * (o.repeatPenalty === undefined ? 0.35 : o.repeatPenalty);
          next.push({seq: st.seq.concat([{c, s: placed.s, e: placed.e, travel: trav, open: placed.open}]), score: st.score + gain, t: placed.e});
        });
      });
      if(!next.length) break;
      next.sort((a, b)=>b.score - a.score);
      // keep the best, and only one of each set of stops (the same places in another order is the same day)
      const seen = new Set();
      beam = next.filter(x=>{ const k = x.seq.map(y=>y.c.id).sort().join('|'); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0, width)
        .concat(beam.filter(x=>x.seq.length === depth && x.seq.length > 0 && x.score > 0).slice(0, 2));
    }
    const best = beam.filter(x=>x.score > -Infinity).sort((a, b)=>b.score - a.score)[0] || {seq: [], score: 0};
    return {stops: best.seq, score: best.score};
  }

  /* What a place is, from its name and description: the words people use for it */
  const CATS = [
    ['mosque', /\b(mosque|masjid)\b/i, 'mosques'], ['temple', /\b(temple|mandir|gurudwara|pagoda)\b/i, 'temples'], ['church', /\b(church|cathedral|basilica|chapel)\b/i, 'churches'],
    ['museum', /\b(museum|gallery|exhibition|heritage house|al fahidi|bastakiya)\b/i, 'museums and galleries'], ['market', /\b(souk|souq|market|bazaar|haat)\b/i, 'markets and souks'],
    ['mall', /\b(mall|plaza|shopping cent|outlet|city centre)\b/i, 'malls'], ['park', /\b(park|garden|lake|nature|zabeel|botanical)\b/i, 'parks and gardens'],
    ['beach', /\b(beach|bay|island|marina|creek|lagoon)\b/i, 'beaches and waterfronts'], ['view', /\b(tower|burj|frame|view|observation|sky|khalifa)\b/i, 'views and towers'],
    ['fort', /\b(fort|palace|castle|qila|mahal)\b/i, 'forts and palaces'], ['animals', /\b(zoo|aquarium|safari park|bird|dolphin)\b/i, 'zoos and aquariums'],
    ['fun', /\b(theme park|water park|wild wadi|aquaventure|kidzania|ski|img worlds|legoland|global village)\b/i, 'theme parks and fun'],
    ['desert', /\b(desert|dune|safari)\b/i, 'desert trips'], ['boat', /\b(cruise|abra|boat|dhow|ferry)\b/i, 'boat rides'],
  ];
  function categoryOf(name, note){
    const t = (name || '') + ' ' + (note || '');
    const hit = CATS.find(([, re])=>re.test(name || '')) || CATS.find(([, re])=>re.test(t));
    return hit ? hit[0] : 'sight';
  }
  const categoryName = c => (CATS.find(x=>x[0] === c) || [0, 0, c + 's'])[2];
  const CATEGORIES = CATS.map(([id, , name])=>({id, name}));

  /* ================================================================ understanding plain requests
     understand(text) -> [{do, ...}] actions an app can apply, and what was not understood.
     Handles the usual things people ask about a plan; anything else is left to an AI (and then learned). */
  const NUM = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, last: -1};
  function catWords(t){
    const out = [];
    t = t.replace(/galleries/g, 'gallery').replace(/\b(\w{3,}?)(es|s)\b/g, (m, w, e)=>/(souq|souk|mosque|temple|church|museum|market|mall|park|garden|beach|tower|fort|palace|zoo|aquarium|cruise|bazaar|lake|island|dune|boat|dhow)$/.test(w + (e === 'es' ? 'e' : '')) ? w + (e === 'es' ? 'e' : '') : /(souq|souk|mosque|temple|church|museum|market|mall|park|garden|beach|tower|fort|palace|zoo|aquarium|bazaar|lake|island|dune|boat|dhow)$/.test(w) ? w : m);
    CATS.forEach(([id, re, name])=>{ if(re.test(t) || new RegExp('\\b' + name.split(' ')[0].replace(/s$/, '') + 's?\\b', 'i').test(t)) out.push(id); });
    return out;
  }
  function understand(text, ctx){
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, "'") + ' ', acts = [];
    const dayRef = () => {
      const m = /\bday\s*(\d+)\b/.exec(t) || /\b(first|second|third|fourth|fifth|sixth|last)\s+day\b/.exec(t);
      if(m) return {day: NUM[m[1]] || +m[1]};
      const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?/.exec(t.replace(/\bday\s*\d+/, ''));
      if(dm && (dm[2] || /\bon the\s+\d/.test(t))) return {date: +dm[1], month: dm[2] || ''};
      return null;
    };
    const timeRef = s => { const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(s) || /\bat\s+(\d{1,2}):(\d{2})\b/.exec(s); if(!m) return null;
      let h = +m[1]; if(m[3] === 'pm' && h < 12) h += 12; if(m[3] === 'am' && h === 12) h = 0; return h * 60 + +(m[2] || 0); };
    // pace
    if(/too (packed|much|busy|tiring|hectic)|less (packed|rushed|busy)|slow(er)? down|more (relaxed|rest|free time)|relax(ed)? pace|tired/.test(t)) acts.push({do: 'pace', value: 'relaxed', day: dayRef()});
    else if(/too (empty|light|slow|little)|more (things|places|sights|activities)|pack (it|more)|packed pace|busier/.test(t)) acts.push({do: 'pace', value: 'packed', day: dayRef()});
    // food
    if(/\b(pure )?veg(etarian|gie)?\b|no (meat|non[- ]?veg)|we don't eat meat/.test(t) && !/non[- ]?veg(etarian)? (is )?(ok|fine)/.test(t)) acts.push({do: 'food', value: 'vegetarian'});
    else if(/\bvegan\b/.test(t)) acts.push({do: 'food', value: 'vegan'});
    else if(/\b(jain)\b/.test(t)) acts.push({do: 'food', value: 'jain vegetarian'});
    else if(/\bhalal\b/.test(t)) acts.push({do: 'food', value: 'halal'});
    // likes and dislikes of kinds of places
    // one request ends at a full stop, "but", or a comma that starts the next one ("no mosques, we are vegetarian, day 2 …")
    const END = '(?=[.!;?]|,\\s*(?:we|i|day|but|more|less|no|not|please|start|keep|add|also|and|plus|our|my|the kids)\\b|\\bbut\\b|\\bplease\\b|$)';
    const neg = new RegExp("\\b(no|not|skip|avoid|without|less|fewer|don't want|dont want|hate|dislike|remove|drop)\\b\\s+(?:(?:any|more|the|so many|too many)\\s+)?([a-z0-9 ,&'-]+?)" + END, 'g');
    const pos = new RegExp('\\b(more|love|like|add|include|prefer|want|interested in|keen on|we enjoy|enjoy)\\b\\s+(?:(?:some|a few|a|more|the)\\s+)?([a-z0-9 ,&\'-]+?)' + END, 'g');
    let m;
    while((m = neg.exec(t))){ catWords(m[2]).forEach(c=>acts.push({do: 'dislike', category: c})); if(!catWords(m[2]).length && m[1] === 'avoid' && m[2].trim().length > 3) acts.push({do: 'avoid', words: m[2].trim()}); }
    while((m = pos.exec(t))){ const cs = catWords(m[2]); cs.forEach(c=>{ if(!acts.some(a=>a.do === 'dislike' && a.category === c)) acts.push({do: 'like', category: c}); });
      if(!cs.length && /food|eat|restaurant|street food|cafe/.test(m[2])) acts.push({do: 'like', category: 'food'}); }
    // start later / earlier, back earlier
    const late = /start (the day )?(later|late)|sleep in|late start|lazy morning/.test(t), early = /start (the day )?(earlier|early)|early start/.test(t);
    const st = /(?:start|begin|leave the hotel)(?: the day| days)?(?: at| by| from| after)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/.exec(t);
    if(st && timeRef(st[1] + (/(am|pm)/.test(st[1]) ? '' : (+st[1].split(':')[0] < 7 ? 'pm' : 'am')))) acts.push({do: 'dayStart', min: timeRef(st[1] + (/(am|pm)/.test(st[1]) ? '' : (+st[1].split(':')[0] < 7 ? 'pm' : 'am')))});
    else if(late) acts.push({do: 'dayStart', shift: 60}); else if(early) acts.push({do: 'dayStart', shift: -60});
    const back = /(?:back|return|at the hotel|home)(?: at the hotel)? (?:by|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/.exec(t);
    if(back){ const s = back[1] + (/(am|pm)/.test(back[1]) ? '' : 'pm'); acts.push({do: 'dayEnd', min: timeRef(s)}); }
    // a fixed appointment: "meeting on the 14th at 3 pm", "dinner with friends on day 3 at 8pm"
    const appt = /(meeting|call|appointment|dinner with|lunch with|visit(?:ing)? (?:my |our )?\w+|wedding|conference|event|show|match|concert)\b([^.;]*?)\b(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/.exec(t);
    if(appt){ const d = dayRef(); acts.push({do: 'fixed', title: (appt[1] + appt[2]).replace(/\s+on\s+.*$/, '').replace(/\s+/g, ' ').trim(), min: timeRef(appt[3]), day: d, minutes: /dinner|lunch/.test(appt[1]) ? 90 : 60}); }
    // a free evening / morning / day
    const fr = /(morning|afternoon|evening) (free|off)/.exec(t) || /(free|nothing planned|keep (it )?free|rest)\s+(?:on\s+)?(?:the\s+)?(morning|afternoon|evening|day)/.exec(t);
    if(fr){ const part = [fr[2], fr[3], fr[1]].find(x=>/morning|afternoon|evening|day/.test(x || '')); acts.push({do: 'free', part, day: dayRef()}); }
    // shopping / beach day etc. = like
    if(/shopping day|go shopping|more shopping/.test(t) && !acts.some(a=>a.category === 'mall')) acts.push({do: 'like', category: 'mall'}, {do: 'like', category: 'market'});
    // kids, elders
    if(/\bkids?\b|\bchild(ren)?\b|toddler|baby/.test(t)) acts.push({do: 'travellers', value: 'with children'});
    if(/elder|parents|grand(ma|pa|mother|father)|senior|wheelchair|can't walk|cannot walk|less walking|walk less/.test(t)) acts.push({do: 'walking', value: 'less'});
    const seen = new Set();
    return acts.filter(a=>{ const k = JSON.stringify(a); if(seen.has(k)) return false; seen.add(k); return true; });
  }

  return {learn, recall, lessons, forget, forgetAll, switchOff, pin, merge, exportAll, describe, confidenceOf,
    fact, km, travelMin, parseHours, openDuring, planDay, categoryOf, categoryName, CATEGORIES, understand,
    _reset: ()=>{ mem = {v: 1, lessons: {}}; }};
})();
if(typeof window !== 'undefined') window.MoneyBrain = MoneyBrain;
if(typeof module !== 'undefined') module.exports = MoneyBrain;
