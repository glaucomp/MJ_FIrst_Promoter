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
  const [currentUserId, setCurrentUserId] = useState<string>('');

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
      setCurrentUserId(earningsRes.data.userId);
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
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.paidEarnings?.toFixed(2) || '0.00'}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>Paid commissions</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>All Commissions</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.totalEarnings?.toFixed(2) || '0.00'}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>Paid + Pending</p>
        </div>

        <div className="card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
          <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.9 }}>Pending Earnings</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>${stats?.pendingEarnings?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Earnings Breakdown - Direct vs Team */}
      {earnings?.summary && (earnings.summary.directEarnings > 0 || earnings.summary.teamEarnings > 0) && (
        <div className="card" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            💰 Earnings Breakdown
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Direct Earnings */}
            <div style={{ 
              padding: '1.5rem', 
              background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
              borderRadius: '0.75rem',
              color: 'white'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
                    💼 Direct Sales
                  </div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                    ${earnings.summary.directEarnings?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div style={{ fontSize: '2rem' }}>🎯</div>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.85 }}>
                From your own customer referrals
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.5rem' }}>
                {earnings.directCommissions?.length || 0} commission{earnings.directCommissions?.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Team Earnings */}
            <div style={{ 
              padding: '1.5rem', 
              background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
              borderRadius: '0.75rem',
              color: 'white'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
                    👥 Team Sales
                  </div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                    ${earnings.summary.teamEarnings?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div style={{ fontSize: '2rem' }}>🌟</div>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.85 }}>
                From your team's customer referrals
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.5rem' }}>
                {earnings.teamCommissions?.length || 0} commission{earnings.teamCommissions?.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Percentage Breakdown */}
          {earnings.summary.total > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', height: '40px', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <div
                  style={{
                    flex: earnings.summary.directEarnings || 0,
                    background: '#48bb78',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                  }}
                >
                  {((earnings.summary.directEarnings / earnings.summary.total) * 100).toFixed(0)}% Direct
                </div>
                <div
                  style={{
                    flex: earnings.summary.teamEarnings || 0,
                    background: '#ed8936',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                  }}
                >
                  {((earnings.summary.teamEarnings / earnings.summary.total) * 100).toFixed(0)}% Team
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Team Performance - Only show if user has team members */}
      {referrals?.referrals && referrals.referrals.some((r: any) => r.referredUser) && (
        <div className="card" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            👥 My Team Performance
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            {referrals.referrals
              .filter((ref: any) => ref.referredUser)
              .map((ref: any) => {
                const teamMemberEarnings = earnings?.commissions?.filter(
                  (c: any) => c.referral?.referredUser?.id === ref.referredUser?.id
                ).reduce((sum: number, c: any) => sum + c.amount, 0) || 0;

                return (
                  <div
                    key={ref.id}
                    style={{
                      padding: '1.25rem',
                      background: '#f7fafc',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div
                        style={{
                          width: '45px',
                          height: '45px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '1rem'
                        }}
                      >
                        {ref.referredUser.firstName?.charAt(0) || ''}
                        {ref.referredUser.lastName?.charAt(0) || ''}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.95rem' }}>
                          {ref.referredUser.firstName} {ref.referredUser.lastName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                          {ref.referredUser.email}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#718096', marginBottom: '0.25rem' }}>
                          Your Earnings
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ed8936' }}>
                          ${teamMemberEarnings.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#718096', marginBottom: '0.25rem' }}>
                          Status
                        </div>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            background: ref.status === 'ACTIVE' ? '#48bb7820' : '#fbd38d20',
                            color: ref.status === 'ACTIVE' ? '#48bb78' : '#ed8936'
                          }}
                        >
                          {ref.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          📋 My Referrals
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
          💵 Commission History
        </h3>
        {earnings?.commissions?.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No commissions yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Campaign</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Rate</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {earnings?.commissions?.map((commission: any) => {
                  const isDirect = commission.referral?.referrerId === currentUserId;
                  const teamMemberName = !isDirect && commission.referral?.referredUser 
                    ? `${commission.referral.referredUser.firstName || ''} ${commission.referral.referredUser.lastName || ''}`.trim()
                    : null;
                  
                  return (
                    <tr key={commission.id}>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.25rem 0.625rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: isDirect ? '#48bb7820' : '#ed893620',
                          color: isDirect ? '#48bb78' : '#ed8936'
                        }}>
                          {isDirect ? '💼 Direct' : '👥 Team'}
                        </span>
                        {teamMemberName && (
                          <div style={{ fontSize: '0.7rem', color: '#718096', marginTop: '0.25rem' }}>
                            via {teamMemberName}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: '500' }}>{commission.campaign?.name || 'N/A'}</td>
                      <td style={{ fontSize: '0.875rem' }}>
                        {commission.customer?.email || commission.customer?.name || 
                         commission.referral?.referredUser?.email || 'N/A'}
                      </td>
                      <td style={{ fontWeight: '600', color: 'var(--success)', fontSize: '1rem' }}>
                        ${commission.amount.toFixed(2)}
                      </td>
                      <td>{commission.percentage}%</td>
                      <td>
                        {commission.status === 'paid' && <span className="badge badge-success">Paid</span>}
                        {commission.status === 'unpaid' && <span className="badge badge-warning">Unpaid</span>}
                        {commission.status === 'pending' && <span className="badge badge-info">Pending</span>}
                      </td>
                      <td style={{ fontSize: '0.875rem' }}>
                        {new Date(commission.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default PromoterDashboard;
