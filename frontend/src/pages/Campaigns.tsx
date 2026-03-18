import React, { useState, useEffect } from 'react';
import { campaignAPI } from '../services/api';
import PercentageSlider from '../components/PercentageSlider';
import CommissionPreview from '../components/CommissionPreview';

const Campaigns = () => {
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
    cookieLifeDays: 60,
    autoApprove: true,
    visibleToPromoters: true,
    maxInvitesPerMonth: 0
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const campaignsRes = await campaignAPI.getAll();
      setCampaigns(campaignsRes.data.campaigns);
    } catch (err) {
      setError('Failed to load campaigns');
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
        cookieLifeDays: 60,
        autoApprove: true,
        visibleToPromoters: true,
        maxInvitesPerMonth: 0
      });
      fetchCampaigns();
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
      cookieLifeDays: campaign.cookieLifeDays || 60,
      autoApprove: campaign.autoApprove !== false,
      visibleToPromoters: campaign.visibleToPromoters !== false,
      maxInvitesPerMonth: campaign.maxInvitesPerMonth || 0
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
        cookieLifeDays: 60,
        autoApprove: true,
        visibleToPromoters: true,
        maxInvitesPerMonth: 0
      });
      fetchCampaigns();
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
      cookieLifeDays: 60,
      autoApprove: true,
      visibleToPromoters: true,
      maxInvitesPerMonth: 0
    });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          🎯 Campaign Management
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Create and manage referral campaigns with custom commission structures
        </p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>{success}</div>}

      <div style={{ marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreateCampaign(!showCreateCampaign);
            setEditingCampaign(null);
          }}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: '600'
          }}
        >
          {showCreateCampaign ? '✕ Cancel' : '+ New Campaign'}
        </button>
      </div>

      {/* Edit Campaign Form */}
      {editingCampaign && (
        <div className="card" style={{ marginBottom: '2rem', border: '2px solid #ed8936', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748' }}>
              ✏️ Edit Campaign
            </h3>
            <button className="btn" onClick={handleCancelEdit} style={{ background: '#e2e8f0', color: '#2d3748' }}>
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
                </div>
                
                <div>
                  <CommissionPreview
                    commissionRate={campaignForm.commissionRate}
                    secondaryRate={campaignForm.secondaryRate}
                    exampleRevenue={100}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Campaign Settings</h4>
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
                  <label className="form-label">Max Invites per Month</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.maxInvitesPerMonth}
                    onChange={(e) => setCampaignForm({ ...campaignForm, maxInvitesPerMonth: parseInt(e.target.value) })}
                    min="0"
                    placeholder="0 = unlimited"
                  />
                  <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                    0 = unlimited invites, or set a specific limit per promoter
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
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
                <div className="form-group">
                  <label className="form-label">
                    <input
                      type="checkbox"
                      checked={campaignForm.visibleToPromoters}
                      onChange={(e) => setCampaignForm({ ...campaignForm, visibleToPromoters: e.target.checked })}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Visible to promoters
                  </label>
                  <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
                    When enabled, promoters can see and promote this campaign
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ background: '#48bb78', color: 'white' }}>
                Update Campaign
              </button>
              <button type="button" className="btn" onClick={handleCancelEdit} style={{ background: '#e2e8f0' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Campaign Form */}
      {showCreateCampaign && (
        <div className="card" style={{ marginBottom: '2rem', background: 'white' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
            Create New Campaign
          </h3>
          <form onSubmit={handleCreateCampaign}>
            {/* Same form fields as edit... */}
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
                </div>
                
                <div>
                  <CommissionPreview
                    commissionRate={campaignForm.commissionRate}
                    secondaryRate={campaignForm.secondaryRate}
                    exampleRevenue={100}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Campaign Settings</h4>
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
                  <label className="form-label">Max Invites per Month</label>
                  <input
                    type="number"
                    className="input"
                    value={campaignForm.maxInvitesPerMonth}
                    onChange={(e) => setCampaignForm({ ...campaignForm, maxInvitesPerMonth: parseInt(e.target.value) })}
                    min="0"
                    placeholder="0 = unlimited"
                  />
                  <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                    0 = unlimited invites, or set a specific limit per promoter
                  </p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
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
                <div className="form-group">
                  <label className="form-label">
                    <input
                      type="checkbox"
                      checked={campaignForm.visibleToPromoters}
                      onChange={(e) => setCampaignForm({ ...campaignForm, visibleToPromoters: e.target.checked })}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Visible to promoters
                  </label>
                  <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
                    When enabled, promoters can see and promote this campaign
                  </p>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ background: '#667eea', color: 'white' }}>
              Create Campaign
            </button>
          </form>
        </div>
      )}

      {/* Campaigns List */}
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#2d3748' }}>
          All Campaigns ({campaigns.length})
        </h3>
        
        <div style={{ display: 'grid', gap: '1rem' }}>
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="card" style={{ padding: '1.5rem', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                      {campaign.name}
                    </h4>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: campaign.isActive ? '#48bb7820' : '#f5656520',
                      color: campaign.isActive ? '#48bb78' : '#f56565'
                    }}>
                      {campaign.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {campaign.visibleToPromoters && (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: '#667eea20',
                        color: '#667eea'
                      }}>
                        👁️ Visible to Promoters
                      </span>
                    )}
                    {!campaign.visibleToPromoters && (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: '#71809620',
                        color: '#718096'
                      }}>
                        🔒 Hidden from Promoters
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#718096', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    {campaign.description || 'No description'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>Level 1 Commission</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#667eea' }}>
                        {campaign.commissionRate}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>Level 2 Commission</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#764ba2' }}>
                        {campaign.secondaryRate}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>Cookie Life</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#2d3748' }}>
                        {campaign.cookieLifeDays} days
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>Max Invites/Month</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#ed8936' }}>
                        {campaign.maxInvitesPerMonth || 'Unlimited'}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleEditCampaign(campaign)}
                  className="btn"
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem'
                  }}
                >
                  ✏️ Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Campaigns;
