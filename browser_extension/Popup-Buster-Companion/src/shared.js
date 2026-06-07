const PopupBusterList = (() => {
  const extensionApi = globalThis.browser || globalThis.chrome;
  const defaults = {
    sourceDomains: [],
    targetDomains: [],
    blockCount: 0
  };

  function normalizeDomain(input) {
    if (!input || typeof input !== "string") return "";

    let value = input.trim().toLowerCase();
    if (!value) return "";

    try {
      if (!value.includes("://")) value = `https://${value}`;
      const host = new URL(value).hostname;
      return host.replace(/^www\./, "");
    } catch {
      return value
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .split(":")[0]
        .trim();
    }
  }

  function domainFromUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return "";
    return normalizeDomain(url);
  }

  function uniqueDomains(domains) {
    return [...new Set(domains.map(normalizeDomain).filter(Boolean))].sort();
  }

  function findMatchingDomain(domain, list) {
    const normalized = normalizeDomain(domain);
    if (!normalized) return "";

    return uniqueDomains(list).find((entry) => {
      return normalized === entry || normalized.endsWith(`.${entry}`);
    }) || "";
  }

  function matchesDomain(domain, list) {
    return Boolean(findMatchingDomain(domain, list));
  }

  async function getLists() {
    return extensionApi.storage.local.get(defaults);
  }

  async function setList(key, domains) {
    await extensionApi.storage.local.set({ [key]: uniqueDomains(domains) });
  }

  async function toggleDomain(key, domain) {
    const lists = await getLists();
    const normalized = normalizeDomain(domain);
    const matchingEntry = findMatchingDomain(normalized, lists[key]);
    const next = matchingEntry
      ? lists[key].filter((entry) => normalizeDomain(entry) !== matchingEntry)
      : [...lists[key], normalized];

    await setList(key, next);
  }

  return {
    domainFromUrl,
    getLists,
    matchesDomain,
    normalizeDomain,
    setList,
    toggleDomain,
    uniqueDomains
  };
})();
