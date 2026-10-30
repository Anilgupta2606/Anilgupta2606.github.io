"use strict";
/* =========================================================
   TRIPS, DOCUMENTS, VIEWER, MEMORIES
   ========================================================= */

const TYPE_ICON = {'boarding-pass': '🎫', flight: '✈️', hotel: '🏨', train: '🚆', bus: '🚌', visa: '🛂', passport: '📘', insurance: '🛡️', car: '🚕', activity: '🎟️',
  aadhaar: '🪪', pan: '💳', licence: '🚗', 'voter-id': '🗳️', tax: '🧾', bank: '🏦', investment: '📈', property: '🏠', vehicle: '🚙', medical: '🩺', education: '🎓', employment: '💼', bill: '📑', other: '📄'};
/* The category picker, in groups: Travel, Identity, Money and tax, Home health and work, Other. */
const typeOptions = (sel, which) => Parse.GROUPS.filter(which || (()=>true)).map(g=>`<optgroup label="${esc(g.label)}">${g.types.map(k=>`<option value="${k}"${k === sel ? ' selected' : ''}>${TYPE_ICON[k] || ''} ${esc(typeLabel(k))}</option>`).join('')}</optgroup>`).join('');
const groupOf = t => (Parse.GROUPS.find(g=>g.types.indexOf(t) >= 0) || {id: 'other', label: 'Other'});
const typeLabel = t => Parse.TYPE_LABEL[t] || 'Other';

/* ================================================================ Trips */
VIEWS.newTrip = function(prefill, after){
  const p = prefill || {};
  const card = openModal(`<h2>${p.id ? 'Edit trip' : 'New trip'}</h2>
    <form id="trip-f" class="grid2">
      <label class="span2">Name<input id="t-name" required placeholder="Goa with family" value="${esc(p.name || '')}"></label>
      <label>City<input id="t-city" placeholder="Goa" value="${esc(p.city || '')}"></label>
      <label>Country<input id="t-country" placeholder="India" value="${esc(p.country || '')}"></label>
      <label>From<input id="t-start" type="date" value="${esc(p.start || '')}"></label>
      <label>To<input id="t-end" type="date" value="${esc(p.end || '')}"></label>
      <label class="span2">Notes<textarea id="t-notes" rows="2" placeholder="Anything to remember">${esc(p.notes || '')}</textarea></label>
      <div class="row end span2">${p.id ? '<button type="button" class="btn danger ghost" id="t-del">Delete trip</button>' : ''}<button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">${p.id ? 'Save' : 'Create trip'}</button></div>
    </form>`);
  citySuggest(card.querySelector('#t-city'), card.querySelector('#t-country'));
  card.querySelector('#trip-f').onsubmit = e=>{
    e.preventDefault();
    const t = p.id ? tripById(p.id) : {id: uid('t'), createdAt: Date.now()};
    Object.assign(t, {name: $('t-name').value.trim(), city: $('t-city').value.trim(), country: $('t-country').value.trim(), start: $('t-start').value, end: $('t-end').value, notes: $('t-notes').value.trim()});
    if(t.start && t.end && t.end < t.start) return toast('The trip ends before it starts.', 'error');
    touch(t);
    if(!p.id) S.trips.push(t);
    S.settings.lastTrip = t.id;
    save(); closeModal();
    if(after) after(t); else render();
  };
  if(card.querySelector('#t-del')) card.querySelector('#t-del').onclick = async ()=>{
    if(!(await confirmBox('Delete this trip?', 'Its itinerary and memories go too. Its documents stay, unfiled.'))) return;
    S.docs.forEach(d=>{ if(d.tripId === p.id){ d.tripId = ''; touch(d); } });
    S.memories.filter(m=>m.tripId === p.id).forEach(m=>remove('memories', m.id));
    Object.keys(S.plans).forEach(k=>{ if(k.indexOf(p.id + '|') === 0){ delete S.plans[k]; S.deleted[k] = Date.now(); } });
    remove('trips', p.id);
    if(S.settings.lastTrip === p.id) S.settings.lastTrip = '';
    save(); render();
  };
};

const passSky = () => `<svg class="pass-sky" viewBox="0 0 600 240" preserveAspectRatio="xMaxYMin meet" aria-hidden="true">
  <circle cx="518" cy="60" r="74" fill="#FFC53D" opacity=".16"/><circle cx="518" cy="60" r="40" fill="#FFC53D"/>
  <g class="sky-clouds" fill="#fff" opacity=".16"><rect x="316" y="160" width="160" height="34" rx="17"/><rect x="362" y="140" width="84" height="34" rx="17"/><rect x="40" y="36" width="126" height="26" rx="13"/><rect x="74" y="22" width="60" height="26" rx="13"/></g>
  <path class="sky-route" d="M20 220 C 180 90, 360 40, 590 120" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-dasharray="2 11" stroke-linecap="round"/>
  <g class="pass-plane"><g transform="translate(426 84) rotate(5)" fill="#fff">
    <path d="M-24 0 C-24 -3.5 18 -4.5 25 0 C18 4.5 -24 3.5 -24 0Z"/><path d="M2 -2 L-9 -23 L-2 -23 L13 -2Z"/><path d="M2 2 L-9 23 L-2 23 L13 2Z"/>
    <path d="M-17 -1 L-24 -11 L-19 -11 L-11 -1Z"/><path d="M-17 1 L-24 11 L-19 11 L-11 1Z"/></g></g>
</svg>`;

