import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogoLottie } from '../components/LogoLottie';
import type { UserRole } from '../types';

// Landing destination after a successful first-password-change. Mirrors
// the chooser used by Login + SetPassword so we don't accidentally drop
// chatters/payers on the wrong default page.
const defaultLandingFor = (role: UserRole): string => {
  if (role === 'chatter') return '/chatter-portal';
  if (role === 'payer') return '/reports';
  return '/dashboard';
};

interface LocationState {
  changeToken?: string;
  email?: string;
  firstName?: string | null;
}

/**
 * One-shot screen reached when /login responds with
 * `requirePasswordChange: true` (the user was created by the TeaseMe 4->5
 * promotion flow with a temp password from their welcome email).
 *
 * The `changeToken` arrives via `location.state` from Login.tsx — we do
 * NOT read it from the URL because that would let it leak into browser
 * history / referrer headers / shoulder-surfers. If state is missing
 * (e.g. the user refreshed the page) we send them back to /login to
 * re-authenticate; the temp password still works until they actually
 * change it, so a second login attempt produces a fresh changeToken.
 */
export const FirstPasswordChange = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { firstPasswordChange } = useAuth();

  const state = (location.state as LocationState | null) ?? null;
  const changeToken = state?.changeToken;
  const email = state?.email;
  const firstName = state?.firstName ?? null;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Defensive: a deep-link / refresh that bypassed /login won't have a
  // changeToken in router state. Bounce back to /login rather than
  // rendering an unusable form.
  if (!changeToken || !email) {
    return <Navigate to="/login" replace />;
  }

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

    setIsSubmitting(true);
    try {
      const mapped = await firstPasswordChange(changeToken, password);
      navigate(defaultLandingFor(mapped.baseRole), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set new password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = 'Set your password';
  const greeting = firstName?.trim()
    ? `Welcome, ${firstName}!`
    : 'Welcome!';
  const intro = `For security we ask you to choose a new password before continuing. The temporary one from your welcome email will stop working after this. (${email})`;

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-[20px]">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col gap-[32px]">
          <div className="flex flex-col gap-[12px] items-center">
            <LogoLottie height={56} width={220} />
            <h1 className="absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [-webkit-clip-path:inset(50%)] [clip:rect(0,0,0,0)]">
              {heading}
            </h1>
          </div>

          <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
            <form onSubmit={handleSubmit} className="flex flex-col gap-[20px]">
              <div className="flex flex-col gap-[4px]">
                <h2 className="text-white text-[20px] font-bold">{greeting}</h2>
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
                {isSubmitting ? 'Saving…' : 'Save and continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
