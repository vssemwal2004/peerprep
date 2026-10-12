import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, LibraryBig, Pencil, Rocket, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';

import { QUICKPREP_ROOT, quickPrepLibraryUrl } from './libraryLink';

export { QUICKPREP_ROOT, quickPrepLibraryUrl };

/** The row and page actions every QuickPrep offers, with their confirmations and messages. */
export default function useQuickPrepActions({ onChanged, onRemoved } = {}) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState(null);

  const run = async (quest, work, success) => {
    setBusyId(quest.id); setMessage(null);
    try {
      const result = await work();
      setMessage({ tone: 'success', text: typeof success === 'function' ? success(result) : success });
      await onChanged?.(result);
      return result;
    } catch (cause) {
      setMessage({ tone: 'error', text: cause.message || 'That action could not be completed.' });
      return null;
    } finally { setBusyId(''); }
  };

  // Mirrors the server: centrally, anything ever published may hold progress in universities, so it is archived.
  const isTouched = (quest) => (quest.central ? Boolean(quest.publishedAt) : quest.stats?.enrolled > 0);
  const kept = (quest) => (quest.central ? 'Universities keep their students’ progress.' : 'Student progress is kept.');
  const setStatus = (quest, status) => run(quest, () => api.updateQuest(quest.id, { status }), status === 'published'
    ? `“${quest.title}” is live for students.` : status === 'archived' ? `“${quest.title}” was archived. ${kept(quest)}` : `“${quest.title}” is now a draft and hidden from students.`);
  const duplicate = (quest) => run(quest, () => api.duplicateQuest(quest.id), (result) => `Copied as “${result.quest.title}” (draft).`);
  const remove = async (quest) => {
    const touched = isTouched(quest);
    if (!window.confirm(touched || quest.status !== 'draft'
      ? (quest.central
        ? `Remove “${quest.title}”? It has been published before, so it will be archived instead of deleted.`
        : `Remove “${quest.title}”? It will be archived so the progress of ${quest.stats?.enrolled || 0} student(s) is kept.`)
      : `Delete the draft “${quest.title}”? This cannot be undone.`)) return;
    const result = await run(quest, () => api.deleteQuest(quest.id), (value) => (value.deleted ? 'Draft deleted.' : `Archived. ${kept(quest)}`));
    if (result) onRemoved?.(result);
  };

  const actionsFor = (quest, { includeView = true } = {}) => [
    includeView && { id: 'view', label: 'View details', icon: Eye, run: () => navigate(`${QUICKPREP_ROOT}/${quest.id}`) },
    { id: 'edit', label: 'Edit details', icon: Pencil, run: () => navigate(`${QUICKPREP_ROOT}/${quest.id}/edit`) },
    { id: 'questions', label: 'Add questions', icon: LibraryBig, run: () => navigate(quickPrepLibraryUrl(quest)) },
    'divider',
    quest.status === 'published'
      ? { id: 'unpublish', label: 'Unpublish', icon: EyeOff, run: () => setStatus(quest, 'draft') }
      : { id: 'publish', label: quest.status === 'archived' ? 'Restore & publish' : 'Publish', icon: Rocket, disabled: !quest.questionCount, title: quest.questionCount ? undefined : 'Add questions first', run: () => setStatus(quest, 'published') },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, run: () => duplicate(quest) },
    quest.status === 'archived'
      ? { id: 'restore', label: 'Restore as draft', icon: ArchiveRestore, run: () => setStatus(quest, 'draft') }
      : { id: 'archive', label: 'Archive', icon: Archive, run: () => setStatus(quest, 'archived') },
    'divider',
    { id: 'delete', label: quest.status === 'draft' && !isTouched(quest) ? 'Delete draft' : 'Remove', icon: Trash2, danger: true, run: () => remove(quest) },
  ].filter(Boolean);

  return { actionsFor, setStatus, duplicate, remove, busyId, message, setMessage };
}
