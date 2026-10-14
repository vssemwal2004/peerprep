import { useId, useRef, useState } from 'react';
import { Building2, CheckCircle2, Loader2, RotateCw, TriangleAlert } from 'lucide-react';
import { api } from '../../../utils/api';
import { Notice } from '../../quickprep/ui';
import LogoUploader from './LogoUploader';
import { ApiKeyPanel, Field, Modal } from './primitives';
import { fieldForServerError, slugify, validateUniversityFields } from './universityModel';
import { inputClass, primaryButton, secondaryButton } from './styles';

const EMPTY = { universityId: '', name: '', contactEmail: '', deploymentUrl: '', apiUrl: '' };
const FIELDS = [
  { key: 'name', label: 'University name', required: true, placeholder: 'Graphic Era University', autoComplete: 'organization' },
  { key: 'universityId', label: 'University ID', required: true, placeholder: 'graphic-era', hint: 'Permanent. Lowercase letters, numbers and hyphens. Must match PEERPREP_UNIVERSITY_ID on its deployment.', mono: true },
  { key: 'contactEmail', label: 'Contact email', type: 'email', placeholder: 'placements@university.edu', autoComplete: 'email' },
  { key: 'deploymentUrl', label: 'Frontend URL', type: 'url', placeholder: 'https://peerprep.university.edu', hint: 'Where students open PeerPrep for this university.' },
  { key: 'apiUrl', label: 'University API URL', type: 'url', placeholder: 'https://api.university.edu', hint: 'Origin only. Used to read student records; HTTPS required except on localhost.' },
];

/** Two steps: the registration form, then the one-time API key (and logo upload status). */
export default function CreateUniversityDialog({ existingIds = [], onClose, onCreated }) {
  const baseId = useId();
  const formRef = useRef(null);
  const [values, setValues] = useState(EMPTY);
  const [idEdited, setIdEdited] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [created, setCreated] = useState(null);
  const [logo, setLogo] = useState({ state: 'none', error: '' });
  const [saved, setSaved] = useState(false);

  const clientErrors = validateUniversityFields(values, { requireId: true });
  if (!clientErrors.universityId && existingIds.includes(values.universityId.trim())) clientErrors.universityId = 'A university with this ID already exists.';
  const errors = { ...clientErrors, ...serverErrors };
  const visibleError = (key) => ((touched[key] || submitted) ? errors[key] : '') || '';
  const invalid = Object.keys(clientErrors).length > 0;

  function change(key, raw) {
    const value = key === 'universityId' ? raw.toLowerCase().replace(/\s+/g, '-') : raw;
    setValues((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'name' && !idEdited) next.universityId = slugify(value);
      return next;
    });
    if (key === 'universityId') setIdEdited(true);
    setServerErrors((previous) => {
      if (!previous[key] && !(key === 'name' && !idEdited && previous.universityId)) return previous;
      const next = { ...previous };
      delete next[key];
      if (key === 'name' && !idEdited) delete next.universityId;
      return next;
    });
    setGeneralError('');
  }

  async function uploadLogo(universityId, file) {
    setLogo({ state: 'uploading', error: '' });
    try {
      await api.uploadUniversityLogo(universityId, file);
      setLogo({ state: 'done', error: '' });
      onCreated?.();
    } catch (error) {
      setLogo({ state: 'failed', error: error.message || 'The logo could not be uploaded.' });
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (invalid || submitting) {
      formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    setGeneralError('');
    const body = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
    try {
      const result = await api.createUniversity(body);
      setCreated({ universityId: result.university.universityId, name: result.university.name, apiKey: result.apiKey });
      onCreated?.();
      if (logoFile) uploadLogo(result.university.universityId, logoFile);
    } catch (error) {
      const field = fieldForServerError(error);
      if (field) setServerErrors({ [field]: error.message });
      else setGeneralError(error.message || 'The university could not be created.');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const uploading = logo.state === 'uploading';
    return <Modal title={`${created.name} is ready`} description="Configure its deployment with the key below." icon={CheckCircle2} tone="sky" dismissible={false} onClose={onClose} size="max-w-xl"
      footer={<button type="button" className={primaryButton} disabled={!saved || uploading} onClick={onClose}>I saved the key</button>}>
      <div className="space-y-4">
        <ApiKeyPanel universityId={created.universityId} apiKey={created.apiKey} />
        {logo.state === 'uploading' && <Notice tone="info"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Uploading the logo…</span></Notice>}
        {logo.state === 'done' && <Notice tone="success">Logo uploaded.</Notice>}
        {logo.state === 'failed' && <Notice tone="warning">
          <p className="flex items-start gap-2 font-semibold"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />The university was created, but its logo was not uploaded.</p>
          <p className="mt-1">{logo.error} You can retry now or add the logo later from the university's Overview tab.</p>
          <button type="button" className={`${secondaryButton} mt-2 px-3 py-1.5`} onClick={() => uploadLogo(created.universityId, logoFile)}><RotateCw className="h-4 w-4" aria-hidden="true" />Retry upload</button>
        </Notice>}
        <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-zinc-200">
          <input type="checkbox" data-autofocus checked={saved} onChange={(event) => setSaved(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
          I have stored this key somewhere safe and understand it cannot be shown again.
        </label>
      </div>
    </Modal>;
  }

  return <Modal title="Add university" description="It starts with the current defaults for new universities and keeps its own database for local data." icon={Building2} onClose={onClose} dismissible={!submitting} size="max-w-2xl"
    footer={<>
      <button type="button" className={secondaryButton} onClick={onClose} disabled={submitting}>Cancel</button>
      <button type="submit" form={`${baseId}-form`} className={primaryButton} disabled={submitting || (submitted && invalid)}>{submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Creating…</> : 'Create university'}</button>
    </>}>
    <form id={`${baseId}-form`} ref={formRef} noValidate onSubmit={submit} className="space-y-4">
      {generalError && <Notice tone="error" onClose={() => setGeneralError('')}>{generalError}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => <div key={field.key} className={field.key === 'apiUrl' || field.key === 'deploymentUrl' ? 'sm:col-span-2' : ''}>
          <Field id={`${baseId}-${field.key}`} label={field.label} hint={field.hint} required={field.required} error={visibleError(field.key)}>
            {(props) => <input {...props} type={field.type || 'text'} value={values[field.key]} placeholder={field.placeholder} autoComplete={field.autoComplete || 'off'} spellCheck={false}
              data-autofocus={field.key === 'name' ? true : undefined}
              onChange={(event) => change(field.key, event.target.value)} onBlur={() => setTouched((previous) => ({ ...previous, [field.key]: true }))}
              className={`${inputClass} ${field.mono ? 'font-mono' : ''} ${visibleError(field.key) ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100 dark:border-rose-500/50' : ''}`} />}
          </Field>
        </div>)}
      </div>
      <LogoUploader university={{ name: values.name, universityId: values.universityId }} file={logoFile} busy={submitting} label="Logo (optional)"
        onSelect={(file) => setLogoFile(file)} onRemove={logoFile ? () => setLogoFile(null) : undefined} />
    </form>
  </Modal>;
}
