(function () {
  'use strict';

  var WHATSAPP = '917860391489';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* Footer year */
  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* Hero image is optional: hide it if the remote fallback is unavailable */
  var hero = $('#heroImage');
  if (hero) hero.addEventListener('error', function () { hero.remove(); });

  /* Mobile menu */
  var menuBtn = $('#menuToggle'), menu = $('#mobileMenu');
  function setMenu(open) {
    menu.classList.toggle('hidden', !open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', function () { setMenu(menu.classList.contains('hidden')); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  /* Remember ad campaign tags (utm_*) for the whole visit */
  try {
    var qs = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      if (qs.get(k)) sessionStorage.setItem(k, qs.get(k).slice(0, 80));
    });
  } catch (e) { /* storage unavailable: fine */ }
  function utm(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }

  /* ---------- Enquiry modal ---------- */
  var modal = $('#enquiryModal'), lastFocus = null, modalSource = 'Modal';
  function openModal(source, unit) {
    lastFocus = document.activeElement;
    modalSource = source || 'Modal';
    var form = $('form', modal);
    form.dataset.source = modalSource;
    resetForm(modal);
    if (unit) $('#modalUnit').value = unit;
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    setTimeout(function () { var f = $('input[name="fullName"]', modal); if (f) f.focus(); }, 30);
  }
  function closeModal() {
    if (!floorplansUnlocked) pendingFloorplan = null;
    modal.classList.add('hidden'); modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('[data-open-enquiry]').forEach(function (b) {
    b.addEventListener('click', function () { openModal(b.getAttribute('data-open-enquiry'), b.getAttribute('data-unit')); });
  });
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('mousedown', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!modal.classList.contains('hidden')) closeModal();
      else if (!zoom.classList.contains('hidden')) closeFloorplanZoom();
      else if (!chatBox.classList.contains('hidden')) setChat(false);
    }
    // Team shortcut: Ctrl + Alt + M opens the CRM login
    if (e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); location.href = '/admin'; }
    // Keep Tab inside the modal while it is open
    if (e.key === 'Tab' && !modal.classList.contains('hidden')) {
      var f = $$('button, input, select, a[href]', modal).filter(function (el) { return el.offsetParent !== null && !el.disabled && el.tabIndex !== -1; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Lead forms ---------- */
  function resetForm(scope) {
    var form = $('form', scope), ok = $('[data-success]', scope), err = $('[data-error]', scope);
    form.classList.remove('hidden'); ok.classList.add('hidden'); ok.textContent = '';
    err.classList.add('hidden'); err.textContent = '';
    var btn = $('button[type="submit"]', form); btn.disabled = false;
  }

  function normalisePhone(v) {
    var p = String(v || '').replace(/[\s\-()]/g, '');
    return p.replace(/^(\+91|0091|91|0)(?=\d{10}$)/, '');
  }

  var floorplansUnlocked = false, pendingFloorplan = null;
  var zoom = $('#floorplanZoom'), zoomImage = $('#floorplanZoomImage'), zoomDownload = $('#floorplanZoomDownload');
  function openFloorplanZoom(filename) {
    if (!floorplansUnlocked) {
      pendingFloorplan = filename;
      openModal('Floor plan zoom request');
      return;
    }
    var url = '/private/floorplans/' + encodeURIComponent(filename);
    zoomImage.src = url;
    zoomImage.alt = 'Full-size floor plan: ' + filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    zoomDownload.href = url;
    zoomDownload.download = filename;
    zoom.classList.remove('hidden'); zoom.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    $('#floorplanZoomClose').focus();
  }
  function closeFloorplanZoom() {
    zoom.classList.add('hidden'); zoom.classList.remove('flex');
    zoomImage.removeAttribute('src');
    floorplansUnlocked = false;
    document.body.classList.remove('overflow-hidden');
  }
  function unlockFloorplans() { floorplansUnlocked = true; }
  $$('[data-floorplan-zoom]').forEach(function (button) {
    button.addEventListener('click', function () { openFloorplanZoom(button.getAttribute('data-floorplan-zoom')); });
  });
  var pdfRequest = $('[data-floorplan-pdf-request]');
  if (pdfRequest) pdfRequest.addEventListener('click', function () {
    pendingFloorplan = '__floorplan_pdf__';
    openModal('Floor plan PDF request');
  });
  $('#floorplanZoomClose').addEventListener('click', closeFloorplanZoom);
  zoom.addEventListener('mousedown', function (e) { if (e.target === zoom) closeFloorplanZoom(); });

  function showSuccess(form, name, phone) {
    var scope = form.parentElement, ok = $('[data-success]', scope);
    ok.textContent = '';
    var icon = document.createElement('div');
    icon.className = 'mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-olive-100 text-2xl text-olive-500';
    icon.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
    var h = document.createElement('h3'); h.className = 'font-serif text-2xl font-bold';
    h.textContent = 'Thank you, ' + name.split(' ')[0] + '.';
    var p = document.createElement('p'); p.className = 'mt-2 text-sm text-olive-700';
    p.textContent = 'Our team will call you on ' + phone + ' shortly.';
    var wa = document.createElement('a');
    wa.className = 'btn-primary mt-5 w-full bg-emerald-600 hover:bg-emerald-500';
    wa.target = '_blank'; wa.rel = 'noopener noreferrer';
    wa.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hi, I am ' + name + '. I just submitted an enquiry for Eldeco La Vida Bella. Please contact me with the details.');
    wa.innerHTML = '<i class="fa-brands fa-whatsapp text-lg" aria-hidden="true"></i> Continue on WhatsApp';
    ok.appendChild(icon); ok.appendChild(h); ok.appendChild(p);

    ok.appendChild(wa);
    form.classList.add('hidden'); ok.classList.remove('hidden');
  }

  $$('[data-lead-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('[data-error]', form), btn = $('button[type="submit"]', form), label = $('[data-label]', btn);
      var fd = new FormData(form);
      var payload = {
        fullName: String(fd.get('fullName') || '').trim(),
        phone: normalisePhone(fd.get('phone')),
        email: String(fd.get('email') || '').trim(),
        unitType: fd.get('unitType') || '',
        consent: !!fd.get('consent'),
        website: fd.get('website') || '',
        source: form.dataset.source || 'Website',
        utmSource: utm('utm_source'), utmMedium: utm('utm_medium'), utmCampaign: utm('utm_campaign')
      };
      function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); }
      err.classList.add('hidden');
      if (payload.fullName.length < 2) return fail('Enter your full name.');
      if (!/^[6-9]\d{9}$/.test(payload.phone)) return fail('Enter a valid 10-digit Indian mobile number.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) return fail('Enter a valid email address.');
      if (!payload.consent) return fail('Please tick the box to agree to be contacted.');

      var original = label.textContent;
      btn.disabled = true; label.textContent = 'Sending...';
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, body: d }; }); })
        .then(function (res) {
          if (res.body && res.body.ok) {
            form.reset();
            showSuccess(form, payload.fullName, payload.phone);
            if (res.body.floorplansUnlocked && pendingFloorplan) {
              var requestedPlan = pendingFloorplan; pendingFloorplan = null;
              unlockFloorplans();
              if (!modal.classList.contains('hidden')) closeModal();
              setTimeout(function () {
                if (requestedPlan === '__floorplan_pdf__') {
                  var pdfLink = document.createElement('a');
                  pdfLink.href = '/private/floorplans/floorplans.pdf';
                  pdfLink.download = 'eldeco-la-vida-bella-floorplans.pdf';
                  pdfLink.target = '_blank'; pdfLink.rel = 'noopener noreferrer';
                  document.body.appendChild(pdfLink); pdfLink.click(); pdfLink.remove();
                  floorplansUnlocked = false;
                } else {
                  openFloorplanZoom(requestedPlan);
                }
              }, 80);
            }
            return;
          }
          var msg = (res.body && res.body.error) || (res.body && res.body.errors && Object.values(res.body.errors)[0]) || 'Could not send your details. Please try again.';
          fail(msg);
        })
        .catch(function () { fail('No connection. Please check your internet or call +91 78603 91489.'); })
        .then(function () { btn.disabled = false; label.textContent = original; });
    });
  });

  /* ---------- Question assistant (answers from project facts only) ---------- */
  var chatBox = $('#chatBox'), chatToggle = $('#chatToggle'), chatMsgs = $('#chatMessages'), chatChips = $('#chatChips');
  function setChat(open) {
    chatBox.classList.toggle('hidden', !open); chatBox.classList.toggle('flex', open);
    chatToggle.setAttribute('aria-expanded', String(open));
    if (open) { if (!chatMsgs.children.length) bot('Hi! Ask me about apartment layouts, RERA or the location. For anything else, I can arrange a callback.'); $('#chatInput').focus(); }
  }
  chatToggle.addEventListener('click', function () { setChat(chatBox.classList.contains('hidden')); });
  $('#chatClose').addEventListener('click', function () { setChat(false); chatToggle.focus(); });

  function bubble(text, mine) {
    var d = document.createElement('div');
    d.className = mine ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-olive-500 px-3 py-2 text-white' : 'max-w-[90%] rounded-2xl rounded-bl-sm border border-olive-200 bg-white px-3 py-2 shadow-sm';
    d.textContent = text; chatMsgs.appendChild(d); chatMsgs.scrollTop = chatMsgs.scrollHeight; return d;
  }
  function bot(text, withCta) {
    var d = bubble(text, false);
    if (withCta) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'mt-2 block rounded-lg bg-olive-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-olive-600';
      b.textContent = 'Request a callback';
      b.addEventListener('click', function () { setChat(false); openModal('Assistant'); });
      d.appendChild(b);
    }
  }

  var KB = [
    { re: /(book|booking|availability|visit|appointment)/i, a: 'Choose a home layout and share your details in the Book Now section. Our team will contact you about the next steps.', cta: true },
    { re: /(size|sq|area|bhk|bedroom|config|layout|plan|unit)/i, a: 'Three layouts: 3 BHK + 3T at 1,905 sq. ft., 4 BHK + 4T at 2,755 sq. ft., and 4 BHK with servant room at 3,300 sq. ft.', cta: true },
    { re: /(rera|registration|approved|legal)/i, a: 'RERA registration number: UPRERAPRJ136219/04/2024. You can verify it at up-rera.in.' },
    { re: /(where|location|address|sector|map|direction|noida|reach)/i, a: 'The project is in Sector 12, Greater Noida West (Noida Extension). Scroll to the Location section for the map, or request a callback for directions.', cta: true },
    { re: /(club|amenit|pool|gym|park|green|garden|facility|facilities)/i, a: 'The community has a 35,000 sq. ft. G+2 clubhouse and 1.70 acres of landscaped greens within a 4-acre campus. See the Amenities section for the full list.' },
    { re: /(tower|floor|storey|story|height|acre|land)/i, a: 'There are five towers of G+22 on a 4-acre site.' },
    { re: /(possession|ready|delivery|handover|when)/i, a: 'Possession timelines are stated in the RERA registration. Our team will confirm the current construction status on a call.', cta: true },
    { re: /(visit|see|tour|appointment|meet)/i, a: 'We would be happy to arrange a site visit. Leave your details and we will confirm a time.', cta: true },
    { re: /(brochure|pdf|download)/i, a: 'Submit your details to unlock the brochure and floor plans.', cta: true },
    { re: /(call|phone|contact|number|whatsapp)/i, a: 'You can call or WhatsApp us on +91 78603 91489.', cta: true },
    { re: /^(hi|hello|hey|namaste|good (morning|evening|afternoon))\b/i, a: 'Hello! What would you like to know about La Vida Bella?' }
  ];
  function answer(q) {
    for (var i = 0; i < KB.length; i++) if (KB[i].re.test(q)) return bot(KB[i].a, KB[i].cta);
    bot("I don't have that detail here. Our team can answer it on a call.", true);
  }
  function ask(q) { q = q.trim(); if (!q) return; bubble(q, true); setTimeout(function () { answer(q); }, 250); }
  $('#chatForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#chatInput'); ask(i.value); i.value = ''; });
  ['Book now', 'Apartment sizes', 'RERA number', 'Location', 'Floor plans'].forEach(function (t) {
    var b = document.createElement('button'); b.type = 'button';
    b.className = 'mb-2 rounded-full border border-olive-300 px-3 py-1 text-xs text-olive-800 hover:bg-olive-100';
    b.textContent = t; b.addEventListener('click', function () { ask(t); }); chatChips.appendChild(b);
  });
})();
