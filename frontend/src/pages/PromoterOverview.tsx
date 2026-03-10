import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI, referralAPI, campaignAPI } from '../services/api';

const PromoterOverview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, referralsRes, earningsRes, campaignsRes] = await Promise.all([
        dashboardAPI.getStats(),
        referralAPI.getMyReferrals(),
        dashboardAPI.getEarnings(),
        campaignAPI.getAll()
      ]);
      setStats(statsRes.data.stats);
      setReferrals(referralsRes.data);
      setEarnings(earningsRes.data);
      setCampaigns(campaignsRes.data.campaigns.slice(0, 3));
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
          📊 Promoter Dashboard
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Welcome back! Track your performance and earnings
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
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Referrals</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
                {referrals?.referrals?.length || 0}
              </p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                Active referrals
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
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Total Earnings</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
                ${referrals?.totalEarnings?.toFixed(2) || '0.00'}
              </p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                All time
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>💰</div>
          </div>
        </div>

        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Pending Earnings</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
                ${earnings?.pendingEarnings?.toFixed(2) || '0.00'}
              </p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                Awaiting payment
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>⏳</div>
          </div>
        </div>

        <div className="card" style={{ 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', 
          color: 'white' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Active Campaigns</h3>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
                {campaigns.length}
              </p>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem' }}>
                Available to promote
              </p>
            </div>
            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>🎯</div>
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
            onClick={() => navigate('/referrals')}
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
            👥 View Referrals
          </button>
          <button
            onClick={() => navigate('/earnings')}
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
            💰 View Earnings
          </button>
          <button
            onClick={() => navigate('/tracking-links')}
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
            🔗 Tracking Links
          </button>
        </div>
      </div>

      {/* Recent Referrals */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748' }}>
            👥 Recent Referrals
          </h3>
          <button
            onClick={() => navigate('/referrals')}
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
          {referrals?.referrals?.slice(0, 3).map((referral: any) => (
            <div 
              key={referral.id} 
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
                    {referral.referredUser?.firstName || 'Pending'} {referral.referredUser?.lastName || 'User'}
                  </h4>
                  <span style={{
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: referral.status === 'ACTIVE' ? '#48bb7820' : '#667eea20',
                    color: referral.status === 'ACTIVE' ? '#48bb78' : '#667eea'
                  }}>
                    {referral.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#718096', margin: 0 }}>
                  Campaign: {referral.campaign.name} • {referral.campaign.commissionRate}% commission
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2d3748' }}>
                  {new Date(referral.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          
          {(!referrals?.referrals || referrals.referrals.length === 0) && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
              <p>No referrals yet. Start inviting friends to earn commissions!</p>
              <button
                onClick={() => navigate('/referrals')}
                className="btn"
                style={{
                  background: '#667eea',
                  color: 'white',
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  border: 'none'
                }}
              >
                + Create Referral
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Available Campaigns */}
      <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '1rem' }}>
          🎯 Available Campaigns
        </h3>
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
                <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', margin: 0, marginBottom: '0.25rem' }}>
                  {campaign.name}
                </h4>
                <p style={{ fontSize: '0.875rem', color: '#718096', margin: 0 }}>
                  {campaign.description || 'No description'}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', color: '#667eea', fontWeight: '600' }}>
                    💵 {campaign.commissionRate}% Commission
                  </span>
                  <span style={{ fontSize: '0.875rem', color: '#48bb78', fontWeight: '600' }}>
                    🔄 {campaign.recurringRate}% Recurring
                  </span>
                </div>
              </div>
              <button
                onClick={() => navigate('/referrals')}
                className="btn"
                style={{
                  background: '#667eea',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: 'none'
                }}
              >
                Promote
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromoterOverview;
