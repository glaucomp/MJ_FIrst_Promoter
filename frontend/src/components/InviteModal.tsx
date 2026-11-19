import { useState, useEffect, type FormEvent } from 'react';
import { modelsApi, type Campaign } from '../services/api';

const USERNAME_ERROR =
  'Enter a username using letters, numbers, dots, underscores, or hyphens (up to 80 characters).';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'referral' | 'tracking';
  userRole: 'admin' | 'team_manager' | 'account_manager' | 'promoter';
}

const syncUsernameA11y = (input: HTMLInputElement) => {
  const invalid = input.matches(':user-invalid') && !input.validity.valid;
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  input.setAttribute(
    'aria-describedby',
    invalid ? 'invite-username-hint invite-username-error' : 'invite-username-hint',
  );
};

export const InviteModal = ({ isOpen, onClose, type, userRole }: InviteModalProps) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [invitedUsername, setInvitedUsername] = useState('');
  const [quota, setQuota] = useState<{ used: number; remaining: number; unlimited: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCampaigns();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCampaignId && type === 'referral' && (userRole === 'team_manager' || userRole === 'promoter')) {
      loadQuota(selectedCampaignId);
    }
  }, [selectedCampaignId, type, userRole]);

  const loadCampaigns = async () => {
    try {
      const data = await modelsApi.getCampaigns();
      // Server already scopes the list per-role: AMs receive the public
      // campaign linked from their hidden membership campaign, promoters /
      // team managers receive `visibleToPromoters: true` campaigns, admins
      // receive everything. Here we drop inactive rows and keep only
      // campaigns marked `visibleToPromoters`.
      const filteredCampaigns = data.filter(
        (c) => c.isActive && c.visibleToPromoters,
      );
      setCampaigns(filteredCampaigns);
      if (filteredCampaigns.length > 0) {
        setSelectedCampaignId(filteredCampaigns[0].id);
      } else {
        setSelectedCampaignId('');
      }
    } catch (err) {
      setError('Failed to load campaigns');
    }
  };

  const loadQuota = async (campaignId: string) => {
    try {
      const quotaData = await modelsApi.getInviteQuota(campaignId);
      setQuota(quotaData);
    } catch (err) {
      setQuota(null);
    }
  };

  const handleGenerate = async () => {
    if (!selectedCampaignId) {
      setError('Please select a campaign');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (type === 'referral') {
        const result = await modelsApi.createReferralInvite(
          selectedCampaignId,
          username.trim().replace(/^@+/, ''),
        );
        setGeneratedUrl(result.inviteUrl);
        setGeneratedCode(result.inviteCode);
        setInvitedUsername(result.inviteeUsername || username.trim().replace(/^@+/, ''));
        if (quota && !quota.unlimited) {
          setQuota({ ...quota, used: quota.used + 1, remaining: quota.remaining - 1 });
        }
      } else {
        const result = await modelsApi.createTrackingLink(selectedCampaignId);
        setGeneratedUrl(result.fullUrl);
        setGeneratedCode(result.shortCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (type === 'referral') {
      const field = event.currentTarget.elements.namedItem('username');
      if (field instanceof HTMLInputElement) {
        field.setCustomValidity('');
        if (!field.checkValidity()) {
          field.setCustomValidity(USERNAME_ERROR);
          field.reportValidity();
          syncUsernameA11y(field);
          field.focus();
          return;
        }
        field.setCustomValidity('');
      }
    }
    void handleGenerate();
  };

  const handleCopyUrl = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
    } catch {
      setError('Failed to copy URL to clipboard');
    }
  };

  const handleClose = () => {
    setGeneratedUrl('');
    setGeneratedCode('');
    setUsername('');
    setInvitedUsername('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  // All roles use "Invite New Promoter" for referral-type invites; tracking
  // link creation uses a separate heading.
  const title = type === 'referral'
    ? 'Invite New Promoter'
    : 'Create Tracking Link';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-[20px]">
      <style>{`
        .invite-username:user-invalid {
          border-color: #d93025;
        }
        .invite-username-error { display: none; }
        .invite-username:user-invalid + .invite-username-error { display: block; }
      `}</style>
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-sm p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full max-w-[500px]">
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 id="invite-modal-title" className="text-lg leading-[1.4] font-bold text-white">{title}</h2>
            <button
              type="button"
              onClick={handleClose}
              className="text-tm-text-color08 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>

          {!generatedUrl ? (
            <form
              className="flex flex-col gap-[20px]"
              aria-labelledby="invite-modal-title"
              onSubmit={handleSubmit}
              noValidate={false}
            >
              <div className="flex flex-col gap-[8px]">
                <label htmlFor="invite-campaign" className="text-tm-text-color08 text-sm leading-[1.4] font-bold uppercase">
                  Campaign
                </label>
                <select
                  id="invite-campaign"
                  name="campaignId"
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={campaigns.length < 2}
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-tm-primary-color04 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                {campaigns.length === 0 && (
                  <p className="text-[#ffcc33] text-sm leading-[1.4] mt-[4px]">
                    {userRole === 'account_manager'
                      ? 'No public campaign is linked to your account manager campaign yet. Ask an admin to set the linked campaign on the Campaigns page.'
                      : 'No active public campaigns are available. Ask an admin to enable a campaign.'}
                  </p>
                )}
              </div>

              {quota && !quota.unlimited && (
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px]">
                  <p className="text-sm text-tm-text-color08">
                    Remaining invites: <span className="text-white font-bold">{quota.remaining}</span> / {quota.used + quota.remaining}
                  </p>
                </div>
              )}

              {type === 'referral' && (
                <div className="flex flex-col gap-[8px]">
                  <label htmlFor="invite-username" className="text-tm-text-color08 text-sm leading-[1.4] font-bold uppercase">
                    Username <span aria-hidden="true">*</span>
                  </label>
                  <span id="invite-username-hint" className="text-tm-text-color08 text-sm leading-[1.4]">
                    Same username for every integration. Their email is verified when they become an influencer.
                  </span>
                  <input
                    id="invite-username"
                    name="username"
                    type="text"
                    required
                    pattern="(?=.*[A-Za-z0-9])[A-Za-z0-9._-]{1,80}"
                    maxLength={80}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-describedby="invite-username-hint"
                    value={username}
                    onChange={(e) => {
                      e.target.setCustomValidity('');
                      setUsername(e.target.value.replace(/^@+/, ''));
                      syncUsernameA11y(e.target);
                    }}
                    onBlur={(e) => syncUsernameA11y(e.target)}
                    onInvalid={(e) => {
                      e.currentTarget.setCustomValidity(USERNAME_ERROR);
                    }}
                    placeholder="promotername"
                    className="invite-username bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-base text-white focus:outline-none focus:border-tm-primary-color04"
                  />
                  <p id="invite-username-error" className="invite-username-error text-tm-danger-color05 text-sm leading-[1.4] font-medium">
                    <span role="img" aria-label="Error">!</span> {USERNAME_ERROR}
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-sm px-[16px] py-[12px]">
                  <p className="text-tm-danger-color05 text-sm leading-[1.4] font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isLoading ||
                  !selectedCampaignId ||
                  (quota?.remaining === 0 && !quota?.unlimited)
                }
                className="btn-primary-cta rounded-lg px-[24px] py-[14px] text-base font-bold leading-[1.4] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Generating...' : 'Generate Link'}
              </button>
            </form>
          ) : (
            <>
              <div role="status" className="bg-tm-success-color12 border border-tm-success-color09 rounded-sm px-[16px] py-[12px]">
                <p className="text-tm-success-color05 text-sm leading-[1.4] font-medium">
                  {type === 'referral' ? 'Invite link generated successfully!' : 'Tracking link created successfully!'}
                </p>
              </div>

              {type === 'referral' && invitedUsername && (
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px]">
                  <p className="text-tm-text-color08 text-sm leading-[1.4]">
                    Share this link with <span className="text-white font-medium">@{invitedUsername}</span>. Their email is verified when they become an influencer.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-[8px]">
                <label className="text-tm-text-color08 text-sm leading-[1.4] font-bold uppercase">
                  {type === 'referral' ? 'Invite Code' : 'Short Code'}
                </label>
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-white font-mono">
                  {generatedCode}
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <label className="text-tm-text-color08 text-sm leading-[1.4] font-bold uppercase">
                  URL
                </label>
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[16px] py-[12px] text-white break-all text-sm">
                  {generatedUrl}
                </div>
              </div>

              <div className="flex gap-[12px]">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex-1 btn-primary-cta rounded-sm px-[24px] py-[14px] text-base font-bold leading-[1.4]  active:scale-[0.98] transition-all"
                >
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-sm px-[24px] py-[14px] text-white text-base font-bold leading-[1.4] hover:bg-[#252525] active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
