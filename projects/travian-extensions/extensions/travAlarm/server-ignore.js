/**
 * TRAVIAN WATCHMAN PRO - IGNORED SERVERS
 * Hosts listed under IGNORED_HOSTS_KEY get no widget, scans, fetches or new
 * alarms. Only a small pill to resume is shown.
 */

const IGNORED_HOSTS_KEY = "_tw_ignored_hosts";

/** @returns {Promise<string[]>} */
async function readIgnoredHosts() {
  try {
    const res = await api.storage.local.get(IGNORED_HOSTS_KEY);
    const list = res?.[IGNORED_HOSTS_KEY];
    return Array.isArray(list) ? list.filter((h) => typeof h === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string} [host] */
async function isHostIgnored(host = window.location.hostname) {
  return (await readIgnoredHosts()).includes(host);
}

/**
 * Adds or removes a host from the ignore list.
 * @param {boolean} ignored
 * @param {string} [host]
 */
async function setHostIgnored(ignored, host = window.location.hostname) {
  const hosts = (await readIgnoredHosts()).filter((h) => h !== host);
  await api.storage.local.set({
    [IGNORED_HOSTS_KEY]: ignored ? [...hosts, host] : hosts,
  });
}

/** Shows the "ignored" pill with a Resume button on an ignored server. */
function renderIgnoredPill() {
  const pill = document.createElement("div");
  pill.id = "_tw-ignored";
  pill.innerHTML = `<span>TravAlarm · Ignored</span><button type="button" id="_tw-resume">Resume</button>`;
  pill.querySelector("#_tw-resume").onclick = async () => {
    await setHostIgnored(false);
    window.location.reload();
  };
  document.body.appendChild(pill);
}
