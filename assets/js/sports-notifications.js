(function () {
  "use strict";

  const dialog = document.querySelector("[data-notifications-dialog]");
  if (!dialog) return;

  const CONFIG_URL = "/sports/data/notifications.json";
  const TEAM_KEY = "sports-center:favorite-teams:v1";
  const PLAYER_KEY = "sports-center:favorite-players:v1";
  const TOKEN_KEY = "sports-center:push-management-token:v1";
  const EVENT_KEY = "sports-center:notification-events:v1";
  const state = { config: null, server: null, subscription: null, busy: false };
  const status = dialog.querySelector("[data-notifications-status]");
  const enable = dialog.querySelector("[data-enable-notifications]");
  const save = dialog.querySelector("[data-save-notifications]");
  const test = dialog.querySelector("[data-test-notifications]");
  const disable = dialog.querySelector("[data-disable-notifications]");
  const checks = Array.from(dialog.querySelectorAll('.sports-notifications-options input[type="checkbox"]'));

  function setStatus(message, error) {
    status.textContent = message;
    status.dataset.error = error ? "true" : "false";
  }

  function supported() {
    return window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }

  function read(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; }
    catch (_) { return fallback; }
  }

  function selectedEvents() { return checks.filter((item) => item.checked).map((item) => item.value); }

  function loadEvents() {
    const selected = new Set(read(EVENT_KEY, checks.map((item) => item.value)));
    checks.forEach((item) => { item.checked = selected.has(item.value); });
  }

  function managementToken() {
    let token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  function publicKey(value) {
    const padded = value + "=".repeat((4 - value.length % 4) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  function preferences() {
    const players = read(PLAYER_KEY, []);
    return {
      teams: read(TEAM_KEY, []).filter((id) => typeof id === "string"),
      players: players.map((item) => typeof item === "string" ? item : item && item.id).filter(Boolean),
      events: selectedEvents()
    };
  }

  async function request(path, method, payload) {
    const response = await fetch(state.config.api_url.replace(/\/$/, "") + path, {
      method: method,
      headers: { "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(result.error || "The notification service could not complete that request.");
    return result;
  }

  async function registration() {
    return navigator.serviceWorker.ready;
  }

  async function currentSubscription() {
    if (!supported()) return null;
    state.subscription = await (await registration()).pushManager.getSubscription();
    return state.subscription;
  }

  function updateControls() {
    const active = Boolean(state.subscription);
    enable.hidden = active;
    save.hidden = !active;
    test.hidden = !active;
    disable.hidden = !active;
    if (active) setStatus("Notifications are on for this device.");
  }

  async function sync(showMessage) {
    if (!state.subscription || !state.config?.enabled) return;
    localStorage.setItem(EVENT_KEY, JSON.stringify(selectedEvents()));
    await request("/v1/subscriptions", "PUT", {
      subscription: state.subscription.toJSON(),
      managementToken: managementToken(),
      preferences: preferences()
    });
    if (showMessage) setStatus("Your alert choices are saved.");
  }

  async function initialize() {
    loadEvents();
    if (!supported()) {
      setStatus("This browser does not support web notifications. On iPhone or iPad, add Sports Center to your Home Screen first.", true);
      enable.disabled = true;
      return;
    }
    try {
      state.config = await fetch(CONFIG_URL, { cache: "no-store" }).then(function (response) { return response.json(); });
      if (!state.config.enabled || !state.config.api_url) {
        setStatus("The notification service is not connected yet. Your website remains fully usable.");
        enable.disabled = true;
        return;
      }
      state.server = await request("/v1/config", "GET");
      await currentSubscription();
      updateControls();
    } catch (_) {
      setStatus("The notification service is temporarily unavailable. Please try again later.", true);
      enable.disabled = true;
    }
  }

  async function run(action) {
    if (state.busy) return;
    state.busy = true;
    Array.from(dialog.querySelectorAll("button")).forEach((button) => { button.disabled = true; });
    try { await action(); }
    catch (error) { setStatus(error.message || "Notifications could not be updated.", true); }
    finally {
      state.busy = false;
      Array.from(dialog.querySelectorAll("button")).forEach((button) => { button.disabled = false; });
      if (!state.config?.enabled) enable.disabled = true;
    }
  }

  enable.addEventListener("click", function () { run(async function () {
    if (Notification.permission === "denied") throw new Error("Notifications are blocked in this browser’s settings.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");
    const reg = await registration();
    state.subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey(state.server.publicKey) });
    await sync(false);
    updateControls();
  }); });

  save.addEventListener("click", function () { run(function () { return sync(true); }); });
  test.addEventListener("click", function () { run(async function () {
    await request("/v1/test", "POST", { endpoint: state.subscription.endpoint, managementToken: managementToken() });
    setStatus("Test sent. It may take a few seconds to arrive.");
  }); });
  disable.addEventListener("click", function () { run(async function () {
    await request("/v1/subscriptions", "DELETE", { endpoint: state.subscription.endpoint, managementToken: managementToken() });
    await state.subscription.unsubscribe();
    state.subscription = null;
    updateControls();
    setStatus("Notifications are off for this device.");
  }); });

  document.querySelectorAll("[data-open-notifications]").forEach(function (button) {
    button.addEventListener("click", function () { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); });
  });
  dialog.querySelector("[data-close-notifications]").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
  window.addEventListener("sports:favorites-changed", function () { sync(false).catch(function () {}); });
  window.addEventListener("storage", function (event) { if (event.key === TEAM_KEY || event.key === PLAYER_KEY) sync(false).catch(function () {}); });
  if (new URLSearchParams(location.search).get("notifications") === "open") {
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }
  initialize();
}());
