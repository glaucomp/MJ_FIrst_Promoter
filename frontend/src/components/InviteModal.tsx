import { useState, useEffect } from 'react';
import { modelsApi, type Campaign } from '../services/api';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'referral' | 'tracking';
  userRole: 'admin' | 'team_manager' | 'account_manager' | 'promoter';
}

export const InviteModal = ({ isOpen, onClose, type, userRole }: InviteModalProps) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [sentToEmail, setSentToEmail] = useState('');
  const [quota, setQuota] = useState<{ used: number; remaining: number; unlimited: boolean } | null>(null);

  // Lightweight client-side check only. Server does strict validation via
  // express-validator (`isEmail().normalizeEmail()`).
  const isEmailValid = /.+@.+\..+/.test(email.trim());

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

    if (type === 'referral' && !isEmailValid) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (type === 'referral') {
        const result = await modelsApi.createReferralInvite(selectedCampaignId, email.trim());
        setGeneratedUrl(result.inviteUrl);
        setGeneratedCode(result.inviteCode);
        setEmailSent(result.emailSent ?? null);
        setSentToEmail(email.trim());
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
    setEmail('');
    setEmailSent(null);
    setSentToEmail('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  // Promoters now see the same "My Promoters" experience as AMs/admins, so
  // they get the same modal heading. Team managers keep the "Team Member"
  // wording since they're inviting teammates, not downstream promoters.
  const title = type === 'referral'
    ? (userRole === 'team_manager' ? 'Invite Team Member' : 'Invite New Promoter')
    : 'Create Tracking Link';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-[20px]">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)] w-full max-w-[500px]">
        <div className="flex flex-col gap-[20px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.4] font-bold text-white">{title}</h2>
            <button
              onClick={handleClose}
              className="text-[#9e9e9e] hover:text-white text-[24px] leading-none"
            >
              ×
            </button>
          </div>

          {!generatedUrl ? (
            <>
              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
                  Campaign
                </label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={campaigns.length === 0}
                  className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white focus:outline-none focus:border-[#ff0f5f] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                {campaigns.length === 0 && (
                  <p className="text-[#ffcc33] text-[13px] leading-[1.4] mt-[4px]">
                    {userRole === 'account_manager'
                      ? 'No public campaign is linked to your account manager campaign yet. Ask an admin to set the linked campaign on the Campaigns page.'
                      : 'No active public campaigns are available. Ask an admin to enable a campaign.'}
                  </p>
                )}
              </div>

              {quota && !quota.unlimited && (
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[14px] text-[#9e9e9e]">
                    Remaining invites: <span className="text-white font-bold">{quota.remaining}</span> / {quota.used + quota.remaining}
                  </p>
                </div>
              )}

              {type === 'referral' && (
                <div className="flex flex-col gap-[8px]">
                  <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="promoter@example.com"
                    className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-[16px] text-white focus:outline-none focus:border-[#ff0f5f]"
                  />
                </div>
              )}

              {error && (
                <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ff2a2a] text-[14px] leading-[1.4] font-medium">{error}</p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={
                  isLoading ||
                  !selectedCampaignId ||
                  (type === 'referral' && !isEmailValid) ||
                  (quota?.remaining === 0 && !quota?.unlimited)
                }
                className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Generating...' : 'Generate Link'}
              </button>
            </>
          ) : (
            <>
              <div className="bg-[#006622] border border-[#00d948] rounded-[8px] px-[16px] py-[12px]">
                <p className="text-[#28ff70] text-[14px] leading-[1.4] font-medium">
                  {type === 'referral' ? 'Invite link generated successfully!' : 'Tracking link created successfully!'}
                </p>
              </div>

              {type === 'referral' && emailSent === true && (
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#9e9e9e] text-[14px] leading-[1.4]">
                    Invite email sent to <span className="text-white font-medium">{sentToEmail}</span>
                  </p>
                </div>
              )}

              {type === 'referral' && emailSent === false && (
                <div className="bg-[#332200] border border-[#cc9900] rounded-[8px] px-[16px] py-[12px]">
                  <p className="text-[#ffcc33] text-[14px] leading-[1.4]">
                    Email delivery failed &mdash; share the link manually with <span className="font-medium">{sentToEmail}</span>.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
                  {type === 'referral' ? 'Invite Code' : 'Short Code'}
                </label>
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-white font-mono">
                  {generatedCode}
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <label className="text-[#9e9e9e] text-[14px] leading-[1.4] font-bold uppercase tracking-[0.2px]">
                  URL
                </label>
                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[12px] text-white break-all text-[14px]">
                  {generatedUrl}
                </div>
              </div>

              <div className="flex gap-[12px]">
                <button
                  onClick={handleCopyUrl}
                  className="flex-1 bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
                >
                  Copy URL
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold leading-[1.4] tracking-[0.2px] hover:bg-[#252525] active:scale-[0.98] transition-all"
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
