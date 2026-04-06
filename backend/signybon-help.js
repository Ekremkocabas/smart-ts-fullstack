/* Signybon conversational support chat — single flow, FAQ → AI → Contact */
(function(){
  const STYLE = `
.sb-bubble{position:fixed;bottom:24px;right:24px;width:62px;height:62px;border-radius:50%;background:#1B4332;color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem;cursor:pointer;box-shadow:0 8px 28px rgba(27,67,50,.45);z-index:99998;transition:all .25s;border:none}
.sb-bubble:hover{transform:scale(1.08)}
.sb-window{position:fixed;bottom:100px;right:24px;width:420px;max-height:600px;background:#fff;border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.22);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:'Inter',system-ui,sans-serif}
.sb-window.open{display:flex}
.sb-header{background:#1B4332;color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.sb-header-left{display:flex;align-items:center;gap:12px}
.sb-header-logo{flex-shrink:0}
.sb-header-text h4{font-size:1rem;font-weight:700;margin:0;line-height:1.2}
.sb-header-text p{font-size:.72rem;margin:2px 0 0;opacity:.75}
.sb-close{background:none;border:none;color:rgba(255,255,255,.85);font-size:1.5rem;cursor:pointer;padding:4px 8px;line-height:1}
.sb-close:hover{color:#fff}
.sb-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#FAFBFC}
.sb-msg{max-width:88%;padding:11px 15px;border-radius:14px;font-size:.88rem;line-height:1.5;word-wrap:break-word}
.sb-msg.bot{background:#fff;color:#212529;align-self:flex-start;border-bottom-left-radius:4px;border:1px solid #ECEFF1;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.sb-msg.user{background:#1B4332;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
.sb-msg.system{background:#FFF8E1;color:#7B5E00;align-self:center;font-size:.78rem;text-align:center;border-radius:10px;padding:8px 14px;border:1px solid #FFE082}
.sb-options{align-self:flex-start;max-width:90%;display:flex;flex-direction:column;gap:6px;margin-top:2px}
.sb-option-btn{text-align:left;padding:10px 14px;background:#fff;border:1.5px solid #E0E4E8;border-radius:12px;font-size:.83rem;cursor:pointer;font-family:inherit;color:#1B4332;font-weight:500;transition:all .15s}
.sb-option-btn:hover{border-color:#1B4332;background:rgba(27,67,50,.05)}
.sb-option-btn.ai{border-color:#D4A017;color:#B8870A}
.sb-option-btn.ai:hover{background:rgba(212,160,23,.08)}
.sb-input-row{display:flex;padding:14px;border-top:1px solid #E9ECEF;gap:8px;background:#fff}
.sb-input-row input{flex:1;padding:11px 14px;border:1.5px solid #E0E4E8;border-radius:10px;font-size:.88rem;font-family:inherit;outline:none}
.sb-input-row input:focus{border-color:#1B4332}
.sb-send{padding:11px 18px;background:#1B4332;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:.88rem;font-family:inherit;display:flex;align-items:center;gap:6px}
.sb-send:disabled{opacity:.5;cursor:not-allowed}
.sb-form{padding:16px;display:flex;flex-direction:column;gap:10px;background:#fff;border-top:1px solid #E9ECEF}
.sb-form input,.sb-form textarea{padding:10px 12px;border:1.5px solid #E0E4E8;border-radius:8px;font-size:.85rem;font-family:inherit;outline:none}
.sb-form input:focus,.sb-form textarea:focus{border-color:#1B4332}
.sb-form textarea{min-height:90px;resize:vertical}
.sb-form label{font-size:.7rem;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.sb-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:sbspin .6s linear infinite;vertical-align:middle}
@keyframes sbspin{to{transform:rotate(360deg)}}
@media(max-width:480px){.sb-window{right:10px;left:10px;width:auto;bottom:90px;max-height:80vh}}
`;

  // ──────────────────── FAQ KNOWLEDGE BASE ────────────────────
  const FAQ = [
    // Werkbon
    { kw: ['werkbon','aanmaken','nieuw','maken','create','create werkbon'], q: 'Hoe maak ik een nieuwe werkbon?', a: 'Klik op het + icoon op de werkbonnen pagina, kies het type (uren / dag / oplevering / prestatie), vul de gegevens in en laat de klant digitaal tekenen. De PDF wordt automatisch verstuurd.' },
    { kw: ['types','soorten','welke werkbon','welke type'], q: 'Welke werkbon types zijn er?', a: 'Er zijn vier types: Uren (wekelijkse uren per teamlid), Dag (dag/halve dag/vaste prijs/uurtarief), Oplevering (checklist met OK/NOK/NVT en sterren), en Prestatie (m² per ruimte met dikte en product).' },
    { kw: ['kopieren','copy','kopie','kopieer'], q: 'Kan ik een werkbon kopiëren?', a: 'Ja. Klik op het kopieer-icoon naast een bestaande werkbon. Alle gegevens (klant, werf, uren) worden automatisch overgenomen. U hoeft alleen de week aan te passen.' },
    { kw: ['handtekening','tekenen','sign','signature'], q: 'Hoe werkt de digitale handtekening?', a: 'Op de laatste stap geeft u uw telefoon of tablet aan de klant. Hij/zij tekent met de vinger op het scherm. De handtekening is juridisch bindend.' },
    { kw: ['foto','photos','foto toevoegen','afbeelding'], q: 'Kan ik foto\u2019s toevoegen?', a: 'Ja, op iedere werkbon kunt u tot 3 foto\u2019s toevoegen — direct vanuit de camera of uit de galerij. Foto\u2019s worden gecomprimeerd en als bijlage in de PDF gezet.' },
    { kw: ['concept','draft','opslaan','later','onderbreken'], q: 'Kan ik een werkbon als concept opslaan?', a: 'Ja, als u de app sluit blijft uw werkbon automatisch als concept bewaard. U kunt later verder gaan waar u gebleven was.' },

    // Planning
    { kw: ['planning','plan','schedule','plannen'], q: 'Hoe maak ik een planning?', a: 'Ga naar Planning, kies datum/week, voeg klant + werf + werknemers toe. De toegewezen werknemers krijgen automatisch een pushmelding op hun telefoon.' },
    { kw: ['bulk','meerdere planning','batch'], q: 'Kan ik meerdere planningen tegelijk maken?', a: 'Ja. Op de planning pagina kunt u via "Bulk planning" meerdere taken in één keer aanmaken voor dezelfde week of meerdere dagen.' },
    { kw: ['push','melding','notificatie','notification'], q: 'Krijgen werknemers een melding?', a: 'Ja, zodra u een planning aanmaakt of wijzigt, krijgt de toegewezen werknemer direct een pushmelding op zijn/haar telefoon.' },
    { kw: ['planning werkbon','vanuit planning','planning naar werkbon'], q: 'Kan ik vanuit een planning een werkbon maken?', a: 'Ja. De werknemer kan vanuit zijn planning direct op "Maak werkbon" klikken — alle gegevens (klant, werf, datum) worden vooraf ingevuld.' },
    { kw: ['planning verwijderen','annuleren','cancel'], q: 'Hoe verwijder ik een planning?', a: 'In de planning lijst kunt u een planning selecteren en op het prullenbak-icoon klikken. Bulk verwijderen kan via de selecteren-modus.' },

    // PDF
    { kw: ['pdf','genereren','automatisch','versturen','verstuur'], q: 'Wordt de PDF automatisch verstuurd?', a: 'Ja, na ondertekening wordt de PDF automatisch naar uw bedrijfsemail (uit Instellingen) gestuurd. Optioneel kunt u ook de klant aanvinken zodat hij/zij een kopie krijgt.' },
    { kw: ['logo','aanpassen','branding','huisstijl'], q: 'Kan ik mijn logo en kleuren aanpassen?', a: 'Ja, ga naar Instellingen → Branding. Daar kunt u uw logo uploaden en de PDF kleuren (primair, secundair, accent) instellen. Deze worden in alle PDFs gebruikt.' },
    { kw: ['voettekst','footer','onderaan'], q: 'Kan ik de voettekst van de PDF aanpassen?', a: 'Ja, in Instellingen → PDF teksten kunt u de algemene voettekst en de bevestigingsteksten per werkbon type aanpassen.' },
    { kw: ['pdf opnieuw','herversturen','re-send'], q: 'Kan ik een PDF opnieuw versturen?', a: 'Ja, open een verzonden werkbon en klik op "Opnieuw versturen". U kunt eventueel een ander emailadres opgeven.' },
    { kw: ['exporteren','export','download','zip'], q: 'Kan ik werkbonnen exporteren?', a: 'Ja, in het admin panel kunt u werkbonnen filteren en als ZIP (alle PDFs) of CSV downloaden — handig voor uw boekhouder.' },

    // Facturatie
    { kw: ['billit','facturatie','factuur','invoicing','factureren'], q: 'Hoe activeer ik de Billit koppeling?', a: 'Ga naar Instellingen → Facturatie koppeling, vul uw Billit API key en Party ID in, en activeer de koppeling. Werkbonnen kunnen daarna automatisch als concept-factuur naar Billit worden gestuurd.' },
    { kw: ['boekhouding','accounting','exact','yuki'], q: 'Welke boekhoudkoppelingen zijn er?', a: 'Op dit moment is alleen Billit direct gekoppeld. Boekhoudkoppelingen (Exact, Yuki, etc.) zijn in ontwikkeling.' },
    { kw: ['btw','vat','tarief'], q: 'Hoe stel ik BTW tarieven in?', a: 'BTW tarieven zijn per klant instelbaar. Bij het aanmaken/bewerken van een klant kunt u het standaard BTW percentage opgeven (6%, 12%, 21%).' },
    { kw: ['uurtarief','tarief','hourly','prijs','prijsmodel'], q: 'Hoe stel ik uurtarieven per klant in?', a: 'Bij elke klant kunt u een prijsmodel kiezen: vast uurtarief, dagprijs, of vaste prijs. Dit wordt automatisch toegepast bij elke werkbon van die klant.' },

    // Account/Instellingen
    { kw: ['wachtwoord','password','reset','vergeten','forgot'], q: 'Wachtwoord vergeten of resetten?', a: 'Op de loginpagina staat "Wachtwoord vergeten". Als admin kunt u ook van een werknemer in de werknemerslijst het wachtwoord resetten via "Resend uitnodiging".' },
    { kw: ['instellingen','settings','bedrijfsgegevens','profiel'], q: 'Waar pas ik mijn bedrijfsgegevens aan?', a: 'In het web admin panel onder Instellingen → Bedrijfsgegevens. Hier kunt u naam, adres, BTW, email, contactpersoon en branding aanpassen.' },
    { kw: ['rol','role','permissie','rechten'], q: 'Welke gebruikersrollen zijn er?', a: 'Master Admin (alles), Admin (beheer), Planner (planning), Beheerder (web only), Werknemer (mobile only), Onderaannemer (beperkt). Elke rol heeft eigen rechten.' },

    // Werknemers
    { kw: ['werknemer','werknemers','employees','staff','medewerker'], q: 'Hoe voeg ik een nieuwe werknemer toe?', a: 'Ga naar Werknemers → Nieuwe werknemer. Vul naam, email en rol in. De werknemer krijgt automatisch een uitnodigingsmail met inloggegevens.' },
    { kw: ['onderaannemer','subcontractor','freelancer'], q: 'Hoe werk ik met onderaannemers?', a: 'Onderaannemers worden net als werknemers toegevoegd, maar krijgen rol "onderaannemer". Zij kunnen alleen hun eigen werkbonnen invullen.' },
    { kw: ['team','teams'], q: 'Kan ik teams aanmaken?', a: 'Ja, in Werknemers kunt u teams definiëren en werknemers aan teams koppelen. Teams maken planning en rapportages overzichtelijker.' },
    { kw: ['document','documenten','identiteitskaart','vca'], q: 'Kan ik documenten van werknemers bewaren?', a: 'Ja, per werknemer kunt u documenten uploaden (ID, VCA, contract, etc.). Deze zijn alleen voor admins zichtbaar.' },

    // Klanten/Werven
    { kw: ['klant','klanten','customer','client'], q: 'Hoe voeg ik een klant toe?', a: 'Ga naar Klanten → Nieuwe klant. Vul naam, BTW, contactgegevens en prijsmodel in. Klanten worden automatisch beschikbaar voor alle werkbonnen.' },
    { kw: ['werf','werven','site','locatie','project'], q: 'Hoe voeg ik een werf toe?', a: 'Werven worden gekoppeld aan een klant. Ga naar Werven → Nieuwe werf, kies de klant en vul adres + werfleider in.' },
  ];

  // ──────────────────── HELPER: search FAQ ────────────────────
  function searchFAQ(query) {
    const q = (query || '').toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    const scored = FAQ.map(item => {
      let score = 0;
      for (const kw of item.kw) {
        if (q.includes(kw)) score += 10;
      }
      for (const t of tokens) {
        for (const kw of item.kw) {
          if (kw.includes(t) || t.includes(kw)) score += 2;
        }
        if (item.q.toLowerCase().includes(t)) score += 3;
      }
      return { item, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.item);
    return scored;
  }

  // ──────────────────── UI / FLOW ────────────────────
  function init() {
    if (document.getElementById('sb-bubble')) return;
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    const bubble = document.createElement('button');
    bubble.id = 'sb-bubble';
    bubble.className = 'sb-bubble';
    bubble.innerHTML = '\u{1F4AC}';
    bubble.setAttribute('aria-label', 'Support chat');
    document.body.appendChild(bubble);

    const win = document.createElement('div');
    win.className = 'sb-window';
    win.innerHTML = `
      <div class="sb-header">
        <div class="sb-header-left">
          <div class="sb-header-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="36" height="36">
              <rect x="15" y="15" width="70" height="70" rx="12" ry="12" fill="#D4A017" transform="rotate(45 50 50)"/>
              <rect x="23" y="23" width="54" height="54" rx="9" ry="9" fill="#fff" transform="rotate(45 50 50)"/>
              <rect x="36" y="36" width="28" height="28" rx="5" ry="5" fill="#D4A017" transform="rotate(45 50 50)"/>
            </svg>
          </div>
          <div class="sb-header-text">
            <h4>Signybon Support</h4>
            <p>Online \u2014 we helpen u graag</p>
          </div>
        </div>
        <button class="sb-close" aria-label="Sluiten">&times;</button>
      </div>
      <div class="sb-body" id="sb-body"></div>
      <div id="sb-footer"></div>
    `;
    document.body.appendChild(win);

    const body = () => document.getElementById('sb-body');
    const footer = () => document.getElementById('sb-footer');

    bubble.onclick = () => {
      win.classList.toggle('open');
      if (win.classList.contains('open') && body().children.length === 0) {
        startChat();
      }
    };
    win.querySelector('.sb-close').onclick = () => win.classList.remove('open');

    // ──────── State ────────
    let lastUserQuery = '';
    let aiHistory = [];
    let aiMessageCount = 0;

    // ──────── Helpers ────────
    function getUser() {
      try {
        const u = JSON.parse(localStorage.getItem('user') || 'null');
        return u || {};
      } catch(e) { return {}; }
    }

    function addMsg(text, type) {
      const d = document.createElement('div');
      d.className = 'sb-msg ' + type;
      d.textContent = text;
      body().appendChild(d);
      body().scrollTop = body().scrollHeight;
      return d;
    }

    function addOptions(options) {
      const wrap = document.createElement('div');
      wrap.className = 'sb-options';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'sb-option-btn' + (opt.type === 'ai' ? ' ai' : '');
        btn.textContent = opt.label;
        btn.onclick = () => {
          wrap.remove();
          opt.action();
        };
        wrap.appendChild(btn);
      });
      body().appendChild(wrap);
      body().scrollTop = body().scrollHeight;
    }

    function setFooterInput(placeholder, onSend) {
      const f = footer();
      f.innerHTML = '';
      f.className = 'sb-input-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      const send = document.createElement('button');
      send.className = 'sb-send';
      send.textContent = 'Verstuur';
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        onSend(text);
      };
      send.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
      f.appendChild(input);
      f.appendChild(send);
      setTimeout(() => input.focus(), 50);
    }

    function clearFooter() {
      const f = footer();
      f.innerHTML = '';
      f.className = '';
    }

    // ──────── Flow: Start ────────
    function startChat() {
      const user = getUser();
      const naam = user.bedrijfsnaam || user.naam || '';
      const greeting = naam
        ? `Hallo ${naam}, hoe kan ik u helpen?`
        : 'Hallo, hoe kan ik u helpen?';
      addMsg(greeting, 'bot');
      setFooterInput('Stel uw vraag...', handleQuery);
    }

    // ──────── Flow: Tier 1 — FAQ analysis ────────
    function handleQuery(query) {
      lastUserQuery = query;
      addMsg(query, 'user');
      const matches = searchFAQ(query);

      if (matches.length === 0) {
        // No match → directly to AI
        addMsg('Ik heb geen passend antwoord in de FAQ gevonden. Ik vraag het aan onze AI assistent...', 'system');
        setTimeout(() => askAI(query, true), 600);
        return;
      }

      addMsg('Bedoelt u dit?', 'bot');
      const options = matches.map(m => ({
        label: m.q,
        action: () => showAnswer(m),
      }));
      options.push({
        label: 'Of vraag het aan onze AI assistent \u2192',
        type: 'ai',
        action: () => askAI(lastUserQuery, true),
      });
      addOptions(options);
    }

    function showAnswer(faqItem) {
      addMsg(faqItem.q, 'user');
      setTimeout(() => {
        addMsg(faqItem.a, 'bot');
        setTimeout(() => {
          addOptions([
            { label: '\u{1F4AC} Een andere vraag stellen', action: () => setFooterInput('Stel uw vraag...', handleQuery) },
            { label: '\u{1F914} Toch niet duidelijk \u2014 vraag AI', type: 'ai', action: () => askAI(lastUserQuery, true) },
          ]);
        }, 400);
      }, 350);
    }

    // ──────── Flow: Tier 2 — AI ────────
    async function askAI(question, isFirst) {
      clearFooter();
      if (isFirst) {
        aiHistory = [];
        aiMessageCount = 0;
      }
      aiHistory.push({ role: 'user', content: question });
      aiMessageCount++;

      const loadingMsg = addMsg('AI assistent denkt na...', 'system');

      try {
        const res = await fetch('/api/help/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: aiHistory })
        });
        loadingMsg.remove();
        const data = await res.json();
        if (data.reply) {
          addMsg(data.reply, 'bot');
          aiHistory.push({ role: 'assistant', content: data.reply });

          if (aiMessageCount >= 2) {
            // After 2 AI exchanges, suggest contact
            setTimeout(() => {
              addMsg('Het lijkt erop dat uw vraag beter via e-mail beantwoord kan worden.', 'system');
              addOptions([
                { label: '\u270D\u{FE0F} Contact opnemen \u2192', action: showContactForm },
                { label: '\u{1F4AC} Toch nog een vraag stellen', type: 'ai', action: () => setFooterInput('Stel uw vraag aan AI...', (t) => askAI(t, false)) },
              ]);
            }, 500);
          } else {
            setFooterInput('Stel een vervolgvraag...', (t) => askAI(t, false));
          }
        } else {
          addMsg('Geen antwoord ontvangen.', 'bot');
          showContactSuggest();
        }
      } catch(e) {
        loadingMsg.remove();
        addMsg('Verbinding mislukt.', 'bot');
        showContactSuggest();
      }
    }

    function showContactSuggest() {
      addOptions([
        { label: '\u270D\u{FE0F} Contact opnemen via e-mail', action: showContactForm },
      ]);
    }

    // ──────── Flow: Tier 3 — Contact form ────────
    function showContactForm() {
      clearFooter();
      const user = getUser();
      const f = footer();
      f.innerHTML = '';
      f.className = 'sb-form';
      f.innerHTML = `
        <label>Uw naam</label>
        <input id="sb-c-naam" type="text" value="${user.naam || ((user.voornaam || '') + ' ' + (user.achternaam || '')).trim()}" placeholder="Uw naam">
        <label>Uw e-mail</label>
        <input id="sb-c-email" type="email" value="${user.email || ''}" placeholder="naam@bedrijf.be">
        <label>Uw vraag</label>
        <textarea id="sb-c-vraag" placeholder="Uw vraag...">${lastUserQuery || ''}</textarea>
        <button class="sb-send" id="sb-c-send" style="margin-top:6px;justify-content:center">Versturen</button>
      `;
      document.getElementById('sb-c-send').onclick = sendTicket;
    }

    async function sendTicket() {
      const naam = document.getElementById('sb-c-naam').value.trim();
      const email = document.getElementById('sb-c-email').value.trim();
      const vraag = document.getElementById('sb-c-vraag').value.trim();
      if (!naam || !email || !vraag) {
        alert('Vul alle velden in.');
        return;
      }
      const btn = document.getElementById('sb-c-send');
      btn.disabled = true;
      btn.innerHTML = '<span class="sb-spinner"></span>';
      const user = getUser();
      try {
        const res = await fetch('/api/help/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ naam, email, bedrijfsnaam: user.bedrijfsnaam || '', vraag })
        });
        if (res.ok) {
          clearFooter();
          addMsg('Uw vraag is verstuurd. Wij reageren binnen 24 uur.', 'system');
        } else {
          btn.disabled = false;
          btn.textContent = 'Versturen';
          alert('Verzenden mislukt. Probeer opnieuw.');
        }
      } catch(e) {
        btn.disabled = false;
        btn.textContent = 'Versturen';
        alert('Verbinding mislukt.');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
