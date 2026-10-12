/* TRIP VAULT (regression): the news summary asks for a web search that your own AI can do (no Gemini key needed), says
   so under the summary, and passes the sources on. Run: node --test tests/   (Node 18+; nothing is fetched) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), vm = require('vm'), path = require('path');

function load(chat){
  const ctx = {console, Date, Math, JSON, setTimeout, clearTimeout, URL, encodeURIComponent, fetch: async () => { throw new Error('no network in this test'); },
    Parse: {TYPE: new Proxy({}, {get: (o, k)=>String(k)}), TYPE_LABEL: {ticket: 'Ticket'}, airport: ()=>null, read: ()=>null},
    Cloud: {chat, json: t => JSON.parse(String(t).replace(/^```json|```$/g, ''))}, window: {}, document: {addEventListener(){}}, localStorage: {getItem: ()=>null, setItem(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'tripManangement', 'services.js'), 'utf8') + '\nthis.News = News;', ctx);
  return ctx.News;
}
const trip = {city: 'Lisbon', country: 'Portugal', start: '2027-03-10', end: '2027-03-15', flights: []};
const data = {advisory: {levelText: 'No FCDO travel restrictions', summary: ''}, weather: null, city: [], security: [], travel: []};

test('news: a web search is asked for, with a question your own AI can look up', async () => {
  let opts = null;
  const News = load(async (system, turns, o) => { opts = o; return {text: '{"status":"caution","headline":"Airport strike","points":["a"],"flights":"b","advice":"c"}', provider: 'Your own AI (on your Mac)', model: 'chatgpt', searchedBy: 'your Mac', sources: [{title: 'Example News', url: 'https://example.com/news'}]}; });
  const s = await News.summarise(trip, data, {search: true});
  assert.equal(opts.search, true);
  assert.equal(opts.searchOptional, true, 'the summary still comes when no AI can search');
  assert.match(opts.webQuestion, /latest news \(last 7 days\) affecting travellers to Lisbon, Portugal/);
  assert.equal(s.status, 'caution');
  assert.match(s.by, /\(with a web search on your Mac\)$/);
  assert.equal(s.sources[0].url, 'https://example.com/news');
});
test('news: without a search it says so plainly (the old "the AI that searches is busy" case)', async () => {
  const News = load(async () => ({text: '{"status":"clear","headline":"h","points":[]}', provider: 'Groq', model: 'm', noSearch: true}));
  const s = await News.summarise(trip, data, {search: true});
  assert.match(s.by, /without web search/);
});
test('news: with the search box off, no search is asked for', async () => {
  let opts = null;
  const News = load(async (system, turns, o) => { opts = o; return {text: '{"status":"clear","headline":"h","points":[]}', provider: 'x', model: 'y'}; });
  await News.summarise(trip, data, {});
  assert.equal(opts.search, undefined);
  assert.equal(opts.webQuestion, undefined);
});
