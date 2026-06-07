const state = {
  sourceDomains: [],
  targetDomains: [],
  blockCount: 0,
  filters: {
    sourceDomains: "",
    targetDomains: ""
  }
};

const extensionApi = globalThis.browser || globalThis.chrome;

const listElements = {
  sourceDomains: document.getElementById("source-list"),
  targetDomains: document.getElementById("target-list")
};

const messageEl = document.getElementById("message");
const blockCountEl = document.getElementById("block-count");
const importDataEl = document.getElementById("import-data");

function showMessage(message) {
  messageEl.textContent = message;
}

function listLabel(key) {
  return key === "sourceDomains" ? "ポップアップ元" : "ポップアップ先";
}

function renderList(key) {
  const list = listElements[key];
  const filter = state.filters[key].trim().toLowerCase();
  const domains = state[key].filter((domain) => domain.includes(filter));

  list.replaceChildren();

  if (domains.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "登録なし";
    list.append(empty);
    return;
  }

  for (const domain of domains) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    const button = document.createElement("button");

    text.textContent = domain;
    button.type = "button";
    button.textContent = "削除";
    button.addEventListener("click", async () => {
      const next = state[key].filter((entry) => entry !== domain);
      await PopupBusterList.setList(key, next);
      await load();
      showMessage(`${listLabel(key)}リストから削除しました`);
    });

    item.append(text, button);
    list.append(item);
  }
}

function render() {
  blockCountEl.textContent = String(state.blockCount || 0);
  renderList("sourceDomains");
  renderList("targetDomains");
}

async function load() {
  const lists = await PopupBusterList.getLists();
  state.sourceDomains = PopupBusterList.uniqueDomains(lists.sourceDomains);
  state.targetDomains = PopupBusterList.uniqueDomains(lists.targetDomains);
  state.blockCount = lists.blockCount || 0;
  render();
}

function parseImport(raw) {
  const value = raw.trim();
  if (!value) return { sourceDomains: [], targetDomains: [] };

  try {
    const parsed = JSON.parse(value);
    return {
      sourceDomains: PopupBusterList.uniqueDomains(parsed.sourceDomains || []),
      targetDomains: PopupBusterList.uniqueDomains(parsed.targetDomains || [])
    };
  } catch {
    const imported = { sourceDomains: [], targetDomains: [] };
    let activeKey = "targetDomains";

    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^#\s*source/i.test(trimmed)) {
        activeKey = "sourceDomains";
        continue;
      }

      if (/^#\s*target/i.test(trimmed)) {
        activeKey = "targetDomains";
        continue;
      }

      if (trimmed.startsWith("#")) continue;
      imported[activeKey].push(trimmed);
    }

    return {
      sourceDomains: PopupBusterList.uniqueDomains(imported.sourceDomains),
      targetDomains: PopupBusterList.uniqueDomains(imported.targetDomains)
    };
  }
}

async function importLists(mode) {
  const imported = parseImport(importDataEl.value);
  const next = mode === "replace"
    ? imported
    : {
        sourceDomains: PopupBusterList.uniqueDomains([...state.sourceDomains, ...imported.sourceDomains]),
        targetDomains: PopupBusterList.uniqueDomains([...state.targetDomains, ...imported.targetDomains])
      };

  await extensionApi.storage.local.set(next);
  await load();
  showMessage(mode === "replace" ? "リストを上書きしました" : "リストに追加しました");
}

function exportToTextarea(format) {
  if (format === "json") {
    importDataEl.value = JSON.stringify({
      sourceDomains: state.sourceDomains,
      targetDomains: state.targetDomains
    }, null, 2);
  } else {
    importDataEl.value = [
      "# Source Domains",
      ...state.sourceDomains,
      "",
      "# Target Domains",
      ...state.targetDomains
    ].join("\n");
  }

  importDataEl.select();
  showMessage("エクスポート内容をテキスト欄に出力しました");
}

document.querySelectorAll(".add-form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = form.dataset.list;
    const input = form.elements.domain;
    const domain = PopupBusterList.normalizeDomain(input.value);
    if (!domain) return;

    await PopupBusterList.setList(key, [...state[key], domain]);
    input.value = "";
    await load();
    showMessage(`${listLabel(key)}リストに追加しました`);
  });
});

document.querySelectorAll(".search").forEach((input) => {
  input.addEventListener("input", () => {
    state.filters[input.dataset.search] = input.value.toLowerCase();
    renderList(input.dataset.search);
  });
});

document.getElementById("export-json").addEventListener("click", () => exportToTextarea("json"));
document.getElementById("export-text").addEventListener("click", () => exportToTextarea("text"));
document.getElementById("import-merge").addEventListener("click", () => importLists("merge"));
document.getElementById("import-replace").addEventListener("click", () => importLists("replace"));

load();
