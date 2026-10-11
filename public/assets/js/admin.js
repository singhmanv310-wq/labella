(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var state = { page: 1, q: '', status: '', statuses: [] };
  var timer;

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    if (opts.body && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); opts.headers = { 'Content-Type': 'application/json' }; }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error('auth'); }
        d._status = r.status; return d;
      });
    });
  }
  function toast(msg, bad) {
    var t = $('#toast'); t.textContent = msg; t.className = 'pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ' + (bad ? 'bg-red-700' : 'bg-emerald-700');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }
  function showLogin() { $('#appView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); $('#loginView').classList.add('flex'); }
  function showApp() { $('#loginView').classList.add('hidden'); $('#loginView').classList.remove('flex'); $('#appView').classList.remove('hidden'); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render(d) {
    $('#sTotal').textContent = d.stats.total; $('#sNew').textContent = d.stats.new;
    $('#sToday').textContent = d.stats.today; $('#sWon').textContent = d.stats.won;
    var body = $('#rows'); body.textContent = '';
    if (!d.leads.length) {
      var tr = el('tr'), td = el('td', 'p-8 text-center text-gray-400', state.q || state.status ? 'No leads match your filters.' : 'No leads yet. They will appear here as soon as someone submits a form.');
      td.colSpan = 10; tr.appendChild(td); body.appendChild(tr);
    }
    d.leads.forEach(function (l) {
      var tr = el('tr', 'align-top hover:bg-olive-800/40');
      tr.appendChild(el('td', 'p-3 font-mono text-emerald-400', l.id));
      tr.appendChild(el('td', 'p-3 whitespace-nowrap text-gray-400', new Date(l.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })));
      tr.appendChild(el('td', 'p-3 font-semibold text-white', l.fullName));
      tr.appendChild(el('td', 'p-3 font-mono', l.phone));
      tr.appendChild(el('td', 'p-3 text-gray-300 break-all', l.email));
      tr.appendChild(el('td', 'p-3', l.unitType));
      var src = el('td', 'p-3 text-gray-400', l.source + (l.utmCampaign ? ' / ' + l.utmCampaign : '')); tr.appendChild(src);

      var sTd = el('td', 'p-3'), sel = el('select', 'rounded border border-olive-700 bg-olive-950 px-2 py-1 text-emerald-300');
      sel.setAttribute('aria-label', 'Status for ' + l.fullName);
      state.statuses.forEach(function (s) { var o = el('option', '', s); o.value = s; if (s === l.status) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () {
        api('/api/admin/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body: { status: sel.value } })
          .then(function (r) { if (r.ok) { toast('Status updated'); load(true); } else toast(r.error || 'Failed', true); }).catch(function () {});
      });
      sTd.appendChild(sel); tr.appendChild(sTd);

      var nTd = el('td', 'p-3'), note = el('input', 'w-48 rounded border border-olive-700 bg-olive-950 px-2 py-1 text-gray-200 placeholder-gray-600');
      note.type = 'text'; note.maxLength = 500; note.value = l.notes || ''; note.placeholder = 'Add note'; note.setAttribute('aria-label', 'Notes for ' + l.fullName);
      note.addEventListener('change', function () {
        api('/api/admin/leads/' + encodeURIComponent(l.id), { method: 'PATCH', body: { notes: note.value } })
          .then(function (r) { if (r.ok) toast('Note saved'); else toast(r.error || 'Failed', true); }).catch(function () {});
      });
      nTd.appendChild(note); tr.appendChild(nTd);

      var aTd = el('td', 'p-3 whitespace-nowrap');
      var wa = el('a', 'mr-3 text-emerald-400 hover:underline', 'WhatsApp'); wa.href = 'https://wa.me/91' + l.phone; wa.target = '_blank'; wa.rel = 'noopener noreferrer';
      var call = el('a', 'mr-3 text-gray-300 hover:underline', 'Call'); call.href = 'tel:+91' + l.phone;
      var del = el('button', 'text-red-300 hover:underline', 'Delete'); del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Delete ' + l.id + ' (' + l.fullName + ')? This cannot be undone.')) return;
        api('/api/admin/leads/' + encodeURIComponent(l.id), { method: 'DELETE' }).then(function (r) { if (r.ok) { toast('Deleted'); load(); } else toast('Failed', true); }).catch(function () {});
      });
      aTd.appendChild(wa); aTd.appendChild(call); aTd.appendChild(del); tr.appendChild(aTd);
      body.appendChild(tr);
    });
    $('#pageInfo').textContent = d.total + ' lead' + (d.total === 1 ? '' : 's') + ' | Page ' + d.page + ' of ' + d.pages;
    $('#prev').disabled = d.page <= 1; $('#next').disabled = d.page >= d.pages;
    state.page = d.page;
    var p = new URLSearchParams(); if (state.q) p.set('q', state.q); if (state.status) p.set('status', state.status);
    $('#exportLink').href = '/api/admin/export.csv' + (p.toString() ? '?' + p : '');
  }

  function load() {
    var p = new URLSearchParams({ page: state.page, q: state.q, status: state.status });
    return api('/api/admin/leads?' + p).then(function (d) { if (d.ok) render(d); }).catch(function () {});
  }

  function start() {
    api('/api/admin/me').then(function (d) {
      if (!d.ok) return showLogin();
      state.statuses = d.statuses; $('#who').textContent = d.email;
      var f = $('#statusFilter'); if (f.options.length === 1) d.statuses.forEach(function (s) { var o = el('option', '', s); o.value = s; f.appendChild(o); });
      showApp(); load();
    }).catch(function () { showLogin(); });
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#loginError'); err.classList.add('hidden');
    api('/api/admin/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } }).then(function (d) {
      if (d.ok) { $('#password').value = ''; start(); }
      else { err.textContent = d.error || 'Sign in failed.'; err.classList.remove('hidden'); }
    });
  });
  $('#logout').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST', body: {} }).then(function (d) {
      if (d.ok) location.reload();
      else toast(d.error || 'Sign out failed. Please try again.', true);
    }).catch(function () { toast('Could not sign out. Please try again.', true); });
  });
  $('#search').addEventListener('input', function (e) { clearTimeout(timer); timer = setTimeout(function () { state.q = e.target.value; state.page = 1; load(); }, 250); });
  $('#statusFilter').addEventListener('change', function (e) { state.status = e.target.value; state.page = 1; load(); });
  $('#prev').addEventListener('click', function () { state.page--; load(); });
  $('#next').addEventListener('click', function () { state.page++; load(); });
  start();
})();
