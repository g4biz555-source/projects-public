const extensionApi = globalThis.browser || globalThis.chrome;
let blockCountQueue = Promise.resolve();

async function getLists() {
  return PopupBusterList.getLists();
}

async function incrementBlockCount() {
  blockCountQueue = blockCountQueue
    .catch(() => {})
    .then(async () => {
      const { blockCount = 0 } = await extensionApi.storage.local.get({ blockCount: 0 });
      await extensionApi.storage.local.set({ blockCount: blockCount + 1 });
    });

  await blockCountQueue;
}

async function removeTab(tabId) {
  try {
    await extensionApi.tabs.remove(tabId);
    await incrementBlockCount();
  } catch {
    // The tab may already be closed by the browser or another extension.
  }
}

async function shouldCloseBySource(tab, sourceDomains) {
  if (!Number.isInteger(tab.openerTabId)) return false;

  try {
    const opener = await extensionApi.tabs.get(tab.openerTabId);
    const openerDomain = PopupBusterList.domainFromUrl(opener.url || opener.pendingUrl);
    return PopupBusterList.matchesDomain(openerDomain, sourceDomains);
  } catch {
    return false;
  }
}

async function evaluateTab(tab) {
  const { sourceDomains, targetDomains } = await getLists();
  const targetDomain = PopupBusterList.domainFromUrl(tab.url || tab.pendingUrl);

  if (PopupBusterList.matchesDomain(targetDomain, targetDomains)) {
    await removeTab(tab.id);
    return;
  }

  if (await shouldCloseBySource(tab, sourceDomains)) {
    await removeTab(tab.id);
  }
}

extensionApi.tabs.onCreated.addListener((tab) => {
  if (Number.isInteger(tab.id)) evaluateTab(tab);
});

extensionApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && !tab.pendingUrl) return;
  evaluateTab({ ...tab, id: tabId });
});
