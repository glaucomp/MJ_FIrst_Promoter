import React, { useState, useEffect } from 'react';
import { referralAPI, campaignAPI } from '../services/api';

const Referrals = () => {
  const [referrals, setReferrals] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [referralsRes, campaignsRes] = await Promise.all([
        referralAPI.getMyReferrals(),
        campaignAPI.getAll()
      ]);
      setReferrals(referralsRes.data);
      setCampaigns(campaignsRes.data.campaigns);
    } catch (err) {
      setError('Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedCampaignId) {
      setError('Please select a campaign');
      return;
    }

    try {
      const response = await referralAPI.createInvite(selectedCampaignId);
      setInviteUrl(response.data.inviteUrl);
      setSuccess('Invite link created! Share it with your friends to earn commissions.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create invite');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 3000);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading referrals...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          👥 My Referrals
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Manage your referral invites and track your referral network
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          {success}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Referrals</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d3748' }}>
                {referrals?.referrals?.length || 0}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>👥</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Earnings</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#48bb78' }}>
                ${referrals?.totalEarnings?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>💰</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Level 1 Referrals</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#667eea' }}>
                {referrals?.referrals?.filter((r: any) => !r.parentReferralId)?.length || 0}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>🎯</div>
          </div>
        </div>
      </div>

      {/* Create Invite Button */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="btn btn-primary"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: '600'
          }}
        >
          {showInviteForm ? '✕ Cancel' : '+ Create Referral Link'}
        </button>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'white' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '1rem' }}>
            Generate Referral Link
          </h3>
          <form onSubmit={handleCreateInvite}>
            <div className="form-group">
              <label className="form-label">Select Campaign</label>
              <select
                className="input"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                required
              >
                <option value="">Choose a campaign...</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} - {campaign.commissionRate}% commission
                  </option>
                ))}
              </select>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              style={{ background: '#667eea', color: 'white', border: 'none' }}
            >
              Generate Link
            </button>
          </form>

          {inviteUrl && (
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              background: '#f7fafc', 
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2d3748', display: 'block', marginBottom: '0.5rem' }}>
                Your Referral Link:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input"
                  value={inviteUrl}
                  readOnly
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => copyToClipboard(inviteUrl)}
                  className="btn"
                  style={{ background: '#48bb78', color: 'white', border: 'none', whiteSpace: 'nowrap' }}
                >
                  📋 Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referrals List */}
      <div className="card" style={{ padding: 0, background: 'white', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748' }}>
            All Referrals ({referrals?.referrals?.length || 0})
          </h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  User
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Campaign
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Status
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Earnings
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Date
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Sub-Referrals
                </th>
              </tr>
            </thead>
            <tbody>
              {referrals?.referrals?.map((referral: any) => (
                <tr key={referral.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#2d3748' }}>
                        {referral.referredUser?.firstName || 'Pending'} {referral.referredUser?.lastName || 'User'}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                        {referral.referredUser?.email || referral.inviteCode}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#4a5568' }}>
                    {referral.campaign.name}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      background: referral.status === 'ACTIVE' ? '#48bb7820' : referral.status === 'PENDING' ? '#ed893620' : '#f5656520',
                      color: referral.status === 'ACTIVE' ? '#48bb78' : referral.status === 'PENDING' ? '#ed8936' : '#f56565'
                    }}>
                      {referral.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#2d3748', fontSize: '1.125rem' }}>
                    ${referral.commissions?.reduce((sum: number, c: any) => sum + c.amount, 0)?.toFixed(2) || '0.00'}
                  </td>
                  <td style={{ padding: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', color: '#667eea', fontWeight: '600' }}>
                    {referral.childReferrals?.length || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!referrals?.referrals || referrals.referrals.length === 0) && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>No referrals yet</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Create your first referral link and start earning commissions!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Referrals;
