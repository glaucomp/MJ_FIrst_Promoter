import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { chattersApi, chatterGroupsApi, modelsApi, type ApiUser } from '../services/api';
import type { ChatterGroup, Chatter } from '../types';

const MAX_CHATTER_GROUP_COMMISSION_PERCENT = 2;

// ── Create / Edit Group Modal ───────────────────────────────────────────────

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (group: ChatterGroup) => void;
  editing?: ChatterGroup | null;
}

const GroupFormModal = ({ isOpen, onClose, onSaved, editing }: GroupFormModalProps) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [pct, setPct] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(editing?.name ?? '');
      setTag(editing?.tag ?? '');
      setPct(editing ? String(editing.commissionPercentage) : '');
      setError('');
    }
  }, [isOpen, editing]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    const pctNum = Number.parseFloat(pct);
    if (Number.isNaN(pctNum) || pctNum < 0 || pctNum > MAX_CHATTER_GROUP_COMMISSION_PERCENT) {
      setError(`Commission percentage must be between 0 and ${MAX_CHATTER_GROUP_COMMISSION_PERCENT}`);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      let group: ChatterGroup;
      const tagValue = tag.trim() || null;
      if (editing) {
        const res = await chatterGroupsApi.update(editing.id, { name: name.trim(), commissionPercentage: pctNum, tag: tagValue });
        group = res.group;
      } else {
        const res = await chatterGroupsApi.create({ name: name.trim(), commissionPercentage: pctNum, tag: tagValue });
        group = res.group;
      }
      onSaved(group);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-6 w-full max-w-110 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{editing ? 'Edit Group' : 'New Chatter Group'}</h2>
          <button onClick={onClose} className="text-[#9e9e9e] hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[#9e9e9e] text-xs font-bold uppercase">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Night Shift Team"
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-base text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[#9e9e9e] text-xs font-bold uppercase">Tag <span className="normal-case font-normal">(optional)</span></label>
          <input
            type="text"
            value={tag}
            onChange={e => setTag(e.target.value)}
            placeholder="e.g. night-shift, vip"
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-md px-4 py-3 text-base text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
          <p className="text-[#9e9e9e] text-xs">A short label to identify or filter this group.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[#9e9e9e] text-xs font-bold uppercase">Commission Percentage (%)</label>
          <input
            type="number"
            min="0"
            max={MAX_CHATTER_GROUP_COMMISSION_PERCENT}
            step="0.1"
            value={pct}
            onChange={e => setPct(e.target.value)}
            placeholder="e.g. 2"
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-base text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
          <p className="text-[#9e9e9e] text-xs">
            This percentage of every sale is split equally among all chatters in the group. Maximum{' '}
            {MAX_CHATTER_GROUP_COMMISSION_PERCENT}%.
          </p>
        </div>

        {error && (
          <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-4 py-3">
            <p className="text-tm-danger-color05 text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-lg px-6 py-4 text-white text-base font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : editing ? 'Save Changes' : 'Create Group'}
        </button>
      </div>
    </div>
  );
};

// ── Edit Chatter Modal ───────────────────────────────────────────────────────

interface EditChatterModalProps {
  chatter: Chatter | null;
  onClose: () => void;
  onSaved: (chatter: Chatter) => void;
}

const EditChatterModal = ({ chatter, onClose, onSaved }: EditChatterModalProps) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (chatter) {
      setFirstName(chatter.firstName ?? '');
      setLastName(chatter.lastName ?? '');
      setError('');
    }
  }, [chatter]);

  const handleSave = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { chatter: updated } = await chattersApi.update(chatter!.id, {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update chatter');
    } finally {
      setIsLoading(false);
    }
  };

  if (!chatter) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.07)] rounded-lg p-6 w-full max-w-md flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Edit Chatter</h2>
          <button onClick={onClose} className="text-[#9e9e9e] hover:text-white text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-3 py-3">
            <p className="text-tm-danger-color05 text-xs font-medium">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[#9e9e9e] text-xs font-bold uppercase">Email</label>
          <p className="bg-[#111] border border-[rgba(255,255,255,0.06)] rounded-lg px-4 py-3 text-sm text-[#9e9e9e] select-all">{chatter.email}</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-[#9e9e9e] text-xs font-bold uppercase">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="First name"
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[#9e9e9e] text-xs font-bold uppercase">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Last name"
              className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-[#9e9e9e] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-lg px-5 py-2.5 text-white text-sm font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Create Chatter Panel (page-level) ───────────────────────────────────────

interface CreateChatterPanelProps {
  onChatterCreated: (chatter: Chatter) => void;
  onChatterUpdated: (chatter: Chatter) => void;
  onChatterDeleted: (id: string) => void;
  allChatters: Chatter[];
}

const CreateChatterPanel = ({ onChatterCreated, onChatterUpdated, onChatterDeleted, allChatters }: CreateChatterPanelProps) => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingChatter, setEditingChatter] = useState<Chatter | null>(null);
  const [deletingChatterId, setDeletingChatterId] = useState<string | null>(null);
  const [confirmDeleteChatterId, setConfirmDeleteChatterId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setIsCreating(true);
    setError('');
    setSuccess('');
    try {
      const { chatter, inviteEmailSent } = await chattersApi.create({
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      onChatterCreated(chatter);
      const name = [chatter.firstName, chatter.lastName].filter(Boolean).join(' ') || chatter.email;
      setSuccess(
        inviteEmailSent
          ? `${name} created — an invite email has been sent. They can now be added to any group.`
          : `${name} created. They can now be added to any group.`,
      );
      setEmail('');
      setFirstName('');
      setLastName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chatter');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteChatter = async (id: string) => {
    setDeletingChatterId(id);
    try {
      await chattersApi.delete(id);
      onChatterDeleted(id);
      setConfirmDeleteChatterId(null);
      setError('');
      setSuccess('Chatter deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chatter');
    } finally {
      setDeletingChatterId(null);
    }
  };

  const handleResendInvite = async (c: Chatter) => {
    setResendingId(c.id);
    setSuccess('');
    setError('');
    try {
      await chattersApi.resendInvite(c.id);
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email;
      setSuccess(`Invite email resent to ${name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite email');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="bg-[#1a1a1c] border border-[rgba(255,255,255,0.07)] rounded-lg p-5 flex flex-col gap-3 mb-6">
      <p className="text-[#9e9e9e] text-xs font-bold uppercase">Create New Chatter</p>

      {success && (
        <div className="bg-[#0d2b1a] border border-[#1a5c35] rounded-lg px-3 py-3">
          <p className="text-tm-success-color05 text-xs font-medium">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-3 py-3">
          <p className="text-tm-danger-color05 text-xs font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full lg:w-40 bg-[#141416] border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-3 text-white text-sm placeholder-[#555] outline-none focus:border-[rgba(255,255,255,0.18)] transition-colors"
        />
        <input
          type="text"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-full lg:w-60 bg-[#141416] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-3 text-white text-sm placeholder-[#555] outline-none focus:border-[rgba(255,255,255,0.18)] transition-colors"
        />
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); setSuccess(''); }}
          placeholder="Email address *"
          className="flex-1 bg-[#141416] lg:min-w-90 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-3 text-white text-sm placeholder-[#555] outline-none focus:border-[#ff0f5f] transition-colors"
        />

        <button
          onClick={handleCreate}
          disabled={isCreating || !email.trim()}
          className="shrink-0 bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-lg px-4 py-3 text-white text-sm font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating…' : '+ Create Chatter'}
        </button>
      </div>

      {/* Edit chatter modal */}
      <EditChatterModal
        chatter={editingChatter}
        onClose={() => setEditingChatter(null)}
        onSaved={c => { onChatterUpdated(c); setSuccess(`${[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email} updated.`); }}
      />

      {/* Existing chatters — horizontal list */}
      {allChatters.length > 0 && (
        <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 flex flex-col gap-3">
          <p className="text-[#9e9e9e] text-xs font-bold uppercase">
            Existing Chatters ({allChatters.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {allChatters.map(c => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email;
              const initials = name
                .split(' ')
                .slice(0, 2)
                .map(w => w[0]?.toUpperCase() ?? '')
                .join('') || name.slice(0, 2).toUpperCase();
              const isDeleting = deletingChatterId === c.id;
              const isResending = resendingId === c.id;
              const confirmingDelete = confirmDeleteChatterId === c.id;
              return (
                <div
                  key={c.id}
                  className="group relative flex-col lg:flex-row flex items-start lg:items-center gap-2 bg-[#141416] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] rounded-2xl px-4 py-3 transition-colors w-full lg:w-auto"
                >
                  <div className="w-7 h-7  rounded-full bg-[#2e2e32] border border-[#3a3a3e] flex items-center justify-center shrink-0">
                    <span className="text-3 font-semibold text-[#aaa] leading-none">{initials}</span>
                  </div>
                  <div className="flex flex-col min-w-0 w-full">
                    <span className="text-white text-sm font-medium leading-tight">{name}</span>
                    <span className="text-[#666] text-xs truncate lg:max-w-[140px] w-full">{c.email}</span>
                  </div>

                  {/* Action buttons — always visible on mobile, fade in on hover for desktop */}
                  <div className="flex items-center gap-1 ml-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity mt-3">
                    {/* Edit */}
                    <button
                      onClick={() => setEditingChatter(c)}
                      title="Edit chatter"
                      className="w-8 h-8 lg:w-6 lg:h-6 p-1 flex items-center justify-center rounded-md text-[#9e9e9e] hover:text-white hover:bg-[#2a2a2e] transition-colors"
                    >
                      <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15H1v-4L11.5 2.5z"/>
                      </svg>
                    </button>
                    {/* Resend invite */}
                    <button
                      onClick={() => handleResendInvite(c)}
                      disabled={isResending}
                      title="Resend welcome email"
                      className="w-8 h-8 lg:w-6 lg:h-6 p-1 flex items-center justify-center rounded-md text-[#9e9e9e] hover:text-white hover:bg-[#2a2a2e] transition-colors disabled:opacity-40"
                    >
                      {isResending
                        ? <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        : <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                            <path d="M1 4l7 5 7-5"/>
                          </svg>
                      }
                    </button>
                    {/* Delete */}
                    {confirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteChatter(c.id)}
                          disabled={isDeleting}
                          className="text-sm font-semibold text-red-400 hover:text-red-300  py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 transition-colors disabled:opacity-50 px-3"
                        >
                          {isDeleting ? '…' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteChatterId(null)}
                          className="text-sm font-semibold text-[#9e9e9e] hover:text-white  py-0.5 rounded bg-[#2a2a2e] transition-colors px-3"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteChatterId(c.id)}
                        title="Delete chatter"
                        className="w-8 h-8 lg:w-6 lg:h-6 p-1 flex items-center justify-center rounded-md text-[#9e9e9e] hover:text-red-400 hover:bg-[#2a2a2e] transition-colors"
                      >
                        <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Inline Member Manager (per-group: add existing chatters) ─────────────────

interface InlineMemberManagerProps {
  group: ChatterGroup;
  allChatters: Chatter[];
  onGroupUpdated: (group: ChatterGroup) => void;
}

const InlineMemberManager = ({ group, allChatters, onGroupUpdated }: InlineMemberManagerProps) => {
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [search, setSearch] = useState('');

  const memberIds = new Set(group.members.map(m => m.chatterId));
  const nonMembers = allChatters.filter(c => !memberIds.has(c.id));

  const chatterName = (c: Chatter) => {
    const parts = [c.firstName, c.lastName].filter(Boolean).join(' ');
    return parts || c.email;
  };

  const filteredNonMembers = nonMembers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return chatterName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const handleAdd = async (chatterId: string) => {
    setIsAdding(chatterId);
    setAddError('');
    try {
      await chatterGroupsApi.addMember(group.id, chatterId);
      const res = await chatterGroupsApi.get(group.id);
      onGroupUpdated(res.group);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsAdding(null);
    }
  };

  return (
    <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 flex flex-col gap-3">
      <p className="text-[#9e9e9e] text-xs font-bold uppercase">
        Add Chatters ({nonMembers.length} available)
      </p>

      {addError && (
        <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-3 py-3">
          <p className="text-tm-danger-color05 text-xs font-medium">{addError}</p>
        </div>
      )}

      <input
        type="text"
        placeholder="Search by name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-[#141416] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-3 text-white text-sm placeholder-[#555] outline-none focus:border-[rgba(255,255,255,0.18)] transition-colors"
      />

      {filteredNonMembers.length === 0 ? (
        <p className="text-[#555] text-sm">
          {search
            ? 'No chatters match search.'
            : nonMembers.length === 0
              ? 'All chatters are already in this group.'
              : 'No results.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filteredNonMembers.map(c => {
            const name = chatterName(c);
            const initials = name
              .split(' ')
              .slice(0, 2)
              .map(w => w[0]?.toUpperCase() ?? '')
              .join('') || name.slice(0, 2).toUpperCase();
            return (
              <button
                key={c.id}
                onClick={() => handleAdd(c.id)}
                disabled={isAdding === c.id}
                title={c.email}
                className="flex items-center gap-2 bg-[#141416] border border-[rgba(255,255,255,0.08)] hover:border-tm-success-color05 rounded-full px-6 py-2 text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="w-7 h-7 rounded-full bg-[#2e2e32] border border-[#3a3a3e] flex items-center justify-center shrink-0">
                  <span className="text-3 font-semibold text-[#aaa] group-hover:text-white transition-colors leading-none">
                    {isAdding === c.id ? '…' : initials}
                  </span>
                </div>
                <span className="font-medium group-hover:text-tm-success-color05 transition-colors">
                  {name}
                </span>
                {isAdding !== c.id && (
                  <span className="text-[#555] text-2xl group-hover:text-tm-success-color05 transition-colors">+</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Link Promoter Modal ─────────────────────────────────────────────────────

interface LinkPromoterModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: ChatterGroup;
  allPromoters: ApiUser[];
  onGroupUpdated: (group: ChatterGroup) => void;
}

const LinkPromoterModal = ({ isOpen, onClose, group, allPromoters, onGroupUpdated }: LinkPromoterModalProps) => {
  const [isLinking, setIsLinking] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const promoterName = (p: ApiUser) => {
    const parts = [p.firstName, p.lastName].filter(Boolean).join(' ');
    return parts || p.email;
  };

  const handleLink = async (promoterId: string) => {
    setIsLinking(promoterId);
    setError('');
    try {
      await chatterGroupsApi.linkPromoter(group.id, promoterId);
      const res = await chatterGroupsApi.get(group.id);
      onGroupUpdated(res.group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link promoter');
    } finally {
      setIsLinking(null);
    }
  };

  const handleUnlink = async () => {
    if (!group.promoter) return;
    setIsUnlinking(true);
    setError('');
    try {
      await chatterGroupsApi.unlinkPromoter(group.id, group.promoter.id);
      const res = await chatterGroupsApi.get(group.id);
      onGroupUpdated(res.group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink promoter');
    } finally {
      setIsUnlinking(false);
    }
  };

  const availablePromoters = allPromoters.filter(p => {
    if (!p.isActive) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(q) || p.email.toLowerCase().includes(q);
  });

  if (!isOpen) return null;

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-6 w-full max-w-130 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Link Promoter — {group.name}</h2>
          <button onClick={handleClose} className="text-[#9e9e9e] hover:text-white text-xl leading-none">×</button>
        </div>

        <p className="text-[#9e9e9e] text-sm">
          A promoter linked to this group will trigger chatter commissions on every sale they generate.
          One promoter can only be linked to one group at a time.
        </p>

        {error && (
          <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-lg px-4 py-3">
            <p className="text-tm-danger-color05 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Currently linked promoter */}
        <div>
          <p className="text-[#9e9e9e] text-xs font-bold uppercase mb-3">
            Currently Linked Promoter
          </p>
          {group.promoter ? (
            <div className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-lg px-4 py-3">
              <div>
                <p className="text-white text-sm font-medium">
                  {[group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.email}
                </p>
                <p className="text-[#9e9e9e] text-xs">{group.promoter.email}</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-tm-danger-color05 text-xs font-bold hover:text-[#ff4444] disabled:opacity-50"
              >
                {isUnlinking ? 'Unlinking...' : 'Unlink'}
              </button>
            </div>
          ) : (
            <p className="text-[#9e9e9e] text-sm">No promoter linked.</p>
          )}
        </div>

        {/* Available promoters */}
        <div className="flex flex-col gap-3">
          <p className="text-[#9e9e9e] text-xs font-bold uppercase">
            {group.promoter ? 'Switch Promoter' : 'Select Promoter'}
          </p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
          {availablePromoters.length === 0 ? (
            <p className="text-[#9e9e9e] text-sm">{search ? 'No promoters match your search.' : 'No promoters available.'}</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-70 overflow-y-auto pr-1">
              {availablePromoters.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.05)] rounded-lg px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{promoterName(p)}</p>
                    <p className="text-[#9e9e9e] text-xs">{p.email}</p>
                  </div>
                  {group.promoter?.id === p.id ? (
                    <span className="text-tm-success-color05 text-xs font-bold">Linked</span>
                  ) : (
                    <button
                      onClick={() => handleLink(p.id)}
                      disabled={isLinking === p.id}
                      className="text-[#ff0f5f] text-xs font-bold hover:text-[#ff4080] disabled:opacity-50"
                    >
                      {isLinking === p.id ? 'Linking...' : 'Link'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleClose}
          className="self-end bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-white text-sm font-bold hover:bg-[#252525] transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ── Chatter Avatar Card ──────────────────────────────────────────────────────

interface ChatterAvatarCardProps {
  member: ChatterGroup['members'][number];
  onRemove?: (chatterId: string) => void;
  isRemoving?: boolean;
}

const ChatterAvatarCard = ({ member, onRemove, isRemoving }: ChatterAvatarCardProps) => {
  const firstName = member.chatter.firstName ?? '';
  const lastName = member.chatter.lastName ?? '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || member.chatter.email.split('@')[0];
  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative flex items-center gap-3 bg-[#202022] border border-[rgba(255,255,255,0.06)] rounded-lg px-4 py-4">
      <div className="w-11 h-11 rounded-full bg-[#2e2e32] border-2 border-[#3a3a3e] flex items-center justify-center shrink-0">
        <span className="text-[#aaa] text-sm font-semibold">{isRemoving ? '…' : initials}</span>
      </div>
      <span className="text-white text-sm font-medium flex-1 truncate">{displayName}</span>
      {onRemove && (
        <button
          onClick={() => onRemove(member.chatterId)}
          disabled={isRemoving}
          title={`Remove ${displayName}`}
          aria-label={`Remove ${displayName} from group`}
          className="absolute top-1 right-2 w-6 h-6 flex items-center justify-center text-tm-danger-color05 lg:text-[#555] hover:text-tm-danger-color05 disabled:opacity-40 transition-colors text-3xl leading-none"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────

type GroupSortBy = 'name' | 'members' | 'commission';

const isGroupSortBy = (value: string): value is GroupSortBy =>
  value === 'name' || value === 'members' || value === 'commission';

export const ChatterGroups = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // ?group=<id> — when navigated here from "Assign Chatters", scroll to and
  // highlight this group so the AM can immediately add chatters.
  const [focusGroupId] = useState(() => searchParams.get('group'));

  const [groups, setGroups] = useState<ChatterGroup[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [promoters, setPromoters] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<GroupSortBy>('name');

  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChatterGroup | null>(null);
  const [expandedMembersId, setExpandedMembersId] = useState<string | null>(null);
  const [removingChatter, setRemovingChatter] = useState<string | null>(null);
  const [linkingGroup, setLinkingGroup] = useState<ChatterGroup | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Ref map: groupId → DOM element, used to scroll into view after load.
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const canManage = user?.baseRole === 'admin' || user?.baseRole === 'account_manager';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [groupsRes, chattersRes, promotersRes] = await Promise.all([
        chatterGroupsApi.list(),
        chattersApi.list(),
        modelsApi.getPromoters(),
      ]);
      setGroups(groupsRes.groups);
      setChatters(chattersRes.chatters);
      setPromoters(promotersRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When a focusGroupId is present and data has loaded, scroll that group card
  // into view, expand its "Add Chatters" panel, and clear the URL param.
  useEffect(() => {
    if (isLoading || !focusGroupId) return;
    const el = groupRefs.current.get(focusGroupId);
    // Auto-expand the Add Chatters panel for the focused group.
    setExpandedMembersId(focusGroupId);
    if (el) {
      const timer = setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('group');
        return next;
      }, { replace: true });
      return () => clearTimeout(timer);
    }
    // Clear the param even if the ref isn't mounted yet.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('group');
      return next;
    }, { replace: true });
  }, [isLoading, focusGroupId, setSearchParams]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await chatterGroupsApi.delete(id);
      setGroups(prev => prev.filter(g => g.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setDeletingId(null);
    }
  };

  const handleGroupSaved = (group: ChatterGroup) => {
    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === group.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = group;
        return next;
      }
      return [group, ...prev];
    });
    setEditingGroup(null);
  };

  const handleGroupUpdated = (group: ChatterGroup) => {
    setGroups(prev => prev.map(g => g.id === group.id ? group : g));
    if (linkingGroup?.id === group.id) setLinkingGroup(group);
  };

  const handleChatterCreated = (chatter: Chatter) => {
    setChatters(prev => [...prev, chatter]);
  };

  const handleChatterUpdated = (chatter: Chatter) => {
    setChatters(prev => prev.map(c => c.id === chatter.id ? chatter : c));
  };

  const handleChatterDeleted = (id: string) => {
    setChatters(prev => prev.filter(c => c.id !== id));
  };

  const handleRemoveMember = async (groupId: string, chatterId: string) => {
    setRemovingChatter(chatterId);
    try {
      await chatterGroupsApi.removeMember(groupId, chatterId);
      const res = await chatterGroupsApi.get(groupId);
      handleGroupUpdated(res.group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingChatter(null);
    }
  };

  const sortedGroups = [...groups].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'members') return b.members.length - a.members.length;
    if (sortBy === 'commission') return b.commissionPercentage - a.commissionPercentage;
    return 0;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="grid lg:grid-cols-2 items-start gap-4">
        <div className='col-span-full'>
          <h1 className="text-3xl leading-9 font-semibold text-white lg:w-full">Chatters</h1>
        </div>

      </div>
      <h2 className="text-xl font-semibold text-white lg:w-full mt-2">Chatter Users</h2>
      {/* Create Chatter — always visible at top for account managers */}
      {canManage && (
        <CreateChatterPanel
          onChatterCreated={handleChatterCreated}
          onChatterUpdated={handleChatterUpdated}
          onChatterDeleted={handleChatterDeleted}
          allChatters={chatters}
        />
      )}

      {error && (
        <div className="bg-tm-danger-color12 border border-tm-danger-color09 rounded-md px-4 py-3">
          <p className="text-tm-danger-color05 text-sm font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#ff0f5f] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-lg p-8 text-center mt-4">
          <p className="text-[#9e9e9e] text-base">No chatter groups yet.</p>
          {canManage && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => { setEditingGroup(null); setIsGroupFormOpen(true); }}
                className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-lg px-5 py-2.5 text-white text-sm font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
              >
                + New Group
              </button>
            </div>
          )}
        </div>
      ) : (

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-white lg:w-full">Chatter Groups</h2>
          <p className="text-[#9e9e9e] text-sm lg:text-base mt-1">
            {groups.length} group{groups.length !== 1 ? 's' : ''} — commissions split equally among group members
          </p>
          <div className="grid grid-cols-2 items-center gap-3 w-full lg:col-start-2 lg:self-end lg:max-w-lg">
            {/* Sort dropdown */}
            <div className="flex items-start gap-2 flex-col w-full">
              <label htmlFor="chatter-groups-sort-by" className="text-[#9e9e9e] text-sm">
                Sort By
              </label>
              <select
                id="chatter-groups-sort-by"
                value={sortBy}
                onChange={e => {
                  const nextSortBy = e.target.value;
                  if (isGroupSortBy(nextSortBy)) {
                    setSortBy(nextSortBy);
                  }
                }}
                className="bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#ff0f5f] appearance-none cursor-pointer pr-7 w-full"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239e9e9e' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
              >
                <option value="name">Name</option>
                <option value="members">Members</option>
                <option value="commission">Commission</option>
              </select>
            </div>
            {canManage && (
              <button
                onClick={() => { setEditingGroup(null); setIsGroupFormOpen(true); }}
                className="w-full self-end bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-lg px-4 py-3 text-white text-sm font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
              >
                + New Group
              </button>
            )}
          </div>
          {sortedGroups.map(group => (
            <div
              key={group.id}
              ref={(el) => {
                if (el) groupRefs.current.set(group.id, el);
                else groupRefs.current.delete(group.id);
              }}
              className={[
                "bg-[#1a1a1c] border rounded-2xl flex flex-col overflow-hidden transition-all duration-500",
                group.id === focusGroupId
                  ? "border-[#ff0f5f] shadow-[0_0_0_2px_rgba(255,15,95,0.25)]"
                  : "border-[rgba(255,255,255,0.07)]",
              ].join(' ')}
            >
              {/* Card header — static */}
              <div className="p-7 flex flex-col-reverse lg:flex-row lg:items-start justify-between gap-4">
                {/* Left: avatar + name + tag */}
                <div className="flex items-center gap-4 min-w-0">
                  {(() => {
                    const promoterName = group.promoter
                      ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') ||
                      group.promoter.username ||
                      group.promoter.email ||
                      group.name
                      : group.name;
                    const initials =
                      promoterName
                        .split(' ')
                        .slice(0, 2)
                        .map(w => w[0]?.toUpperCase() ?? '')
                        .join('') || group.name.slice(0, 2).toUpperCase();
                    return (
                      <div className="w-14 h-14 rounded-full bg-linear-to-br from-[#ff0f5f] to-[#cc0047] flex items-center justify-center shrink-0 overflow-hidden border border-[rgba(255,255,255,0.08)]">
                        {group.promoter?.photoUrl ? (
                          <img src={group.promoter.photoUrl} alt={promoterName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-base font-bold leading-none">{initials}</span>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-2 min-w-0">
                    <h3 className="text-white text-xl lg:text-2xl truncate">{group.name}</h3>
                    {group.tag && (
                      <span className="self-start px-3 py-1 rounded-full text-xs font-semibold text-tm-primary-color05 border border-tm-primary-color05 bg-tm-primary-color12">
                        {group.tag}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: referral bonus + admin actions */}
                <div className="flex flex-row justify-between gap-4">
                  <div className="flex items-baseline gap-1 self-end">
                    <span className="text-[#9e9e9e] text-base">Referral Bonus</span>
                    <span className="text-white text-sm font-bold">{group.commissionPercentage}%</span>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { setEditingGroup(group); setIsGroupFormOpen(true); }}
                        className="text-[#9e9e9e] text-sm lg:text-base hover:text-white hover:-translate-y-0.5 transition-all"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === group.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[#555] text-sm lg:text-base">Delete?</span>
                          <button
                            onClick={() => void handleDelete(group.id)}
                            disabled={deletingId === group.id}
                            className="text-tm-danger-color05 text-sm lg:text-base font-bold hover:text-[#ff4444] disabled:opacity-50"
                          >
                            {deletingId === group.id ? '...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[#555] text-sm lg:text-base font-bold hover:text-[#9e9e9e]"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(group.id)}
                          className="text-tm-danger-color04 text-sm lg:text-base hover:text-tm-danger-color05 hover:-translate-y-0.5 transition-all"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div className="px-7 pb-6 flex flex-col gap-4">
                {/* Team Members section */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col items-start lg:items-center justify-start gap-2 lg:gap-6 lg:flex-row">
                    <p className="text-[#9e9e9e] text-base font-semibold">Team Members</p>
                    {canManage && (
                      <button
                        onClick={() => setExpandedMembersId(prev => prev === group.id ? null : group.id)}
                        className="bg-tm-neutral-color05 px-4 py-2 text-tm-text-color08 hover:text-tm-text-color10 text-base transition-colors rounded-lg mb-2"
                      >
                        {expandedMembersId === group.id
                          ? 'Done'
                          : group.members.length === 0
                            ? '+ Add Chatters'
                            : 'Manage Chatters'}
                      </button>
                    )}
                  </div>
                  {group.members.length === 0 ? (
                    <p className="text-[#555] text-base">No chatters assigned yet.</p>
                  ) : (
                    <div className="grid lg:grid-cols-3 gap-3">
                      {group.members.map(m => (
                        <ChatterAvatarCard
                          key={m.id}
                          member={m}
                          onRemove={canManage ? (chatterId) => void handleRemoveMember(group.id, chatterId) : undefined}
                          isRemoving={removingChatter === m.chatterId}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline chatter manager — account managers only */}
                {canManage && expandedMembersId === group.id && (
                  <InlineMemberManager
                    group={group}
                    allChatters={chatters}
                    onGroupUpdated={handleGroupUpdated}
                  />
                )}
              </div>

              {/* Linked Promoter — subtle footer row */}
              <div className="flex flex-row items-center justify-between gap-4 px-7 py-4 border-t border-[rgba(255,255,255,0.04)] bg-tm-neutral-color09 flex-wrap">
                <div className="flex flex-col items-start gap-2">
                  <span className="text-tm-text-color08 text-sm font-semibold uppercase">Linked Promoter</span>
                  <span className="text-tm-text-color01 text-base">
                    {group.promoter
                      ? [group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.email
                      : 'None'}
                  </span>
                </div>
                {canManage && (
                  <button
                    onClick={() => setLinkingGroup(group)}
                    className="text-tm-primary-color05 hover:text-tm-text-color01 text-base font-semibold border border-tm-text-color12 py-1 px-4 rounded-xl transition-colors"
                  >
                    {group.promoter ? 'Change' : 'Link'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Form Modal */}
      <GroupFormModal
        isOpen={isGroupFormOpen}
        onClose={() => { setIsGroupFormOpen(false); setEditingGroup(null); }}
        onSaved={handleGroupSaved}
        editing={editingGroup}
      />

      {/* Link Promoter Modal */}
      {linkingGroup && (
        <LinkPromoterModal
          isOpen={!!linkingGroup}
          onClose={() => setLinkingGroup(null)}
          group={linkingGroup}
          allPromoters={promoters}
          onGroupUpdated={handleGroupUpdated}
        />
      )}
    </div>
  );
};
