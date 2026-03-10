import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, campaignAPI } from '../services/api';

const Overview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setCampaigns(campaignsRes.data.campaigns.slice(0, 5)); // Only show top 5
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          📊 Dashboard Overview
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Welcome back! Here's what's happening with your referral program
        </p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem', 
        marginBottom: '2rem' 
      }}>
        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Campaigns</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats?.totalCampaigns || 0}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                {stats?.activeCampaigns || 0} active
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>🎯</div>
          </div>
        </div>

        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Promoters</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats?.totalPromoters || 0}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                Active members
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>👥</div>
          </div>
        </div>

        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Referrals</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats?.totalReferrals || 0}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                {stats?.activeReferrals || 0} active
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>🔗</div>
          </div>
        </div>

        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Commissions</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
                ${stats?.totalCommissions?.toFixed(2) || '0.00'}
              </p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                Paid to promoters
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>💰</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'white' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '1rem' }}>
          ⚡ Quick Actions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <button
            onClick={() => navigate('/campaigns')}
            className="btn"
            style={{
              background: '#667eea',
              color: 'white',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: 'none'
            }}
          >
            🎯 Manage Campaigns
          </button>
          <button
            onClick={() => navigate('/promoters')}
            className="btn"
            style={{
              background: '#4facfe',
              color: 'white',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: 'none'
            }}
          >
            👥 View Promoters
          </button>
          <button
            onClick={() => navigate('/commissions')}
            className="btn"
            style={{
              background: '#fa709a',
              color: 'white',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: 'none'
            }}
          >
            💰 Manage Payments
          </button>
          <button
            onClick={() => navigate('/customers')}
            className="btn"
            style={{
              background: '#43e97b',
              color: 'white',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: 'none'
            }}
          >
            🛍️ View Customers
          </button>
        </div>
      </div>

      {/* Recent Campaigns */}
      <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748' }}>
            🎯 Recent Campaigns
          </h3>
          <button
            onClick={() => navigate('/campaigns')}
            className="btn"
            style={{
              background: '#e2e8f0',
              color: '#2d3748',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: 'none'
            }}
          >
            View All →
          </button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {campaigns.map((campaign) => (
            <div 
              key={campaign.id} 
              style={{
                padding: '1rem',
                background: '#f7fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                    {campaign.name}
                  </h4>
                  <span style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: campaign.isActive ? '#48bb7820' : '#f5656520',
                    color: campaign.isActive ? '#48bb78' : '#f56565'
                  }}>
                    {campaign.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#718096', margin: 0 }}>
                  Commission: {campaign.commissionRate}% | Recurring: {campaign.recurringRate}%
                </p>
              </div>
              <button
                onClick={() => navigate('/campaigns')}
                className="btn"
                style={{
                  background: '#667eea',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: 'none'
                }}
              >
                Manage
              </button>
            </div>
          ))}
          
          {campaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
              <p>No campaigns yet. Create your first campaign to get started!</p>
              <button
                onClick={() => navigate('/campaigns')}
                className="btn"
                style={{
                  background: '#667eea',
                  color: 'white',
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  border: 'none'
                }}
              >
                + Create Campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Overview;
