/**
 * يولّد src/styles/dark-theme.css — الوضع الداكن للنظام كله.
 *
 * الفكرة: أدوات Tailwind v4 تقرأ ألوانها من متغيرات CSS (--color-gray-50 ...)،
 * فإعادة تعريف هذه المتغيرات تحت .dark تقلب كل صفحة دون لمس مكوّناتها:
 *  - السلاسل المحايدة (gray/slate/...) تنقلب: الفاتح يصير داكناً والعكس.
 *  - السلاسل الملوّنة: درجات الخلفية الفاتحة (50–200) تصير صبغات داكنة شفيفة،
 *    ودرجات النص الداكنة (700–950) تصير فاتحة لتُقرأ على السطح الداكن.
 *  - رموز الهوية (ink/navy/edge/surface/page) لها قيمة داكنة صريحة.
 *  - .los-paper (الورق: الترويسة، المعاينات) والطباعة تستعيد القيم الفاتحة.
 *
 * التشغيل: node scripts/generate-dark-theme.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const twTheme = readFileSync(join(dirname(require.resolve("tailwindcss/package.json")), "theme.css"), "utf8");
const indexCss = readFileSync(join(root, "src/index.css"), "utf8");

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const NEUTRALS = ["slate", "gray", "zinc", "neutral", "stone"];
const HUES = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "pink", "rose"];
// معرَّفة في index.css بدرجات الكحلي — لها سلّم داكن خاص
const NAVY_FAMILIES = ["purple", "violet", "indigo", "fuchsia"];

const readVars = (css) => {
  const out = {};
  for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) out[`${m[1]}-${m[2]}`] = m[3].trim();
  return out;
};
const tw = readVars(twTheme);
const project = readVars(indexCss);
const light = { ...tw, ...project };

/* ── القيم الداكنة ── */

const PAGE = "#0b1120";
const SURFACE = "#111a2e";

// محايد داكن مائل للكحلي — مقلوب: 50 أغمق خلفية فرعية، 950 أفتح نص
const NEUTRAL_DARK = {
  50: "#162036", 100: "#1b2740", 200: "#253250", 300: "#34435f", 400: "#64738f",
  500: "#8592ab", 600: "#a3aec3", 700: "#bfc8d8", 800: "#d7dde8", 900: "#e9edf4", 950: "#f4f6fa",
};

const NAVY_DARK = {
  50: "#16213d", 100: "#1c2a4d", 200: "#263a66", 300: "#97a6d0", 400: "#6b80b8",
  500: "#8193c6", 600: "#9aaad6", 700: "#b3c0e2", 800: "#ccd5ec", 900: "#e3e8f5", 950: "#f1f4fa",
};

const tint = (hue, pct) => `color-mix(in oklab, ${light[`${hue}-500`]} ${pct}%, ${SURFACE})`;
const hueDark = (hue) => ({
  50: tint(hue, 14), 100: tint(hue, 22), 200: tint(hue, 34),
  300: light[`${hue}-300`], 400: light[`${hue}-400`], 500: light[`${hue}-500`],
  600: light[`${hue}-500`],
  700: light[`${hue}-300`], 800: light[`${hue}-200`], 900: light[`${hue}-100`], 950: light[`${hue}-50`],
});

// رموز الهوية — الفاتح كما كان في الكود حرفياً، والداكن مختار للتباين على SURFACE
const TOKENS = {
  surface: ["#ffffff", SURFACE],
  page: ["#F3F4F6", PAGE],
  navy: ["#192a56", "#22396f"],
  "navy-2": ["#273c75", "#3a5498"],
  ink: ["#192a56", "#e6ebf7"],
  "ink-2": ["#273c75", "#a9bbe8"],
  edge: ["#192a56", "#8597c9"],
  "edge-2": ["#273c75", "#6f84bf"],
  "brand-gray": ["#F3F4F6", PAGE],
};

// متغيرات shadcn — الفاتحة من :root في index.css
const SHADCN_DARK = {
  background: PAGE, foreground: "#e9edf4",
  card: SURFACE, "card-foreground": "#e9edf4",
  popover: "#141f36", "popover-foreground": "#e9edf4",
  primary: "#3a5498", "primary-foreground": "#ffffff",
  secondary: "#1b2740", "secondary-foreground": "#e6ebf7",
  muted: "#162036", "muted-foreground": "#8592ab",
  accent: "#1b2740", "accent-foreground": "#e6ebf7",
  border: "#253250", input: "#2c3a5a", ring: "#6f84bf",
  sidebar: SURFACE, "sidebar-foreground": "#e9edf4",
  "sidebar-primary": "#3a5498", "sidebar-primary-foreground": "#ffffff",
  "sidebar-accent": "#1b2740", "sidebar-accent-foreground": "#e6ebf7",
  "sidebar-border": "#253250", "sidebar-ring": "#6f84bf",
};
const rootBlock = indexCss.match(/:root\s*\{([^}]*)\}/)[1];
const SHADCN_LIGHT = {};
for (const m of rootBlock.matchAll(/--([a-z-]+):\s*([^;]+);/g)) SHADCN_LIGHT[m[1]] = m[2].trim();

