(() => {
  'use strict';
  document.querySelectorAll('.real-avatar img').forEach(img => {
    const updatePhoto = () => img.parentElement.classList.toggle('has-photo', img.complete && img.naturalWidth > 0);
    img.addEventListener('load', updatePhoto);
    img.addEventListener('error', updatePhoto);
    updatePhoto();
  });
  const form = document.querySelector('#filters');
  const cards = [...document.querySelectorAll('[data-candidate]')];
  const fields = Object.fromEntries(['sport', 'tier', 'price', 'status', 'budget'].map(id => [id, document.getElementById(id)]));
  function update() {
    const entered = fields.budget.value.trim();
    const budget = entered !== '' && Number.isFinite(Number(entered)) && Number(entered) >= 0 ? Number(entered) : null;
    let count = 0;
    cards.forEach(card => {
      const price = Number(card.dataset.price);
      const status = budget !== null && price > budget ? 'Above budget' : card.dataset.status;
      card.querySelector('[data-label]').textContent = status;
      card.querySelector('[data-label]').classList.toggle('above', status === 'Above budget');
      card.hidden = Boolean((fields.sport.value && fields.sport.value !== card.dataset.sport) || (fields.tier.value && fields.tier.value !== card.dataset.tier) || (fields.price.value && price > Number(fields.price.value)) || (fields.status.value && fields.status.value !== status));
      if (!card.hidden) count++;
    });
    document.getElementById('result-count').textContent = `${count} of ${cards.length} candidates`;
    document.getElementById('empty').hidden = count > 0;
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', () => setTimeout(update, 0));
  document.getElementById('clear-empty').addEventListener('click', () => form.reset());
  const checked = Date.parse(document.querySelector('time[datetime]').dateTime);
  const hours = Math.max(0, Math.floor((Date.now() - checked) / 3600000));
  if (hours >= 24) document.getElementById('snapshot-age').textContent = `Stale snapshot: checked ${Math.floor(hours / 24)} day(s) ago.`;
  update();
})();
