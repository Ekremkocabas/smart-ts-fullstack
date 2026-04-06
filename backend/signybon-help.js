/* Signybon 3-tier help/chat widget — used on landing, login, register, web panel */
(function(){
  const STYLE = `
.sb-help-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:#1B4332;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.6rem;cursor:pointer;box-shadow:0 6px 24px rgba(27,67,50,.4);z-index:99998;transition:all .3s;border:none}
.sb-help-bubble:hover{transform:scale(1.1)}
.sb-help-window{position:fixed;bottom:96px;right:24px;width:380px;max-height:560px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.2);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:'Inter',system-ui,sans-serif}
.sb-help-window.open{display:flex}
.sb-help-header{background:#1B4332;color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}
.sb-help-header h4{font-size:.95rem;font-weight:700;margin:0;display:flex;align-items:center;gap:8px}
.sb-help-close{background:none;border:none;color:rgba(255,255,255,.7);font-size:1.4rem;cursor:pointer;padding:4px}
.sb-help-tabs{display:flex;background:#143328;padding:0 12px;gap:4px}
.sb-help-tab{flex:1;padding:10px;background:none;border:none;color:rgba(255,255,255,.6);font-size:.75rem;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.sb-help-tab.active{color:#D4A017;border-bottom-color:#D4A017}
.sb-help-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;max-height:380px}
.sb-msg{max-width:88%;padding:10px 14px;border-radius:14px;font-size:.875rem;line-height:1.5}
.sb-msg.bot{background:#F1F3F5;color:#212529;align-self:flex-start;border-bottom-left-radius:4px}
.sb-msg.user{background:#1B4332;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.sb-msg.system{background:#FFF3CD;color:#856404;align-self:center;font-size:.75rem;text-align:center;border-radius:8px;padding:6px 12px}
.sb-quick{padding:12px 16px;border-top:1px solid #E9ECEF;display:flex;flex-wrap:wrap;gap:6px}
.sb-quick-btn{padding:7px 12px;border:1px solid #DEE2E6;border-radius:18px;background:#fff;font-size:.75rem;cursor:pointer;font-family:inherit;color:#495057}
.sb-quick-btn:hover{border-color:#1B4332;color:#1B4332;background:rgba(27,67,50,.04)}
.sb-input-row{display:flex;padding:12px;border-top:1px solid #E9ECEF;gap:8px}
.sb-input-row input,.sb-input-row textarea{flex:1;padding:10px 12px;border:1px solid #DEE2E6;border-radius:8px;font-size:.85rem;font-family:inherit;outline:none;resize:none}
.sb-input-row input:focus,.sb-input-row textarea:focus{border-color:#1B4332}
.sb-send{padding:10px 16px;background:#1B4332;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:.85rem;font-family:inherit}
.sb-send:disabled{opacity:.5;cursor:not-allowed}
.sb-ticket-form{padding:16px;display:flex;flex-direction:column;gap:10px}
.sb-ticket-form input,.sb-ticket-form textarea{padding:10px 12px;border:1px solid #DEE2E6;border-radius:8px;font-size:.85rem;font-family:inherit;outline:none}
.sb-ticket-form textarea{min-height:100px;resize:vertical}
.sb-ticket-form label{font-size:.75rem;font-weight:600;color:#6c757d;text-transform:uppercase;letter-spacing:.05em}
.sb-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:sbspin .6s linear infinite}
@keyframes sbspin{to{transform:rotate(360deg)}}
@media(max-width:480px){.sb-help-window{right:12px;left:12px;width:auto;bottom:90px}}
`;

  const FAQ_CATEGORIES = {
    nl: {
      welcome: 'Hallo! Hoe kan ik u helpen? Kies een categorie of stel een vraag.',
      categories: [
        { name: 'Werkbon', items: [
          { q: 'Hoe maak ik een werkbon?', a: 'Klik op het + icoon op de werkbonnen pagina, kies het type (uren/dag/oplevering/prestatie), vul de gegevens in en laat de klant digitaal tekenen.' },
          { q: 'Welke werkbon types zijn er?', a: 'Uren (wekelijkse uren), Dag (dagprijs/uurtarief), Oplevering (checklist + sterren), Prestatie (m² per ruimte).' },
          { q: 'Kan ik een werkbon kopiëren?', a: 'Ja. Klik op het kopieer-icoon naast een bestaande werkbon en alle gegevens worden overgenomen.' },
        ]},
        { name: 'Planning', items: [
          { q: 'Hoe maak ik een planning?', a: 'Ga naar Planning, kies datum/week, voeg klant + werf + werknemers toe. De werknemers krijgen automatisch een pushmelding.' },
          { q: 'Kan ik bulk planningen maken?', a: 'Ja. Op de planning pagina kunt u meerdere planningen tegelijk aanmaken voor dezelfde week.' },
        ]},
        { name: 'PDF', items: [
          { q: 'Wordt de PDF automatisch verstuurd?', a: 'Ja, na ondertekening wordt de PDF automatisch naar uw bedrijfsemail gestuurd. Optioneel ook naar de klant.' },
          { q: 'Kan ik de PDF aanpassen?', a: 'Logo, kleuren en bedrijfsgegevens kunt u in Instellingen aanpassen. Deze worden in alle PDFs gebruikt.' },
        ]},
        { name: 'Facturatie', items: [
          { q: 'Welke koppelingen zijn er?', a: 'Billit is direct gekoppeld. Werkbonnen kunnen automatisch als concept-factuur naar Billit worden gestuurd.' },
          { q: 'Hoe activeer ik Billit?', a: 'Ga naar Instellingen → Facturatie koppeling, vul uw Billit API key in en activeer de koppeling.' },
        ]},
        { name: 'Account', items: [
          { q: 'Hoe voeg ik werknemers toe?', a: 'Ga naar Werknemers → Nieuwe werknemer. Vul naam en email in. De werknemer krijgt automatisch een uitnodiging.' },
          { q: 'Wachtwoord vergeten?', a: 'Op de loginpagina kunt u "Wachtwoord vergeten" gebruiken om een reset link te ontvangen.' },
        ]},
      ],
      askMore: 'Ik wil met een medewerker praten',
      aiPlaceholder: 'Stel uw vraag aan de Signybon assistent...',
      ticketTitle: 'Stuur ons uw vraag',
      ticketIntro: 'Laat ons weten waar u tegenaan loopt. Wij reageren binnen 24 uur.',
      ticketSent: 'Uw vraag is verstuurd. Wij reageren binnen 24 uur.',
    }
  };

  const tier1FAQ = FAQ_CATEGORIES.nl;

  function init() {
    if (document.getElementById('sb-help-bubble')) return;
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    const bubble = document.createElement('button');
    bubble.id = 'sb-help-bubble';
    bubble.className = 'sb-help-bubble';
    bubble.innerHTML = '\u{1F4AC}';
    bubble.setAttribute('aria-label', 'Help');
    document.body.appendChild(bubble);

    const win = document.createElement('div');
    win.id = 'sb-help-window';
    win.className = 'sb-help-window';
    win.innerHTML = `
      <div class="sb-help-header">
        <h4>\u{1F916} Signybon Support</h4>
        <button class="sb-help-close" aria-label="Sluiten">&times;</button>
      </div>
      <div class="sb-help-tabs">
        <button class="sb-help-tab active" data-tab="faq">FAQ</button>
        <button class="sb-help-tab" data-tab="ai">AI Assistent</button>
        <button class="sb-help-tab" data-tab="ticket">Contact</button>
      </div>
      <div class="sb-help-body" id="sb-help-body"></div>
      <div id="sb-help-quick"></div>
    `;
    document.body.appendChild(win);

    let currentTab = 'faq';
    let aiHistory = [];

    bubble.onclick = () => {
      win.classList.toggle('open');
      if (win.classList.contains('open')) renderTab('faq');
    };
    win.querySelector('.sb-help-close').onclick = () => win.classList.remove('open');
    win.querySelectorAll('.sb-help-tab').forEach(t => {
      t.onclick = () => renderTab(t.dataset.tab);
    });

    function renderTab(tab) {
      currentTab = tab;
      win.querySelectorAll('.sb-help-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const body = document.getElementById('sb-help-body');
      const quick = document.getElementById('sb-help-quick');
      body.innerHTML = '';
      quick.innerHTML = '';
      if (tab === 'faq') renderFAQ(body, quick);
      else if (tab === 'ai') renderAI(body, quick);
      else if (tab === 'ticket') renderTicket(body, quick);
    }

    function addMsg(body, text, type) {
      const d = document.createElement('div');
      d.className = 'sb-msg ' + type;
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
    }

    function renderFAQ(body, quick) {
      addMsg(body, tier1FAQ.welcome, 'bot');
      tier1FAQ.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'sb-quick-btn';
        btn.textContent = cat.name;
        btn.onclick = () => showCategory(body, quick, cat);
        quick.appendChild(btn);
      });
      const aiBtn = document.createElement('button');
      aiBtn.className = 'sb-quick-btn';
      aiBtn.textContent = tier1FAQ.askMore;
      aiBtn.style.borderColor = '#D4A017';
      aiBtn.style.color = '#D4A017';
      aiBtn.onclick = () => renderTab('ai');
      quick.appendChild(aiBtn);
      quick.className = 'sb-quick';
    }

    function showCategory(body, quick, cat) {
      body.innerHTML = '';
      quick.innerHTML = '';
      addMsg(body, cat.name + ' — kies een vraag:', 'bot');
      cat.items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'sb-quick-btn';
        btn.textContent = item.q;
        btn.onclick = () => {
          addMsg(body, item.q, 'user');
          setTimeout(() => addMsg(body, item.a, 'bot'), 350);
        };
        quick.appendChild(btn);
      });
      const back = document.createElement('button');
      back.className = 'sb-quick-btn';
      back.textContent = '\u2190 Terug';
      back.onclick = () => renderTab('faq');
      quick.appendChild(back);
      quick.className = 'sb-quick';
    }

    function renderAI(body, quick) {
      if (aiHistory.length === 0) {
        addMsg(body, 'Hallo! Ik ben de Signybon AI assistent. Stel mij gerust uw vraag — ik ken het hele systeem.', 'bot');
      } else {
        aiHistory.forEach(m => addMsg(body, m.content, m.role === 'user' ? 'user' : 'bot'));
      }
      quick.className = 'sb-input-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = tier1FAQ.aiPlaceholder;
      const send = document.createElement('button');
      send.className = 'sb-send';
      send.textContent = 'Verstuur';
      const submit = async () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        addMsg(body, text, 'user');
        aiHistory.push({ role: 'user', content: text });
        send.disabled = true;
        send.innerHTML = '<span class="sb-spinner"></span>';
        try {
          const res = await fetch('/api/help/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: aiHistory })
          });
          const data = await res.json();
          if (data.reply) {
            addMsg(body, data.reply, 'bot');
            aiHistory.push({ role: 'assistant', content: data.reply });
          } else {
            addMsg(body, 'Helaas geen antwoord. Probeer Contact tab voor een ticket.', 'bot');
          }
        } catch(e) {
          addMsg(body, 'Verbinding mislukt. Probeer Contact tab.', 'bot');
        }
        send.disabled = false;
        send.textContent = 'Verstuur';
      };
      send.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      quick.appendChild(input);
      quick.appendChild(send);
    }

    function renderTicket(body, quick) {
      body.innerHTML = '';
      quick.innerHTML = '';
      const form = document.createElement('div');
      form.className = 'sb-ticket-form';
      const sessionUser = (function(){
        try {
          const u = JSON.parse(localStorage.getItem('user') || 'null');
          return u || {};
        } catch(e) { return {}; }
      })();
      form.innerHTML = `
        <div style="font-size:.85rem;color:#495057;margin-bottom:6px">${tier1FAQ.ticketIntro}</div>
        <label>Naam</label>
        <input id="sb-t-naam" type="text" value="${sessionUser.naam || ''}" placeholder="Uw naam">
        <label>E-mail</label>
        <input id="sb-t-email" type="email" value="${sessionUser.email || ''}" placeholder="naam@bedrijf.be">
        <label>Bedrijfsnaam</label>
        <input id="sb-t-bedrijf" type="text" value="${sessionUser.bedrijfsnaam || ''}" placeholder="Uw bedrijf">
        <label>Uw vraag</label>
        <textarea id="sb-t-vraag" placeholder="Beschrijf uw vraag..."></textarea>
        <button class="sb-send" id="sb-t-send" style="margin-top:8px">Verstuur ticket</button>
      `;
      body.appendChild(form);
      document.getElementById('sb-t-send').onclick = async () => {
        const naam = document.getElementById('sb-t-naam').value.trim();
        const email = document.getElementById('sb-t-email').value.trim();
        const bedrijf = document.getElementById('sb-t-bedrijf').value.trim();
        const vraag = document.getElementById('sb-t-vraag').value.trim();
        if (!naam || !email || !vraag) {
          alert('Vul naam, e-mail en vraag in.');
          return;
        }
        const btn = document.getElementById('sb-t-send');
        btn.disabled = true;
        btn.innerHTML = '<span class="sb-spinner"></span>';
        try {
          const res = await fetch('/api/help/ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ naam, email, bedrijfsnaam: bedrijf, vraag })
          });
          if (res.ok) {
            body.innerHTML = '<div class="sb-msg bot" style="max-width:100%;text-align:center">' + tier1FAQ.ticketSent + '</div>';
          } else {
            btn.disabled = false;
            btn.textContent = 'Verstuur ticket';
            alert('Verzenden mislukt. Probeer opnieuw.');
          }
        } catch(e) {
          btn.disabled = false;
          btn.textContent = 'Verstuur ticket';
          alert('Verbinding mislukt.');
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
