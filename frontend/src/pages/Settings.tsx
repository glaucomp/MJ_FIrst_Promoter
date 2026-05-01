import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { wiseApi } from '../services/api';
import type { UserRole } from '../types';

type BankType = 'aba' | 'australian' | 'iban' | 'email';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY',
];

const Field = ({
  label, value, onChange, placeholder, type = 'text', hint, required = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; required?: boolean;
}) => (
  <div className="flex flex-col gap-[6px]">
    <label className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.5px]">
      {label}{required && <span className="text-[#9fe870] ml-[2px]">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[10px] text-[14px] text-white placeholder-[#444] focus:outline-none focus:border-[#9fe870] transition-colors"
    />
    {hint && <p className="text-[10px] text-[#555] leading-[1.4]">{hint}</p>}
  </div>
);

const getBtnLabel = (recipientId: string | null | undefined) =>
  recipientId ? 'Update Wise Account' : 'Link Wise Account';

type RecipientFields = {
  bankType: BankType;
  holderName: string; routingNumber: string; accountNumber: string;
  accountType: 'checking' | 'savings'; address: string; city: string;
  stateCode: string; postCode: string; bsb: string;
  iban: string; bicSwift: string; wiseEmail: string;
};

function validateAba(f: RecipientFields): string | null {
  if (!f.holderName || !f.routingNumber || !f.accountNumber || !f.address || !f.city || !f.postCode)
    return 'Please fill in all required fields';
  if (!/^\d{9}$/.test(f.routingNumber))
    return 'Routing number must be exactly 9 digits';
  return null;
}

/** Returns `{ recipient }` on success or `{ error }` on validation failure. */
function buildRecipient(f: RecipientFields): { recipient: object } | { error: string } {
  const { bankType: bt, holderName: name } = f;

  if (bt === 'aba') {
    const err = validateAba(f);
    if (err) return { error: err };
    return {
      recipient: {
        type: 'aba', accountHolderName: name.trim(), currency: 'USD',
        abartn: f.routingNumber.trim(), accountNumber: f.accountNumber.trim(),
        accountType: f.accountType.toUpperCase(),
        address: { firstLine: f.address.trim(), city: f.city.trim(), state: f.stateCode, postCode: f.postCode.trim(), countryCode: 'US' },
      },
    };
  }

  if (bt === 'australian') {
    if (!name || !f.bsb || !f.accountNumber)
      return { error: 'Account holder name, BSB and account number are required' };
    if (!/^\d{6}$/.test(f.bsb.replaceAll('-', '')))
      return { error: 'BSB must be 6 digits (e.g. 063-000 or 063000)' };
    return {
      recipient: {
        type: 'australian', accountHolderName: name.trim(), currency: 'AUD',
        bsb: f.bsb.replaceAll('-', ''), accountNumber: f.accountNumber.trim(),
      },
    };
  }

  if (bt === 'iban') {
    if (!name || !f.iban) return { error: 'Account holder name and IBAN are required' };
    return {
      recipient: {
        type: 'iban', accountHolderName: name.trim(), currency: 'EUR',
        iban: f.iban.trim().replaceAll(' ', ''),
        ...(f.bicSwift ? { bicSwift: f.bicSwift.trim() } : {}),
      },
    };
  }

  if (!name || !f.wiseEmail) return { error: 'Account holder name and Wise email are required' };
  return {
    recipient: {
      type: 'email',
      accountHolderName: name.trim(),
      email: f.wiseEmail.trim(),
      currency: 'USD',
    },
  };
}

export const Settings = () => {
  const { user, switchRole, updateUser } = useAuth();

  // ── Wise form state ──────────────────────────────────────────────────────
  const [bankType, setBankType] = useState<BankType>('aba');
  const [holderName, setHolderName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('NY');
  const [postCode, setPostCode] = useState('');
  const [bsb, setBsb] = useState('');
  const [iban, setIban] = useState('');
  const [bicSwift, setBicSwift] = useState('');
  const [wiseEmail, setWiseEmail] = useState('');
  const [wiseSaving, setWiseSaving] = useState(false);
  const [wiseMessage, setWiseMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      const anyUser = user as any;
      const recipientType = anyUser.wiseRecipientType;

      if (recipientType === 'iban' || recipientType === 'email' || recipientType === 'australian') {
        setBankType(recipientType);
      } else if (recipientType === 'aba') {
        setBankType('aba');
      }
      if (user.wiseEmail) setWiseEmail(user.wiseEmail);
    }
  }, [user]);

  const handleCreateRecipient = async () => {
    const built = buildRecipient({
      bankType, holderName, routingNumber, accountNumber, accountType,
      address, city, stateCode, postCode, bsb, iban, bicSwift, wiseEmail,
    });

    if ('error' in built) {
      setWiseMessage({ type: 'error', text: built.error });
      return;
    }

    setWiseSaving(true);
    setWiseMessage(null);
    try {
      const result = await wiseApi.createOwnRecipient(built.recipient);
      updateUser({
        wiseRecipientId: result.user.wiseRecipientId,
        wiseEmail: result.user.wiseEmail,
        wiseRecipientType: result.user.wiseRecipientType,
      } as any);
      setWiseMessage({ type: 'success', text: `Wise account linked! ID: ${result.wiseAccount.id}` });
    } catch (err: any) {
      setWiseMessage({ type: 'error', text: err.message || 'Failed to link Wise account' });
    } finally {
      setWiseSaving(false);
    }
  };

  const handleRoleSwitch = (role: UserRole) => {
    switchRole(role);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">Settings</h1>

      {/* View Selection - Only for Team Managers */}
      {user?.baseRole === 'team_manager' && user?.canSwitchToPromoter && (
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-4 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[8px]">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">
              View Selection
            </h2>
            <p className="text-[14px] leading-[1.4] text-[#9e9e9e] tracking-[0.2px]">
              Switch between your team management view or personal promoter stats
            </p>
          </div>

          <div className="grid grid-cols-2 gap-[12px]">
            <button
              onClick={() => handleRoleSwitch('team_manager')}
              className={`relative flex flex-col items-center gap-[12px] p-[20px] rounded-[8px] border-2 transition-all ${
                user?.role === 'team_manager'
                  ? 'bg-linear-to-b from-[#ff0f5f] to-[#cc0047] border-[#ff0f5f] shadow-[0px_0px_20px_rgba(255,15,95,0.3)]'
                  : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[#ff0f5f] hover:shadow-[0px_0px_12px_rgba(255,15,95,0.15)]'
              }`}
            >
              <div className="text-[32px]">👥</div>
              <div className="flex flex-col gap-[4px] text-center">
                <p className={`text-[16px] leading-[1.4] font-bold ${
                  user?.role === 'team_manager' ? 'text-white' : 'text-[#9e9e9e]'
                }`}>
                  Team Manager
                </p>
                <p className={`text-[12px] leading-[1.4] ${
                  user?.role === 'team_manager' ? 'text-white/80' : 'text-[#9e9e9e]'
                }`}>
                  Manage your team
                </p>
              </div>
              {user?.role === 'team_manager' && (
                <div className="absolute top-[12px] right-[12px] w-[8px] h-[8px] rounded-full bg-white shadow-[0px_0px_8px_rgba(255,255,255,0.8)]" />
              )}
            </button>

            <button
              onClick={() => handleRoleSwitch('promoter')}
              className={`relative flex flex-col items-center gap-[12px] p-[20px] rounded-[8px] border-2 transition-all ${
                user?.role === 'promoter'
                  ? 'bg-linear-to-b from-[#ff0f5f] to-[#cc0047] border-[#ff0f5f] shadow-[0px_0px_20px_rgba(255,15,95,0.3)]'
                  : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[#ff0f5f] hover:shadow-[0px_0px_12px_rgba(255,15,95,0.15)]'
              }`}
            >
              <div className="text-[32px]">📈</div>
              <div className="flex flex-col gap-[4px] text-center">
                <p className={`text-[16px] leading-[1.4] font-bold ${
                  user?.role === 'promoter' ? 'text-white' : 'text-[#9e9e9e]'
                }`}>
                  Promoter
                </p>
                <p className={`text-[12px] leading-[1.4] ${
                  user?.role === 'promoter' ? 'text-white/80' : 'text-[#9e9e9e]'
                }`}>
                  Your performance
                </p>
              </div>
              {user?.role === 'promoter' && (
                <div className="absolute top-[12px] right-[12px] w-[8px] h-[8px] rounded-full bg-white shadow-[0px_0px_8px_rgba(255,255,255,0.8)]" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Profile Information */}
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-4 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
        <h2 className="text-[20px] leading-[1.4] font-bold text-white">
          Profile Information
        </h2>
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[8px]">
            <label htmlFor="profileName" className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Name
            </label>
            <input
              id="profileName"
              type="text"
              value={user?.name || ''}
              readOnly
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label htmlFor="profileUsername" className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Username
            </label>
            <div className="relative">
              <input
                id="profileUsername"
                type="text"
                value={user?.username || ''}
                readOnly
                disabled
                aria-readonly="true"
                placeholder="—"
                className="w-full bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] pr-[44px] text-[16px] text-white opacity-80 cursor-not-allowed select-all placeholder-[#444]"
              />
              <span
                aria-hidden="true"
                title="Username cannot be changed"
                className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#9e9e9e]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 10V8a6 6 0 1 1 12 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                </svg>
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-[8px]">
            <label htmlFor="profileEmail" className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Email
            </label>
            <input
              id="profileEmail"
              type="email"
              value={user?.email || ''}
              readOnly
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <span className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
              Role
            </span>
            <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] flex items-center gap-[8px]">
              <span className="text-[16px] text-white font-medium">
                {user?.role.replace('_', ' ').toUpperCase() || ''}
              </span>
              <span className="px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border bg-tm-success-color12 border-[#00d948] text-[#28ff70]">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-4 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">
        <h2 className="text-[20px] leading-[1.4] font-bold text-white">
          Preferences
        </h2>
        <div className="flex flex-col gap-[16px]">
          <label className="flex items-center justify-between p-[16px] bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer hover:border-[#ff0f5f] transition-colors">
            <span className="text-white text-[16px] font-medium">Email Notifications</span>
            <input 
              type="checkbox" 
              className="w-[24px] h-[24px] accent-[#ff0f5f] cursor-pointer" 
              defaultChecked 
            />
          </label>
          <label className="flex items-center justify-between p-[16px] bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] cursor-pointer hover:border-[#ff0f5f] transition-colors">
            <span className="text-white text-[16px] font-medium">Push Notifications</span>
            <input 
              type="checkbox" 
              className="w-[24px] h-[24px] accent-[#ff0f5f] cursor-pointer" 
              defaultChecked 
            />
          </label>
        </div>
      </div>

      {/* Payout Settings — Wise */}
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-4 shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] flex flex-col gap-[20px]">

        {/* Header */}
        <div className="flex items-start gap-[12px] flex-col lg:flex-row">
       <div
              className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[#173300] font-black text-[14px]"
              style={{ background: "linear-gradient(135deg,#9fe870,#9fe870)" }}
            >
              <svg className="w-4" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20">
  <path fill="currentColor" d="M5.5,6.2L0,12.6h9.9l1.1-3h-4.2l2.6-3h0c0,0-1.7-3-1.7-3h7.6l-5.9,16.1h4L20.4.3H2.2l3.4,5.9Z"/>
</svg>
          </div>
          <div className="flex flex-col gap-[2px]">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">Wise Payout</h2>
            <p className="text-[13px] text-[#9e9e9e]">
              Enter your bank details — we'll create a Wise recipient account automatically
            </p>
          </div>
        </div>

        {/* Already linked */}
        {(user as any)?.wiseRecipientId && (
          <div
            className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[8px]"
            style={{ background: 'rgba(0,217,72,0.06)', border: '1px solid rgba(0,217,72,0.2)' }}
          >
            <span className="text-[20px]">✓</span>
            <div className="flex flex-col gap-[2px]">
              <span className="text-[12px] font-semibold" style={{ color: '#00d948' }}>Wise account linked</span>
              <span className="text-[13px] text-white font-mono">
                ID: {(user as any).wiseRecipientId}
                {user?.wiseEmail && <span className="text-[#555] font-sans font-normal ml-[8px]">{user.wiseEmail}</span>}
              </span>
            </div>
            <button
              onClick={() => setWiseMessage(null)}
              className="ml-auto text-[11px] font-semibold px-[10px] py-[5px] rounded-[6px]"
              style={{ background: 'rgba(0,185,255,0.1)', color: '#00b9ff', border: '1px solid rgba(0,185,255,0.2)' }}
            >
              Update
            </button>
          </div>
        )}

        {/* Bank type selector */}
        <div className="flex flex-col gap-[8px]">
          <span className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.5px]">
            Bank Account Type
          </span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[8px]">
            {([
              { id: 'australian', label: 'AUD (Australia)', sub: 'BSB + Account' },
              { id: 'aba', label: 'USD (US Bank)', sub: 'Routing + Account' },
              { id: 'iban', label: 'EUR', sub: 'IBAN' },
              { id: 'email', label: 'Wise Email', sub: 'Wise-to-Wise' },
            ] as { id: BankType; label: string; sub: string }[]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setBankType(t.id); setWiseMessage(null); }}
                className="flex flex-col gap-[2px] px-3 py-2 lg:py-4 rounded-[8px] text-left transition-all border"
                style={{
                  background: bankType === t.id ? 'rgba(159, 232, 112, 0.1)' : '#1a1a1a',
                  borderColor: bankType === t.id ? 'rgb(159, 232, 112)' : 'rgba(255,255,255,0.08)',
                  boxShadow: bankType === t.id ? '0 0 0 1px rgba(0,185,255,0.2)' : 'none',
                }}
              >
                <span className="text-[12px] font-bold" style={{ color: bankType === t.id ? 'rgb(159, 232, 112)' : 'white' }}>
                  {t.label}
                </span>
                <span className="text-[10px]" style={{ color: bankType === t.id ? 'rgb(159, 232, 112)' : 'rgba(255, 255, 255, 0.3)' }}>{t.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Australian (AUD) fields ── */}
        {bankType === 'australian' && (
          <div className="flex flex-col gap-[12px]">
            <Field label="Account Holder Name" value={holderName} onChange={setHolderName} placeholder="Jane Doe" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[10px]">
              <Field
                label="BSB Number"
                value={bsb}
                onChange={setBsb}
                placeholder="063-000"
                hint="6-digit Bank State Branch code"
              />
              <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" />
            </div>
          </div>
        )}

        {/* ── ABA (USD) fields ── */}
        {bankType === 'aba' && (
          <div className="flex flex-col gap-[12px]">
            <Field label="Account Holder Name" value={holderName} onChange={setHolderName} placeholder="Jane Doe" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[10px]">
              <Field
                label="Routing Number (ABA)"
                value={routingNumber}
                onChange={setRoutingNumber}
                placeholder="026009593"
                hint="9-digit US bank routing number"
              />
              <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.5px]">
                Account Type<span className="text-[#9fe870] ml-[2px]">*</span>
              </span>
              <div className="flex gap-[8px]">
                {(['checking', 'savings'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAccountType(t)}
                    className="flex-1 py-[9px] rounded-[8px] text-[13px] font-semibold capitalize transition-all border"
                    style={{
                      background: accountType === t ? 'rgb(159, 232, 112, 0.1)' : '#1a1a1a',
                      borderColor: accountType === t ? 'rgb(159, 232, 112)' : 'rgba(255,255,255,0.08)',
                      color: accountType === t ? 'rgb(159, 232, 112)' : 'white',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Street Address" value={address} onChange={setAddress} placeholder="123 Main St" />
            <div className="grid lg:grid-cols-3 gap-2">
              <Field label="City" value={city} onChange={setCity} placeholder="New York" />
              <div className="flex flex-col gap-[6px]">
                <label
                  htmlFor="stateSelect"
                  className="text-[#9e9e9e] text-[11px] font-bold uppercase tracking-[0.5px]"
                >
                  State<span className="text-[#9fe870] ml-[2px]">*</span>
                </label>
                <select
                  id="stateSelect"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[10px] text-[14px] text-white focus:outline-none focus:border-[#9fe870] transition-colors"
                >
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Field label="ZIP Code" value={postCode} onChange={setPostCode} placeholder="10001" />
            </div>
          </div>
        )}

        {/* ── IBAN fields ── */}
        {bankType === 'iban' && (
          <div className="flex flex-col gap-[12px]">
            <Field label="Account Holder Name" value={holderName} onChange={setHolderName} placeholder="Jane Doe" />
            <Field
              label="IBAN"
              value={iban}
              onChange={setIban}
              placeholder="DE89370400440532013000"
              hint="International Bank Account Number — spaces are removed automatically"
            />
            <Field
              label="BIC / SWIFT"
              value={bicSwift}
              onChange={setBicSwift}
              placeholder="COBADEFFXXX"
              required={false}
              hint="Optional but recommended"
            />
          </div>
        )}

        {/* ── Wise email fields ── */}
        {bankType === 'email' && (
          <div className="flex flex-col gap-[12px]">
            <Field label="Account Holder Name" value={holderName} onChange={setHolderName} placeholder="Jane Doe" />
            <Field
              label="Wise Account Email"
              value={wiseEmail}
              onChange={setWiseEmail}
              placeholder="you@example.com"
              type="email"
              hint="The email address registered on your Wise account"
            />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleCreateRecipient}
          disabled={wiseSaving}
          className="w-full py-4 rounded-lg text-base font-bold text-[#163400] transition-all disabled:opacity-50"
          style={{
            background: wiseSaving ? 'rgba(0,185,255,0.25)' : 'linear-gradient(0deg, rgb(44, 81, 31), rgb(159, 232, 112))',
            
          }}
        >
          {wiseSaving ? 'Linking account…' : getBtnLabel((user as any)?.wiseRecipientId)}
        </button>

        {/* Feedback */}
        {wiseMessage && (
          <div
            className="flex items-center gap-[8px] px-[14px] py-[10px] rounded-[8px] text-[13px] font-medium"
            style={{
              background: wiseMessage.type === 'success' ? 'var(--color-tm-success-color12)' : 'var(--color-tm-danger-color12)',
              border: `1px solid ${wiseMessage.type === 'success' ? 'var(--color-tm-success-color05)' : 'var(--color-tm-danger-color05)'}`,
              color: wiseMessage.type === 'success' ? 'var(--color-tm-success-color05)' : 'var(--color-tm-danger-color05)',
            }}
          >
            {wiseMessage.type === 'success' ? '✓' : '✕'} {wiseMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};
