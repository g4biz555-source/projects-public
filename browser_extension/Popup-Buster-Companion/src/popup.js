const domainSelectEl = document.getElementById("domain-select");
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

function generateDomainCandidates(fullDomain) {
  if (!fullDomain) return [];
  
  // IPv4アドレス、IPv6、またはドットを含まないドメイン(localhost等)の場合は分割しない
  if (!fullDomain.includes(".") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(fullDomain) || fullDomain.includes(":")) {
    return [fullDomain];
  }

  const parts = fullDomain.split(".");
  const candidates = [];
  
  while (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    
    // .co.jp のような ccTLD+SLD を単独で登録させないための簡易ガード
    if (parts.length === 2 && secondLast.length <= 3 && ["jp", "uk", "au", "nz", "kr", "tw", "cn", "br"].includes(last)) {
      break;
    }
    
    candidates.push(parts.join("."));
    parts.shift();
  }
  
  // 万が一候補が空になった場合のフォールバック
  if (candidates.length === 0) {
    candidates.push(fullDomain);
  }
  
  return candidates;
}

async function init() {
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  const fullDomain = PopupBusterList.domainFromUrl(tab?.url || tab?.pendingUrl);

  if (!fullDomain) {
    domainSelectEl.innerHTML = '<option>このページは登録できません</option>';
    domainSelectEl.disabled = true;
    sourceButton.disabled = true;
    targetButton.disabled = true;
    return;
  }

  const candidates = generateDomainCandidates(fullDomain);
  domainSelectEl.innerHTML = "";
  
  for (const candidate of candidates) {
    const option = document.createElement("option");
    option.value = candidate;
    option.textContent = candidate;
    domainSelectEl.appendChild(option);
  }

  domainSelectEl.disabled = false;
  currentDomain = domainSelectEl.value;

  domainSelectEl.addEventListener("change", () => {
    currentDomain = domainSelectEl.value;
    updateButtons();
  });

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