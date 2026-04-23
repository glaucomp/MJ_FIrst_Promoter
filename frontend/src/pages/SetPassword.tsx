import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

type TokenState =
  | { status: 'loading' }
  | { status: 'valid'; email: string; firstName: string | null; purpose: 'invite' | 'reset' }
  | { status: 'invalid' };

const defaultLandingFor = (role: UserRole): string => {
  if (role === 'chatter') return '/chatter-portal';
  if (role === 'payer') return '/reports';
  return '/dashboard';
};

export const SetPassword = () => {
  const { token: rawToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const [tokenState, setTokenState] = useState<TokenState>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!rawToken) {
        setTokenState({ status: 'invalid' });
        return;
      }
      try {
        const result = await authApi.validateResetToken(rawToken);
        if (cancelled) return;
        if (!result.valid || !result.email) {
          setTokenState({ status: 'invalid' });
          return;
        }
        setTokenState({
          status: 'valid',
          email: result.email,
          firstName: result.firstName ?? null,
          purpose: result.purpose === 'reset' ? 'reset' : 'invite',
        });
      } catch {
        if (!cancelled) setTokenState({ status: 'invalid' });
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!rawToken) {
      setError('Missing token');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authApi.resetPassword(rawToken, password);
      const mapped = loginWithToken(response.token, response.user);
      navigate(defaultLandingFor(mapped.baseRole), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading =
    tokenState.status === 'valid' && tokenState.purpose === 'reset'
      ? 'Reset your password'
      : 'Set your password';

  const intro =
    tokenState.status === 'valid'
      ? tokenState.purpose === 'reset'
        ? `Choose a new password for ${tokenState.email}.`
        : `Welcome${tokenState.firstName ? `, ${tokenState.firstName}` : ''}! Choose a password to activate your account (${tokenState.email}).`
      : '';

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-[20px]">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col gap-[32px]">
          <div className="flex flex-col gap-[12px] items-center">
            <div className="flex items-center gap-[4px]">
              <h1 className="text-[28px] leading-[36px] font-semibold text-white font-primary">
                TeaseMe
              </h1>
              <div className="border border-[#ff0f5f] rounded-[100px] px-[16px] py-[4px] h-[44px] flex items-center justify-center">
                <span className="text-[28px] leading-[36px] font-tertiary text-[#ff0f5f]">
                  HQ
                </span>
              </div>
            </div>
          </div>

          <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
            {tokenState.status === 'loading' && (
              <p className="text-[#9e9e9e] text-[14px] text-center py-[24px]">
                Checking your link…
              </p>
            )}

            {tokenState.status === 'invalid' && (
              <div className="flex flex-col gap-[16px]">
                <h2 className="text-white text-[20px] font-bold text-center">
                  Link expired or invalid
                </h2>
                <p className="text-[#9e9e9e] text-[14px] leading-[1.5] text-center">
                  This invite / reset link is no longer valid. Ask whoever
                  invited you for a new link, or request a password reset from
                  the login page.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login', { replace: true })}
                  className="bg-linear-to-t from-tm-primary-color09 to-tm-primary-color06 rounded px-6 py-2 text-white text-base font-bold leading-[1.4] tracking-[0.2px] shadow-[0px_2px_4px_rgba(0,0,0,0.2)] hover:from-[#ff1f69] hover:to-[#d10050] transition-all"
                >
                  Back to Login
                </button>
              </div>
            )}

            {tokenState.status === 'valid' && (
              <form onSubmit={handleSubmit} className="flex flex-col gap-[20px]">
                <div className="flex flex-col gap-[4px]">
                  <h2 className="text-white text-[20px] font-bold">{heading}</h2>
                  <p className="text-[#9e9e9e] text-[14px] leading-[1.5]">
                    {intro}
                  </p>
                </div>

                <div className="flex flex-col gap-[8px]">
                  <label
                    htmlFor="new-password"
                    className="text-[#9e9e9e] text-[12px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                  >
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-[#ff0f5f] transition-colors"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className="flex flex-col gap-[8px]">
                  <label
                    htmlFor="confirm-password"
                    className="text-[#9e9e9e] text-[12px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-[#ff0f5f] transition-colors"
                    placeholder="Repeat the password"
                  />
                </div>

                {error && (
                  <div className="bg-tm-danger-color12 border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                    <p className="text-[#ff2a2a] text-[14px] leading-[1.4] font-medium">
                      {error}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-linear-to-t from-tm-primary-color09 to-tm-primary-color06 rounded px-6 py-2 text-white text-base font-bold leading-[1.4] tracking-[0.2px] shadow-[0px_2px_4px_rgba(0,0,0,0.2)] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? 'Saving…'
                    : tokenState.purpose === 'reset'
                      ? 'Reset Password'
                      : 'Activate Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
