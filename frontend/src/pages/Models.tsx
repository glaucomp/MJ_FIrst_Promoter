import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { modelsApi, type ApiUser, type Referral, type TrackingLink } from '../services/api';
import { InviteModal } from '../components/InviteModal';

export const Models = () => {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState<ApiUser[]>([]);
  const [myReferrals, setMyReferrals] = useState<Referral[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'referral' | 'tracking'>('referral');

  useEffect(() => {
    loadData();
  }, [user?.baseRole]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (user?.baseRole === 'admin') {
        console.log('Fetching all users...');
        const users = await modelsApi.getAllUsers();
        console.log('Users fetched:', users);
        setAllUsers(users);
      } else if (user?.baseRole === 'account_manager' || user?.baseRole === 'team_manager') {
        console.log('Fetching my referrals...');
        const referrals = await modelsApi.getMyReferrals();
        console.log('Referrals fetched:', referrals);
        setMyReferrals(referrals);
      } else if (user?.baseRole === 'promoter') {
        console.log('Fetching tracking links...');
        const links = await modelsApi.getMyTrackingLinks();
        console.log('Tracking links fetched:', links);
        setTrackingLinks(links);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      console.error('Error details:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
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
      <div className="flex flex-col gap-[24px]">
        <h1 className="text-[28px] leading-[36px] font-semibold text-white">Models</h1>
        <p className="text-[16px] text-[#9e9e9e]">Loading...</p>
      </div>
    );
  }

  if (user?.baseRole === 'admin') {
    return (
      <div className="flex flex-col gap-[24px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white">All Users</h1>
          <p className="text-[16px] text-[#9e9e9e]">{allUsers.length} total</p>
        </div>

        <div className="flex flex-col gap-[12px]">
          {allUsers.map((apiUser) => (
            <div
              key={apiUser.id}
              className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-[8px]">
                  <p className="text-white text-[18px] font-semibold">
                    {apiUser.firstName} {apiUser.lastName}
                  </p>
                  <p className="text-[#9e9e9e] text-[14px]">{apiUser.email}</p>
                  <div className="flex items-center gap-[8px]">
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
                      {apiUser.userType}
                    </span>
                  </div>
                </div>
                {apiUser.stats && (
                  <div className="text-right flex flex-col gap-[4px]">
                    <p className="text-[#9e9e9e] text-[12px] uppercase">Earnings</p>
                    <p className="text-white text-[20px] font-bold">
                      ${apiUser.stats.totalEarnings.toFixed(2)}
                    </p>
                    <p className="text-[#9e9e9e] text-[12px]">
                      {apiUser.stats.activeReferrals} active referrals
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (user?.baseRole === 'account_manager' || user?.baseRole === 'team_manager') {
    return (
      <div className="flex flex-col gap-[24px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white">
            {user.baseRole === 'account_manager' ? 'My Promoters' : 'My Team'}
          </h1>
          <button
            onClick={() => handleOpenInviteModal('referral')}
            className="bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
          >
            + Invite Promoter
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-[16px]">
            <p className="text-red-400 text-[14px] font-semibold mb-2">❌ Error: {error}</p>
            {error.includes('401') && (
              <div className="text-[#9e9e9e] text-[13px] mt-2 space-y-1">
                <p>🔒 Your authentication token is invalid or expired.</p>
                <p className="mt-1">👉 Click the logout button (🚪) in the top right corner</p>
                <p>👉 Then login again with your backend API credentials</p>
                <div className="mt-3 bg-black/30 p-2 rounded text-[11px] font-mono">
                  <p>Logged in as: {user?.email}</p>
                  <p>Role: {user?.baseRole}</p>
                  <p>User ID: {user?.id}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[14px] text-[#9e9e9e]">
          {myReferrals.length} total invited
        </p>

        <div className="flex flex-col gap-[12px]">
          {myReferrals.map((referral) => (
            <div
              key={referral.id}
              className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-[8px]">
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
                      <p className="text-[#9e9e9e] text-[14px]">Pending - Not yet accepted</p>
                    </>
                  )}
                  <div className="flex items-center gap-[8px]">
                    <span
                      className={`px-[12px] py-[4px] rounded-[100px] text-[12px] font-bold border ${
                        referral.status === 'ACTIVE'
                          ? 'bg-[#006622] border-[#00d948] text-[#28ff70]'
                          : referral.status === 'PENDING'
                          ? 'bg-[#664400] border-[#cc8800] text-[#ffaa00]'
                          : 'bg-[#660000] border-[#cc0000] text-[#ff2a2a]'
                      }`}
                    >
                      {referral.status}
                    </span>
                    <span className="text-[#9e9e9e] text-[12px]">
                      {referral.campaign.name}
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col gap-[4px]">
                  <p className="text-[#9e9e9e] text-[12px] uppercase">Level</p>
                  <p className="text-white text-[20px] font-bold">{referral.level}</p>
                </div>
              </div>
            </div>
          ))}

          {myReferrals.length === 0 && (
            <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
              <p className="text-[#9e9e9e] text-[16px]">
                No promoters invited yet. Click "Invite Promoter" to get started.
              </p>
            </div>
          )}
        </div>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={handleCloseModal}
          type={modalType}
          userRole={user?.baseRole || 'promoter'}
        />
      </div>
    );
  }

  if (user?.baseRole === 'promoter') {
    return (
      <div className="flex flex-col gap-[24px]">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] leading-[36px] font-semibold text-white">
            My Tracking Links
          </h1>
          <button
            onClick={() => handleOpenInviteModal('tracking')}
            className="bg-gradient-to-b from-[#ff0f5f] to-[#cc0047] rounded-[8px] px-[16px] py-[10px] text-white text-[14px] font-bold leading-[1.4] tracking-[0.2px] hover:from-[#ff1f69] hover:to-[#d10050] active:scale-[0.98] transition-all"
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
              className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[16px] shadow-[0px_-1px_0px_0px_rgba(255,255,255,0.1),0px_2px_2px_0px_rgba(0,0,0,0.1),0px_8px_8px_-2px_rgba(0,0,0,0.05)]"
            >
              <div className="flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-[4px]">
                    <p className="text-white text-[16px] font-semibold">
                      {link.campaign.name}
                    </p>
                    <p className="text-[#9e9e9e] text-[12px]">
                      Code: <span className="font-mono text-white">{link.shortCode}</span>
                    </p>
                  </div>
                  <div className="text-right flex flex-col gap-[4px]">
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
            <div className="bg-gradient-to-t from-[#212121] to-[#23252a] border border-[rgba(255,255,255,0.03)] rounded-[8px] p-[24px] text-center">
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
          userRole={user?.baseRole || 'promoter'}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[24px]">
      <h1 className="text-[28px] leading-[36px] font-semibold text-white">Models</h1>
      <p className="text-[#9e9e9e] text-[16px]">Access denied</p>
    </div>
  );
};
