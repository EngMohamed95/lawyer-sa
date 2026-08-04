/// <reference types="vite/client" />

// Vite يسمح بإلحاق استعلام بالاستيراد لكسر الكاش، مثل: import('./App.tsx?boot=2')
// TypeScript لا يفهم هذه الصيغة افتراضياً، فنُعرّفها هنا.
declare module "*?boot=2" {
  const component: React.ComponentType;
  export default component;
}
