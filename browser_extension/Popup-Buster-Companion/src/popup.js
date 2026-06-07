const domainEl = document.getElementById("domain");
const statusEl = document.getElementById("status");
const sourceButton = document.getElementById("toggle-source");
const targetButton = document.getElementById("toggle-target");
const closeAfterTarget = document.getElementById("close-after-target");
const extensionApi = globalThis.browser || globalThis.chrome;

let activeTab = null;
let currentDomain = "";
let lists = { sourceDomains: [], targetDomains: [] };

function setStatus(message) {
  statusEl.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusEl.textContent = "";
  }, 2200);
}

function updateButtons() {
  const sourceRegistered = PopupBusterList.matchesDomain(currentDomain, lists.sourceDomains);
  const targetRegistered = PopupBusterList.matchesDomain(currentDomain, lists.targetDomains);

  sourceButton.textContent = sourceRegistered
    ? "発生元登録を解除"
    : "発生元として登録";
  targetButton.textContent = targetRegistered
    ? "ポップアップ先登録を解除"
    : "ポップアップ先として登録";
}

async function refreshLists() {
  lists = await PopupBusterList.getLists();
  updateButtons();
}

async function init() {
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  currentDomain = PopupBusterList.domainFromUrl(tab?.url || tab?.pendingUrl);

  if (!currentDomain) {
    domainEl.textContent = "このページは登録できません";
    sourceButton.disabled = true;
    targetButton.disabled = true;
    return;
  }

  domainEl.textContent = currentDomain;
  await refreshLists();
}

sourceButton.addEventListener("click", async () => {
  const wasRegistered = PopupBusterList.matchesDomain(currentDomain, lists.sourceDomains);
  await PopupBusterList.toggleDomain("sourceDomains", currentDomain);
  await refreshLists();
  setStatus(wasRegistered ? "発生元リストから削除しました" : "発生元リストに登録しました");
});

targetButton.addEventListener("click", async () => {
  const wasRegistered = PopupBusterList.matchesDomain(currentDomain, lists.targetDomains);
  await PopupBusterList.toggleDomain("targetDomains", currentDomain);
  await refreshLists();
  setStatus(wasRegistered ? "ポップアップ先リストから削除しました" : "ポップアップ先リストに登録しました");

  if (!wasRegistered && closeAfterTarget.checked && Number.isInteger(activeTab?.id)) {
    window.setTimeout(() => extensionApi.tabs.remove(activeTab.id), 250);
  }
});

init();
