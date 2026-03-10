import React, { useState, useEffect } from 'react';
import { dashboardAPI, referralAPI, campaignAPI } from '../services/api';

const PromoterDashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [trackingLinks, setTrackingLinks] = useState<any[]>([]);
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
      const [statsRes, referralsRes, earningsRes, linksRes, campaignsRes] = await Promise.all([
        dashboardAPI.getStats(),
        referralAPI.getMyReferrals(),
        dashboardAPI.getEarnings(),
        referralAPI.getMyTrackingLinks(),
        campaignAPI.getAll()
      ]);
      setStats(statsRes.data.stats);
      setReferrals(referralsRes.data);
      setEarnings(earningsRes.data);
      setTrackingLinks(linksRes.data.trackingLinks);
      setCampaigns(campaignsRes.data.campaigns);
    } catch (err) {
      setError('Failed to load dashboard data');
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

  const handleGenerateTrackingLink = async (campaignId: string) => {
    setError('');
    setSuccess('');

    try {
      const response = await referralAPI.generateTrackingLink(campaignId);
      setSuccess(`Tracking link created: ${response.data.trackingLink.fullUrl}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate tracking link');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
  };


  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          Promoter Dashboard
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Track your referrals and earnings
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Referrals</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.totalReferrals || 0}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{stats?.activeReferrals || 0} active</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Earnings</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.totalEarnings?.toFixed(2) || '0.00'}</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Paid Earnings</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.paidEarnings?.toFixed(2) || '0.00'}</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Pending Earnings</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.pendingEarnings?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => setShowInviteForm(!showInviteForm)}
        >
          {showInviteForm ? 'Cancel' : '+ Invite Friends'}
        </button>
      </div>

      {showInviteForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Invite Friends & Earn
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Share your referral link with friends. When they sign up and refer others, you earn commissions!
          </p>
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
                {campaigns.map((campaign: any) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} - {campaign.commissionRate}% recurring commission
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn btn-primary">
              Generate Referral Link
            </button>
          </form>

          {inviteUrl && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--light)', borderRadius: '0.375rem' }}>
              <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Your Referral URL:</p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  value={inviteUrl}
                  readOnly
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={() => copyToClipboard(inviteUrl)}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          My Referrals
        </h3>
        {referrals?.referrals?.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No referrals yet. Start inviting friends!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Referred User</th>
                <th>Level</th>
                <th>Status</th>
                <th>Commissions</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {referrals?.referrals?.map((ref: any) => (
                <tr key={ref.id}>
                  <td style={{ fontWeight: '500' }}>{ref.campaign.name}</td>
                  <td>
                    {ref.referredUser ? (
                      `${ref.referredUser.firstName || ''} ${ref.referredUser.lastName || ''} (${ref.referredUser.email})`
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Pending signup</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-info">Level {ref.level}</span>
                  </td>
                  <td>
                    {ref.status === 'ACTIVE' && <span className="badge badge-success">Active</span>}
                    {ref.status === 'PENDING' && <span className="badge badge-warning">Pending</span>}
                    {ref.status === 'COMPLETED' && <span className="badge badge-info">Completed</span>}
                  </td>
                  <td>
                    ${ref.commissions?.reduce((sum: number, c: any) => sum + c.amount, 0).toFixed(2) || '0.00'}
                  </td>
                  <td>{new Date(ref.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Commission History
        </h3>
        {earnings?.commissions?.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No commissions yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Amount</th>
                <th>Percentage</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {earnings?.commissions?.map((commission: any) => (
                <tr key={commission.id}>
                  <td style={{ fontWeight: '500' }}>{commission.campaign.name}</td>
                  <td style={{ fontWeight: '600', color: 'var(--success)' }}>
                    ${commission.amount.toFixed(2)}
                  </td>
                  <td>{commission.percentage}%</td>
                  <td>
                    {commission.status === 'paid' && <span className="badge badge-success">Paid</span>}
                    {commission.status === 'unpaid' && <span className="badge badge-warning">Unpaid</span>}
                    {commission.status === 'pending' && <span className="badge badge-info">Pending</span>}
                  </td>
                  <td>{new Date(commission.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Tracking Links
        </h3>
        {trackingLinks.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No tracking links yet. Generate one to track clicks!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Short Code</th>
                <th>URL</th>
                <th>Clicks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trackingLinks.map((link) => (
                <tr key={link.id}>
                  <td style={{ fontWeight: '500' }}>{link.campaign.name}</td>
                  <td><code>{link.shortCode}</code></td>
                  <td>
                    <input
                      type="text"
                      value={link.fullUrl}
                      readOnly
                      style={{ border: 'none', background: 'transparent', width: '300px' }}
                    />
                  </td>
                  <td>{link.clicks}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => copyToClipboard(link.fullUrl)}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PromoterDashboard;
