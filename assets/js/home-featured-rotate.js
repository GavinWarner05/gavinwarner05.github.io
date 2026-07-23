document.addEventListener("DOMContentLoaded", function () {
  const deck = document.querySelector("[data-home-featured-deck]");

  if (!deck) return;

  const items = Array.from(deck.querySelectorAll("[data-home-featured-item]"));

  if (!items.length) return;

  const storageKey = "home-featured-next-index";
  let activeIndex = 0;

  try {
    const savedIndex = parseInt(window.localStorage.getItem(storageKey), 10);

    if (!Number.isNaN(savedIndex) && savedIndex >= 0) {
      activeIndex = savedIndex % items.length;
    }

    window.localStorage.setItem(storageKey, String((activeIndex + 1) % items.length));
  } catch (error) {
    activeIndex = 0;
  }

  items.forEach(function (item, index) {
    item.hidden = index !== activeIndex;
  });
});
