import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '../utils/validators';
import { loginUser } from '../services/authService';
import { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { TextField, Spinner } from '../components/UI';
import AuthShell from '../components/AuthShell';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const res = await loginUser({ email: data.email, password: data.password });
      login({ ...res, remember: data.remember });
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e, 'Sign-in failed. Check your email and password.'));
    }
  };

  return (
    <AuthShell
      title="Welcome back."
      subtitle={<>Sign in to Tiresias to open your saved maps of any topic. New here? <Link to="/register" state={location.state} className="lp-link lp-auth-switch">Create an account</Link></>}
    >
      {serverError && <div role="alert" className="lp-auth-error">{serverError}</div>}
      <form onSubmit={handleSubmit(onSubmit, (errs) => setFocus(Object.keys(errs)[0]))} className="lp-auth-formgrid" noValidate>
        <TextField id="login-email" label="Email" type="email" autoComplete="email" spellCheck={false} placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
        <TextField
          id="login-password" label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" error={errors.password?.message} {...register('password')}
          right={<button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="lp-auth-show">{show ? 'Hide' : 'Show'}</button>}
        />
        <label className="lp-auth-check">
          <input type="checkbox" className="h-5 w-5 accent-[#4f6238]" {...register('remember')} /> Keep me signed in
        </label>
        <button type="submit" disabled={isSubmitting} className="lp-btn lp-auth-submit">
          {isSubmitting ? <><Spinner size={16} /> Signing in…</> : <>Sign in</>}
        </button>
      </form>
    </AuthShell>
  );
};

export default Login;
