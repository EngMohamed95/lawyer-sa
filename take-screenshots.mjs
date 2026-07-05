import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";
const OUT_DIR = "./public/screenshots";

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const MOCK_STORAGE = {
  isAuthenticated: "true",
  userRole: "LAWYER",
  userPlan: "PREMIUM",
  userName: "أحمد محمد",
  userId: "demo",
  lawyerId: "demo",
};

async function waitForApp(page) {
  // Wait for the lazy-loading spinner to disappear
  try {
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 8000 }
    );
  } catch {}
  await new Promise(r => setTimeout(r, 1500));
}

async function shot(page, name, width = 1280, height = 800) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
  console.log(`✅ ${name}.png`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "Accept-Language": "ar-EG,ar;q=0.9" });

  // 1. Landing Page
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle2" });
  await shot(page, "landing-hero");

  // 2. Pricing section
  await page.goto(`${BASE_URL}/#pricing`, { waitUntil: "networkidle2" });
  await page.evaluate(() => document.querySelector("#pricing")?.scrollIntoView());
  await new Promise(r => setTimeout(r, 500));
  await shot(page, "landing-pricing");

  // 3. Login page
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await shot(page, "login");

  // Inject mock localStorage for app pages
  await page.evaluateOnNewDocument((storage) => {
    for (const [k, v] of Object.entries(storage)) {
      localStorage.setItem(k, v);
    }
  }, MOCK_STORAGE);

  const appPages = [
    { url: "/app/dashboard", name: "dashboard" },
    { url: "/app/clients",   name: "clients" },
    { url: "/app/cases",     name: "cases" },
    { url: "/app/hearings",  name: "hearings" },
    { url: "/app/tasks",     name: "tasks" },
    { url: "/app/documents", name: "documents" },
    { url: "/app/accounting",name: "accounting" },
  ];

  for (const { url, name } of appPages) {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
    await waitForApp(page);
    await shot(page, name);
  }

  await browser.close();
  console.log("\n🎉 All screenshots saved to public/screenshots/");
}

main().catch(console.error);
