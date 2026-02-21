export const SETUP_COMPLETE_KEY = "tripdesk_setup_complete_v1";

export function isSetupComplete(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(SETUP_COMPLETE_KEY) === "true";
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
  } catch {
    // ignore local storage write failures
  }
}
