/** Pure adapter: configuration is supplied by the scraper, never logged. */
export function treasurerProxyConfig(raw) {
  if (!raw) return undefined;
  raw = raw.trim().replace(/^["']|["']$/g, "");
  try {
    if (/^[a-z]+:\/\//i.test(raw) || raw.includes("@")) {
      try {
        const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
        if (!["http:", "https:", "socks5:"].includes(url.protocol)) throw new Error();
        return { server: `${url.protocol}//${url.host}`, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
      } catch {
        // Some proxy providers prefix their host:port:user:password format with http://.
      }
    }
    const scheme = raw.match(/^([a-z]+):\/\//i)?.[1] || "http";
    if (!["http", "https", "socks5"].includes(scheme)) throw new Error();
    const [host, port, username, ...password] = raw.replace(/^[a-z]+:\/\//i, "").split(":");
    if (!host || !/^\d+$/.test(port) || !username || !password.length) throw new Error();
    return { server: `${scheme}://${host}:${port}`, username, password: password.join(":") };
  } catch {
    throw new Error("The configured browser proxy has an invalid format.");
  }
}

export async function loadTreasurerSearchForm(page, url) {
  // Waiting for all deferred third-party scripts can time out on a usable form.
  // Commit to the document, then wait only for the five inputs we actually need.
  const response = await page.goto(url, { waitUntil: "commit", timeout: 20000 });
  if (response?.status() === 407) throw new Error("The configured browser proxy rejected authentication (HTTP 407).");
  if (response?.status() >= 400) throw new Error(`Treasurer search is unavailable (HTTP ${response.status()}).`);
  for (let i = 1; i <= 5; i++) {
    await page.locator(`#ContentPlaceHolder1_ASPxPanel1_SearchByPIN1_txtPIN${i}`).waitFor({ state: "visible", timeout: 15000 });
  }
}

export async function openTreasurerSearchBrowser(chromium, rawProxy, url, log = () => {}) {
  // Preserve the direct path; a configured proxy is a fallback, not a mandatory dependency.
  for (let attempt = 0; attempt < (rawProxy ? 2 : 1); attempt++) {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      ...(attempt ? { proxy: treasurerProxyConfig(rawProxy) } : {}),
    });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await loadTreasurerSearchForm(page, url);
      return { browser, page };
    } catch (error) {
      await browser.close();
      if (!attempt && rawProxy) {
        log("Direct Treasurer connection failed; trying the configured browser proxy.");
      } else {
        throw error;
      }
    }
  }
}