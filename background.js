// background.js
const DEFAULT_INTERVAL_MINUTES = 1; // mặc định check mỗi 1 phút

// key lưu settings
const STORAGE_KEYS = {
  SITES: "wp_sites", // array of {id, url, name}
  LASTS: "wp_lasts", // map siteId -> {postId, link, title, date}
  INTERVAL: "wp_interval_minutes"
};

self.addEventListener("install", (e) => {
  // cài mặc định
  e.waitUntil(
    (async () => {
      const data = await chrome.storage.local.get([STORAGE_KEYS.SITES, STORAGE_KEYS.INTERVAL]);
      if (!data[STORAGE_KEYS.SITES]) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: [] });
      }
      if (!data[STORAGE_KEYS.INTERVAL]) {
        await chrome.storage.local.set({ [STORAGE_KEYS.INTERVAL]: DEFAULT_INTERVAL_MINUTES });
      }
      scheduleAlarm();
    })()
  );
});

// schedule alarm theo interval trong storage
async function scheduleAlarm() {
  const s = await chrome.storage.local.get(STORAGE_KEYS.INTERVAL);
  const minutes = (s[STORAGE_KEYS.INTERVAL] || DEFAULT_INTERVAL_MINUTES);
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("wp_check_alarm", { periodInMinutes: minutes });
  });
}

// Nếu user thay đổi settings từ options -> reschedule
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEYS.INTERVAL]) {
    scheduleAlarm();
  }
});

// Alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "wp_check_alarm") {
    checkAllSites();
  }
});

// Manual trigger from popup/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "check_now") {
    checkAllSites().then((res) => sendResponse({ ok: true, result: res }));
    return true; // keep channel open for async response
  }
  if (msg?.type === "reschedule") {
    scheduleAlarm();
    sendResponse({ ok: true });
  }
});

// Lấy danh sách site rồi check từng site
async function checkAllSites() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SITES, STORAGE_KEYS.LASTS]);
  const sites = data[STORAGE_KEYS.SITES] || [];
  const lasts = data[STORAGE_KEYS.LASTS] || {};

  const results = [];

  for (const site of sites) {
    try {
      const latest = await fetchLatestFromSite(site.url);
      if (!latest) continue;

      const last = lasts[site.id];

      // Nếu site trả về numeric postId thì so sánh, nếu không có id thì so sánh link
      const isNew = last
        ? (latest.id ? String(latest.id) !== String(last.postId) : latest.link !== last.link)
        : true;

      if (isNew) {
        // Gọi notification
        showNotification(site, latest);
        // Lưu last
        lasts[site.id] = {
          postId: latest.id || null,
          link: latest.link || null,
          title: latest.title || "",
          date: latest.date || new Date().toISOString()
        };
      }

      // Cập nhật cache bài cho popup (keep last 5)
      // We'll keep a small cache per site: lastsCache_{site.id}
      const cacheKey = `cache_${site.id}`;
      const cached = (await chrome.storage.local.get(cacheKey))[cacheKey] || [];
      const newCache = [latest, ...cached.filter(c => (c.link !== latest.link))].slice(0, 5);
      await chrome.storage.local.set({ [cacheKey]: newCache });

      results.push({ site: site.url, ok: true, latest });
    } catch (e) {
      console.error("Error checking site", site.url, e);
      results.push({ site: site.url, ok: false, error: String(e) });
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.LASTS]: lasts });
  return results;
}

// show notification
function showNotification(site, latest) {
  const title = `Bài mới: ${site.name || site.url}`;
  const message = latest.title || latest.link || "Có bài viết mới";
  chrome.notifications.create(`wp_new_${site.id}_${Date.now()}`, {
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message
  });

  // mở link khi click (nếu có)
  chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId.startsWith(`wp_new_${site.id}_`)) {
      if (latest.link) {
        chrome.tabs.create({ url: latest.link });
      }
    }
  });
}

// Try REST API first, fallback RSS
async function fetchLatestFromSite(siteUrl) {
  // Normalize url (no trailing slash)
  let base = siteUrl.replace(/\/+$/, "");
  // Try REST API
  const apiUrl = `${base}/wp-json/wp/v2/posts?per_page=1&_fields=id,title,link,date`;
  try {
    const res = await fetch(apiUrl, { method: "GET" });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        return {
          id: json[0].id,
          title: (json[0].title && json[0].title.rendered) ? json[0].title.rendered : (json[0].title || ""),
          link: json[0].link || null,
          date: json[0].date || null
        };
      }
    }
  } catch (e) {
    // ignore and fallback to RSS
    console.warn("REST API failed for", apiUrl, e);
  }

  // Fallback RSS
  const feedUrl = `${base}/feed`;
  try {
    const r = await fetch(feedUrl, { method: "GET" });
    if (!r.ok) throw new Error("Feed fetch failed");
    const text = await r.text();
    // parse xml
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    const item = doc.querySelector("item");
    if (!item) return null;
    const title = item.querySelector("title")?.textContent || "";
    const link = item.querySelector("link")?.textContent || "";
    const guid = item.querySelector("guid")?.textContent || link || title;
    const pubDate = item.querySelector("pubDate")?.textContent || null;
    return {
      id: guid,
      title,
      link,
      date: pubDate
    };
  } catch (e) {
    console.warn("RSS failed for", feedUrl, e);
    throw e;
  }
}
