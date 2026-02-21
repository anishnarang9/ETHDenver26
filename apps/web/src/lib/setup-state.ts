export const SETUP_COMPLETE_KEY = "actuate_setup_complete_v1";
const LEGACY_SETUP_COMPLETE_KEY = "tripdesk_setup_complete_v1";

export function isSetupComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const current = window.localStorage.getItem(SETUP_COMPLETE_KEY);
    if (current === "true") {
      return true;
    }
    return window.localStorage.getItem(LEGACY_SETUP_COMPLETE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSetupComplete(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SETUP_COMPLETE_KEY, value ? "true" : "false");
    window.localStorage.removeItem(LEGACY_SETUP_COMPLETE_KEY);
  } catch {
    // ignore local storage write failures
  }
}
