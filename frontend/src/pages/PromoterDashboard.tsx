import { useState, useEffect } from 'react';
import { dashboardAPI, referralAPI } from '../services/api';

const PromoterDashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [myReferralLink, setMyReferralLink] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, referralsRes, earningsRes, linkRes] = await Promise.all([
        dashboardAPI.getStats(),
        referralAPI.getMyReferrals(),
        dashboardAPI.getEarnings(),
        dashboardAPI.getMyPromoterLink()
      ]);
      setStats(statsRes.data.stats);
      setReferrals(referralsRes.data);
      setEarnings(earningsRes.data);
      setMyReferralLink(linkRes.data.referralLink);
    } catch (err) {
      setError('Failed to load dashboard data');
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

      {/* Permanent Referral Link Card */}
      {myReferralLink && (
        <div className="card" style={{ 
          marginBottom: '2rem', 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          color: 'white'
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
            borderRadius: '0.5rem',
            backdropFilter: 'blur(10px)'
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

    </div>
  );
};

export default PromoterDashboard;