VIEWS.trips = function(main, cur){
  const trips = S.trips.map(t=>Object.assign({}, t, tripSpan(t)));
  const upcoming = trips.filter(t=>!t.end || t.end >= todayISO()).sort((a, b)=>String(a.start || '9').localeCompare(String(b.start || '9')));
  const past = trips.filter(t=>t.end && t.end < todayISO()).sort((a, b)=>b.end.localeCompare(a.end));
  const unfiled = S.docs.filter(d=>!d.tripId);
  if(!S.trips.length && !S.docs.length){
    main.innerHTML = `<section class="hero">
      <div class="pass"><div class="pass-main">${passSky()}
        <p class="pass-when">Trip Vault</p>
        <h1>Where to next?</h1>
        <p class="pass-lead">Upload your tickets and hotel bookings. Trip Vault reads them, builds the trip, plans each day and keeps an eye on the news and your flights.</p>
        <div class="row"><button class="btn primary big" id="h-up">${icon('upload')} Upload a ticket or booking</button><button class="btn soft big" id="h-new">${icon('plus')} Create a trip</button></div>
      </div><div class="pass-stub"><span class="stub-big">✈</span><span class="stub-small">Your first trip</span></div></div>
      <ol class="steps"><li><b>Upload</b> a ticket or booking (PDF or photo, from the phone too)</li><li><b>Check</b> what the reader found: whose it is, what it is</li><li><b>Plan</b> the days with AI, following your rules</li><li><b>Watch</b> news and flight status before you go</li></ol>
    </section>`;
    $('h-up').onclick = ()=>{ location.hash = 'docs'; setTimeout(()=>$('file-in') && $('file-in').click(), 50); };
    $('h-new').onclick = ()=>VIEWS.newTrip();
    return;
  }
  const tripCard = t => {
    const n = daysUntil(t.start || todayISO()), fl = flightsOf(t.id), hs = hotelsOf(t.id);
    const when = !t.start ? 'Dates not set' : t.end && t.end < todayISO() ? fmtRange(t.start, t.end) : n > 0 ? 'in ' + n + ' day' + (n === 1 ? '' : 's') : t.end >= todayISO() ? 'On now' : '';
    return `<article class="trip-card ${cur && cur.id === t.id ? 'on' : ''}" data-trip="${esc(t.id)}" tabindex="0">
      <div class="trip-top"><span class="when">${esc(when)}</span><button class="icon-btn small" data-edit-trip="${esc(t.id)}" aria-label="Edit trip">${icon('edit')}</button></div>
      <h3>${esc(t.name)}</h3>
      <p class="muted">${esc([t.city, t.country].filter(Boolean).join(', ') || 'Where to?')} · ${esc(fmtRange(t.start, t.end) || '—')}</p>
      <div class="trip-stats"><span>${icon('doc')} ${docsOf(t.id).length}</span><span>${icon('plane')} ${fl.length}</span><span>🏨 ${hs.length}</span><span>${icon('photo')} ${S.memories.filter(m=>m.tripId === t.id).length}</span></div>
    </article>`;
  };
  let html = '';
  const resting = betweenTrips(cur);
  if(resting){
    // the last trip is over and nothing is booked: the default page, with that trip a tap away
    const t = Object.assign({}, cur, tripSpan(cur)), pics = S.memories.filter(m=>m.tripId === t.id).length;
    html += `<section class="pass"><div class="pass-main">${passSky()}
        <p class="pass-when">Between trips</p>
        <h1>Where to next?</h1>
        <p class="pass-lead">Your trip <b>${esc(t.name)}</b> ended on ${esc(fmtDate(t.end))}. Upload the tickets for the next one, or create it, and it shows here.</p>
        <div class="row"><button class="btn primary" id="go-up">${icon('upload')} Upload a ticket or booking</button><button class="btn soft" id="new-trip-2">${icon('plus')} Create a trip</button><button class="btn ghost" data-trip="${esc(t.id)}">${icon('photo')} Open ${esc(t.name)}${pics ? ' · ' + pics + ' photo' + (pics === 1 ? '' : 's') : ''}</button></div>
      </div><div class="pass-stub"><span class="stub-big">✓</span><span class="stub-small">last trip done</span></div></section>`;
  }
  else if(cur){
    const t = Object.assign({}, cur, tripSpan(cur));
    const n = t.start ? daysUntil(t.start) : null;
    const first = flightsOf(t.id)[0];
    const total = t.start && t.end ? Rules.daysBetween(t.start, t.end) + 1 : 0;
    const stub = n === null ? ['?', 'add the dates']
      : n > 0 ? [String(n), n === 1 ? 'day to go' : 'days to go']
      : t.end >= todayISO() ? [String(Rules.daysBetween(t.start, todayISO()) + 1), 'of ' + total + ' days']
      : ['✓', 'trip done'];
    if(tvLook() === 'new') html += horizonHero(t);
    else html += `<section class="pass"><div class="pass-main">${passSky()}
        <p class="pass-when">${n === null ? 'Your trip' : n > 0 ? 'Your next trip' : t.end >= todayISO() ? 'You’re travelling' : 'Past trip'}</p>
        <h1>${esc(t.name)}</h1>
        <p class="pass-where">${esc([t.city, t.country].filter(Boolean).join(', ') || 'Where to?')}${t.start ? ' — ' + esc(fmtRange(t.start, t.end)) : ''}</p>
        <div class="row"><button class="btn primary" id="go-up">${icon('upload')} Add a document</button><button class="btn soft" id="go-plan">${icon('map')} Itinerary</button><button class="btn ghost" data-edit-trip="${esc(t.id)}">${icon('edit')} Edit</button></div>
      </div>
      <div class="pass-stub"><span class="stub-big">${esc(stub[0])}</span><span class="stub-small">${esc(stub[1])}</span>${first && first.from && first.to ? `<span class="stub-route">${esc(first.from)} → ${esc(first.to)}</span>` : ''}</div>
    </section>`;
    // the documents checklist, in one line
    const L = checklistOf(cur);
    if(L.items.length) html += `<section class="card ck-mini ${L.missing.length ? 'has-missing' : 'all-good'}">
      <div><b>${L.missing.length ? L.missing.length + ' required document' + (L.missing.length === 1 ? '' : 's') + ' missing' : 'Every required document is here'}</b>
        <div class="small muted">${L.missing.length ? L.missing.slice(0, 3).map(i=>esc(i.rule.name) + (i.person ? ' — ' + esc(i.person) : '') + (i.status === 'expiring' ? ' (validity)' : '')).join(' · ') + (L.missing.length > 3 ? ' …' : '') : L.ready + ' of ' + L.items.length + ' items ready'}</div></div>
      <a class="btn ${L.missing.length ? 'primary' : 'soft'} small" href="#check">${icon('check')} Checklist</a></section>`;
    html += `<section class="card"><h2>Timeline</h2>${timeline(t)}</section>`;
  }
  if(unfiled.length) html += `<section class="card notice"><h2>${unfiled.length} document${unfiled.length === 1 ? '' : 's'} not in a trip</h2>
    <p class="muted">${unfiled.slice(0, 4).map(d=>esc(d.title)).join(' · ')}${unfiled.length > 4 ? ' …' : ''}</p>
    <div class="row"><button class="btn soft" id="make-trip">Make a trip from them</button><a class="btn ghost" href="#docs">File them</a></div></section>`;
  html += `<section><div class="section-head"><h2>Upcoming</h2><button class="btn soft" id="new-trip">${icon('plus')} New trip</button></div>
    <div class="trip-grid">${upcoming.map(tripCard).join('') || '<p class="muted">No upcoming trips.</p>'}</div></section>`;
  if(past.length) html += `<section><h2>Past trips</h2><div class="trip-grid">${past.map(tripCard).join('')}</div></section>`;
  if(tvLook() === 'new') html += placesHTML();
  main.innerHTML = html;
  if(tvLook() === 'new') horizonBind(main, resting ? null : cur, trips);
  if($('new-trip-2')) $('new-trip-2').onclick = ()=>VIEWS.newTrip();
  main.querySelectorAll('[data-trip]').forEach(el=>{ el.onclick = e=>{ if(e.target.closest('[data-edit-trip]')) return; setTrip(el.dataset.trip); window.scrollTo(0, 0); }; el.onkeydown = e=>{ if(e.key === 'Enter') el.click(); }; });
  main.querySelectorAll('[data-edit-trip]').forEach(b=>b.onclick = ()=>VIEWS.newTrip(tripById(b.dataset.editTrip)));
  if($('new-trip')) $('new-trip').onclick = ()=>VIEWS.newTrip();
  if($('go-up')) $('go-up').onclick = ()=>{ location.hash = 'docs'; setTimeout(()=>$('file-in') && $('file-in').click(), 50); };
  if($('go-plan')) $('go-plan').onclick = ()=>{ location.hash = 'plan'; };
  if($('make-trip')) $('make-trip').onclick = ()=>{
    const spans = unfiled.map(d=>Parse.span(d)).filter(s=>s.start);
    const start = spans.map(s=>s.start).sort()[0] || '', end = spans.map(s=>s.end).sort().slice(-1)[0] || '';
    const city = (spans.find(s=>s.city) || {}).city || '', country = (spans.find(s=>s.country) || {}).country || '';
    VIEWS.newTrip({name: city ? city + (start ? ' · ' + MON[+start.slice(5, 7) - 1] + ' ' + start.slice(0, 4) : '') : 'New trip', city, country, start, end}, t=>{
      unfiled.forEach(d=>{ d.tripId = t.id; touch(d); }); save(); render();
    });
  };
  main.querySelectorAll('[data-open-doc]').forEach(b=>b.onclick = ()=>openViewer(b.dataset.openDoc));
  bindOpenDocs(main);
};
/* A button for several documents (everyone's tickets for one flight): the viewer steps through them. */
function bindOpenDocs(root){
  root.querySelectorAll('[data-open-docs]').forEach(b=>b.onclick = ()=>{ const ids = b.dataset.openDocs.split(',').filter(Boolean); openViewer(ids[0], ids); });
}

/* Everything booked for a trip, day by day. */
function timeline(t){
  const ev = [];
  flightsOf(t.id).forEach(f=>ev.push({date: f.date, time: f.dep || '', icon: '✈️', title: `${f.flight} ${f.from || '?'} → ${f.to || '?'}`,
    sub: [f.dep && f.arr ? f.dep + '–' + f.arr : f.dep, f.airline].filter(Boolean).join(' · '),
    people: f.travellers.length ? (f.travellers.length > 1 ? f.travellers.length + ' travellers: ' : '') + travellersText(f) : '',
    docs: f.allDocs}));
  hotelsOf(t.id).forEach(h=>{
    if(h.checkIn) ev.push({date: h.checkIn, time: h.checkInTime || '14:00', icon: '🏨', title: 'Check in · ' + h.name, sub: [h.address, h.confirmation ? 'conf. ' + h.confirmation : ''].filter(Boolean).join(' · '), doc: h.doc});
    if(h.checkOut) ev.push({date: h.checkOut, time: h.checkOutTime || '11:00', icon: '🧳', title: 'Check out · ' + h.name, sub: '', doc: h.doc});
  });
  docsOf(t.id).filter(d=>d.type === 'train' || d.type === 'bus').forEach(d=>ev.push({date: d.fields.date, time: d.fields.dep || '', icon: TYPE_ICON[d.type], title: d.title,
    sub: [d.fields.fromStation, d.fields.toStation].filter(Boolean).join(' → '), doc: d.id}));
  docsOf(t.id).filter(d=>['activity', 'car'].indexOf(d.type) >= 0).forEach(d=>{ const s = Parse.span(d); ev.push({date: s.start, time: '', icon: TYPE_ICON[d.type], title: d.title, sub: '', doc: d.id}); });
  if(!ev.length) return `<p class="muted">Upload the tickets and hotel bookings for this trip and they line up here.</p>`;
  ev.sort((a, b)=>(String(a.date || '9') + a.time).localeCompare(String(b.date || '9') + b.time));
  let last = '';
  return '<ol class="timeline">' + ev.map(e=>{
    const head = e.date !== last ? `<li class="tl-day">${esc(e.date ? fmtDate(e.date, true) : 'Date unknown')}</li>` : '';
    last = e.date;
    const docs = e.docs || (e.doc ? [e.doc] : []);
    return head + `<li class="tl-ev"><span class="tl-time">${esc(e.time)}</span><span class="tl-ic">${e.icon}</span><div><b>${esc(e.title)}</b>${e.sub ? `<div class="muted small">${esc(e.sub)}</div>` : ''}${e.people ? `<div class="tl-people small">${icon('user')} ${esc(e.people)}</div>` : ''}</div>${docs.length ? `<button class="btn ghost small" data-open-docs="${esc(docs.join(','))}">${docs.length > 1 ? 'View all ' + docs.length : 'View'}</button>` : ''}</li>`;
  }).join('') + '</ol>';
}

