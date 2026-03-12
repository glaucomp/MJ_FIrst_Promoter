import { useState, useEffect } from 'react';
import { referralAPI, dashboardAPI } from '../services/api';

const Referrals = () => {
  const [referrals, setReferrals] = useState<any>(null);
  const [myReferralLink, setMyReferralLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [referralsRes, linkRes] = await Promise.all([
        referralAPI.getMyReferrals(),
        dashboardAPI.getMyPromoterLink()
      ]);
      setReferrals(referralsRes.data);
      setMyReferralLink(linkRes.data.referralLink);
    } catch (err) {
      setError('Failed to load referrals');
    } finally {
      setLoading(false);
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

      {/* Permanent Referral Link Card */}
      {myReferralLink && (
        <div style={{ 
          marginBottom: '2rem', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          borderRadius: '0.75rem',
          color: 'white',
          boxShadow: '0 10px 25px rgba(102, 126, 234, 0.3)'
        }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'white' }}>
            🔗 Your Referral Link
          </h3>
          <p style={{ marginBottom: '1.5rem', opacity: 0.9, fontSize: '0.95rem' }}>
            Share this link to refer customers and earn commissions
          </p>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            alignItems: 'center',
            background: 'rgba(255,255,255,0.15)',
            padding: '1rem',
            borderRadius: '0.5rem'
          }}>
            <input
              type="text"
              value={myReferralLink}
              readOnly
              style={{ 
                flex: 1, 
                background: 'white',
                border: 'none',
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.95rem',
                fontFamily: 'monospace',
                color: '#333'
              }}
            />
            <button
              onClick={() => copyToClipboard(myReferralLink)}
              style={{
                background: 'white',
                color: '#667eea',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.375rem',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '1rem'
              }}
            >
              📋 Copy
            </button>
          </div>
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
