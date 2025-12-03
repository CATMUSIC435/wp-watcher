const STORAGE_KEYS = { SITES: "wp_sites" };

function el(id){ return document.getElementById(id); }

async function render() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SITES]);
  const sites = data[STORAGE_KEYS.SITES] || [];
  const list = el("list");
  list.innerHTML = "";
  if (sites.length === 0) {
    list.innerHTML = "<p>Chưa có site nào. Mở Settings để thêm.</p>";
    return;
  }
  for (const s of sites) {
    const container = document.createElement("div");
    container.className = "site";
    container.innerHTML = `<h4>${s.name || s.url}</h4><div class="item" id="cache_${s.id}">Loading...</div>`;
    list.appendChild(container);
    // load cache
    const cacheKey = `cache_${s.id}`;
    const cacheObj = (await chrome.storage.local.get(cacheKey))[cacheKey] || [];
    const html = cacheObj.length > 0 ? cacheObj.map(it => `<div><a href="${it.link}" target="_blank">${it.title}</a><br/><small>${it.date||''}</small></div>`).join("") : "<small>Chưa có bài nào trong cache.</small>";
    el(`cache_${s.id}`).innerHTML = html;
  }
}

document.addEventListener("DOMContentLoaded", render);

el("checkNow").addEventListener("click", () => {
  el("checkNow").disabled = true;
  chrome.runtime.sendMessage({ type: "check_now" }, (r) => {
    setTimeout(()=> { el("checkNow").disabled = false; render(); }, 500);
  });
});

el("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