/* ================================================================ Documents */
var docFilter = {q: '', person: '', type: '', trip: 'current', kind: 'travel'};
VIEWS.docs = function(main, cur){
  keepQueueEdits();                                    // the review cards' unsaved edits, before the page is drawn again
  const kind = docFilter.kind;                         // travel | personal | all
  const tripSel = docFilter.trip === 'current' ? (cur ? cur.id : '') : docFilter.trip;
  let list = S.docs.filter(d=>(kind === 'personal' ? !Parse.isTripDoc(d) : Parse.isTripDoc(d))
    && (kind === 'personal' || !tripSel || (tripSel === 'none' ? !d.tripId : d.tripId === tripSel))
    && (!docFilter.person || d.person === docFilter.person) && (!docFilter.type || d.type === docFilter.type));
  if(docFilter.q){ const q = docFilter.q.toLowerCase(); list = list.filter(d=>(d.title + ' ' + d.person + ' ' + typeLabel(d.type) + ' ' + JSON.stringify(d.fields) + ' ' + (d.fileName || '')).toLowerCase().indexOf(q) >= 0); }
  list.sort((a, b)=>(Parse.span(a).start || '9').localeCompare(Parse.span(b).start || '9') || (b.addedAt || 0) - (a.addedAt || 0));
  const people = Array.from(new Set(S.people.map(p=>p.name).concat(S.docs.map(d=>d.person).filter(Boolean))));
  // anything that runs out within 3 months (or already has): passports, licences, insurance, visas…
  const soon = Rules.addDays(todayISO(), 90);
  const renew = S.docs.filter(d=>d.fields && d.fields.validUntil && d.fields.validUntil <= soon).sort((a, b)=>a.fields.validUntil.localeCompare(b.fields.validUntil));
  const byGroup = kind === 'travel' ? null : Parse.GROUPS.map(g=>({g, docs: list.filter(d=>groupOf(d.type).id === g.id)})).filter(x=>x.docs.length);
  const nTrip = S.docs.filter(d=>Parse.isTripDoc(d)).length, nMine = S.docs.filter(d=>!Parse.isTripDoc(d)).length;
  main.innerHTML = `
  <section class="section-head"><h1>${kind === 'personal' ? 'Personal documents' : 'Trip documents'}</h1></section>
  <nav class="subtabs-bar" role="tablist" aria-label="Which documents">
    <a role="tab" href="#docs/trip" class="${kind !== 'personal' ? 'on' : ''}" aria-selected="${kind !== 'personal'}">✈️ Trip documents <span class="n">${nTrip}</span></a>
    <a role="tab" href="#docs/personal" class="${kind === 'personal' ? 'on' : ''}" aria-selected="${kind === 'personal'}">🗂️ Personal documents <span class="n">${nMine}</span></a>
  </nav>
  <section class="drop" id="drop">
    <input type="file" id="file-in" accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.heic,.webp" multiple hidden>
    <input type="file" id="cam-in" accept="image/*" capture="environment" hidden>
    <div class="drop-ic">${icon('upload')}</div>
    <div><b>${kind === 'personal' ? 'Upload Aadhaar, PAN, passport, licence, tax papers, statements, policies, bills…' : 'Upload tickets, boarding passes, hotel bookings, visas — or any personal document'}</b>
      <div class="muted small">PDF or photo · the reader works out what it is; you can change the category</div></div>
    <div class="row"><button class="btn primary" id="pick">${icon('doc')} Choose files</button><button class="btn soft" id="cam">${icon('camera')} Take a photo</button></div>
  </section>
  <div id="queue"></div>
  ${kind !== 'travel' && renew.length ? `<section class="card renew"><h2>Renew soon</h2><ul class="renew-list">${renew.map(d=>{ const n = daysUntil(d.fields.validUntil);
      return `<li><span>${TYPE_ICON[d.type] || '📄'} <b>${esc(typeLabel(d.type))}</b> — ${esc(d.person || 'whose?')}</span><span class="${n < 0 ? 'bad-text' : 'warn-text'}">${n < 0 ? 'expired ' + esc(fmtDate(d.fields.validUntil)) : 'expires ' + esc(fmtDate(d.fields.validUntil)) + ' · in ' + n + ' days'}</span><button class="btn ghost small" data-open-doc="${esc(d.id)}">View</button></li>`; }).join('')}</ul></section>` : ''}
  <section class="filters">
    <input type="search" id="f-q" placeholder="${kind === 'personal' ? 'Search name, number, category…' : 'Search PNR, name, hotel, flight…'}" value="${esc(docFilter.q)}">
    ${kind === 'personal' ? '' : `<select id="f-trip"><option value="current">${cur ? esc(cur.name) : 'Current trip'}</option><option value="">All trips</option><option value="none">Not in a trip</option>${S.trips.filter(t=>!cur || t.id !== cur.id).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>`}
    <select id="f-person"><option value="">Everyone</option>${people.map(p=>`<option>${esc(p)}</option>`).join('')}</select>
    <select id="f-type"><option value="">All categories</option>${typeOptions(docFilter.type, kind === 'personal' ? g=>g.id !== 'travel' : g=>g.id === 'travel' || g.id === 'identity')}</select>
  </section>
  ${byGroup ? (byGroup.map(x=>`<section class="doc-group"><h2>${esc(x.g.label)} <span class="muted small">${x.docs.length}</span></h2><div class="doc-grid">${x.docs.map(docCard).join('')}</div></section>`).join('') || '<p class="muted empty">No documents here yet.</p>')
    : `<section class="doc-grid">${list.map(docCard).join('') || '<p class="muted empty">No documents here yet.</p>'}</section>`}`;
  if($('f-trip')) $('f-trip').value = docFilter.trip;
  $('f-person').value = docFilter.person; $('f-type').value = docFilter.type;
  const refilter = ()=>{ docFilter.q = $('f-q').value; if($('f-trip')) docFilter.trip = $('f-trip').value; docFilter.person = $('f-person').value; docFilter.type = $('f-type').value; const pos = $('f-q').selectionStart; VIEWS.docs(main, cur); if(document.activeElement !== $('f-q') && docFilter.q){ $('f-q').focus(); $('f-q').setSelectionRange(pos, pos); } };
  $('f-q').oninput = ()=>{ clearTimeout(refilter.t); refilter.t = setTimeout(refilter, 250); };
  ['f-trip', 'f-person', 'f-type'].forEach(id=>{ if($(id)) $(id).onchange = refilter; });
  $('pick').onclick = ()=>$('file-in').click();
  $('cam').onclick = ()=>$('cam-in').click();
  $('file-in').onchange = e=>{ addFiles(Array.from(e.target.files)); e.target.value = ''; };
  $('cam-in').onchange = e=>{ addFiles(Array.from(e.target.files), {straighten: true}); e.target.value = ''; };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e=>addFiles(Array.from(e.dataTransfer.files)));
  main.querySelectorAll('[data-open-doc]').forEach(b=>b.onclick = ()=>openViewer(b.dataset.openDoc));
  drawQueue();
};

function keyFacts(d){
  const f = d.fields || {};
  if(f.segments && f.segments.length) return f.segments.map(s=>`${s.flight} ${s.from || ''}→${s.to || ''} ${s.date ? fmtDate(s.date) : ''} ${s.dep || ''}${s.seat ? ' · ' + s.seat : ''}`).join('<br>');
  if(d.type === 'hotel') return esc([f.hotelName && f.hotelName !== d.title ? f.hotelName : '', fmtRange(f.checkIn, f.checkOut)].filter(Boolean).join(' · '));
  if(d.type === 'train') return esc([f.trainNo + ' ' + (f.trainName || ''), fmtDate(f.date), f.dep].filter(x=>x && x.trim()).join(' · '));
  if(f.validUntil){ const n = daysUntil(f.validUntil); return `<span class="${n < 0 ? 'bad-text' : n < 90 ? 'warn-text' : ''}">${n < 0 ? 'expired' : 'valid until'} ${esc(fmtDate(f.validUntil))}</span>`; }
  if(f.issuedOn) return 'issued ' + esc(fmtDate(f.issuedOn));
  return '';
}
function docCard(d){
  const trip = tripById(d.tripId);
  const pnr = d.fields.pnr || d.fields.confirmation || Parse.mask(d.fields.number, d.type) || d.fields.reference || '';
  return `<article class="doc-card" data-open-doc="${esc(d.id)}" tabindex="0" role="button" aria-label="Open ${esc(d.title)}">
    <div class="doc-thumb">${d.thumb ? `<img src="${d.thumb}" alt="" loading="lazy">` : `<span class="big-ic">${TYPE_ICON[d.type] || '📄'}</span>`}<span class="type-chip t-${esc(d.type)}">${TYPE_ICON[d.type] || ''} ${esc(typeLabel(d.type))}</span></div>
    <div class="doc-body">
      <h3>${esc(d.title)}</h3>
      <div class="muted small">${d.person ? icon('user') + ' ' + esc(d.person) : '<span class="warn-text">whose?</span>'}${trip ? ' · ' + esc(trip.name) : ''}</div>
      ${pnr ? `<div class="pnr">${esc(pnr)}</div>` : ''}
      <div class="facts small">${keyFacts(d)}</div>
      <div class="doc-foot small muted">${d.localOnly ? '🔒 this device only' : d.remote ? '☁︎ synced' : d.tooLarge ? 'on this device only' : Cloud.syncConfig() ? 'waiting to sync' : 'this device'}</div>
    </div></article>`;
}

