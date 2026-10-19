import { useRef, useState } from 'react';
import { ImageUp, Save, Trash2, UserRound } from 'lucide-react';
import { api } from '../../../utils/api';
import { Button, Card, Field, helper, inputClass } from '../ui';
import UniversityBadge from '../UniversityBadge';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Name, contact and logo: what students and admins see for this university. */
export default function ProfileTab({ university, run, busy }) {
  const [name, setName] = useState(university.name || '');
  const [email, setEmail] = useState(university.contactEmail || '');
  const [logoError, setLogoError] = useState('');
  const fileInput = useRef(null);
  const changed = name.trim() !== university.name || email.trim() !== (university.contactEmail || '');

  function pickLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setLogoError('');
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { setLogoError('Use a PNG, JPEG or WebP image. SVG and GIF are not accepted.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setLogoError('The logo must be 2 MB or smaller.'); return; }
    run('logo', () => api.uploadUniversityLogo(university.universityId, file), 'Logo updated.');
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card id="profile-title" title="Details" icon={UserRound} description="The name appears on the university's sign-in page and across its portal.">
        <div className="space-y-4">
          <Field label="University name" required><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Contact email" hint="Who PeerPrep contacts about this university."><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="University ID" hint="Part of every link for this university, so it cannot be changed."><input className={`${inputClass} font-mono`} value={university.universityId} disabled /></Field>
          <Button icon={Save} busy={busy === 'profile'} disabled={!changed || name.trim().length < 2}
            onClick={() => run('profile', () => api.updateUniversity(university.universityId, { name: name.trim(), contactEmail: email.trim() }), 'Details saved.')}>Save details</Button>
        </div>
      </Card>

      <Card id="logo-title" title="Logo" icon={ImageUp} description="PNG, JPEG or WebP, up to 2 MB, between 64 and 4096 pixels on each side. A square logo looks best.">
        <div className="flex flex-wrap items-center gap-5">
          <UniversityBadge university={university} size="lg" />
          <div className="space-y-2">
            <input ref={fileInput} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={pickLogo} aria-label="Choose a logo image" />
            <div className="flex flex-wrap gap-2">
              <Button icon={ImageUp} busy={busy === 'logo'} onClick={() => fileInput.current?.click()}>{university.logo?.url ? 'Replace logo' : 'Upload logo'}</Button>
              {university.logo?.url && <Button variant="danger" icon={Trash2} busy={busy === 'logo-remove'} onClick={() => run('logo-remove', () => api.deleteUniversityLogo(university.universityId), 'Logo removed.')}>Remove</Button>}
            </div>
            {university.logo?.width && <p className={helper}>{university.logo.width}×{university.logo.height} px · {Math.round((university.logo.bytes || 0) / 1024)} KB</p>}
            {logoError && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-300">{logoError}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
