import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { modelsApi, type Campaign, type CampaignInput } from '../services/api';

const EMPTY_FORM: CampaignInput = {
  name: '',
  description: '',
  websiteUrl: '',
  defaultReferralUrl: '',
  commissionRate: 30,
  secondaryRate: 10,
  recurringRate: null,
  cookieLifeDays: 90,
  autoApprove: true,
  visibleToPromoters: true,
  maxInvitesPerMonth: null,
};

export const Campaigns = () => {
  const { user, logout } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.baseRole === 'admin') loadCampaigns();
  }, [user?.baseRole]);

  const loadCampaigns = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await modelsApi.getAllCampaigns();
      setCampaigns(data);
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        logout();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCampaign(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingCampaign(c);
    setForm({
      name: c.name,
      description: c.description ?? '',
      websiteUrl: c.websiteUrl,
      defaultReferralUrl: c.defaultReferralUrl ?? '',
      commissionRate: c.commissionRate,
      secondaryRate: c.secondaryRate ?? 0,
      recurringRate: c.recurringRate ?? null,
      cookieLifeDays: c.cookieLifeDays,
      autoApprove: c.autoApprove,
      visibleToPromoters: c.visibleToPromoters,
      maxInvitesPerMonth: c.maxInvitesPerMonth,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (!form.websiteUrl.trim()) { setFormError('Website URL is required'); return; }
    if (form.commissionRate < 0 || form.commissionRate > 100) { setFormError('Commission rate must be 0–100'); return; }

    setIsSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        maxInvitesPerMonth: form.maxInvitesPerMonth ?? null,
      };
      if (editingCampaign) {
        const updated = await modelsApi.updateCampaign(editingCampaign.id, payload);
        setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await modelsApi.createCampaign(payload);
        setCampaigns(prev => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save campaign');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (c: Campaign) => {
    setTogglingId(c.id);
    try {
      const updated = await modelsApi.updateCampaign(c.id, { isActive: !c.isActive });
      setCampaigns(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch {
      // silent — could show toast
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await modelsApi.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign');
    } finally {
      setDeletingId(null);
    }
  };

  if (user?.baseRole !== 'admin') {
    return (
      <div className="flex flex-col gap-[24px]">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white">Campaigns</h1>
        <p className="text-[#9e9e9e] text-[16px]">Access denied</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white">Campaigns</h1>
        <div className="flex items-center gap-[12px]">
          <p className="text-[16px] text-[#9e9e9e]">{campaigns.length} total</p>
          <button
            onClick={openCreate}
            className="bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Campaign
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
          <p className="text-red-400 text-[14px] font-semibold">{error}</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-[#9e9e9e] text-[16px]">Loading...</p>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {campaigns.map(c => (
            <div
              key={c.id}
              className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-col gap-[12px]">
                {/* Top row */}
                <div className="flex items-start justify-between gap-[12px]">
                  <div className="flex flex-col gap-[4px]">
                    <p className="text-white text-[18px] font-semibold">{c.name}</p>
                    {c.description && (
                      <p className="text-[#9e9e9e] text-[13px]">{c.description}</p>
                    )}
                    <p className="text-[#666] text-[12px] break-all mt-[2px]">{c.websiteUrl}</p>
                  </div>

                  <div className="flex flex-col items-end gap-[8px] shrink-0">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(c)}
                      disabled={togglingId === c.id}
                      className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border transition-colors ${
                        c.isActive
                          ? 'bg-[#006622] border-[#00d948] text-[#28ff70] hover:bg-[#005518]'
                          : 'bg-[#333] border-[#555] text-[#9e9e9e] hover:bg-[#3a3a3a]'
                      } disabled:opacity-50`}
                    >
                      {togglingId === c.id ? '...' : c.isActive ? 'Active' : 'Inactive'}
                    </button>

                    {/* Visibility badge */}
                    <span className={`px-[10px] py-[2px] rounded-[100px] text-[11px] font-bold border ${
                      c.visibleToPromoters
                        ? 'bg-[#001a66] border-[#0047cc] text-[#4d9fff]'
                        : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]'
                    }`}>
                      {c.visibleToPromoters ? 'Public' : 'Hidden'}
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-[16px] flex-wrap">
                  <div className="flex flex-col gap-[2px]">
                    <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Commission</p>
                    <p className="text-white text-[15px] font-bold">{c.commissionRate}%</p>
                  </div>
                  {c.secondaryRate != null && c.secondaryRate > 0 && (
                    <div className="flex flex-col gap-[2px]">
                      <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Upline</p>
                      <p className="text-white text-[15px] font-bold">{c.secondaryRate}%</p>
                    </div>
                  )}
                  {c.recurringRate != null && c.recurringRate > 0 && (
                    <div className="flex flex-col gap-[2px]">
                      <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Recurring</p>
                      <p className="text-white text-[15px] font-bold">{c.recurringRate}%</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-[2px]">
                    <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Cookie</p>
                    <p className="text-white text-[15px] font-bold">{c.cookieLifeDays}d</p>
                  </div>
                  <div className="flex flex-col gap-[2px]">
                    <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Invites/mo</p>
                    <p className="text-white text-[15px] font-bold">
                      {c.maxInvitesPerMonth ?? '∞'}
                    </p>
                  </div>
                  {c._count && (
                    <div className="flex flex-col gap-[2px]">
                      <p className="text-[#666] text-[11px] uppercase tracking-[0.5px]">Referrals</p>
                      <p className="text-white text-[15px] font-bold">{c._count.referrals}</p>
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex items-center justify-between pt-[4px] border-t border-[rgba(255,255,255,0.05)]">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-[#9e9e9e] text-[13px] font-bold hover:text-white transition-colors"
                  >
                    Edit
                  </button>

                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center gap-[8px]">
                      <span className="text-[#9e9e9e] text-[12px]">Delete?</span>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-[#660000] border border-[#cc0000] text-[#ff2a2a] hover:bg-[#880000] disabled:opacity-50 transition-colors"
                      >
                        {deletingId === c.id ? '...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] text-[#9e9e9e] hover:text-white transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="text-[#9e9e9e] text-[12px] font-bold hover:text-[#ff2a2a] transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {campaigns.length === 0 && (
            <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">No campaigns yet. Create the first one.</p>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-[20px] py-[20px]">
          <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1)] w-full max-w-[540px] max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col gap-[18px]">
              {/* Modal header */}
              <div className="flex items-center justify-between">
                <h2 className="text-[20px] font-bold text-white">
                  {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-[#9e9e9e] hover:text-white text-[24px] leading-none"
                >
                  ×
                </button>
              </div>

              <Field label="Campaign Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Influencer Referral Campaign"
                  className={inputCls}
                />
              </Field>

              <Field label="Description">
                <input
                  type="text"
                  value={form.description ?? ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className={inputCls}
                />
              </Field>

              <Field label="Website URL">
                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                  placeholder="https://teaseme.live"
                  className={inputCls}
                />
              </Field>

              <Field label="Default Referral URL">
                <input
                  type="url"
                  value={form.defaultReferralUrl ?? ''}
                  onChange={e => setForm(f => ({ ...f, defaultReferralUrl: e.target.value }))}
                  placeholder="https://teaseme.live/join"
                  className={inputCls}
                />
              </Field>

              {/* Rates row */}
              <div className="flex gap-[12px]">
                <Field label="Commission %" className="flex-1">
                  <input
                    type="number"
                    min={0} max={100} step={0.1}
                    value={form.commissionRate}
                    onChange={e => setForm(f => ({ ...f, commissionRate: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Upline %" className="flex-1">
                  <input
                    type="number"
                    min={0} max={100} step={0.1}
                    value={form.secondaryRate ?? 0}
                    onChange={e => setForm(f => ({ ...f, secondaryRate: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </Field>
                <div className="flex flex-col gap-[6px] flex-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                      Recurring %
                    </label>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        recurringRate: f.recurringRate == null ? 30 : null,
                      }))}
                      className={`text-[10px] font-bold px-[8px] py-[2px] rounded-full border transition-colors ${
                        form.recurringRate != null
                          ? 'bg-[#ff0f5f]/10 border-[#ff0f5f] text-[#ff0f5f]'
                          : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#555] hover:border-[rgba(255,255,255,0.2)] hover:text-[#9e9e9e]'
                      }`}
                    >
                      {form.recurringRate != null ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0} max={100} step={0.1}
                    value={form.recurringRate ?? ''}
                    placeholder="—"
                    disabled={form.recurringRate == null}
                    onChange={e => setForm(f => ({ ...f, recurringRate: parseFloat(e.target.value) || 0 }))}
                    className={`${inputCls} ${form.recurringRate == null ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              {/* Cookie + Invites row */}
              <div className="flex gap-[12px]">
                <Field label="Cookie Life (days)" className="flex-1">
                  <input
                    type="number"
                    min={1}
                    value={form.cookieLifeDays ?? 90}
                    onChange={e => setForm(f => ({ ...f, cookieLifeDays: parseInt(e.target.value) || 90 }))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Max Invites/Month" className="flex-1">
                  <input
                    type="number"
                    min={0}
                    value={form.maxInvitesPerMonth ?? ''}
                    placeholder="Unlimited"
                    onChange={e => {
                      const v = e.target.value;
                      setForm(f => ({ ...f, maxInvitesPerMonth: v === '' ? null : parseInt(v) }));
                    }}
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* Toggles row */}
              <div className="flex gap-[12px]">
                <Toggle
                  label="Visible to Promoters"
                  value={form.visibleToPromoters ?? true}
                  onChange={v => setForm(f => ({ ...f, visibleToPromoters: v }))}
                />
                <Toggle
                  label="Auto Approve"
                  value={form.autoApprove ?? true}
                  onChange={v => setForm(f => ({ ...f, autoApprove: v }))}
                />
              </div>

              {formError && (
                <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[14px] py-[10px]">
                  <p className="text-[#ff2a2a] text-[13px] font-medium">{formError}</p>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[14px] text-white text-[16px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : editingCampaign ? 'Save Changes' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555] w-full';

const Field = ({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col gap-[6px] ${className}`}>
    <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
      {label}
    </label>
    {children}
  </div>
);

const Toggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex-1 flex items-center justify-between rounded-[8px] px-[14px] py-[12px] border transition-all ${
      value
        ? 'bg-[#ff0f5f]/10 border-[#ff0f5f]'
        : 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]'
    }`}
  >
    <span className={`text-[13px] font-bold ${value ? 'text-white' : 'text-[#9e9e9e]'}`}>
      {label}
    </span>
    <div className={`w-[16px] h-[16px] rounded-full border-2 ${
      value ? 'border-[#ff0f5f] bg-[#ff0f5f]' : 'border-[#555]'
    }`} />
  </button>
);