/* ---------------------------------------------------------------- upload queue: read -> review -> save */
const queue = [];
function addFiles(files, o){
  files.forEach(f=>{
    if(f.size > 40 * 1048576){ toast(f.name + ' is over 40 MB — too large.', 'error'); return; }
    queue.push({id: uid('q'), file: f, state: 'waiting', msg: 'Waiting…', straighten: !!(o && o.straighten)});
  });
  drawQueue(); runQueue();
}
let queueBusy = false;
async function runQueue(){
  if(queueBusy) return;
  queueBusy = true;
  try{
    for(const q of queue){
      if(q.state !== 'waiting') continue;
      q.state = 'reading'; drawQueue();
      const say = m=>{ q.msg = m; drawQueueItem(q); };
      try{
        q.read = await Reader.readFile(q.file, {progress: say, straighten: q.straighten, askPassword: async wrong=>{
          const p = await ask(wrong ? 'Wrong password — try again' : 'This PDF is protected', 'Password for ' + q.file.name, {password: true, note: 'Tickets are often protected with your date of birth, PNR, or part of your name. Nothing is sent anywhere.'});
          if(p !== null) q.password = p;
          return p;
        }});
        q.read.password = q.password;
        q.result = await Reader.understand(q.read, S.settings.readerMode, {progress: say});
        q.state = 'review';
      }catch(e){ q.state = 'error'; q.msg = e.message; }
      drawQueue();
    }
  } finally { queueBusy = false; }
}
/* What you typed in each open review card, kept before the cards are drawn again. */
function keepQueueEdits(){
  queue.forEach(q=>{
    const el = $('q-' + q.id);
    if(q.state !== 'review' || !el || !el.querySelector('[data-k="type"]')) return;
    const v = readForm(el, q.result.fields);
    // only what you changed: the rest (whose, trip, title) is worked out again, e.g. a trip made from another file
    const changed = k => { const i = el.querySelector(`[data-k="${k}"]`); return i && i.value !== (i.dataset.d || ''); };
    if(changed('person')) q.person = v.person;
    if(changed('title')) q.title = v.title;
    if(changed('tripId') && v.tripId !== '__new') q.tripId = v.tripId;
    q.result.fields = v.fields; q.result.type = v.type;
    const lo = el.querySelector('[data-k-local]'); if(lo) q.localOnly = lo.checked;
  });
}
function drawQueue(){
  const box = $('queue');
  if(!box) return;
  keepQueueEdits();
  box.innerHTML = queue.map(q=>`<div class="q-item" id="q-${q.id}"></div>`).join('');
  queue.forEach(drawQueueItem);
}
function drawQueueItem(q){
  const el = $('q-' + q.id);
  if(!el) return;
  if(q.state === 'waiting' || q.state === 'reading'){
    el.className = 'q-item card'; el.innerHTML = `<div class="row"><span class="spinner"></span><b>${esc(q.file.name)}</b><span class="muted">${esc(q.msg)}</span></div>`;
    return;
  }
  if(q.state === 'error'){
    el.className = 'q-item card error'; el.innerHTML = `<div class="row"><b>${esc(q.file.name)}</b><span>${esc(q.msg)}</span><button class="btn ghost small" data-q-x>Dismiss</button></div>`;
    el.querySelector('[data-q-x]').onclick = ()=>{ queue.splice(queue.indexOf(q), 1); drawQueue(); };
    return;
  }
  el.className = 'q-item card review';
  el.innerHTML = reviewForm(q);
  bindReview(el, q);
}

