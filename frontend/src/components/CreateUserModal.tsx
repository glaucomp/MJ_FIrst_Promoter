import { useState } from 'react';
import { modelsApi, type ApiUser } from '../services/api';

type UserType = 'account_manager' | 'team_manager' | 'promoter';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (user: ApiUser) => void;
}

const USER_TYPES: { value: UserType; label: string; description: string }[] = [
  {
    value: 'account_manager',
    label: 'Account Manager',
    description: 'Can invite promoters and manage campaigns',
  },
  {
    value: 'team_manager',
    label: 'Team Manager',
    description: 'Can manage a team and switch to promoter view',
  },
  {
    value: 'promoter',
    label: 'Promoter',
    description: 'Creates tracking links and earns commissions',
  },
];

export const CreateUserModal = ({ isOpen, onClose, onCreated }: CreateUserModalProps) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [userType, setUserType]   = useState<UserType>('promoter');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState<ApiUser | null>(null);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await modelsApi.createUser({ email, password, firstName, lastName, userType });
      setSuccess(user);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setUserType('promoter');
    setError('');
    setSuccess(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-[20px]">
      <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full max-w-[500px]">
        <div className="flex flex-col gap-[20px]">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">Create New User</h2>
            <button onClick={handleClose} className="text-[#9e9e9e] hover:text-white text-[24px] leading-none">
              ×
            </button>
          </div>

          {success ? (
            <>
              <div className="bg-[#006622] border border-[#00d948] rounded-[8px] px-[16px] py-[12px]">
                <p className="text-[#28ff70] text-[14px] font-medium">User created successfully!</p>
              </div>

              <div className="flex flex-col gap-[8px]">
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] flex flex-col gap-[4px]">
                  <p className="text-white text-[16px] font-semibold">
                    {success.firstName} {success.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[13px]">{success.email}</p>
                  <span className="self-start mt-[4px] px-[10px] py-[2px] rounded-[100px] text-[11px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                    {success.userType?.toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="flex gap-[12px]">
                <button
                  onClick={() => { setSuccess(null); setEmail(''); setPassword(''); setFirstName(''); setLastName(''); }}
                  className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:bg-[#252525] transition-all"
                >
                  Create Another
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[12px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] transition-all"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Name row */}
              <div className="flex gap-[12px]">
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Sofia"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                  />
                </div>
                <div className="flex flex-col gap-[8px] flex-1">
                  <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Martinez"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="sofia@example.com"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
                />
              </div>

              {/* User type */}
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                  Role
                </label>
                <div className="flex flex-col gap-[8px]">
                  {USER_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setUserType(t.value)}
                      className={`flex items-center justify-between rounded-[8px] px-[14px] py-[12px] border text-left transition-all ${
                        userType === t.value
                          ? 'bg-[#ff0f5f]/10 border-[#ff0f5f] '
                          : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'
                      }`}
                    >
                      <div>
                        <p className={`text-[14px] font-bold ${userType === t.value ? 'text-white' : 'text-[#9e9e9e]'}`}>
                          {t.label}
                        </p>
                        <p className="text-[12px] text-[#666] mt-[2px]">{t.description}</p>
                      </div>
                      <div className={`w-[16px] h-[16px] rounded-full border-2 flex-shrink-0 ${
                        userType === t.value ? 'border-[#ff0f5f] bg-[#ff0f5f]' : 'border-[#555]'
                      }`} />
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={isLoading || !email || !password}
                className="bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create User'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
