import { forwardRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Compass, TreeStructure, ChatCircleDots } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { updateProfile } from '../services/authService';
import { errorMessage } from '../services/api';
import { profileSchema } from '../utils/validators';
import { formatDate, initials } from '../utils/data';
import { PageHeader, Card, FieldError, StatTile, Spinner } from '../components/UI';

// forwardRef so react-hook-form's register() ref reaches the real <input>
const Field = forwardRef(({ id, label, error, ...rest }, ref) => (
  <div>
    <label className="field-label" htmlFor={id}>{label}</label>
    <input ref={ref} id={id} className="input" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
    <FieldError id={`${id}-err`} message={error} />
  </div>
));
Field.displayName = 'Field';

const Profile = () => {
  const { user, setUser } = useAuth();
  const { stats } = useUser();
  const { toast } = useToast();
  const [err, setErr] = useState('');
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', username: user?.username || '', email: user?.email || '' },
  });

  const onSubmit = async (data) => {
    setErr('');
    try {
      const res = await updateProfile(data);
      setUser(res.user);
      localStorage.setItem('tiresias_user', JSON.stringify(res.user));
      reset({ name: res.user.name, username: res.user.username, email: res.user.email });
      toast('Profile updated', { type: 'success' });
    } catch (e) { setErr(errorMessage(e, 'Update failed.')); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Account" title="Profile" />
      <div className="surface mb-6 flex flex-wrap items-center gap-5 p-6">
        <span className="well grid h-20 w-20 shrink-0 place-items-center !rounded-[22px] text-[26px] font-semibold text-accent">{initials(user?.name)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-semibold tracking-tight text-fg">{user?.name}</h2>
          <p className="truncate text-[13.5px] text-fg-2">@{user?.username} · {user?.email}</p>
          <p className="mt-1 text-[12.5px] text-fg-3">Explorer since {formatDate(user?.joinedAt || user?.createdAt)} · {user?.role === 'ADMIN' ? 'Administrator' : 'Explorer'}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile label="Topics explored" value={stats?.topicsExplored} icon={Compass} loading={!stats} />
        <StatTile label="Saved graphs" value={stats?.graphsCreated} icon={TreeStructure} loading={!stats} />
        <StatTile label="AI questions" value={stats?.aiQueries} icon={ChatCircleDots} loading={!stats} />
      </div>

      <Card title="Edit profile" description="Changes are saved to your account.">
        {err && <p role="alert" className="mb-4 text-[13px] text-danger">{err}</p>}
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="profile-name" label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
          <Field id="profile-username" label="Username" autoComplete="username" spellCheck={false} error={errors.username?.message} {...register('username')} />
          <div className="sm:col-span-2"><Field id="profile-email" label="Email" type="email" autoComplete="email" spellCheck={false} error={errors.email?.message} {...register('email')} /></div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={isSubmitting || !isDirty} className="btn btn-primary">{isSubmitting && <Spinner size={14} />} Save changes</button>
            {isDirty && <button type="button" className="btn btn-ghost" onClick={() => reset()}>Discard</button>}
          </div>
        </form>
      </Card>
    </div>
  );
};

export default Profile;
