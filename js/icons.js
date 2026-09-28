export const icons = {
  building: `<svg viewBox="0 0 24 24"><path d="M4 20h16M6 20V8l6-4 6 4v12M9 20v-6h6v6"/></svg>`,
  meal: `<svg viewBox="0 0 24 24"><path d="M4 10h16v10H4zM8 10V4M12 10V6M16 10V4"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>`,
  grill: `<svg viewBox="0 0 24 24"><path d="M4 9h16M6 9v10h12V9M8 5v4M12 4v5M16 5v4"/></svg>`,
  pot: `<svg viewBox="0 0 24 24"><path d="M4 10h16v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8zM8 10V8a4 4 0 0 1 8 0v2M3 12h18"/></svg>`,
  pan: `<svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="6"/><path d="M16.5 9.5 21 5M8 10c1-2 2.5-3 4-3"/></svg>`,
  thermo: `<svg viewBox="0 0 24 24"><rect x="10" y="3" width="4" height="12" rx="2"/><circle cx="12" cy="18" r="3"/><path d="M12 7v8"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 22 20H2L12 3z"/><path d="M12 9v5M12 17h.01"/></svg>`,
};

export function methodIcon(method) {
  if (method === "焼き物") return icons.grill;
  if (method === "煮物") return icons.pot;
  return icons.pan;
}
