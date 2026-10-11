/**
 * Cross-component navigation for the portal shell.
 *
 * Deep components (e.g. overview KPI cards) can't reach the Shell's `setView`
 * through props, so they call `navigateTo(tabId)` and the Shell listens for
 * the event. Tab ids are the fixed sidebar ids ('students', 'staff', 'fees',
 * ...); unknown ids fall back to the first nav item in the Shell.
 */
export const APP_NAV_EVENT = 'school-app:navigate';

export const navigateTo = (tabId: string): void => {
  window.dispatchEvent(new CustomEvent<string>(APP_NAV_EVENT, { detail: tabId }));
};
