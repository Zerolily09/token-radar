/* Token Radar dashboard: renders window.RADAR (data.js, written by main.ts from the
   sealed snapshot) as the board, a per-protocol detail view and a live-token view.
   Static page: no fetch, no framework, no network. */
(function () {
  'use strict';
  var R = window.RADAR;
  var boardEl = document.getElementById('board');
  if (!R) {
    boardEl.textContent = 'No data: data.js did not load. Run main.ts to build the board first.';
    return;
  }
  var M = R.model;

  // ------------------------------------------------------------ formatting
  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function mult(n) { return n === null || n === undefined ? '—' : n.toFixed(3) + '×'; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 90) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' y';
  }

  // ------------------------------------------------------------ sandbox
  // The board's stated model, and the sandbox's current weights. A row's stored
  // multipliers decompose back into the model's inputs, so the sandbox re-scores
  // every row exactly the way lib/model.ts does, with the weights swapped.
  var sandbox = { growth: M.growth_weight, maturity: M.maturity_range, breadth: M.breadth_per_chain };
  function growthPctOf(row) {
    if (M.growth_weight === 0) return 0;
    return ((row.growth_multiplier - 1) / M.growth_weight) * 100;
  }
  function impliedWith(row, w) {
    var g = 1 + (growthPctOf(row) / 100) * w.growth;
    var age = row.age_days === null ? M.unknown_age_days : row.age_days;
    var frac = Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days;
    var m = (1 - w.maturity) + w.maturity * frac;
    var b = 1 + Math.min(Math.max(row.chains.length - 1, 0), M.breadth_max_extra) * w.breadth;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * g * m * b));
  }
  function sandboxActive() {
    return sandbox.growth !== M.growth_weight || sandbox.maturity !== M.maturity_range || sandbox.breadth !== M.breadth_per_chain;
  }

  // ------------------------------------------------------------ state
  var state = { view: 'board', q: '', category: '', chain: '', set: 'all', sort: 'implied' };

  // ------------------------------------------------------------ header + peers
  document.getElementById('asof').textContent = '· as of ' + R.as_of;
  document.getElementById('headline').textContent =
    R.protocols_size + ' protocols in the snapshot, ' + R.pretoken_size + ' with no token. ' +
    'The board ranks ' + R.board_size + ': all ' + R.watchlist_size + ' on the watchlist plus ' +
    R.early_size + ' more the early radar found past the floor. Every row carries the value the ' +
    'model gives its launch and the steps to farm it.';
  var totalImplied = R.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
  var stats = [
    ['Protocols scanned', R.protocols_size],
    ['Pre-token found', R.pretoken_size],
    ['Rows ranked', R.board_size],
    ['Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size],
    ['Global peer multiple', mult(R.global_multiple)],
    ['Board implied total', money(totalImplied)],
  ];
  document.getElementById('stats').innerHTML = stats.map(function (s) {
    return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>';
  }).join('');
  document.getElementById('source-line').textContent =
    'Source: ' + R.source + ' · Model ' + R.model_version + ' · Board built from the sealed snapshot alone; nothing on this page was fetched.';

  var peersHtml = '<table><thead><tr><th>Category</th><th>Traded peers</th><th>Median multiple</th><th>Multiple used</th></tr></thead><tbody>';
  R.peer_stats.slice(0, 12).forEach(function (p) {
    peersHtml += '<tr><td>' + esc(p.category) + '</td><td>' + p.peers + '</td><td>' + mult(p.median_multiple) + '</td><td>' + mult(p.used_multiple) + '</td></tr>';
  });
  peersHtml += '<tr><td>All categories (fallback)</td><td>—</td><td>' + mult(R.global_multiple) + '</td><td>' + mult(R.global_multiple) + '</td></tr></tbody></table>';
  document.getElementById('peers').innerHTML = peersHtml;

  // ------------------------------------------------------------ controls
  var catSel = document.getElementById('f-category');
  var chainSel = document.getElementById('f-chain');
  var cats = {}, chains = {};
  R.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  catSel.innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');
  chainSel.innerHTML = '<option value="">All chains</option>' + Object.keys(chains).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');

  function bind(id, key) {
    document.getElementById(id).addEventListener('input', function (e) {
      state[key] = e.target.value;
      render();
    });
  }
  bind('q', 'q'); bind('f-category', 'category'); bind('f-chain', 'chain');
  bind('f-set', 'set'); bind('f-sort', 'sort');
  document.getElementById('v-board').addEventListener('click', function () { state.view = 'board'; render(); });
  document.getElementById('v-live').addEventListener('click', function () { state.view = 'live'; render(); });

  function bindSlider(id, outId, key, fmt) {
    var el = document.getElementById(id), out = document.getElementById(outId);
    el.value = sandbox[key];
    out.textContent = fmt(sandbox[key]);
    el.addEventListener('input', function () {
      sandbox[key] = parseFloat(el.value);
      out.textContent = fmt(sandbox[key]);
      render();
    });
  }
  bindSlider('s-growth', 'o-growth', 'growth', function (v) { return v.toFixed(2); });
  bindSlider('s-maturity', 'o-maturity', 'maturity', function (v) { return v.toFixed(2); });
  bindSlider('s-breadth', 'o-breadth', 'breadth', function (v) { return v.toFixed(3); });
  document.getElementById('s-reset').addEventListener('click', function () {
    sandbox = { growth: M.growth_weight, maturity: M.maturity_range, breadth: M.breadth_per_chain };
    ['s-growth', 's-maturity', 's-breadth'].forEach(function (id, i) {
      var el = document.getElementById(id);
      el.value = [sandbox.growth, sandbox.maturity, sandbox.breadth][i];
      el.dispatchEvent(new Event('input'));
    });
    render();
  });

  // ------------------------------------------------------------ board
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.set === 'watchlist' && !r.on_watchlist) return false;
      if (state.set === 'early' && r.on_watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      if (key === 'multiple') return b.peer_multiple - a.peer_multiple;
      return impliedWith(b, sandbox) - impliedWith(a, sandbox);
    });
    return rows;
  }

  function rowHtml(r) {
    var implied = impliedWith(r, sandbox);
    var changed = sandboxActive() && implied !== r.implied_value_usd;
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><span class="pname">' + esc(r.name) + '</span>' +
      (r.on_watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early</span>') +
      '<div class="pmeta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') +
      (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</div></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : '') + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num">' + mult(r.peer_multiple) + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num"><strong>' + money(implied) + '</strong>' +
      (changed ? '<div class="pmeta">model: ' + money(r.implied_value_usd) + '</div>' : '') + '</td></tr>';
  }

  function renderBoard() {
    var rows = visibleRows();
    document.getElementById('count').textContent =
      rows.length + ' of ' + R.board_size + ' rows' + (sandboxActive() ? ' · sandbox weights on' : '');
    var html = '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Multiple</th><th>Age</th><th>Implied value</th></tr></thead><tbody>';
    html += rows.map(rowHtml).join('');
    html += '</tbody></table>';
    if (rows.length === 0) html = '<p>No protocol matches those filters. Loosen one and the radar sweeps again.</p>';
    boardEl.innerHTML = html;
    boardEl.setAttribute('aria-busy', 'false');
    Array.prototype.forEach.call(boardEl.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { showDetail(tr.getAttribute('data-slug')); });
    });
  }

  function renderLive() {
    document.getElementById('count').textContent = R.live_size + ' live tokens, at the market’s own values';
    var html = '<table class="board"><thead><tr><th>#</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Multiple</th><th>Age</th><th>Market cap</th></tr></thead><tbody>';
    R.live.forEach(function (r, i) {
      html += '<tr><td class="num">' + (i + 1) + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span><div class="pmeta">' + esc(r.category || 'Uncategorised') + ' · ' +
        esc(r.chains.slice(0, 3).join(', ') || '—') + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : '') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + mult(r.multiple) + '</td><td class="num">—</td>' +
        '<td class="num"><strong>' + money(r.mcap_usd) + '</strong></td></tr>';
    });
    html += '</tbody></table>';
    boardEl.innerHTML = html;
    boardEl.setAttribute('aria-busy', 'false');
  }

  function render() {
    document.getElementById('v-board').classList.toggle('on', state.view === 'board');
    document.getElementById('v-live').classList.toggle('on', state.view === 'live');
    document.getElementById('controls').style.display = state.view === 'board' ? '' : 'none';
    if (state.view === 'live') renderLive(); else renderBoard();
  }

  // ------------------------------------------------------------ detail
  function showDetail(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var sec = document.getElementById('detail');
    var peerNote = r.peer_count >= 2
      ? 'median of ' + r.peer_count + ' traded ' + esc(r.category || '') + ' peers, shrunk toward the market'
      : 'the market-wide median (too few traded peers in its category to judge by)';
    var html = '<h3>' + esc(r.name) + (r.on_watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early radar</span>') + '</h3>' +
      '<p class="pmeta">' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chains recorded') +
      ' · tracked by DefiLlama since ' + esc(r.listed_at || 'an unrecorded date') + ' (' + ageText(r.age_days) + ') · slug ' + esc(r.slug) + '</p>' +
      '<div class="detail-grid"><div><h4>The model’s working</h4><table class="kv">' +
      '<tr><td>TVL</td><td>' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Category multiple</td><td>' + mult(r.peer_multiple) + '</td></tr>' +
      '<tr><td>Peer evidence</td><td>' + peerNote + '</td></tr>' +
      '<tr><td>Momentum (7d ' + pct(r.change_7d) + ')</td><td>' + r.growth_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td>Maturity</td><td>' + r.maturity_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td>Breadth (' + r.chains.length + ' chains)</td><td>' + r.breadth_multiplier.toFixed(3) + '×</td></tr>' +
      '<tr><td><strong>Implied launch value</strong></td><td><strong>' + money(r.implied_value_usd) + '</strong></td></tr>' +
      '</table></div>' +
      '<div><h4>How to farm it</h4><ol class="farm">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div></div>';
    document.getElementById('detail-body').innerHTML = html;
    sec.hidden = false;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render();
})();
