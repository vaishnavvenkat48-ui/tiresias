import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, passwordStrength } from '../utils/validators';
import { registerUser } from '../services/authService';
import { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { TextField, Spinner } from '../components/UI';
import AuthShell from '../components/AuthShell';

const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, watch, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema), defaultValues: { name: '', username: '', email: '', password: '', confirmPassword: '' },
  });
  const pw = watch('password', '');
  const strength = passwordStrength(pw);

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const { confirmPassword: _c, ...payload } = data; // eslint-disable-line no-unused-vars
      const res = await registerUser(payload);
      login({ ...res, remember: true });
      navigate(location.state?.from || '/explore', { replace: true });
    } catch (e) {
      setServerError(e.response?.data?.errors?.[0]?.message || errorMessage(e, 'Registration failed.'));
    }
  };

  return (
    <AuthShell
      title="Keep your maps."
      subtitle={<>A free Tiresias account saves your maps of any topic, built from Wikipedia and Wikidata. Already have one? <Link to="/login" state={location.state} className="lp-link lp-auth-switch">Sign in</Link></>}
    >
      {serverError && <div role="alert" className="lp-auth-error">{serverError}</div>}
      <form onSubmit={handleSubmit(onSubmit, (errs) => setFocus(Object.keys(errs)[0]))} className="lp-auth-formgrid" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="reg-name" label="Full name" autoComplete="name" placeholder="Ada Lovelace" error={errors.name?.message} {...register('name')} />
          <TextField id="reg-username" label="Username" autoComplete="username" spellCheck={false} placeholder="ada" error={errors.username?.message} {...register('username')} />
        </div>
        <TextField id="reg-email" label="Email" type="email" autoComplete="email" spellCheck={false} placeholder="ada@example.com" error={errors.email?.message} {...register('email')} />
        <div className="grid items-start gap-4 sm:grid-cols-2"><div>
          <TextField id="reg-password" label="Password" type="password" autoComplete="new-password" placeholder="Choose a password" aria-describedby={errors.password ? 'reg-password-err reg-password-rules' : 'reg-password-rules'} error={errors.password?.message} {...register('password')} />
          {pw && !errors.password && (
            <div className="mt-2 flex items-center gap-3" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4, 5].map((i) => <span key={i} className="h-1.5 flex-1 transition-colors" style={{ background: i <= strength ? '#4f6238' : '#c9c0ac' }} />)}
              </div>
              <span className="lp-auth-strength">{STRENGTH[strength]}</span>
            </div>
          )}
          <p id="reg-password-rules" className="lp-auth-hint">8 or more characters, with upper and lower case, a number and a symbol.</p>
        </div>
        <TextField id="reg-confirm" label="Confirm password" type="password" autoComplete="new-password" placeholder="Repeat password" error={errors.confirmPassword?.message} {...register('confirmPassword')} /></div>
        <button type="submit" disabled={isSubmitting} className="lp-btn lp-auth-submit">
          {isSubmitting ? <><Spinner size={16} /> Creating account…</> : <>Create account</>}
        </button>
      </form>
    </AuthShell>
  );
};

export default Register;
