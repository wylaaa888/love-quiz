var SUPABASE_URL = 'https://pjyrugztpyldaoirreis.supabase.co';
var SUPABASE_ANON = 'sb_publishable_qXlO_IyNtF9dWEPHuH4qcA_545PRKRM';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

var DATA = window.QUIZ_DATA;
var RESULTS = window.QUIZ_RESULTS;
var TOTAL_Q = DATA.questions.length;

var state = {
  code: '',
  answers: new Array(TOTAL_Q).fill(null),
  idx: 0,
  result: null,
  resultId: null
};

function $(id){ return document.getElementById(id); }
function toast(msg){
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

function parseHash(){
  var h = location.hash.replace(/^#\/?/, '');
  if (h.indexOf('result/') === 0) return { mode: 'result', id: h.split('/')[1] };
  return { mode: 'auth' };
}

function boot(){
  var route = parseHash();
  if (route.mode === 'result' && route.id) { loadResult(route.id); }
  else { renderAuth(); }
}

/* ---------- 密码页 ---------- */
function renderAuth(){
  state.idx = 0;
  var app = $('app');
  app.innerHTML =
    '<div class="wrap">' +
      '<div class="card">' +
        '<div class="title">测一测你的恋爱脑等级</div>' +
        '<div class="subtitle">是清醒大女主，还是沦陷型选手？20 道情境题，看清你在感情里的投入速度、边界感、情绪牵动与复原力。</div>' +
        '<div class="field"><label>请输入卡密开始测试</label>' +
          '<input id="code-input" type="text" autocomplete="off" placeholder="请输入卡密" /></div>' +
        '<button class="btn" id="start-btn">开始测试</button>' +
        '<div class="msg" id="auth-msg"></div>' +
        '<div class="hint">请根据平时的真实表现作答，不要过度美化自己。测试结果仅供娱乐与自我参考，不构成专业心理诊断。</div>' +
      '</div>' +
    '</div>';
  $('start-btn').onclick = submitCode;
  $('code-input').onkeydown = function(e){ if (e.key === 'Enter') submitCode(); };
}

function reasonText(r){
  if (r === 'invalid') return '卡密不存在，请检查后重试';
  if (r === 'disabled') return '该卡密已被停用，请联系发放方';
  if (r === 'exhausted') return '该卡密测试次数已用完';
  return '校验未通过，请重试';
}

async function submitCode(){
  var code = $('code-input').value.trim();
  var msg = $('auth-msg');
  if (!code) { msg.textContent = '请先输入卡密'; return; }
  var btn = $('start-btn'); btn.disabled = true; btn.textContent = '校验中…';
  try {
    var res = await sb.rpc('redeem_code', { p_code: code });
    if (res.error) { msg.textContent = '网络异常，请稍后重试'; btn.disabled = false; btn.textContent = '开始测试'; return; }
    var data = res.data;
    if (data && data.ok) {
      state.code = code;
      renderQuiz();
    } else {
      msg.textContent = reasonText(data && data.reason);
      btn.disabled = false; btn.textContent = '开始测试';
    }
  } catch (e) {
    msg.textContent = '网络异常，请稍后重试'; btn.disabled = false; btn.textContent = '开始测试';
  }
}

/* ---------- 答题页 ---------- */
function renderQuiz(){
  var q = DATA.questions[state.idx];
  var opts = q.options.map(function(text, i){
    var sel = state.answers[state.idx] === i ? ' sel' : '';
    return '<button class="option' + sel + '" data-i="' + i + '">' + text + '</button>';
  }).join('');
  var app = $('app');
  app.innerHTML =
    '<div class="wrap">' +
      '<div class="card">' +
        '<div class="q-index">第 ' + (state.idx + 1) + ' / ' + TOTAL_Q + ' 题</div>' +
        '<div class="progress"><i style="width:' + Math.round((state.idx / TOTAL_Q) * 100) + '%"></i></div>' +
        '<div class="q-text">' + q.q + '</div>' +
        '<div class="options">' + opts + '</div>' +
        '<div class="nav">' +
          (state.idx > 0 ? '<button class="btn btn-ghost" id="prev-btn">上一题</button>' : '') +
          '<button class="btn" id="next-btn" disabled>' + (state.idx === TOTAL_Q - 1 ? '查看结果' : '下一题') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  var optionBtns = document.querySelectorAll('.option');
  optionBtns.forEach(function(btn){
    btn.onclick = function(){
      state.answers[state.idx] = parseInt(btn.getAttribute('data-i'), 10);
      optionBtns.forEach(function(b){ b.classList.remove('sel'); });
      btn.classList.add('sel');
      $('next-btn').disabled = false;
    };
  });
  if (state.idx > 0) $('prev-btn').onclick = function(){ state.idx--; renderQuiz(); };
  var next = $('next-btn');
  if (state.answers[state.idx] !== null) next.disabled = false;
  next.onclick = function(){
    if (state.answers[state.idx] === null) return;
    if (state.idx === TOTAL_Q - 1) { submitQuiz(); }
    else { state.idx++; renderQuiz(); }
  };
}

/* ---------- 计分 ---------- */
function calc(){
  var total = 0;
  var dims = { speed: 0, boundary: 0, emotion: 0, recovery: 0 };
  DATA.questions.forEach(function(q, i){
    var v = state.answers[i] || 0;
    total += v; dims[q.dim] += v;
  });
  var level = DATA.thresholds.find(function(t){ return total >= t.min && total <= t.max; }).level;
  return { total: total, dims: dims, level: level };
}

async function submitQuiz(){
  var r = calc();
  var detail = RESULTS[r.level];
  var row = {
    code: state.code,
    total_score: r.total,
    dimension_scores: r.dims,
    level: r.level,
    level_title: detail.title,
    result_payload: detail
  };
  var btn = $('next-btn'); if (btn) { btn.disabled = true; btn.textContent = '生成结果中…'; }
  var res = await sb.from('test_results').insert(row).select('id').single();
  if (res.error) { toast('结果保存失败，请重试'); return; }
  state.resultId = res.data.id;
  state.result = { total: r.total, dims: r.dims, level: r.level, detail: detail };
  renderResult();
}

/* ---------- 结果页 ---------- */
function dimBars(dims){
  return DATA.dimensions.map(function(d){
    var val = dims[d.key] || 0;
    var pct = Math.round((val / 15) * 100);
    return '<div class="dim"><div class="dim-top"><span>' + d.label + '</span><span>' + val + ' / 15</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
  }).join('');
}

function renderResult(){
  var r = state.result, d = r.detail;
  var app = $('app');
  app.innerHTML =
    '<div class="wrap">' +
      '<div class="card" id="report-card">' +
        '<div class="result-head">' +
          '<div class="result-badge">恋爱脑等级测评</div>' +
          '<div class="result-title">' + d.title + '</div>' +
          '<div class="result-slogan">' + d.slogan + '</div>' +
          '<div class="score-row"><div><div class="num">' + r.total + '</div><div class="lab">总分 / 60</div></div></div>' +
        '</div>' +
        dimBars(r.dims) +
        '<div class="section"><h3>整体画像</h3><p>' + d.portrait + '</p></div>' +
        '<div class="section"><h3>四维度解读</h3>' +
          DATA.dimensions.map(function(x){ return '<p style="margin-top:8px"><strong>' + x.label + '：</strong>' + d.dims[x.key] + '</p>'; }).join('') +
        '</div>' +
        '<div class="section"><h3>你的优势</h3><p>' + d.strengths + '</p></div>' +
        '<div class="section"><h3>需要留意</h3><p>' + d.cautions + '</p></div>' +
        '<div class="section"><h3>给你的建议</h3><p>' + d.advice + '</p></div>' +
        '<div class="quote-card">“' + d.quote + '”</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" id="save-btn">保存结果长图</button>' +
        '<button class="btn btn-ghost" id="copy-btn">复制分享链接</button>' +
      '</div>' +
      '<div class="disclaimer">本测试为娱乐与自我探索用途，结果不构成心理诊断；若情绪长期低落困扰，请咨询专业心理机构。</div>' +
    '</div>';

  $('save-btn').onclick = saveImage;
  $('copy-btn').onclick = copyLink;
  window.scrollTo(0, 0);
}

async function loadResult(id){
  var res = await sb.from('test_results').select('*').eq('id', id).single();
  if (res.error || !res.data) {
    $('app').innerHTML = '<div class="wrap"><div class="card"><div class="title">结果不存在或已失效</div><div class="subtitle">链接可能有误，或结果已被删除。</div></div></div>';
    return;
  }
  var row = res.data;
  state.resultId = row.id;
  state.result = { total: row.total_score, dims: row.dimension_scores, level: row.level, detail: row.result_payload };
  renderResult();
}

/* ---------- 长图与分享 ---------- */
async function saveImage(){
  var node = $('report-card');
  try {
    var canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#fff5f2' });
    var link = document.createElement('a');
    link.download = 'love-quiz-result.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('长图已生成，可保存到相册');
  } catch (e) {
    toast('生成长图失败，请截图保存');
  }
}

function shareUrl(){
  return location.origin + location.pathname + '#/result/' + state.resultId;
}

async function copyLink(){
  var url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast('链接已复制，可分享给好友');
  } catch (e) {
    prompt('复制下面的链接分享给好友：', url);
  }
}

window.addEventListener('hashchange', boot);
boot();
