import { createContext } from 'react';
import { EDITORIAL_LANGUAGE_STORAGE_KEY } from './editorialMarkdown';

// Shared "preferred code language" for every tab group inside one editorial view.
export const EditorialLanguageContext = createContext({
  preferredLanguage: '',
  setPreferredLanguage: () => {},
});

export function readStoredEditorialLanguage() {
  try {
    return String(globalThis.localStorage?.getItem(EDITORIAL_LANGUAGE_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function writeStoredEditorialLanguage(language) {
  try {
    if (language) globalThis.localStorage?.setItem(EDITORIAL_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice still
    // applies for this page view.
  }
}

export async function copyTextToClipboard(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    textarea.remove();
    return Boolean(copied);
  } catch {
    return false;
  }
}
