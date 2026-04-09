import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { chattersApi, chatterGroupsApi, modelsApi, type ApiUser } from '../services/api';
import type { ChatterGroup, Chatter } from '../types';

// ── Create / Edit Group Modal ───────────────────────────────────────────────

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (group: ChatterGroup) => void;
  editing?: ChatterGroup | null;
}

const GroupFormModal = ({ isOpen, onClose, onSaved, editing }: GroupFormModalProps) => {
  const [name, setName] = useState('');
  const [pct, setPct] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(editing?.name ?? '');
      setPct(editing ? String(editing.commissionPercentage) : '');
      setError('');
    }
  }, [isOpen, editing]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    const pctNum = Number.parseFloat(pct);
    if (Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      setError('Commission percentage must be between 0 and 100');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      let group: ChatterGroup;
      if (editing) {
        const res = await chatterGroupsApi.update(editing.id, { name: name.trim(), commissionPercentage: pctNum });
        group = res.group;
      } else {
        const res = await chatterGroupsApi.create({ name: name.trim(), commissionPercentage: pctNum });
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
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] w-full max-w-[440px] flex flex-col gap-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-white">{editing ? 'Edit Group' : 'New Chatter Group'}</h2>
          <button onClick={onClose} className="text-[#9e9e9e] hover:text-white text-[24px] leading-none">×</button>
        </div>

        <div className="flex flex-col gap-[8px]">
          <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">Group Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Night Shift Team"
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
        </div>

        <div className="flex flex-col gap-[8px]">
          <label className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">Commission Percentage (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={pct}
            onChange={e => setPct(e.target.value)}
            placeholder="e.g. 10"
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[11px] text-[15px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
          <p className="text-[#9e9e9e] text-[12px]">
            This percentage of every sale is split equally among all chatters in the group.
          </p>
        </div>

        {error && (
          <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
            <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[24px] py-[13px] text-white text-[15px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : editing ? 'Save Changes' : 'Create Group'}
        </button>
      </div>
    </div>
  );
};

// ── Manage Members Modal ────────────────────────────────────────────────────

interface ManageMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: ChatterGroup;
  allChatters: Chatter[];
  onGroupUpdated: (group: ChatterGroup) => void;
}

const ManageMembersModal = ({ isOpen, onClose, group, allChatters, onGroupUpdated }: ManageMembersModalProps) => {
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const memberIds = new Set(group.members.map(m => m.chatterId));
  const nonMembers = allChatters.filter(c => !memberIds.has(c.id));

  const handleAdd = async (chatterId: string) => {
    setIsAdding(chatterId);
    setError('');
    try {
      await chatterGroupsApi.addMember(group.id, chatterId);
      const res = await chatterGroupsApi.get(group.id);
      onGroupUpdated(res.group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsAdding(null);
    }
  };

  const handleRemove = async (chatterId: string) => {
    setIsRemoving(chatterId);
    setError('');
    try {
      await chatterGroupsApi.removeMember(group.id, chatterId);
      const res = await chatterGroupsApi.get(group.id);
      onGroupUpdated(res.group);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setIsRemoving(null);
    }
  };

  const chatterName = (c: Chatter | { email: string; firstName: string | null; lastName: string | null }) => {
    const parts = [c.firstName, c.lastName].filter(Boolean).join(' ');
    return parts || c.email;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] w-full max-w-[520px] flex flex-col gap-[20px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-white">Manage Members — {group.name}</h2>
          <button onClick={onClose} className="text-[#9e9e9e] hover:text-white text-[24px] leading-none">×</button>
        </div>

        {error && (
          <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
            <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
          </div>
        )}

        {/* Current members */}
        <div>
          <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px] mb-[10px]">
            Current Members ({group.members.length})
          </p>
          {group.members.length === 0 ? (
            <p className="text-[#9e9e9e] text-[14px]">No chatters in this group yet.</p>
          ) : (
            <div className="flex flex-col gap-[8px]">
              {group.members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[14px] py-[10px]">
                  <div>
                    <p className="text-white text-[14px] font-medium">{chatterName(m.chatter)}</p>
                    <p className="text-[#9e9e9e] text-[12px]">{m.chatter.email}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(m.chatterId)}
                    disabled={isRemoving === m.chatterId}
                    className="text-[#ff2a2a] text-[12px] font-bold hover:text-[#ff4444] disabled:opacity-50"
                  >
                    {isRemoving === m.chatterId ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available chatters to add */}
        {nonMembers.length > 0 && (
          <div>
            <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px] mb-[10px]">
              Add Chatter
            </p>
            <div className="flex flex-col gap-[8px]">
              {nonMembers.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.05)] rounded-[8px] px-[14px] py-[10px]">
                  <div>
                    <p className="text-white text-[14px] font-medium">{chatterName(c)}</p>
                    <p className="text-[#9e9e9e] text-[12px]">{c.email}</p>
                  </div>
                  <button
                    onClick={() => handleAdd(c.id)}
                    disabled={isAdding === c.id}
                    className="text-[#28ff70] text-[12px] font-bold hover:text-[#00d948] disabled:opacity-50"
                  >
                    {isAdding === c.id ? 'Adding...' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="self-end bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:bg-[#252525] transition-all"
        >
          Close
        </button>
      </div>
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
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] w-full max-w-[520px] flex flex-col gap-[20px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-bold text-white">Link Promoter — {group.name}</h2>
          <button onClick={handleClose} className="text-[#9e9e9e] hover:text-white text-[24px] leading-none">×</button>
        </div>

        <p className="text-[#9e9e9e] text-[13px]">
          A promoter linked to this group will trigger chatter commissions on every sale they generate.
          One promoter can only be linked to one group at a time.
        </p>

        {error && (
          <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
            <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
          </div>
        )}

        {/* Currently linked promoter */}
        <div>
          <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px] mb-[10px]">
            Currently Linked Promoter
          </p>
          {group.promoter ? (
            <div className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] rounded-[8px] px-[14px] py-[10px]">
              <div>
                <p className="text-white text-[14px] font-medium">
                  {[group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.email}
                </p>
                <p className="text-[#9e9e9e] text-[12px]">{group.promoter.email}</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-[#ff2a2a] text-[12px] font-bold hover:text-[#ff4444] disabled:opacity-50"
              >
                {isUnlinking ? 'Unlinking...' : 'Unlink'}
              </button>
            </div>
          ) : (
            <p className="text-[#9e9e9e] text-[14px]">No promoter linked.</p>
          )}
        </div>

        {/* Available promoters */}
        <div className="flex flex-col gap-[10px]">
          <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
            {group.promoter ? 'Switch Promoter' : 'Select Promoter'}
          </p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[14px] py-[9px] text-[14px] text-white focus:outline-none focus:border-[#ff0f5f] placeholder-[#555]"
          />
          {availablePromoters.length === 0 ? (
            <p className="text-[#9e9e9e] text-[14px]">{search ? 'No promoters match your search.' : 'No promoters available.'}</p>
          ) : (
            <div className="flex flex-col gap-[8px] max-h-[280px] overflow-y-auto pr-[2px]">
              {availablePromoters.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-[#1a1a1a] border border-[rgba(255,255,255,0.05)] rounded-[8px] px-[14px] py-[10px]">
                  <div>
                    <p className="text-white text-[14px] font-medium">{promoterName(p)}</p>
                    <p className="text-[#9e9e9e] text-[12px]">{p.email}</p>
                  </div>
                  {group.promoter?.id === p.id ? (
                    <span className="text-[#28ff70] text-[12px] font-bold">Linked</span>
                  ) : (
                    <button
                      onClick={() => handleLink(p.id)}
                      disabled={isLinking === p.id}
                      className="text-[#ff0f5f] text-[12px] font-bold hover:text-[#ff4080] disabled:opacity-50"
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
          className="self-end bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:bg-[#252525] transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ── Main Page ───────────────────────────────────────────────────────────────

export const ChatterGroups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatterGroup[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [promoters, setPromoters] = useState<ApiUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isGroupFormOpen, setIsGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ChatterGroup | null>(null);
  const [managingGroup, setManagingGroup] = useState<ChatterGroup | null>(null);
  const [linkingGroup, setLinkingGroup] = useState<ChatterGroup | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canManage = user?.baseRole === 'admin' || user?.baseRole === 'account_manager';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [groupsRes, chattersRes, usersRes] = await Promise.all([
        chatterGroupsApi.list(),
        chattersApi.list(),
        modelsApi.getAllUsers(),
      ]);
      setGroups(groupsRes.groups);
      setChatters(chattersRes.chatters);
      // Include promoters and team managers — both can generate sales and be linked to a chatter group
      setPromoters(
        usersRes.filter(u => {
          const t = u.userType?.toLowerCase();
          return t === 'promoter' || t === 'team_manager';
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    // Keep modal open with updated data
    if (managingGroup?.id === group.id) setManagingGroup(group);
    if (linkingGroup?.id === group.id) setLinkingGroup(group);
  };

  return (
    <div className="flex flex-col gap-[24px] p-[24px] max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-white leading-[1.3]">Chatter Groups</h1>
          <p className="text-[#9e9e9e] text-[14px] mt-[4px]">
            {groups.length} group{groups.length !== 1 ? 's' : ''} — commissions split equally among group members
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setEditingGroup(null); setIsGroupFormOpen(true); }}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + New Group
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] px-[16px] py-[12px]">
          <p className="text-[#ff2a2a] text-[14px] font-medium">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-[48px]">
          <div className="w-[32px] h-[32px] border-2 border-[#ff0f5f] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[32px] text-center">
          <p className="text-[#9e9e9e] text-[16px]">No chatter groups yet.</p>
          {canManage && (
            <p className="text-[#9e9e9e] text-[14px] mt-[8px]">
              Click <span className="text-white font-semibold">+ New Group</span> to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {groups.map(group => (
            <div
              key={group.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[20px] flex flex-col gap-[16px]"
            >
              {/* Group header row */}
              <div className="flex items-start justify-between gap-[16px]">
                <div className="flex flex-col gap-[4px]">
                  <h3 className="text-white text-[18px] font-bold">{group.name}</h3>
                  <p className="text-[#9e9e9e] text-[13px]">
                    Commission: <span className="text-white font-semibold">{group.commissionPercentage}%</span>
                    {group.members.length > 0 && (
                      <> · Per chatter: <span className="text-white font-semibold">
                        {(group.commissionPercentage / group.members.length).toFixed(2)}%
                      </span></>
                    )}
                  </p>
                </div>

                {canManage && (
                  <div className="flex items-center gap-[8px] flex-shrink-0">
                    <button
                      onClick={() => { setEditingGroup(group); setIsGroupFormOpen(true); }}
                      className="text-[#9e9e9e] hover:text-white text-[13px] font-medium transition-colors"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === group.id ? (
                      <div className="flex items-center gap-[6px]">
                        <span className="text-[#9e9e9e] text-[12px]">Delete group?</span>
                        <button
                          onClick={() => handleDelete(group.id)}
                          disabled={deletingId === group.id}
                          className="text-[#ff2a2a] text-[12px] font-bold hover:text-[#ff4444] disabled:opacity-50"
                        >
                          {deletingId === group.id ? '...' : 'Yes'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[#9e9e9e] text-[12px] font-bold hover:text-white"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(group.id)}
                        className="text-[#9e9e9e] hover:text-[#ff2a2a] text-[13px] transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-[rgba(255,255,255,0.05)]" />

              {/* Chatters + Promoter row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                {/* Chatters column */}
                <div className="flex flex-col gap-[8px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                      Chatters ({group.members.length})
                    </p>
                    {canManage && (
                      <button
                        onClick={() => setManagingGroup(group)}
                        className="text-[#ff0f5f] text-[12px] font-bold hover:text-[#ff4080]"
                      >
                        Manage
                      </button>
                    )}
                  </div>
                  {group.members.length === 0 ? (
                    <p className="text-[#9e9e9e] text-[13px]">No chatters assigned.</p>
                  ) : (
                    <div className="flex flex-wrap gap-[6px]">
                      {group.members.slice(0, 5).map(m => (
                        <span
                          key={m.id}
                          className="px-[8px] py-[3px] rounded-[100px] text-[11px] font-medium border border-[rgba(255,255,255,0.1)] text-[#ccc]"
                        >
                          {[m.chatter.firstName, m.chatter.lastName].filter(Boolean).join(' ') || m.chatter.email}
                        </span>
                      ))}
                      {group.members.length > 5 && (
                        <span className="px-[8px] py-[3px] rounded-[100px] text-[11px] font-medium border border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                          +{group.members.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Linked Promoter column */}
                <div className="flex flex-col gap-[8px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[#9e9e9e] text-[12px] font-bold uppercase tracking-[0.2px]">
                      Linked Promoter
                    </p>
                    {canManage && (
                      <button
                        onClick={() => setLinkingGroup(group)}
                        className="text-[#ff0f5f] text-[12px] font-bold hover:text-[#ff4080]"
                      >
                        {group.promoter ? 'Change' : 'Link'}
                      </button>
                    )}
                  </div>
                  {group.promoter ? (
                    <div className="flex flex-col gap-[2px]">
                      <p className="text-white text-[14px] font-medium">
                        {[group.promoter.firstName, group.promoter.lastName].filter(Boolean).join(' ') || group.promoter.email}
                      </p>
                      <p className="text-[#9e9e9e] text-[12px]">{group.promoter.email}</p>
                    </div>
                  ) : (
                    <p className="text-[#9e9e9e] text-[13px]">No promoter linked.</p>
                  )}
                </div>
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

      {/* Manage Members Modal */}
      {managingGroup && (
        <ManageMembersModal
          isOpen={!!managingGroup}
          onClose={() => setManagingGroup(null)}
          group={managingGroup}
          allChatters={chatters}
          onGroupUpdated={handleGroupUpdated}
        />
      )}

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
