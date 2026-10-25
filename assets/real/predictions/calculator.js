(() => {
  'use strict';
  const balance = document.getElementById('paper-balance');
  const rate = document.getElementById('paper-rate');
  const portfolios = [...document.querySelectorAll('[data-portfolio]')];
  const buttons = [...document.querySelectorAll('[data-portfolio-button]')];
  const cards = [...document.querySelectorAll('[data-pick]')];
  let active = 'diagnostic';
  const fmt = n => n.toLocaleString('en-US') + ' Rax';
  function calculate() {
    const now = Date.now();
    const age = Math.floor((now - Date.parse('2026-10-25T15:25:00Z')) / 3600000);
    document.querySelector('[data-freshness]').textContent = age >= 1 ? `Stale snapshot: at least ${age} hour(s) old.` : 'Quotes are historical observations, not executable offers.';
    cards.forEach(card => {
      const started = now >= Date.parse(card.dataset.start);
      card.querySelector('[data-include]').disabled = started;
      card.querySelector('[data-game-state]').textContent = started ? 'Started · outcome pending' : 'Pregame · outcome pending';
      card.classList.toggle('has-started', started);
      card.querySelector('[data-pick-allocation]').textContent = '—';
      card.querySelector('[data-pick-return]').textContent = '—';
    });
    const panel = portfolios.find(p => p.dataset.portfolio === active);
    const eligible = [...panel.querySelectorAll('[data-pick]')].filter(card => {
      const input = card.querySelector('[data-include]');
      return input.checked && !input.disabled;
    });
    const text = balance.value.trim();
    const amount = Number(text);
    const valid = /^\d+$/.test(text) && Number.isSafeInteger(amount) && amount <= 1000000000000;
    balance.setAttribute('aria-invalid', text !== '' && !valid ? 'true' : 'false');
    document.getElementById('balance-error').textContent = text !== '' && !valid ? 'Enter a non-negative whole-Rax balance no greater than 1,000,000,000,000.' : '';
    const fields = ['budget', 'allocated', 'loss', 'unused'];
    if (!valid) {
      fields.forEach(key => document.querySelector(`[data-${key}]`).textContent = '—');
      document.querySelector('[data-calc-status]').textContent = 'Enter a valid balance to explore an allocation. Frozen ledger values never change.';
      return;
    }
    const basisPoints = Number(rate.value);
    const budget = Math.floor(amount * Math.max(0, Math.min(100, basisPoints)) / 10000);
    const perPick = eligible.length ? Math.floor(budget / eligible.length) : 0;
    const allocated = perPick * eligible.length;
    const values = { budget, allocated, loss: allocated, unused: budget - allocated };
    fields.forEach(key => document.querySelector(`[data-${key}]`).textContent = fmt(values[key]));
    panel.querySelectorAll('[data-pick]').forEach(card => {
      const stake = eligible.includes(card) ? perPick : 0;
      card.querySelector('[data-pick-allocation]').textContent = fmt(stake);
      const payout = stake * Number(card.dataset.payout) / 25;
      card.querySelector('[data-pick-return]').textContent = payout.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' Rax';
    });
    document.querySelector('[data-calc-status]').textContent = `${eligible.length} selected eligible pick(s) in ${active === 'diagnostic' ? 'the diagnostic portfolio' : 'the original value portfolio'} · ${fmt(perPick)} each. ${budget - allocated} Rax unallocated. ${eligible.length === 0 ? 'No eligible picks selected.' : perPick === 0 ? 'Budget too small for a whole-Rax allocation.' : 'Only this portfolio is included.'} Frozen 25-Rax ledger unchanged.`;
  }
  function choose(id) {
    active = id;
    portfolios.forEach(panel => panel.hidden = panel.dataset.portfolio !== id);
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.portfolioButton === id)));
    calculate();
  }
  buttons.forEach(button => button.addEventListener('click', () => choose(button.dataset.portfolioButton)));
  balance.addEventListener('input', calculate);
  rate.addEventListener('change', calculate);
  cards.forEach(card => card.querySelector('[data-include]').addEventListener('change', calculate));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) calculate(); });
  // Re-evaluate local time eligibility only; never fetch or refresh snapshot data.
  setInterval(calculate, 60000);
  choose(active);
})();