/* The review form: whose, what, which trip, the facts found — all editable. */
function reviewForm(q){
  const r = q.result, f = r.fields || {};
  const cur = currentTrip();
  const people = S.people.map(p=>p.name);
  const found = [].concat(f.passengers || [], f.guests || [], f.people || [], r.person ? [r.person] : []).map(n=>Parse.titleCase(n)).filter((n, i, a)=>n && a.indexOf(n) === i);
  let person = q.person || '';
  if(!person){ const known = people.find(p=>found.some(n=>n.toLowerCase().indexOf(p.toLowerCase().split(' ')[0]) >= 0)); person = known || found[0] || (people.length === 1 ? people[0] : ''); }
  const allPeople = Array.from(new Set(people.concat(found)));
  const span = Parse.span({type: r.type, fields: f});
  const match = S.trips.map(t=>Object.assign({}, t, tripSpan(t))).find(t=>span.start && t.start && span.start >= Rules.addDays(t.start, -2) && span.start <= Rules.addDays(t.end || t.start, 2));
  // a personal document belongs to no trip unless you say so
  const tripId = q.tripId !== undefined ? q.tripId : !Parse.isTravel(r.type) && r.type !== 'insurance' ? '' : (match ? match.id : cur ? cur.id : '');
  const title = q.title || r.title || autoTitle(r.type, f, q.file.name);
  return `<div class="review-head">
      ${q.read.thumb ? `<img class="review-thumb" src="${q.read.thumb}" alt="">` : ''}
      <div><b>${esc(q.file.name)}</b> <span class="muted small">${fmtSize(q.file.size)}${q.read.pages > 1 ? ' · ' + q.read.pages + ' pages' : ''}</span>
      <div class="small reader-by">${icon('spark')} Read by ${esc(r.by)}${r.aiError ? ` <span class="warn-text">· AI reader unavailable: ${esc(r.aiError)}</span>` : ''}</div>
      ${r.summary ? `<div class="small">${esc(r.summary)}</div>` : ''}
      ${(r.checks || []).length ? `<ul class="read-checks small">${r.checks.map(c=>`<li class="${c.level}">${c.level === 'fixed' ? '✓ Corrected: ' : c.level === 'error' ? '✗ Check: ' : '⚠ '}${esc(c.text)}</li>`).join('')}</ul>` : ''}</div></div>
    <div class="grid3">
      <label>Whose document<input list="people-dl-${q.id}" data-k="person" value="${esc(person)}" data-d="${esc(person)}" placeholder="Name"><datalist id="people-dl-${q.id}">${allPeople.map(p=>`<option value="${esc(p)}">`).join('')}</datalist></label>
      <label>Category <span class="muted small">(change it if it is wrong)</span><select data-k="type">${typeOptions(r.type)}</select></label>
      <label>Trip <span class="muted small">(optional)</span><select data-k="tripId" data-d="${esc(tripId)}"><option value="">Not in a trip</option>${S.trips.map(t=>`<option value="${esc(t.id)}"${t.id === tripId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="__new">+ New trip from this document</option></select></label>
      <label class="span3">Title<input data-k="title" value="${esc(title)}" data-d="${esc(title)}"></label>
    </div>
    ${fieldsEditor(r.type, f)}
    <label class="check local-only"><input type="checkbox" data-k-local ${q.localOnly ? 'checked' : ''}> 🔒 Keep on this device only — never synced, not even encrypted</label>
    <div class="row end">
      <button class="btn ghost" data-q-x>Discard</button>
      ${Cloud.aiAvailable() ? `<button class="btn soft" data-q-ai>${icon('spark')} Read again with AI</button>` : ''}
      <button class="btn primary" data-q-save>Save document</button>
    </div>`;
}
function autoTitle(type, f, name){
  const s = (f.segments || [])[0];
  if(s && s.flight) return `${s.airline || s.flight} ${s.from || ''}→${s.to || ''}${s.date ? ' · ' + fmtDate(s.date) : ''}`.replace(/\s+/g, ' ');
  if(type === 'hotel' && f.hotelName) return f.hotelName + (f.checkIn ? ' · ' + fmtRange(f.checkIn, f.checkOut) : '');
  if(type === 'train' && (f.trainNo || f.trainName)) return `Train ${f.trainNo || ''} ${f.trainName || ''}${f.date ? ' · ' + fmtDate(f.date) : ''}`.replace(/\s+/g, ' ');
  if(!Parse.isTravel(type) && type !== 'other') return typeLabel(type).replace(/ \(.*\)$/, '') + (f.reference ? ' · ' + f.reference : '');
  return typeLabel(type) + ' · ' + String(name || '').replace(/\.[a-z0-9]+$/i, '');
}
const FIELD_SETS = {
  flight: [['pnr', 'PNR / booking ref']],
  'boarding-pass': [['pnr', 'PNR']],
  hotel: [['hotelName', 'Hotel', 'span2'], ['confirmation', 'Confirmation no.'], ['address', 'Address', 'span2'], ['city', 'City'], ['country', 'Country'], ['checkIn', 'Check-in', '', 'date'], ['checkInTime', 'from', '', 'time'], ['checkOut', 'Check-out', '', 'date'], ['checkOutTime', 'by', '', 'time'], ['phone', 'Phone']],
  train: [['pnr', 'PNR'], ['trainNo', 'Train no.'], ['trainName', 'Train name'], ['date', 'Date', '', 'date'], ['fromStation', 'From'], ['toStation', 'To'], ['dep', 'Departs', '', 'time'], ['arr', 'Arrives', '', 'time'], ['coach', 'Coach'], ['berth', 'Berth / seat'], ['class', 'Class']],
  bus: [['reference', 'Ticket / PNR'], ['date', 'Date', '', 'date'], ['fromStation', 'From'], ['toStation', 'To'], ['dep', 'Departs', '', 'time'], ['arr', 'Arrives', '', 'time']],
  visa: [['number', 'Visa number'], ['validUntil', 'Valid until', '', 'date'], ['reference', 'Reference']],
  passport: [['number', 'Number'], ['validUntil', 'Expires', '', 'date']],
  insurance: [['number', 'Policy no.'], ['reference', 'Insurer / plan'], ['validUntil', 'Valid until', '', 'date'], ['phone', 'Helpline']],
  car: [['reference', 'Booking ref'], ['date', 'Date', '', 'date'], ['dep', 'Pick-up time', '', 'time'], ['address', 'Pick-up place', 'span2']],
  activity: [['reference', 'Booking ref'], ['date', 'Date', '', 'date'], ['dep', 'Time', '', 'time'], ['address', 'Place', 'span2']],
  other: [['reference', 'Reference'], ['date', 'Date', '', 'date']],
  aadhaar: [['number', 'Aadhaar number'], ['issuedOn', 'Issued', '', 'date']],
  pan: [['number', 'PAN']],
  licence: [['number', 'Licence number'], ['issuedOn', 'Issued', '', 'date'], ['validUntil', 'Valid until', '', 'date']],
  'voter-id': [['number', 'EPIC number']],
  tax: [['reference', 'Assessment year'], ['number', 'PAN'], ['date', 'Date', '', 'date']],
  bank: [['number', 'Account no.'], ['reference', 'Bank / period', 'span2']],
  investment: [['number', 'Folio / account'], ['reference', 'Fund / broker', 'span2'], ['date', 'Date', '', 'date']],
  property: [['reference', 'Property / address', 'span2'], ['issuedOn', 'From', '', 'date'], ['validUntil', 'Until', '', 'date']],
  vehicle: [['number', 'Registration no.'], ['reference', 'Vehicle'], ['issuedOn', 'Registered', '', 'date'], ['validUntil', 'Valid until (PUC / fitness)', '', 'date']],
  medical: [['reference', 'Hospital / doctor', 'span2'], ['date', 'Date', '', 'date']],
  education: [['reference', 'Institution / course', 'span2'], ['date', 'Date', '', 'date']],
  employment: [['reference', 'Employer / month', 'span2'], ['date', 'Date', '', 'date']],
  bill: [['reference', 'Seller / invoice no.', 'span2'], ['date', 'Date', '', 'date'], ['validUntil', 'Warranty until', '', 'date']],
};
function fieldsEditor(type, f){
  const set = FIELD_SETS[type] || FIELD_SETS.other;
  let html = '<div class="grid4 fields">' + set.map(([k, label, cls, t])=>`<label class="${cls || ''}">${esc(label)}<input data-f="${k}" ${t ? `type="${t}"` : ''} value="${esc(f[k] || (k === 'date' && f.dates ? f.dates[0] : '') || '')}"></label>`).join('') + '</div>';
  if(type === 'flight' || type === 'boarding-pass' || (f.segments && f.segments.length)){
    const segs = (f.segments && f.segments.length) ? f.segments : [{}];
    html += `<div class="segs"><div class="seg-head small muted"><span>Flight</span><span>From</span><span>To</span><span>Date</span><span>Dep</span><span>Arr</span><span>Seat</span><span>Gate/Term</span><span></span></div>` +
      segs.map((s, i)=>`<div class="seg" data-seg="${i}">
        <input data-s="flight" value="${esc(s.flight || '')}" placeholder="6E123" aria-label="Flight">
        <input data-s="from" value="${esc(s.from || '')}" placeholder="DEL" maxlength="3" aria-label="From">
        <input data-s="to" value="${esc(s.to || '')}" placeholder="BOM" maxlength="3" aria-label="To">
        <input data-s="date" type="date" value="${esc(s.date || '')}" aria-label="Date">
        <input data-s="dep" type="time" value="${esc(s.dep || '')}" aria-label="Departs">
        <input data-s="arr" type="time" value="${esc(s.arr || '')}" aria-label="Arrives">
        <input data-s="seat" value="${esc(s.seat || '')}" aria-label="Seat">
        <input data-s="gate" value="${esc([s.gate, s.terminal ? 'T' + s.terminal : ''].filter(Boolean).join(' / '))}" aria-label="Gate / terminal">
        <button class="icon-btn small" data-seg-x="${i}" aria-label="Remove flight">${icon('x')}</button></div>`).join('') +
      `<button class="btn ghost small" data-seg-add>${icon('plus')} Add a flight</button></div>`;
  }
  const names = (f.passengers || f.guests || []);
  if(Parse.isTravel(type) || type === 'insurance') html += `<label>${type === 'insurance' ? 'People covered' : 'Travellers on this document'}<input data-f="passengers" value="${esc(names.join(', '))}" placeholder="Names, comma separated"></label>`;
  html += `<label>Notes<input data-f="notes" value="${esc(f.notes || '')}"></label>`;
  return html;
}
/* The form -> {person, type, tripId, title, fields} */
function readForm(el, base){
  const g = k => { const i = el.querySelector(`[data-k="${k}"]`); return i ? i.value.trim() : ''; };
  const fields = Object.assign({}, base || {});
  el.querySelectorAll('[data-f]').forEach(i=>{ fields[i.dataset.f] = i.value.trim(); });
  if(typeof fields.passengers === 'string') fields.passengers = fields.passengers.split(',').map(s=>s.trim()).filter(Boolean);   // only where the box is shown
  if(el.querySelector('[data-seg]')){
    fields.segments = Array.from(el.querySelectorAll('[data-seg]')).map(row=>{
      const s = {}, old = (base && base.segments || [])[+row.dataset.seg] || {};
      row.querySelectorAll('[data-s]').forEach(i=>{ s[i.dataset.s] = i.value.trim(); });
      s.flight = s.flight.toUpperCase().replace(/[\s-]/g, ''); s.from = s.from.toUpperCase(); s.to = s.to.toUpperCase();
      const gm = /^([^/]*?)(?:\s*\/\s*T?(.*))?$/.exec(s.gate || '');
      s.gate = gm ? gm[1].trim() : ''; s.terminal = gm && gm[2] ? gm[2].trim() : (old.terminal || '');
      if(/^T\d/.test(s.gate)){ s.terminal = s.gate.slice(1); s.gate = ''; }
      s.airline = Parse.airline(s.flight.slice(0, 2)) || old.airline || '';
      return Object.assign({}, old, s);
    }).filter(s=>s.flight || s.from || s.to);
  }
  return {person: g('person'), type: g('type'), tripId: g('tripId'), title: g('title'), fields};
}
function bindReview(el, q){
  citySuggest(el.querySelector('[data-f="city"]'), el.querySelector('[data-f="country"]'));
  const keep = ()=>{ const v = readForm(el, q.result.fields); q.localOnly = el.querySelector('[data-k-local]').checked; q.person = v.person; q.tripId = v.tripId === '__new' ? q.tripId : v.tripId; q.title = v.title; q.result.fields = v.fields; q.result.type = v.type; };
  el.querySelector('[data-k="type"]').onchange = ()=>{ keep(); drawQueueItem(q); };
  el.querySelectorAll('[data-seg-x]').forEach(b=>b.onclick = ()=>{ keep(); q.result.fields.segments.splice(+b.dataset.segX, 1); drawQueueItem(q); });
  const add = el.querySelector('[data-seg-add]');
  if(add) add.onclick = ()=>{ keep(); (q.result.fields.segments = q.result.fields.segments || []).push({}); drawQueueItem(q); };
  el.querySelector('[data-q-x]').onclick = ()=>{ queue.splice(queue.indexOf(q), 1); drawQueue(); };
  const ai = el.querySelector('[data-q-ai]');
  if(ai) ai.onclick = async ()=>{
    keep(); ai.disabled = true; ai.innerHTML = '<span class="spinner"></span> Reading…';
    try{
      const r = await Reader.understand(q.read, 'ai', {type: q.result.type, forceAi: true, picture: true});
      if(r.aiError) throw new Error(r.aiError);
      q.result = r; q.title = '';
    }catch(e){ toast(e.message, 'error'); }
    drawQueueItem(q);
  };
  el.querySelector('[data-q-save]').onclick = async ()=>{
    const v = readForm(el, q.result.fields);
    if(!v.person){ toast('Whose document is it? Add a name.', 'error'); el.querySelector('[data-k="person"]').focus(); return; }
    const btn = el.querySelector('[data-q-save]'); btn.disabled = true;
    const finish = async tripId=>{
      addPerson(v.person);
      const fileId = uid('f');
      await Store.putFile(fileId, {bytes: q.read.bytes.buffer.slice(q.read.bytes.byteOffset, q.read.bytes.byteOffset + q.read.bytes.byteLength), mime: q.read.mime, name: q.file.name});
      const d = touch({id: uid('d'), tripId, person: v.person, type: v.type, title: v.title || autoTitle(v.type, v.fields, q.file.name), fields: v.fields,
        fileId, fileName: q.file.name, mime: q.read.mime, size: q.read.bytes.byteLength, pages: q.read.pages, thumb: q.read.thumb, password: q.read.password || '',
        readBy: q.result.by, summary: q.result.summary || '', text: String(q.read.text || '').slice(0, 6000), addedAt: Date.now(),
        localOnly: el.querySelector('[data-k-local]').checked});
      S.docs.push(d);
      const t = tripById(tripId);
      if(t && !t.city){ const sp = Parse.span(d); if(sp.city){ t.city = sp.city; t.country = t.country || sp.country; touch(t); } }
      await save();
      queue.splice(queue.indexOf(q), 1);
      toast('Saved “' + d.title + '”.');
      render();
    };
    if(v.tripId === '__new'){
      const sp = Parse.span({type: v.type, fields: v.fields});
      VIEWS.newTrip({name: sp.city ? sp.city + (sp.start ? ' · ' + MON[+sp.start.slice(5, 7) - 1] + ' ' + sp.start.slice(0, 4) : '') : v.title, city: sp.city, country: sp.country, start: sp.start, end: sp.end}, t=>finish(t.id));
      btn.disabled = false;
    } else finish(v.tripId);
  };
}

/* ================================================================ viewer (works on the phone) */
let viewerUrl = null;
let viewSet = [];
async function openViewer(id, set){
  const d = S.docs.find(x=>x.id === id);
  if(!d) return;
  if(!(await PinLock.ensure())) return;
  viewSet = (set || [id]).filter(x=>S.docs.some(y=>y.id === x));
  const at = viewSet.indexOf(id), many = viewSet.length > 1;
  const v = $('viewer');
  v.hidden = false; document.body.classList.add('noscroll');
  const trip = tripById(d.tripId);
  v.innerHTML = `<div class="viewer-bar">
      <button class="icon-btn" id="v-x" aria-label="Close">${icon('x')}</button>
      <div class="viewer-title"><b>${many ? esc(d.person || 'whose?') + ' — ' : ''}${esc(d.title)}</b><span class="muted small">${many ? (at + 1) + ' of ' + viewSet.length + ' · ' : ''}${TYPE_ICON[d.type] || ''} ${esc(typeLabel(d.type))} · ${esc(d.person || 'whose?')}${trip ? ' · ' + esc(trip.name) : ''}</span></div>
      ${many ? `<button class="btn soft small" id="v-prev" ${at === 0 ? 'disabled' : ''} aria-label="Previous ticket">‹ Prev</button><button class="btn soft small" id="v-next" ${at === viewSet.length - 1 ? 'disabled' : ''} aria-label="Next ticket">Next ›</button>` : ''}
      <button class="btn soft small" id="v-bright" title="Full brightness view for scanning at the gate">Scan mode</button>
      <button class="btn soft small" id="v-edit">${icon('edit')}<span class="hide-sm"> Details</span></button>
      <button class="btn soft small" id="v-dl">${icon('download')}<span class="hide-sm"> Open</span></button>
      <button class="icon-btn" id="v-del" aria-label="Delete">${icon('trash')}</button>
    </div>
    <div class="viewer-body" id="v-body"><div class="center"><span class="spinner"></span> Opening…</div></div>
    <aside class="viewer-facts" id="v-facts">${factsPanel(d)}</aside>`;
  $('v-x').onclick = closeViewer;
  if(many){
    const go = k => { const n = viewSet[at + k]; if(n) openViewer(n, viewSet); };
    $('v-prev').onclick = ()=>go(-1); $('v-next').onclick = ()=>go(1);
    v.onkeydown = e=>{ if(e.key === 'ArrowLeft') go(-1); if(e.key === 'ArrowRight') go(1); };
    v.tabIndex = -1; v.focus();
  } else v.onkeydown = null;
  $('v-bright').onclick = ()=>v.classList.toggle('bright');
  $('v-edit').onclick = ()=>editDoc(d);
  $('v-del').onclick = async ()=>{
    if(!(await confirmBox('Delete this document?', d.title + ' — from every synced device.'))) return;
    Cloud.deleteFile(d.remote); Store.delFile(d.fileId); remove('docs', d.id); save(); closeViewer(); render();
  };
  try{
    const f = await fileFor(d);
    if(viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(new Blob([f.bytes], {type: f.mime}));
    $('v-dl').onclick = ()=>{ const a = document.createElement('a'); a.href = viewerUrl; a.download = d.fileName || 'document'; a.target = '_blank'; a.click(); };
    const body = $('v-body');
    if(/^image\//.test(f.mime)){ body.innerHTML = `<img class="v-img" src="${viewerUrl}" alt="${esc(d.title)}">`; }
    else if(f.mime === 'application/pdf'){
      body.innerHTML = '';
      const pdf = await Reader.openPdf(f.bytes, async wrong=>{ if(d.password && !wrong) return d.password; return await ask('Password', 'This PDF is protected', {password: true}); });
      const w = Math.min(body.clientWidth - 16, 1100);
      for(let p = 1; p <= pdf.numPages; p++){
        const page = await pdf.getPage(p);
        const vp1 = page.getViewport({scale: 1});
        const scale = (w / vp1.width) * (window.devicePixelRatio || 1);
        const c = await Reader.renderPage(pdf, p, scale);
        c.className = 'v-page'; c.style.width = w + 'px';
        body.appendChild(c);
      }
    } else body.innerHTML = `<p class="center">This file can’t be shown here. <button class="btn soft" onclick="document.getElementById('v-dl').click()">Open it</button></p>`;
  }catch(e){ $('v-body').innerHTML = `<div class="center card error">${esc(e.message)}</div>`; }
}
function closeViewer(){ $('viewer').hidden = true; $('viewer').className = 'viewer'; $('viewer').innerHTML = ''; document.body.classList.remove('noscroll'); }
function factsPanel(d){
  const f = d.fields || {}, rows = [];
  const add = (k, v) => { if(v) rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
  add('PNR / ref', f.pnr || f.confirmation || f.reference || f.number ? `<span class="pnr">${esc(f.pnr || f.confirmation || f.reference || f.number)}</span>` : '');
  (f.segments || []).forEach(s=>add(s.flight, esc(`${s.from}→${s.to} · ${fmtDate(s.date, true)} ${s.dep || ''}${s.arr ? '–' + s.arr : ''}${s.seat ? ' · seat ' + s.seat : ''}${s.gate ? ' · gate ' + s.gate : ''}${s.terminal ? ' · T' + s.terminal : ''}`)));
  add('Hotel', esc(f.hotelName));
  add('Address', f.address ? `<a href="${mapsLink(f.address)}" target="_blank" rel="noopener">${esc(f.address)}</a>` : '');
  add('Stay', esc(fmtRange(f.checkIn, f.checkOut)) + (f.checkInTime ? ' · in ' + esc(f.checkInTime) : '') + (f.checkOutTime ? ' · out ' + esc(f.checkOutTime) : ''));
  add('Train', esc([f.trainNo, f.trainName].filter(Boolean).join(' ')));
  add('Route', esc([f.fromStation, f.toStation].filter(Boolean).join(' → ')));
  add('Date', d.type !== 'hotel' && f.date ? esc(fmtDate(f.date, true) + (f.dep ? ' ' + f.dep : '')) : '');
  add('Coach / berth', esc([f.coach, f.berth, f.class].filter(Boolean).join(' · ')));
  add('Valid until', esc(fmtDate(f.validUntil)));
  add('Phone', f.phone ? `<a href="tel:${esc(f.phone.replace(/[^\d+]/g, ''))}">${esc(f.phone)}</a>` : '');
  add('Travellers', esc((f.passengers || []).join(', ')));
  add('Notes', esc(f.notes));
  return `<dl>${rows.join('')}</dl><p class="muted small">${esc(d.summary || '')}</p><p class="muted small">Read by ${esc(d.readBy || '—')} · ${esc(d.fileName || '')}${d.size ? ' · ' + fmtSize(d.size) : ''}</p>`;
}
function editDoc(d){
  const card = openModal(`<h2>Document details</h2><div class="q-item review" id="edit-doc">
    <div class="grid3">
      <label>Whose document<input list="ppl-dl" data-k="person" value="${esc(d.person)}"><datalist id="ppl-dl">${S.people.map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></label>
      <label>Category<select data-k="type">${typeOptions(d.type)}</select></label>
      <label>Trip <span class="muted small">(optional)</span><select data-k="tripId"><option value="">Not in a trip</option>${S.trips.map(t=>`<option value="${esc(t.id)}"${t.id === d.tripId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="span3">Title<input data-k="title" value="${esc(d.title)}"></label>
    </div>${fieldsEditor(d.type, d.fields)}
    <label class="check local-only"><input type="checkbox" id="ed-local" ${d.localOnly ? 'checked' : ''}> 🔒 Keep on this device only — never synced, not even encrypted</label>
    <div class="row end">${Cloud.aiAvailable() && d.text ? `<button class="btn soft" id="ed-ai">${icon('spark')} Read again with AI</button>` : ''}<button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="ed-save">Save</button></div></div>`, {wide: true, noFocus: true});
  const el = card.querySelector('#edit-doc');
  citySuggest(el.querySelector('[data-f="city"]'), el.querySelector('[data-f="country"]'));
  el.querySelector('[data-k="type"]').onchange = ()=>{ const v = readForm(el, d.fields); Object.assign(d, v); editDoc(d); };
  el.querySelectorAll('[data-seg-x]').forEach(b=>b.onclick = ()=>{ const v = readForm(el, d.fields); v.fields.segments.splice(+b.dataset.segX, 1); Object.assign(d, v); editDoc(d); });
  const add = el.querySelector('[data-seg-add]');
  if(add) add.onclick = ()=>{ const v = readForm(el, d.fields); (v.fields.segments = v.fields.segments || []).push({}); Object.assign(d, v); editDoc(d); };
  const aiB = el.querySelector('#ed-ai');
  if(aiB) aiB.onclick = async ()=>{
    aiB.disabled = true; aiB.innerHTML = '<span class="spinner"></span> Reading…';
    try{
      const pics = d.thumb ? [] : [];
      const r = await Reader.understand({text: d.text, barcode: '', name: d.fileName, pictures: pics, method: []}, 'ai', {type: d.type, forceAi: true});
      if(r.aiError) throw new Error(r.aiError);
      d.fields = Reader.mergeFields(d.fields, r.fields); d.readBy = r.by; if(r.summary) d.summary = r.summary;
      editDoc(d);
    }catch(e){ toast(e.message, 'error'); aiB.disabled = false; aiB.textContent = 'Read again with AI'; }
  };
  el.querySelector('#ed-save').onclick = ()=>{
    const v = readForm(el, d.fields);
    const local = $('ed-local').checked;
    if(local && !d.localOnly){
      // taken off the other devices: its file leaves GitHub, and a note tells the other device to drop it
      Cloud.deleteFile(d.remote); d.remote = null; S.deleted[d.id] = Date.now();
    }
    d.localOnly = local;
    Object.assign(d, v); addPerson(v.person); touch(d); if(local) d.updatedAt = Date.now() + 1; save(); closeModal();
    if(!$('viewer').hidden) $('v-facts').innerHTML = factsPanel(d);
    render(); toast('Saved.');
  };
}

/* ================================================================ Memories */
VIEWS.memories = function(main, cur){
  if(!cur){ main.innerHTML = `<div class="card"><p>Create a trip first, then keep its photos and notes here.</p><button class="btn primary" onclick="VIEWS.newTrip()">New trip</button></div>`; return; }
  const span = tripSpan(cur);
  const mems = S.memories.filter(m=>m.tripId === cur.id).sort((a, b)=>String(a.date).localeCompare(String(b.date)) || a.createdAt - b.createdAt);
  main.innerHTML = `<section class="section-head"><div><h1>${esc(cur.name)}</h1></div></section>
    <form class="card mem-new" id="mem-f">
      <div class="grid3"><label>Day<input type="date" id="m-date" value="${esc(todayISO() >= span.start && todayISO() <= span.end ? todayISO() : span.start || todayISO())}"></label>
      <label class="span2">Title<input id="m-title" placeholder="Sunset at Chapora Fort"></label></div>
      <label>What happened<textarea id="m-text" rows="3" placeholder="Write it down while you remember…"></textarea></label>
      <div class="row"><label class="btn soft file-btn">${icon('photo')} Add photos<input type="file" id="m-photos" accept="image/*" multiple hidden></label><span class="muted small" id="m-count"></span><span class="grow"></span><button class="btn primary">Save memory</button></div>
    </form>
    <section class="mem-list">${mems.map(memCard).join('') || '<p class="muted">No memories yet — add the first one above.</p>'}</section>`;
  let files = [];
  $('m-photos').onchange = e=>{ files = Array.from(e.target.files); $('m-count').textContent = files.length ? files.length + ' photo' + (files.length === 1 ? '' : 's') + ' ready' : ''; };
  $('mem-f').onsubmit = async e=>{
    e.preventDefault();
    const text = $('m-text').value.trim(), title = $('m-title').value.trim();
    if(!text && !title && !files.length) return toast('Write something or add a photo.', 'error');
    const btn = e.target.querySelector('.btn.primary'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
    const photos = [];
    for(const f of files){
      try{
        const c = await Reader.imageCanvas(f, 1800);
        const blob = await new Promise(r=>c.toBlob(r, 'image/jpeg', 0.84));
        const fileId = uid('f');
        await Store.putFile(fileId, {bytes: await blob.arrayBuffer(), mime: 'image/jpeg', name: f.name});
        const k = 420 / Math.max(c.width, c.height), t = document.createElement('canvas');
        t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        photos.push({fileId, thumb: t.toDataURL('image/jpeg', 0.72), name: f.name});
      }catch(err){ toast(f.name + ': ' + err.message, 'error'); }
    }
    S.memories.push(touch({id: uid('m'), tripId: cur.id, date: $('m-date').value, title, text, photos, createdAt: Date.now()}));
    await save(); render();
  };
  main.querySelectorAll('[data-photo]').forEach(im=>im.onclick = ()=>openPhoto(im.dataset.mem, +im.dataset.photo));
  main.querySelectorAll('[data-del-mem]').forEach(b=>b.onclick = async ()=>{
    if(!(await confirmBox('Delete this memory?', 'Its photos go too.'))) return;
    const m = S.memories.find(x=>x.id === b.dataset.delMem);
    (m.photos || []).forEach(p=>{ Cloud.deleteFile(p.remote); Store.delFile(p.fileId); });
    remove('memories', m.id); save(); render();
  });
};
function memCard(m){
  return `<article class="mem card"><div class="mem-date">${esc(fmtDate(m.date, true))}</div>
    ${m.title ? `<h3>${esc(m.title)}</h3>` : ''}${m.text ? `<p>${esc(m.text).replace(/\n/g, '<br>')}</p>` : ''}
    ${(m.photos || []).length ? `<div class="mem-photos">${m.photos.map((p, i)=>`<img src="${p.thumb}" alt="" data-mem="${esc(m.id)}" data-photo="${i}" loading="lazy">`).join('')}</div>` : ''}
    <button class="icon-btn small mem-del" data-del-mem="${esc(m.id)}" aria-label="Delete memory">${icon('trash')}</button></article>`;
}
async function openPhoto(memId, i){
  if(!(await PinLock.ensure())) return;
  const m = S.memories.find(x=>x.id === memId), p = m.photos[i];
  const v = $('viewer');
  v.hidden = false; document.body.classList.add('noscroll');
  v.innerHTML = `<div class="viewer-bar"><button class="icon-btn" id="v-x" aria-label="Close">${icon('x')}</button><div class="viewer-title"><b>${esc(m.title || fmtDate(m.date, true))}</b><span class="muted small">${i + 1} of ${m.photos.length}</span></div>
    ${i > 0 ? `<button class="btn soft small" id="v-prev">‹ Prev</button>` : ''}${i < m.photos.length - 1 ? `<button class="btn soft small" id="v-next">Next ›</button>` : ''}</div>
    <div class="viewer-body"><img class="v-img" src="${p.thumb}" id="v-photo" alt=""></div>`;
  $('v-x').onclick = closeViewer;
  if($('v-prev')) $('v-prev').onclick = ()=>openPhoto(memId, i - 1);
  if($('v-next')) $('v-next').onclick = ()=>openPhoto(memId, i + 1);
  try{ const f = await fileFor(p); $('v-photo').src = URL.createObjectURL(new Blob([f.bytes], {type: f.mime})); }catch(e){ toast(e.message, 'error'); }
}


/* ================================================================ the new design ("Horizon") on the Trips tab
   The trip's city is the backdrop (its photos, drifting and crossfading), its name and a live countdown and the
   weather there now, a 3D globe with the route from home, the next flight as a boarding pass (tap: the documents
   checklist on its back), photo cards for every trip, and the places you have been. */
const WX_ICON = {0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫', 'Fog'], 48: ['🌫', 'Fog'], 51: ['🌦', 'Drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌦', 'Drizzle'],
  61: ['🌧', 'Rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'], 71: ['🌨', 'Snow'], 73: ['🌨', 'Snow'], 75: ['🌨', 'Snow'], 80: ['🌦', 'Showers'], 81: ['🌦', 'Showers'], 82: ['⛈', 'Heavy showers'], 95: ['⛈', 'Thunderstorm']};
const tripCity = t => t.city || ((citiesOf(t)[0] || {}).city) || '';
/* the next flight of the trip (else its first) */
const passFlight = t => { const fl = flightsOf(t.id); return fl.find(f=>f.date && f.date >= todayISO()) || fl[0] || null; };
function horizonHero(t){
  const n = t.start ? daysUntil(t.start) : null, city = tripCity(t) || t.name;
  const kick = n === null ? 'Your trip' : n > 0 ? 'Your next trip' : t.end >= todayISO() ? 'You’re travelling' : 'Past trip';
  const total = t.start && t.end ? Rules.daysBetween(t.start, t.end) + 1 : 0;
  const f = passFlight(t), L = checklistOf(t);
  const ap = c => (Parse.airport(c) || {}).city || '';
  const pass = f ? `<section class="hz-pass" id="hz-pass" title="Tap to turn it over" tabindex="0"><div class="in">
      <div class="face front"><div class="main"><div class="al"><span>BOARDING PASS</span><span>${esc(f.airline || '')}</span></div>
        <div class="rt"><div><b>${esc(f.from || '?')}</b><small>${esc(ap(f.from))}${f.dep ? ' · ' + esc(f.dep) : ''}</small></div><span class="path"></span><div style="text-align:right"><b>${esc(f.to || '?')}</b><small>${esc(ap(f.to))}${f.arr ? ' · ' + esc(f.arr) : ''}</small></div></div>
        <div class="kv"><div><span>Flight</span><b>${esc(f.flight || '—')}</b></div><div><span>Date</span><b>${esc(f.date ? fmtDate(f.date) : '—')}</b></div><div><span>Travellers</span><b>${f.travellers.length || '—'}</b></div><div><span>Seat</span><b>${esc((f.seat || '—').split(',')[0])}</b></div></div>
        <span class="hint">Tap to see the documents ↻</span></div>
        <div class="stub"><div><small>SEAT</small><div class="seat">${esc((f.seat || '—').split(',')[0])}</div></div><div class="bar"></div></div></div>
      <div class="face back"><h3>Documents for ${esc(t.name)} · ${L.ready} of ${L.items.length} ready</h3>
        <div class="chk">${L.items.slice(0, 8).map(i=>{ const ok = i.status === 'done' || i.status === 'ticked'; return `<div><i class="${ok ? '' : 'no'}">${ok ? '✓' : '!'}</i>${esc(i.rule.name)}${i.person ? ' — ' + esc(i.person.split(' ')[0]) : ''}</div>`; }).join('') || '<p class="muted">No checklist yet.</p>'}</div>
        <p class="small muted" style="margin:10px 0 0">Tap to turn back ↻ · <a href="#check">Open the checklist</a></p></div>
    </div></section>` : '';
  return `<section class="hz-hero">
    <div class="hz-left">
      <div class="hz-kick"><i></i>${esc(kick)}</div>
      <h1 class="hz-city">${[...city].map((c, i)=>`<span style="animation-delay:${(i * .05).toFixed(2)}s">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('')}</h1>
      <div class="hz-where"><b>${esc(t.name !== city ? t.name : (t.country || ''))}</b>${t.start ? ' · ' + esc(fmtRange(t.start, t.end)) : ''}${total ? ' · ' + total + ' days' : ''}</div>
      <div class="hz-facts"><div class="hz-count" id="hz-count"></div><div class="hz-wx" id="hz-wx" hidden></div></div>
      <div class="row hz-actions"><button class="btn primary" id="go-up">${icon('upload')} Add a document</button><button class="btn soft" id="go-plan">${icon('map')} Itinerary</button><button class="btn ghost" data-edit-trip="${esc(t.id)}">${icon('edit')} Edit</button></div>
    </div>
    <div class="hz-globe" id="hz-globe"><canvas aria-hidden="true"></canvas><span class="hz-pin home" data-pin="home"></span><span class="hz-pin" data-pin="dest"></span></div>
  </section>${pass}`;
}
function placesHTML(){
  const list = (S.visited || []).slice().sort((a, b)=>String(b.year || '').localeCompare(String(a.year || '')) || a.city.localeCompare(b.city));
  return `<section class="hz-places"><div class="section-head"><h2>Places you’ve been</h2><span class="muted small">${list.length ? list.length + ' place' + (list.length === 1 ? '' : 's') + ' · glowing on the globe' : 'Add them once - they glow on the globe'}</span></div>
    <form class="hz-add" id="hz-add"><input id="hz-city" placeholder="City — Venice" required><input id="hz-country" placeholder="Country"><input id="hz-year" inputmode="numeric" maxlength="4" placeholder="Year"><button class="btn primary">${icon('plus')} Add</button></form>
    <div class="trip-grid">${list.map(v=>`<article class="hz-place" data-city="${esc(v.city)}"><button class="hz-x" data-del-place="${esc(v.id)}" aria-label="Remove ${esc(v.city)}">×</button>
      <div class="tx"><b>${esc(v.city)}</b><small>${esc([v.country, v.year].filter(Boolean).join(' · '))}</small></div></article>`).join('')}</div></section>`;
}
let hzTimer = 0, hzSlides = 0, hzCity = '';
/* the backdrop: the city's photos, one after another, each drifting slowly */
async function hzBackdrop(city){
  let bg = $('hz-bg');
  if(!bg){ bg = document.createElement('div'); bg.id = 'hz-bg'; bg.setAttribute('aria-hidden', 'true'); document.body.prepend(bg);
    const cr = document.createElement('div'); cr.id = 'hz-credit'; document.body.appendChild(cr); }
  if(city === hzCity && bg.children.length) return;
  hzCity = city; clearInterval(hzTimer);
  const files = await Photos.of(city);
  if(city !== hzCity) return;
  if(!files.length){ [...bg.children].forEach(o=>o.remove()); $('hz-credit').textContent = ''; return; }
  const show = i => {
    const f = files[i % files.length], img = new Image();
    img.onload = () => {
      if(city !== hzCity) return;
      const el = document.createElement('div');
      el.className = 'hz-ph kb' + (1 + (hzSlides++ % 3)); el.style.backgroundImage = `url("${Photos.url(f)}")`;
      bg.appendChild(el); requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('on')));
      [...bg.children].slice(0, -1).forEach(o=>{ o.classList.remove('on'); setTimeout(()=>o.remove(), 1800); });
      $('hz-credit').innerHTML = `${esc(f.replace(/\.jpe?g$/i, '').replace(/_/g, ' '))} · <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(f)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    };
    img.onerror = () => { if(files.length > 1 && i < files.length * 2) show(i + 1); };
    img.src = Photos.url(f);
  };
  let i = 0; show(i);
  if(files.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) hzTimer = setInterval(()=>show(++i), 9000);
}
let hzCountTimer = 0;
function horizonBind(main, cur, trips){
  if(cur){
    const t = Object.assign({}, cur, tripSpan(cur)), city = tripCity(t);
    hzBackdrop(city);
    // the countdown, to the first flight's departure (else the first day)
    const f = flightsOf(t.id)[0];
    const at = f && f.date ? new Date(f.date + 'T' + (f.dep || '00:00') + ':00') : t.start ? new Date(t.start + 'T00:00:00') : null;
    clearInterval(hzCountTimer);
    const box = $('hz-count');
    const draw = () => {
      if(!box.isConnected){ clearInterval(hzCountTimer); return; }
      const ms = at ? at - Date.now() : -1;
      if(!at || ms < 0){
        const on = t.end && t.end >= todayISO() && t.start && t.start <= todayISO();
        box.innerHTML = at ? `<div class="u"><b>${on ? Rules.daysBetween(t.start, todayISO()) + 1 : '✓'}</b><small>${on ? 'day of the trip' : 'been there'}</small></div>` : '<div class="u"><b>?</b><small>add the dates</small></div>';
        return;
      }
      const parts = [['d', Math.floor(ms / 864e5), 'days'], ['h', Math.floor(ms / 36e5) % 24, 'hours'], ['m', Math.floor(ms / 6e4) % 60, 'min'], ['s', Math.floor(ms / 1e3) % 60, 'sec']];
      if(!box.querySelector('[data-k]')) box.innerHTML = parts.map(([k, , l])=>`<div class="u" data-k="${k}"><b>00</b><small>${l}</small></div>`).join('');
      parts.forEach(([k, v])=>{ const u = box.querySelector(`[data-k="${k}"]`), txt = String(v).padStart(2, '0');
        if(u.firstElementChild.textContent !== txt){ u.firstElementChild.textContent = txt; u.classList.remove('flip'); void u.offsetWidth; u.classList.add('flip'); } });
    };
    draw(); hzCountTimer = setInterval(draw, 1000);
    // the weather there now
    const loc = tripLoc(t);
    if(loc) fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,weather_code`).then(r=>r.json()).then(r=>{
      const w = $('hz-wx'); if(!w || !r.current) return;
      const code = r.current.weather_code, ic = WX_ICON[code] || ['🌡', ''];
      w.innerHTML = `<span class="i">${ic[0]}</span><div><span class="t">${Math.round(r.current.temperature_2m)}°</span><small>${esc(ic[1])}${ic[1] ? ' in ' : 'In '}${esc(city)} now</small></div>`; w.hidden = false;
    }).catch(()=>{});
    // the globe: home, this trip, and every place you have been
    const home = homeBase();
    const dots = trips.filter(x=>x.id !== t.id).map(tripLoc).concat((S.visited || []).filter(v=>v.lat != null).map(v=>({lat: v.lat, lng: v.lng}))).filter(Boolean);
    mountGlobe($('hz-globe'), {home: home && {lat: home.lat, lng: home.lng, name: home.name.toUpperCase()}, dest: loc && {lat: loc.lat, lng: loc.lng, name: city.toUpperCase()}, dots});
    const pass = $('hz-pass');
    if(pass){ pass.onclick = e=>{ if(!e.target.closest('a')) pass.classList.toggle('flipped'); }; pass.onkeydown = e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pass.classList.toggle('flipped'); } }; }
  }
  // every trip and place gets its city's photo
  const photo = (el, city) => Photos.of(city).then(f=>{ if(f[0]){ el.style.backgroundImage = `url("${Photos.url(f[0], 640)}")`; el.classList.add('has-photo'); } });
  main.querySelectorAll('.trip-card[data-trip]').forEach(el=>{ const t = tripById(el.dataset.trip); if(t) photo(el, tripCity(t)); });
  main.querySelectorAll('.hz-place').forEach(el=>photo(el, el.dataset.city));
  // the cards lean towards the pointer
  if(matchMedia('(hover: hover) and (pointer: fine)').matches) main.querySelectorAll('.trip-card, .hz-place').forEach(el=>{
    el.addEventListener('pointermove', e=>{ const r = el.getBoundingClientRect(); el.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg'); el.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 8 + 'deg'); });
    el.addEventListener('pointerleave', ()=>{ el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
  // places you have been: add one (found on the map once) or take it off
  const form = $('hz-add');
  if(form){
    citySuggest($('hz-city'), $('hz-country'));
    form.onsubmit = async e=>{
      e.preventDefault();
      const city = $('hz-city').value.trim(), country = $('hz-country').value.trim(), year = $('hz-year').value.trim();
      if(!city) return;
      if((S.visited || []).some(v=>v.city.toLowerCase() === city.toLowerCase())) return toast(city + ' is already on the list.');
      const loc = await cityLoc(city, country).catch(()=>null);
      S.visited = S.visited || [];
      S.visited.push(touch({id: uid('v'), city, country: country || (loc && loc.country) || '', year: /^\d{4}$/.test(year) ? year : '', lat: loc ? loc.lat : null, lng: loc ? loc.lng : null}));
      save(); render();
      toast(loc ? city + ' added - it glows on the globe.' : city + ' added (not found on the map, so not on the globe).');
    };
  }
  main.querySelectorAll('[data-del-place]').forEach(b=>b.onclick = ()=>{ remove('visited', b.dataset.delPlace); save(); render(); });
}
