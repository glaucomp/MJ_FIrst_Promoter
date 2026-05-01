import { useState } from 'react';
import type { FormEvent } from 'react';
import { RequirePasswordChangeError, useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { LogoLottie } from '../components/LogoLottie';

type Mode = 'login' | 'forgot';

export const Login = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const loggedInUser = await login(email, password);
      navigate(loggedInUser.baseRole === 'chatter' ? '/chatter-portal' : '/dashboard');
    } catch (err) {
      // The backend signaled the account is on a temp password (created
      // by the TeaseMe 4->5 promotion flow). Route to /first-password-change
      // so the user can set a real password before reaching the dashboard.
      if (err instanceof RequirePasswordChangeError) {
        navigate('/first-password-change', {
          state: {
            changeToken: err.changeToken,
            email: err.emailAddress,
            firstName: err.firstName,
          },
          replace: true,
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotMessage('');
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch {
      // Intentionally ignored — the endpoint always 200s on success, and
      // we don't want to leak whether the email matched a real account
      // even if a network blip makes the request throw.
    } finally {
      setIsLoading(false);
    }
    setForgotMessage(
      'If an account exists for that email, we just sent a password reset link. Check your inbox.',
    );
  };

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-[20px]">
      <div className="w-full max-w-[402px]">
        <div className="flex flex-col gap-[32px]">
          {/* Logo/Header */}
          <div className="flex flex-col gap-[12px] items-center">
            <h1 className="sr-only">{mode === 'login' ? 'Login' : 'Forgot password'}</h1>
            <LogoLottie height={56} width={220} />
            <p className="text-base leading-[1.4] text-[#9e9e9e] font-medium tracking-[0.2px]">
              {mode === 'login'
                ? 'Sign in to your account'
                : 'Enter your email and we\u2019ll send a reset link'}
            </p>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-[20px]">
              <div
                className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]"
              >
                <div className="flex flex-col gap-[8px]">
                  <label
                    htmlFor="email"
                    className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-[#ff0f5f] transition-colors"
                    placeholder="your@email.com"
                  />
                </div>

                <div className="flex flex-col gap-[8px]">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError('');
                        setForgotMessage('');
                      }}
                      className="text-[13px] leading-[1.4] text-[#ff0f5f] hover:underline font-semibold"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-[#ff0f5f] transition-colors"
                    placeholder="••••••••"
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
                  disabled={isLoading}
                  className="bg-linear-to-t from-tm-primary-color09 to-tm-primary-color06 rounded px-6 py-2 text-white text-base font-bold leading-[1.4] tracking-[0.2px] shadow-[0px_2px_4px_rgba(0,0,0,0.2)] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </button>
              </div>

              <p className="text-center text-[14px] leading-[1.4] text-[#9e9e9e] tracking-[0.2px]">
                Need help? Contact support
              </p>
            </form>
          ) : (
            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-[20px]">
              <div
                className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]"
              >
                <div className="flex flex-col gap-[8px]">
                  <label
                    htmlFor="forgot-email"
                    className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                  >
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-[#ff0f5f] transition-colors"
                    placeholder="your@email.com"
                  />
                </div>

                {error && (
                  <div className="bg-tm-danger-color12 border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                    <p className="text-[#ff2a2a] text-[14px] leading-[1.4] font-medium">
                      {error}
                    </p>
                  </div>
                )}

                {forgotMessage && (
                  <div className="bg-[#1f3d29] border border-[#00d948] rounded-[8px] px-[16px] py-[12px]">
                    <p className="text-[#28ff70] text-[14px] leading-[1.4] font-medium">
                      {forgotMessage}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-linear-to-t from-tm-primary-color09 to-tm-primary-color06 rounded px-6 py-2 text-white text-base font-bold leading-[1.4] tracking-[0.2px] shadow-[0px_2px_4px_rgba(0,0,0,0.2)] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Sending…' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setForgotMessage('');
                  }}
                  className="text-center text-[13px] leading-[1.4] text-[#9e9e9e] hover:text-white tracking-[0.2px]"
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
