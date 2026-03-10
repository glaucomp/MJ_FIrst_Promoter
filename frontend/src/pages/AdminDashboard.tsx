import React, { useState, useEffect } from 'react';
import { dashboardAPI, campaignAPI, userAPI } from '../services/api';
import PercentageSlider from '../components/PercentageSlider';
import CommissionPreview from '../components/CommissionPreview';

const AdminDashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    websiteUrl: '',
    defaultReferralUrl: '',
    commissionRate: 15,
    secondaryRate: 5,
    recurringRate: 10,
    cookieLifeDays: 60,
    autoApprove: true,
    referralDiscount: 0,
    referralReward: 0
  });


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, campaignsRes] = await Promise.all([
        dashboardAPI.getStats(),
        campaignAPI.getAll()
      ]);
      setStats(statsRes.data.stats);
      setCampaigns(campaignsRes.data.campaigns);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      await campaignAPI.create(campaignForm);
      setSuccess('Campaign created successfully!');
      setShowCreateCampaign(false);
      setCampaignForm({
        name: '',
        description: '',
        websiteUrl: '',
        defaultReferralUrl: '',
        commissionRate: 15,
        secondaryRate: 5,
        recurringRate: 10,
        cookieLifeDays: 60,
        autoApprove: true,
        referralDiscount: 0,
        referralReward: 0
      });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create campaign');
    }
  };

  const handleEditCampaign = (campaign: any) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || '',
      websiteUrl: campaign.websiteUrl,
      defaultReferralUrl: campaign.defaultReferralUrl || '',
      commissionRate: campaign.commissionRate,
      secondaryRate: campaign.secondaryRate || 0,
      recurringRate: campaign.recurringRate || 0,
      cookieLifeDays: campaign.cookieLifeDays || 60,
      autoApprove: campaign.autoApprove !== false,
      referralDiscount: campaign.referralDiscount || 0,
      referralReward: campaign.referralReward || 0
    });
    setShowCreateCampaign(false);
  };

  const handleUpdateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      await campaignAPI.update(editingCampaign.id, campaignForm);
      setSuccess('Campaign updated successfully!');
      setEditingCampaign(null);
      setCampaignForm({
        name: '',
        description: '',
        websiteUrl: '',
        defaultReferralUrl: '',
        commissionRate: 15,
        secondaryRate: 5,
        recurringRate: 10,
        cookieLifeDays: 60,
        autoApprove: true,
        referralDiscount: 0,
        referralReward: 0
      });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update campaign');
    }
  };

  const handleCancelEdit = () => {
    setEditingCampaign(null);
    setCampaignForm({
      name: '',
      description: '',
      websiteUrl: '',
      defaultReferralUrl: '',
      commissionRate: 15,
      secondaryRate: 5,
      recurringRate: 10,
      cookieLifeDays: 60,
      autoApprove: true,
      referralDiscount: 0,
      referralReward: 0
    });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          Admin Dashboard
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Manage campaigns and view platform statistics
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Campaigns</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.totalCampaigns || 0}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{stats?.activeCampaigns || 0} active</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Promoters</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.totalPromoters || 0}</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Referrals</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.totalReferrals || 0}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{stats?.activeReferrals || 0} active</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Commissions</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.totalCommissions?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreateCampaign(!showCreateCampaign);
            setEditingCampaign(null);
          }}
        >
          {showCreateCampaign ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {editingCampaign && (
        <div className="card" style={{ marginBottom: '2rem', border: '2px solid var(--warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              Edit Campaign
            </h3>
            <button className="btn" onClick={handleCancelEdit} style={{ background: 'var(--light)' }}>
              Cancel
            </button>
          </div>
          <form onSubmit={handleUpdateCampaign}>
            <div className="form-group">
              <label className="form-label">Campaign Name</label>
              <input
                type="text"
                className="input"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="input"
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Website URL</label>
              <input
                type="url"
                className="input"
                value={campaignForm.websiteUrl}
                onChange={(e) => setCampaignForm({ ...campaignForm, websiteUrl: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Default Referral URL (Optional)</label>
              <input
                type="url"
                className="input"
                value={campaignForm.defaultReferralUrl}
                onChange={(e) => setCampaignForm({ ...campaignForm, defaultReferralUrl: e.target.value })}
                placeholder="https://example.com/landing-page"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Custom landing page for referrals. If empty, uses Website URL above.
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#2d3748' }}>
                💰 Commission Structure
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <PercentageSlider
                    label="First Sale Commission"
                    value={campaignForm.commissionRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, commissionRate: value })}
                    min={0}
                    max={50}
                    icon="💵"
                    color="#667eea"
                    description="Level 1 promoter earns this on direct referral"
                  />
                  
                  <PercentageSlider
                    label="Second Tier Commission"
                    value={campaignForm.secondaryRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, secondaryRate: value })}
                    min={0}
                    max={30}
                    icon="🎯"
                    color="#764ba2"
                    description="Level 2 promoter earns this on sub-referrals"
                  />
                  
                  <PercentageSlider
                    label="Recurring Commission"
                    value={campaignForm.recurringRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, recurringRate: value })}
                    min={0}
                    max={30}
                    icon="🔄"
                    color="#48bb78"
                    description="Earned on each subscription renewal"
                  />
                </div>
                
                <div>
                  <CommissionPreview
                    commissionRate={campaignForm.commissionRate}
                    secondaryRate={campaignForm.secondaryRate}
                    recurringRate={campaignForm.recurringRate}
                    exampleRevenue={100}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--light)', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Reward Setup for Referrals</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Referral Discount (%)</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.referralDiscount}
                    onChange={(e) => setCampaignForm({ ...campaignForm, referralDiscount: parseFloat(e.target.value) })}
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Referral Reward ($)</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.referralReward}
                    onChange={(e) => setCampaignForm({ ...campaignForm, referralReward: parseFloat(e.target.value) })}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Cookie Life (days)</label>
                <input
                  type="number"
                  className="input"
                  value={campaignForm.cookieLifeDays}
                  onChange={(e) => setCampaignForm({ ...campaignForm, cookieLifeDays: parseInt(e.target.value) })}
                  min="1"
                  max="365"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input
                    type="checkbox"
                    checked={campaignForm.autoApprove}
                    onChange={(e) => setCampaignForm({ ...campaignForm, autoApprove: e.target.checked })}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Auto-approve new promoters
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary">
                Update Campaign
              </button>
              <button type="button" className="btn" onClick={handleCancelEdit} style={{ background: 'var(--light)' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showCreateCampaign && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            Create New Campaign
          </h3>
          <form onSubmit={handleCreateCampaign}>
            <div className="form-group">
              <label className="form-label">Campaign Name</label>
              <input
                type="text"
                className="input"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="input"
                value={campaignForm.description}
                onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Website URL</label>
              <input
                type="url"
                className="input"
                value={campaignForm.websiteUrl}
                onChange={(e) => setCampaignForm({ ...campaignForm, websiteUrl: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#2d3748' }}>
                💰 Commission Structure
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <PercentageSlider
                    label="First Sale Commission"
                    value={campaignForm.commissionRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, commissionRate: value })}
                    min={0}
                    max={50}
                    icon="💵"
                    color="#667eea"
                    description="Level 1 promoter earns this on direct referral"
                  />
                  
                  <PercentageSlider
                    label="Second Tier Commission"
                    value={campaignForm.secondaryRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, secondaryRate: value })}
                    min={0}
                    max={30}
                    icon="🎯"
                    color="#764ba2"
                    description="Level 2 promoter earns this on sub-referrals"
                  />
                  
                  <PercentageSlider
                    label="Recurring Commission"
                    value={campaignForm.recurringRate}
                    onChange={(value) => setCampaignForm({ ...campaignForm, recurringRate: value })}
                    min={0}
                    max={30}
                    icon="🔄"
                    color="#48bb78"
                    description="Earned on each subscription renewal"
                  />
                </div>
                
                <div>
                  <CommissionPreview
                    commissionRate={campaignForm.commissionRate}
                    secondaryRate={campaignForm.secondaryRate}
                    recurringRate={campaignForm.recurringRate}
                    exampleRevenue={100}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--light)', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Reward Setup for Referrals</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Discount or rewards given to the users referred by the promoters
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Referral Discount (%)</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.referralDiscount}
                    onChange={(e) => setCampaignForm({ ...campaignForm, referralDiscount: parseFloat(e.target.value) })}
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Discount for referred customers
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Referral Reward ($)</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.referralReward}
                    onChange={(e) => setCampaignForm({ ...campaignForm, referralReward: parseFloat(e.target.value) })}
                    min="0"
                    step="0.01"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Cash reward for referred customers
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Cookie Life (days)</label>
                <input
                  type="number"
                  className="input"
                  value={campaignForm.cookieLifeDays}
                  onChange={(e) => setCampaignForm({ ...campaignForm, cookieLifeDays: parseInt(e.target.value) })}
                  min="1"
                  max="365"
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  How long referral tracking persists
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">
                  <input
                    type="checkbox"
                    checked={campaignForm.autoApprove}
                    onChange={(e) => setCampaignForm({ ...campaignForm, autoApprove: e.target.checked })}
                    style={{ marginRight: '0.5rem' }}
                  />
                  Auto-approve new promoters
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Automatically approve promoters who sign up without requiring review
                </p>
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              Create Campaign
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          All Campaigns
        </h3>
        {campaigns.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No campaigns yet. Create one to get started!</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th style={{ textAlign: 'right' }}>Referrals</th>
                <th style={{ textAlign: 'right' }}>Customers</th>
                <th style={{ textAlign: 'right' }}>Promoters</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{campaign.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {campaign.commissionRate}% recurring commission
                      {campaign.secondaryRate && ` / ${campaign.secondaryRate}% second tier`}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '600' }}>
                    ${(campaign._count?.commissions || 0) * 100}
                  </td>
                  <td style={{ textAlign: 'right' }}>{campaign._count?.referrals || 0}</td>
                  <td style={{ textAlign: 'right' }}>0</td>
                  <td style={{ textAlign: 'right' }}>
                    {campaign._count?.referrals || 0}
                  </td>
                  <td>
                    {campaign.isActive ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-danger">Inactive</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => handleEditCampaign(campaign)}
                    >
                      Edit
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

export default AdminDashboard;
