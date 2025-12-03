const STORAGE_KEYS = {
  SITES: "wp_sites",
  INTERVAL: "wp_interval_minutes"
};

const el = id => document.getElementById(id);

async function render() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SITES, STORAGE_KEYS.INTERVAL]);
  const sites = data[STORAGE_KEYS.SITES] || [];
  const interval = data[STORAGE_KEYS.INTERVAL] || 1;
  el("interval").value = interval;

  const list = el("sitesList");
  list.innerHTML = "";
  for (const s of sites) {
    const div = document.createElement("div");
    div.className = "site";
    div.innerHTML = `
      <div class="left">
        <strong>${s.name || '(no name)'}</strong><br/>
        <small>${s.url}</small>
      </div>
      <div>
        <button class="del" data-id="${s.id}">Delete</button>
      </div>
    `;
    list.appendChild(div);
  }

  document.querySelectorAll(".del").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      const d = await chrome.storage.local.get(STORAGE_KEYS.SITES);
      const sitesNow = d[STORAGE_KEYS.SITES] || [];
      const newSites = sitesNow.filter(x => x.id !== id);
      await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: newSites });
      render();
    });
  });
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

document.addEventListener("DOMContentLoaded", render);

el("addBtn").addEventListener("click", async () => {
  const url = el("siteUrl").value.trim();
  const name = el("siteName").value.trim();
  if (!url) return alert("Nhập URL");
  const d = await chrome.storage.local.get(STORAGE_KEYS.SITES);
  const sites = d[STORAGE_KEYS.SITES] || [];
  sites.push({ id: genId(), url, name });
  await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: sites });
  el("siteUrl").value = "";
  el("siteName").value = "";
  render();
});

el("saveBtn").addEventListener("click", async () => {
  const minutes = Number(el("interval").value) || 1;
  await chrome.storage.local.set({ [STORAGE_KEYS.INTERVAL]: minutes });
  // tell background to reschedule
  chrome.runtime.sendMessage({ type: "reschedule" }, (r) => {
    el("status").textContent = "Saved.";
    setTimeout(()=> el("status").textContent = "", 2000);
  });
});

el("checkNowBtn").addEventListener("click", async () => {
  el("status").textContent = "Checking...";
  chrome.runtime.sendMessage({ type: "check_now" }, (resp) => {
    el("status").textContent = "Done.";
    setTimeout(()=> el("status").textContent = "", 2000);
  });
});
