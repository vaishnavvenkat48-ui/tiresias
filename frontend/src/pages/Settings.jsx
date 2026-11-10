import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle, Check, SignOut, Sun, Moon, Desktop, Warning } from '@phosphor-icons/react';
import { PageHeader, Card, SwitchRow, Spinner, Segmented, ThemeToggle, TextField, Modal } from '../components/UI';
import { usersApi } from '../services/dataService';
import { usePrefs } from '../context/PrefsContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { updateProfile } from '../services/authService';
import { errorMessage } from '../services/api';

const Settings = () => {
  const { prefs, setPref } = usePrefs();
  const { user, setUser, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(null);

  const notif = user?.preferences || {};
  const setNotif = async (key, value) => {
    setSaving(key);
    const preferences = { ...notif, [key]: value };
    try {
      const res = await updateProfile({ preferences });
      setUser(res.user);
      localStorage.setItem('tiresias_user', JSON.stringify(res.user));
    } catch (e) {
      toast(errorMessage(e, 'Could not update notification settings.'), { type: 'error' });
    } finally { setSaving(null); }
  };

  const setTheme = (t) => {
    setPref('theme', t);
    usersApi.preferences({ theme: t }).then((r) => { if (r?.user) setUser(r.user); }).catch(() => null); // sync to account (best effort)
  };

  /* Password change */
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwState, setPwState] = useState({ busy: false, error: '' });
  const pwMismatch = pw.confirm && pw.next !== pw.confirm;
  const changePassword = async (e) => {
    e.preventDefault();
    if (pwMismatch) return;
    setPwState({ busy: true, error: '' });
    try {
      await usersApi.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setPwState({ busy: false, error: '' });
      toast('Password changed. Other devices were signed out.', { type: 'success' });
    } catch (err) {
      setPwState({ busy: false, error: err.response?.data?.errors?.[0]?.message || errorMessage(err, 'Could not change the password.') });
    }
  };

  /* Account deletion */
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delState, setDelState] = useState({ busy: false, error: '' });
  const deleteAccount = async (e) => {
    e.preventDefault();
    setDelState({ busy: true, error: '' });
    try {
      await usersApi.deleteAccount(delPw);
      logout();
      navigate('/');
    } catch (err) {
      setDelState({ busy: false, error: errorMessage(err, 'Could not delete the account.') });
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Preferences" title="Settings" description="Tune how Tiresias looks, moves and behaves." />

      <div className="space-y-6">
        <Card title="Appearance" description="Paper reads like a book in daylight; Night is the same book by lamplight. System follows your device.">
          <div className="flex flex-wrap items-center gap-4">
            <Segmented label="Colour theme" value={prefs.theme} onChange={setTheme} options={[{ value: 'dark', label: 'Night', icon: Moon }, { value: 'light', label: 'Paper', icon: Sun }, { value: 'system', label: 'System', icon: Desktop }]} />
            <ThemeToggle />
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Interface" bodyClass="divide-y divide-[var(--line-strong)]">
            <SwitchRow title="Reduce motion" description="Disable animations and settle graphs instantly" checked={prefs.reduceMotion} onChange={(v) => setPref('reduceMotion', v)} />
            <SwitchRow title="Ambient background" description="A slow animated starfield behind the app (off by default)" checked={prefs.ambient} onChange={(v) => setPref('ambient', v)} />
            <SwitchRow title="Show graph tips" description="The hint bar at the bottom of the explorer" checked={!prefs.hintsDismissed} onChange={(v) => setPref('hintsDismissed', !v)} />
          </Card>

          <Card title="Graph defaults" description="Applied to newly generated graphs. Saved graphs keep their own settings." bodyClass="divide-y divide-[var(--line-strong)]">
            <SwitchRow title="Physics simulation" description="Concepts repel, links pull, the graph settles itself" checked={prefs.physics} onChange={(v) => setPref('physics', v)} />
            <SwitchRow title="Mini-map" description="Overview map in the bottom-right corner" checked={prefs.minimap} onChange={(v) => setPref('minimap', v)} />
            <div className="py-3.5">
              <label htmlFor="def-strength" className="flex items-center justify-between text-[13.5px] font-medium text-fg">
                Simulation strength <span className="tabular-nums text-fg-2">{Number(prefs.strength).toFixed(1)}×</span>
              </label>
              <input id="def-strength" type="range" min="0.3" max="2" step="0.1" value={prefs.strength} onChange={(e) => setPref('strength', Number(e.target.value))} className="range mt-3 w-full" />
              <div className="mt-1 flex justify-between text-[11.5px] text-fg-3"><span>Calm</span><span>Energetic</span></div>
            </div>
          </Card>

          <Card title="Notifications" description="Saved to your account" bodyClass="divide-y divide-[var(--line-strong)]">
            {[
              ['notifications', 'In-app notifications', 'Path progress and graph activity'],
              ['emailNotifications', 'Email updates', 'Weekly learning digest'],
              ['productUpdates', 'Product news', 'New features and improvements'],
            ].map(([key, title, desc]) => (
              <div key={key} className="relative">
                <SwitchRow title={title} description={desc} checked={notif[key] ?? true} onChange={(v) => setNotif(key, v)} disabled={!!saving} />
                {saving === key && <Spinner size={13} className="absolute right-14 top-1/2 -translate-y-1/2 text-fg-3" />}
              </div>
            ))}
          </Card>

          <Card title="Change password" description="Other devices are signed out after a change.">
            <form onSubmit={changePassword} className="space-y-3" noValidate>
              <TextField id="pw-current" label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              <TextField id="pw-new" label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <TextField id="pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwMismatch ? 'Passwords do not match.' : ''} />
              <p className="text-[12px] text-fg-3">At least 8 characters with upper & lower case, a number and a symbol.</p>
              {pwState.error && <p role="alert" className="text-[12.5px] text-danger">{pwState.error}</p>}
              <button type="submit" className="btn btn-primary btn-sm" disabled={pwState.busy || !pw.current || !pw.next || pwMismatch}>{pwState.busy && <Spinner size={13} />} Update password</button>
            </form>
          </Card>
        </div>

        <Card title="Interface extras" bodyClass="divide-y divide-[var(--line-strong)]">
          <SwitchRow title="Load topic images automatically" description="Show the Wikimedia Commons image and Wikidata facts as soon as you select a concept" checked={prefs.autoMedia} onChange={(v) => setPref('autoMedia', v)} />
        </Card>

        <Card title="Account">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[13px] text-fg-2">Signed in as <span className="text-fg">{user?.email}</span>.</p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => { logout(); navigate('/'); }}><SignOut size={15} /> Sign out</button>
              <button type="button" className="btn btn-danger" onClick={() => { setDelOpen(true); setDelPw(''); setDelState({ busy: false, error: '' }); }}><Warning size={15} /> Delete account</button>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account?" description="This permanently removes your graphs, learning paths, history, analytics and conversations. It can't be undone.">
        <form onSubmit={deleteAccount} className="space-y-4">
          <TextField id="del-pw" label="Confirm with your password" type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          {delState.error && <p role="alert" className="text-[12.5px] text-danger">{delState.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setDelOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={!delPw || delState.busy}>{delState.busy && <Spinner size={13} />} Delete permanently</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Settings;
