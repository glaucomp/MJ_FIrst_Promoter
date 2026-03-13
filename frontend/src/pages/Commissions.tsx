import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Commission {
  id: string;
  amount: number;
  percentage: number;
  status: 'unpaid' | 'pending' | 'paid';
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  referral: {
    campaign: {
      name: string;
    };
  };
}

const Commissions = () => {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'pending' | 'paid'>('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCommissions();
  }, []);

  const fetchCommissions = async () => {
    try {
      // TODO: Replace with actual API call
      // const response = await axios.get('/api/commissions');
      // setCommissions(response.data.commissions);
      
      // Mock data for now
      setCommissions([
        {
          id: '1',
          amount: 150.00,
          percentage: 15,
          status: 'unpaid',
          createdAt: new Date().toISOString(),
          user: {
            id: 'u1',
            firstName: 'Master',
            lastName: 'Yoda',
            email: 'yoda@example.com'
          },
          referral: {
            campaign: {
              name: 'TeaseMe Referral Program'
            }
          }
        },
        {
          id: '2',
          amount: 75.50,
          percentage: 10,
          status: 'pending',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          user: {
            id: 'u2',
            firstName: 'Luke',
            lastName: 'Skywalker',
            email: 'luke@example.com'
          },
          referral: {
            campaign: {
              name: 'TeaseMe Referral Program'
            }
          }
        },
        {
          id: '3',
          amount: 200.00,
          percentage: 15,
          status: 'paid',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          user: {
            id: 'u1',
            firstName: 'Master',
            lastName: 'Yoda',
            email: 'yoda@example.com'
          },
          referral: {
            campaign: {
              name: 'Premium Members Campaign'
            }
          }
        }
      ]);
    } catch (err) {
      setError('Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (commissionId: string, newStatus: 'unpaid' | 'pending' | 'paid') => {
    try {
      // TODO: Replace with actual API call
      // await axios.patch(`/api/commissions/${commissionId}`, { status: newStatus });
      
      setCommissions(prev => prev.map(c => 
        c.id === commissionId ? { ...c, status: newStatus } : c
      ));
      setSuccess(`Commission marked as ${newStatus}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update commission status');
    }
  };

  const filteredCommissions = filter === 'all' 
    ? commissions 
    : commissions.filter(c => c.status === filter);

  const stats = {
    total: commissions.reduce((sum, c) => sum + c.amount, 0),
    unpaid: commissions.filter(c => c.status === 'unpaid').reduce((sum, c) => sum + c.amount, 0),
    pending: commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
    paid: commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0),
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unpaid': return '#f56565';
      case 'pending': return '#ed8936';
      case 'paid': return '#48bb78';
      default: return '#718096';
    }
  };

  const getStatusBadgeStyle = (status: string) => ({
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    background: `${getStatusColor(status)}20`,
    color: getStatusColor(status)
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading commissions...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          💰 Commission Management
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          {user?.role === 'ADMIN' 
            ? 'Track and manage all promoter commissions and payments'
            : 'View your earned commissions and payment history'}
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
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Commissions</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d3748' }}>
                ${stats.total.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>💵</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Unpaid</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f56565' }}>
                ${stats.unpaid.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>⏳</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Pending</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ed8936' }}>
                ${stats.pending.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>⏱️</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Paid</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#48bb78' }}>
                ${stats.paid.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>✅</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'white' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('all')}
            className="btn"
            style={{
              background: filter === 'all' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e2e8f0',
              color: filter === 'all' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            All ({commissions.length})
          </button>
          <button
            onClick={() => setFilter('unpaid')}
            className="btn"
            style={{
              background: filter === 'unpaid' ? '#f56565' : '#e2e8f0',
              color: filter === 'unpaid' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            Unpaid ({commissions.filter(c => c.status === 'unpaid').length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className="btn"
            style={{
              background: filter === 'pending' ? '#ed8936' : '#e2e8f0',
              color: filter === 'pending' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            Pending ({commissions.filter(c => c.status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('paid')}
            className="btn"
            style={{
              background: filter === 'paid' ? '#48bb78' : '#e2e8f0',
              color: filter === 'paid' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            Paid ({commissions.filter(c => c.status === 'paid').length})
          </button>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="card" style={{ padding: 0, background: 'white', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Promoter
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Campaign
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Amount
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Rate
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Status
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Date
                </th>
                {user?.role === 'ADMIN' && (
                  <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredCommissions.map((commission) => (
                <tr key={commission.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#2d3748' }}>
                        {commission.user.firstName} {commission.user.lastName}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                        {commission.user.email}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#4a5568' }}>
                    {commission.referral.campaign.name}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#2d3748', fontSize: '1.125rem' }}>
                    ${commission.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center', color: '#718096' }}>
                    {commission.percentage}%
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={getStatusBadgeStyle(commission.status)}>
                      {commission.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                    {new Date(commission.createdAt).toLocaleDateString()}
                  </td>
                  {user?.role === 'ADMIN' && (
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {commission.status === 'unpaid' && (
                          <button
                            onClick={() => handleStatusChange(commission.id, 'pending')}
                            className="btn"
                            style={{
                              background: '#ed8936',
                              color: 'white',
                              border: 'none',
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.75rem'
                            }}
                          >
                            Mark Pending
                          </button>
                        )}
                        {commission.status !== 'paid' && (
                          <button
                            onClick={() => handleStatusChange(commission.id, 'paid')}
                            className="btn"
                            style={{
                              background: '#48bb78',
                              color: 'white',
                              border: 'none',
                              padding: '0.375rem 0.75rem',
                              fontSize: '0.75rem'
                            }}
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredCommissions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>No commissions found</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {filter !== 'all' ? `No ${filter} commissions at the moment.` : 'Start generating referrals to earn commissions!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Commissions;
