export const QUICKPREP_ROOT = '/admin/quickprep';

/** The existing Question Library, opened to pick coding questions for one QuickPrep and come back. */
export function quickPrepLibraryUrl(quest) {
  const params = new URLSearchParams({
    type: 'coding', lockType: 'coding', mode: 'quickprep', quickprep: quest.id, quickprepTitle: quest.title || 'QuickPrep',
    return: `${QUICKPREP_ROOT}/${quest.id}/edit?step=questions`,
  });
  return `/admin/library?${params.toString()}`;
}
