// Centralized configurable theme + content for the portal style homepage.
// Adjust values here to rebrand without touching component code.

export const PORTAL_BRAND = 'Election Engine Portal';
export const PORTAL_TAGLINE = 'Spatial analytics, electoral simulation and data exploration in one unified workspace.';

export interface PortalNavItem { label: string; to: string }
export const PORTAL_NAV: PortalNavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Gallery', to: '/projection-demo' },
  { label: 'Maps', to: '/map-2024' },
  { label: '3D', to: '/cesium-3d' },
  { label: 'Scenarios', to: '/iowa-scenario' },
  { label: 'Canada', to: '/canada-election' },
  { label: 'Dashboard', to: '/dashboard' }
];

// Primary accent color (announcement bars etc.) — tweak to any brand hue.
export const PORTAL_ACCENT = '#1d4ed8'; // Tailwind blue-700 equivalent

// Announcement message (top & bottom). Could later be replaced by API‑driven content.
export const PORTAL_ANNOUNCEMENT = 'Portal Preview • Share feedback on the new interface → feedback@electionengine.dev';
