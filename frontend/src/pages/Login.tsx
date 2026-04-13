import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-[20px]">
      <div className="w-full max-w-[402px]">
        <div className="flex flex-col gap-[32px]">
          {/* Logo/Header */}
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
            <p className="text-base leading-[1.4] text-[#9e9e9e] font-medium tracking-[0.2px]">
              Sign in to your account
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-[20px]">
            <div
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]"
            >
              {/* Email Input */}
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

              {/* Password Input */}
              <div className="flex flex-col gap-[8px]">
                <label
                  htmlFor="password"
                  className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]"
                >
                  Password
                </label>
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

              {/* Error Message */}
              {error && (
                <div className="bg-tm-danger-color12 border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ff2a2a] text-[14px] leading-[1.4] font-medium">
                    {error}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="bg-linear-to-t from-tm-primary-color09 to-tm-primary-color06 rounded px-6 py-2 text-white text-base font-bold leading-[1.4] tracking-[0.2px] shadow-[0px_2px_4px_rgba(0,0,0,0.2)] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>

            {/* Footer Text */}
            <p className="text-center text-[14px] leading-[1.4] text-[#9e9e9e] tracking-[0.2px]">
              Need help? Contact support
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