/* ── البناء ── */

const decls = (entries) => entries.map(([k, v]) => `  --${k}: ${v};`).join("\n");

const darkVars = [];
const lightVars = [];
for (const fam of NEUTRALS) for (const s of STEPS) {
  darkVars.push([`color-${fam}-${s}`, NEUTRAL_DARK[s]]);
  lightVars.push([`color-${fam}-${s}`, light[`${fam}-${s}`]]);
}
for (const fam of NAVY_FAMILIES) for (const s of STEPS) {
  darkVars.push([`color-${fam}-${s}`, NAVY_DARK[s]]);
  lightVars.push([`color-${fam}-${s}`, light[`${fam}-${s}`]]);
}
for (const hue of HUES) {
  const d = hueDark(hue);
  for (const s of STEPS) {
    darkVars.push([`color-${hue}-${s}`, d[s]]);
    lightVars.push([`color-${hue}-${s}`, light[`${hue}-${s}`]]);
  }
}
for (const [name, [l, d]] of Object.entries(TOKENS)) {
  darkVars.push([`color-${name}`, d]);
  lightVars.push([`color-${name}`, l]);
}
for (const [k, v] of Object.entries(SHADCN_DARK)) {
  darkVars.push([k, v]);
  if (SHADCN_LIGHT[k]) lightVars.push([k, SHADCN_LIGHT[k]]);
}
for (const [k, v] of lightVars) if (!v) throw new Error(`لا قيمة فاتحة لـ ${k}`);

// خلفيات صلبة داكنة (أزرار، شارات) — تحتفظ بلونها الأصلي فلا تنقلب فاتحة تحت نص أبيض
const pinned = [];
const pin = (fam, s) => pinned.push([fam, s, light[`${fam}-${s}`]]);
for (const fam of NEUTRALS) for (const s of ["600", "700", "800", "900", "950"]) pin(fam, s);
for (const fam of NAVY_FAMILIES) for (const s of ["500", "600", "700", "800", "900", "950"]) pin(fam, s);
for (const hue of HUES) for (const s of ["700", "800", "900", "950"]) pin(hue, s);

const isNeutral = ([k]) => NEUTRALS.some((n) => k.startsWith(`color-${n}-`));
const neutralLight = lightVars.filter(isNeutral);
const neutralDark = darkVars.filter(isNeutral);
// أسطح كحلية: بالفئة الدقيقة (~=) كي لا تدخل الصبغات الخفيفة مثل bg-navy/[0.04] على البطاقات الفاتحة
const navyClasses = ["navy", "navy-2"].flatMap((t) => [`bg-${t}`, ...["40", "50", "60", "70", "80", "90", "95"].map((o) => `bg-${t}/${o}`)]);
const NAVY_SURFACES = [".los-dark", ...navyClasses.map((c) => `[class~="${c}"]`), '[class*="from-navy"]'].join(", ");

const esc = (cls) => cls.replace(/:/g, "\\:");
const pinRules = pinned.flatMap(([fam, s, value]) => [
  `  :where(.dark) .bg-${fam}-${s}, :where(.dark) .${esc(`hover:bg-${fam}-${s}`)}:hover { background-color: ${value}; }`,
]).join("\n");

const css = `/* مُولَّد — لا تعدّله يدوياً. المصدر: scripts/generate-dark-theme.mjs */

/* :root.dark لا .dark — كتلة :root في index.css تأتي بعدنا وبنفس الأولوية فكانت تغلب متغيرات shadcn */
:root.dark {
  color-scheme: dark;
${decls(darkVars)}
}

/* الورق (الترويسة ومعاينات المذكرات والتقارير) يبقى أبيض في الوضع الداكن */
.dark .los-paper {
  color-scheme: light;
  color: #2f3640;
${decls(lightVars)}
}

/* الأسطح الكحلية (القائمة الجانبية، الأزرار، الألواح المتدرجة) كحلية في الوضعين —
   نصوصها الرمادية تبقى فاتحة كي تُقرأ عليها */
.dark :is(${NAVY_SURFACES}) {
${decls(neutralLight)}
}

/* بطاقة فاتحة داخل سطح كحلي تستعيد المحايد الداكن */
.dark :is(${NAVY_SURFACES}) :is(.bg-surface, .bg-card, .bg-popover, .bg-background, .bg-page) {
${decls(neutralDark)}
}

/* الطباعة دائماً بالألوان الفاتحة */
@media print {
  :root.dark {
    color-scheme: light;
${decls(lightVars).replace(/^/gm, "  ")}
  }
}

/* في طبقة الأدوات وبأولوية الأداة نفسها (:where) — فتغلب الأداة الأصلية لكن لا تغلب hover/focus */
@layer utilities {
${pinRules}
}
`;

mkdirSync(join(root, "src/styles"), { recursive: true });
writeFileSync(join(root, "src/styles/dark-theme.css"), css);
console.log(`dark-theme.css: ${darkVars.length} متغير، ${pinned.length} خلفية مثبّتة`);
