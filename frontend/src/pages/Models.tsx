import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { modelsApi, type ApiUser, type Referral, type TrackingLink } from '../services/api';
import { InviteModal } from '../components/InviteModal';
import { CreateUserModal } from '../components/CreateUserModal';

const SessionExpiredBanner = ({ onLogout }: { onLogout: () => void }) => (
  <div className="bg-[#660000] border border-[#cc0000] rounded-[8px] p-[16px] flex flex-col gap-[12px]">
    <p className="text-[#ff2a2a] text-[14px] font-bold">Session expired</p>
    <p className="text-[#ff8080] text-[13px]">
      Your login session is no longer valid. This usually happens after the server restarts.
      Please log out and log back in to continue.
    </p>
    <button
      onClick={onLogout}
      className="self-start bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
    >
      Log out &amp; log back in
    </button>
  </div>
);

export const Models = () => {
  const { user, logout } = useAuth();
  const [allUsers, setAllUsers] = useState<ApiUser[]>([]);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'referral' | 'tracking'>('referral');
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user?.baseRole, user?.role]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (user?.baseRole === 'admin') {
        const users = await modelsApi.getAllUsers();
        // Exclude admin accounts from the list
        setAllUsers(users.filter(u => u.userType?.toLowerCase() !== 'admin'));
      } else if (
        user?.baseRole === 'account_manager' ||
        (user?.baseRole === 'team_manager' && user?.role === 'team_manager')
      ) {
        const referrals = await modelsApi.getMyReferrals();
        setMyReferrals(referrals);
      } else if (user?.baseRole === 'promoter') {
        const links = await modelsApi.getMyTrackingLinks();
        setTrackingLinks(links);
      }
      // team_manager in promoter mode: no list data needed
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      await modelsApi.deleteUser(userId);
      setAllUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleOpenInviteModal = (type: 'referral' | 'tracking') => {
    setModalType(type);
    setIsInviteModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsInviteModalOpen(false);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">Models</h1>
        <p className="text-[16px] text-[#9e9e9e]">Loading...</p>
      </div>
    );
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  if (user?.baseRole === 'admin') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-col lg:flex-row gap-3">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">All Users</h1>
          <div className="flex items-center  justify-between lg:justify-end lg:gap-4 w-full">
            <p className="text-[16px] text-[#9e9e9e]">{allUsers.length} total</p>
            <button
              onClick={() => setIsCreateUserModalOpen(true)}
              className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
            >
              + Create User
            </button>
          </div>
        </div>

        {error === 'SESSION_EXPIRED' ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-[12px]">
          {allUsers.map((apiUser) => (
            <div
              key={apiUser.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between gap-[12px] flex-col lg:flex-row">
                <div className="flex flex-col gap-[8px] w-full">
                  <p className="text-white text-[18px] font-semibold">
                    {apiUser.firstName} {apiUser.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">{apiUser.email}</p>
                  <div className="flex items-center gap-[8px] w-full">
                    <span
                      className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                        apiUser.isActive
                          ? 'bg-[#006622] border-[#00d948] text-[#28ff70]'
                          : 'bg-[#660000] border-[#cc0000] text-[#ff2a2a]'
                      }`}
                    >
                      {apiUser.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]">
                      {apiUser.userType?.toLowerCase().replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-start lg:items-end gap-[8px] w-full">
                  {apiUser.stats && (
                    <div className="text-left flex flex-col gap-[4px] w-full lg:text-right">
                      <p className="text-[#9e9e9e] text-[12px] uppercase">Earnings</p>
                      <p className="text-white text-[20px] font-bold">
                        ${apiUser.stats.totalEarnings.toFixed(2)}
                      </p>
                      <p className="text-[#9e9e9e] text-[12px]">
                        {apiUser.stats.activeReferrals} active referrals
                      </p>
                    </div>
                  )}

                  {confirmDeleteId === apiUser.id ? (
                    <div className="flex items-center gap-[8px] mt-[4px]">
                      <span className="text-[#9e9e9e] text-[12px]">Delete?</span>
                      <button
                        onClick={() => handleDeleteUser(apiUser.id)}
                        disabled={deletingUserId === apiUser.id}
                        className="px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold bg-[#660000] border border-[#cc0000] text-[#ff2a2a] hover:bg-[#880000] disabled:opacity-50 transition-colors"
                      >
                        {deletingUserId === apiUser.id ? '...' : 'Yes'}
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
                      onClick={() => setConfirmDeleteId(apiUser.id)}
                      className="text-tm-danger-color02  opacity-80 text-[12px] font-bold transition-colors mt-[4px] hover:text-tm-danger-color05"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {allUsers.length === 0 && (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">No users found.</p>
            </div>
          )}
        </div>

        <CreateUserModal
          isOpen={isCreateUserModalOpen}
          onClose={() => setIsCreateUserModalOpen(false)}
          onCreated={(newUser) => {
            setAllUsers(prev => [newUser, ...prev]);
          }}
        />
      </div>
    );
  }

  // ── ACCOUNT MANAGER ───────────────────────────────────────────────────────
  if (user?.baseRole === 'account_manager') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">My Promoters</h1>
          <button
            onClick={() => handleOpenInviteModal('referral')}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Referral Link
          </button>
        </div>

        {error === 'SESSION_EXPIRED' ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <p className="text-[14px] text-[#9e9e9e]">{myReferrals.length} total referrals</p>

        <ReferralList referrals={myReferrals} />

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type={modalType}
          userRole="account_manager"
        />
      </div>
    );
  }

  // ── TEAM MANAGER → acting as PROMOTER ─────────────────────────────────────
  if (user?.baseRole === 'team_manager' && user?.role === 'promoter') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">Referral Link</h1>
        </div>

        <p className="text-[14px] text-[#9e9e9e]">
          Generate a referral link to invite new promoters to your campaign.
        </p>

        <button
          onClick={() => handleOpenInviteModal('referral')}
          className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[14px] text-white text-[16px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all w-full"
        >
          + Create Referral Link
        </button>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type="referral"
          userRole="promoter"
        />
      </div>
    );
  }

  // ── TEAM MANAGER → acting as TEAM MANAGER ────────────────────────────────
  if (user?.baseRole === 'team_manager' && user?.role === 'team_manager') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">My Team</h1>
          <button
            onClick={() => handleOpenInviteModal('referral')}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Referral Link
          </button>
        </div>

        {error === 'SESSION_EXPIRED' ? (
          <SessionExpiredBanner onLogout={logout} />
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold">{error}</p>
          </div>
        ) : null}

        <p className="text-[14px] text-[#9e9e9e]">{myReferrals.length} total referrals</p>

        <ReferralList referrals={myReferrals} />

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type="referral"
          userRole="team_manager"
        />
      </div>
    );
  }

  // ── PURE PROMOTER ─────────────────────────────────────────────────────────
  if (user?.baseRole === 'promoter') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">My Tracking Links</h1>
          <button
            onClick={() => handleOpenInviteModal('tracking')}
            className="bg-linear-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Create Link
          </button>
        </div>

        <p className="text-[14px] text-[#9e9e9e]">
          Share these links to earn commissions from customer purchases
        </p>

        <div className="flex flex-col gap-[12px]">
          {trackingLinks.map((link) => (
            <div
              key={link.id}
              className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-[4px]">
                    <p className="text-white text-[16px] font-semibold">{link.campaign.name}</p>
                    <p className="text-[#9e9e9e] text-[12px]">
                      Code: <span className="font-mono text-white">{link.shortCode}</span>
                    </p>
                  </div>
                  <div className="text-right flex flex-col gap-[4px] w-full">
                    <p className="text-[#9e9e9e] text-[12px] uppercase">Clicks</p>
                    <p className="text-white text-[20px] font-bold">{link.clicks}</p>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] flex items-center justify-between gap-[8px]">
                  <p className="text-[#9e9e9e] text-[12px] break-all font-mono flex-1">
                    {link.fullUrl}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(link.fullUrl)}
                    className="text-[#ff0f5f] text-[12px] font-bold hover:text-[#ff1f69] transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>

                <p className="text-[#9e9e9e] text-[12px]">
                  Created {new Date(link.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}

          {trackingLinks.length === 0 && (
            <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">
                No tracking links yet. Create your first link to start earning commissions.
              </p>
            </div>
          )}
        </div>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type={modalType}
          userRole="promoter"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-[36px] font-semibold text-white lg:w-full">Models</h1>
      <p className="text-[#9e9e9e] text-[16px]">Access denied</p>
    </div>
  );
};

// ── Shared Referral List component ────────────────────────────────────────────
const ReferralList = ({ referrals }: { referrals: Referral[] }) => {
  if (referrals.length === 0) {
    return (
      <div className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
        <p className="text-[#9e9e9e] text-[16px]">
          No referrals yet. Create a referral link to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      {referrals.map((referral) => (
        <div
          key={referral.id}
          className="bg-linear-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-[8px] w-full">
              {referral.referredUser ? (
                <>
                  <p className="text-white text-[18px] font-semibold">
                    {referral.referredUser.firstName} {referral.referredUser.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">{referral.referredUser.email}</p>
                </>
              ) : (
                <>
                  <p className="text-white text-[18px] font-semibold">
                    Invite Code: {referral.inviteCode}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">Pending — not yet accepted</p>
                </>
              )}
              <div className="flex items-center gap-[8px]">
                <span
                  className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                    referral.status === 'ACTIVE'
                      ? 'bg-[#006622] border-[#00d948] text-[#28ff70]'
                      : referral.status === 'PENDING'
                      ? 'bg-[#664400] border-[#cc8800] text-[#ffaa00]'
                      : referral.status === 'INACTIVE'
                      ? 'bg-[#1a1a1a] border-[rgba(255,255,255,0.1)] text-[#9e9e9e]'
                      : 'bg-[#660000] border-[#cc0000] text-[#ff2a2a]'
                  }`}
                >
                  {referral.status}
                </span>
                <span className="text-[#9e9e9e] text-[12px]">{referral.campaign.name}</span>
              </div>
            </div>
            <div className="text-right flex flex-col gap-[4px] w-full">
              <p className="text-[#9e9e9e] text-[12px] uppercase">Level</p>
              <p className="text-white text-[20px] font-bold">{referral.level}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
