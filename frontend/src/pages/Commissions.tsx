import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { commissionAPI } from '../services/api';

interface Commission {
  id: string;
  amount: number;
  percentage: number;
  status: 'unpaid' | 'pending' | 'paid';
  description: string | null;
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
    referrer: {
      firstName: string;
      lastName: string;
      email: string;
    };
  } | null;
  customer: {
    id: string;
    email: string;
    name: string;
    revenue: number;
  } | null;
}

const Commissions = () => {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'pending' | 'paid'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCommissions();
  }, []);

  const fetchCommissions = async () => {
    try {
      const response = await commissionAPI.getAll();
      setCommissions(response.data.commissions || []);
    } catch (err) {
      console.error('Error fetching commissions:', err);
      setError('Failed to load commissions');
    } finally {
      setLoading(false);
    }
  };

  const filteredCommissions = filter === 'all' 
    ? commissions 
    : commissions.filter(c => c.status === filter);

  // Calculate stats
  const pendingCommissionsList = commissions.filter(c => c.status === 'unpaid' || c.status === 'pending');
  
  // Pending Earnings: Sum only tier 1 sales revenue (percentage 30%)
  const uniquePendingTier1Customers = new Map<string, number>();
  pendingCommissionsList.forEach(c => {
    // Only count tier 1 commissions (percentage === 30)
    if (c.customer?.id && c.percentage === 30) {
      uniquePendingTier1Customers.set(c.customer.id, c.customer.revenue || 0);
    }
  });
  const pendingEarnings = Array.from(uniquePendingTier1Customers.values()).reduce((sum, revenue) => sum + revenue, 0);
  
  // Pending Commissions: Sum ALL commissions (tier 1 + tier 2)
  const pendingCommissions = pendingCommissionsList.reduce((sum, c) => sum + c.amount, 0);
  
  const completedCommissionsList = commissions.filter(c => c.status === 'paid');
  
  // Completed Earnings: Sum only tier 1 sales revenue (percentage 30%)
  const uniqueCompletedTier1Customers = new Map<string, number>();
  completedCommissionsList.forEach(c => {
    // Only count tier 1 commissions (percentage === 30)
    if (c.customer?.id && c.percentage === 30) {
      uniqueCompletedTier1Customers.set(c.customer.id, c.customer.revenue || 0);
    }
  });
  const completedEarnings = Array.from(uniqueCompletedTier1Customers.values()).reduce((sum, revenue) => sum + revenue, 0);
  
  // Completed Commissions: Sum ALL commissions (tier 1 + tier 2)
  const completedCommissions = completedCommissionsList.reduce((sum, c) => sum + c.amount, 0);

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
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1a202c', marginBottom: '0.25rem' }}>
          Commissions
        </h2>
      </div>

      {/* Summary Stats - 4 Panels */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        {/* Pending Earnings */}
        <div style={{ 
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', 
          padding: '1.5rem', 
          borderRadius: '0.75rem',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Pending Earnings</span>
            <span style={{ fontSize: '1.5rem' }}>⏳</span>
          </div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
            ${pendingEarnings.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
            Awaiting payment
          </div>
        </div>

        {/* Pending Commissions */}
        <div style={{ 
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
          padding: '1.5rem', 
          borderRadius: '0.75rem',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Pending Commissions</span>
            <span style={{ fontSize: '1.5rem' }}>📊</span>
          </div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
            ${pendingCommissions.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
            Total pending
          </div>
        </div>

        {/* Completed Earnings */}
        <div style={{ 
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
          padding: '1.5rem', 
          borderRadius: '0.75rem',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Completed Earnings</span>
            <span style={{ fontSize: '1.5rem' }}>💰</span>
          </div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
            ${completedEarnings.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
            Already paid
          </div>
        </div>

        {/* Completed Commissions */}
        <div style={{ 
          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', 
          padding: '1.5rem', 
          borderRadius: '0.75rem',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Completed Commissions</span>
            <span style={{ fontSize: '1.5rem' }}>✓</span>
          </div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
            ${completedCommissions.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
            Total paid
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Tabs and Search */}
      <div className="card" style={{ padding: 0, background: 'white', overflow: 'hidden', marginBottom: '0' }}>
        {/* Tabs */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid #e2e8f0',
          padding: '0 1.5rem'
        }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '1rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: filter === 'all' ? '2px solid #3b82f6' : '2px solid transparent',
              color: filter === 'all' ? '#3b82f6' : '#718096',
              fontWeight: filter === 'all' ? '600' : '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unpaid')}
            style={{
              padding: '1rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: filter === 'unpaid' ? '2px solid #3b82f6' : '2px solid transparent',
              color: filter === 'unpaid' ? '#3b82f6' : '#718096',
              fontWeight: filter === 'unpaid' ? '600' : '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            Unpaid
          </button>
          <button
            onClick={() => setFilter('pending')}
            style={{
              padding: '1rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: filter === 'pending' ? '2px solid #3b82f6' : '2px solid transparent',
              color: filter === 'pending' ? '#3b82f6' : '#718096',
              fontWeight: filter === 'pending' ? '600' : '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('paid')}
            style={{
              padding: '1rem 1.5rem',
              background: 'none',
              border: 'none',
              borderBottom: filter === 'paid' ? '2px solid #3b82f6' : '2px solid transparent',
              color: filter === 'paid' ? '#3b82f6' : '#718096',
              fontWeight: filter === 'paid' ? '600' : '400',
              fontSize: '0.875rem',
              cursor: 'pointer',
              marginBottom: '-1px'
            }}
          >
            Paid
          </button>
        </div>

        {/* Search and Filters Bar */}
        <div style={{ 
          padding: '1rem 1.5rem', 
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }}>
          <div style={{ 
            flex: 1,
            position: 'relative'
          }}>
            <input
              type="text"
              placeholder="Start your search..."
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                background: '#f7fafc'
              }}
            />
            <span style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#a0aec0',
              fontSize: '1rem'
            }}>🔍</span>
          </div>
          <select style={{
            padding: '0.5rem 2rem 0.5rem 0.75rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            background: 'white',
            cursor: 'pointer'
          }}>
            <option>Campaign: All</option>
          </select>
        </div>

        {/* Commissions Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'white', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Promoter
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Sale
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Amount
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Created at
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Customer
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Campaign
                </th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  
                </th>
                {user?.role === 'ADMIN' && (
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>
                    
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredCommissions.map((commission) => (
                <tr key={commission.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ 
                        width: '24px', 
                        height: '24px', 
                        borderRadius: '50%', 
                        background: commission.status === 'paid' ? '#10b981' : '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        color: 'white',
                        fontWeight: 'bold'
                      }}>
                        ✓
                      </div>
                      <div>
                        <div style={{ fontWeight: '500', color: '#3b82f6', fontSize: '0.875rem' }}>
                          {commission.user.firstName} {commission.user.lastName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {commission.user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>$</span>
                        <span style={{ 
                          fontWeight: '500',
                          color: '#1f2937',
                          fontSize: '0.875rem'
                        }}>
                          {commission.customer?.revenue?.toFixed(2) || '0.00'}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: commission.percentage === 30 ? '#3b82f6' : '#f59e0b',
                          color: 'white',
                          fontSize: '0.625rem',
                          fontWeight: 'bold'
                        }}>
                          {commission.percentage === 30 ? '1' : '2'}
                        </span>
                      </div>
                      {commission.percentage !== 30 && commission.description && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {commission.description.match(/From (.+?)'s sale/)?.[1] 
                            ? `from ${commission.description.match(/From (.+?)'s sale/)?.[1]}`
                            : commission.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>$</span>
                      <span style={{ 
                        fontWeight: '500',
                        color: '#1f2937',
                        fontSize: '0.875rem'
                      }}>
                        {commission.amount.toFixed(2)}
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: commission.percentage === 30 ? '#3b82f6' : '#f59e0b',
                        color: 'white',
                        fontSize: '0.625rem',
                        fontWeight: 'bold'
                      }}>
                        {commission.percentage === 30 ? '1' : '2'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ color: '#1f2937', fontSize: '0.875rem' }}>
                      {new Date(commission.createdAt).toLocaleDateString('en-US', { 
                        day: 'numeric',
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {new Date(commission.createdAt).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', color: '#1f2937', fontSize: '0.875rem' }}>
                    {commission.customer?.email || '-'}
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: '#f59e0b',
                      color: 'white'
                    }}>
                      <span style={{ fontSize: '0.625rem' }}>●</span>
                      {commission.referral?.campaign?.name || 'N/A'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                    {commission.status === 'paid' ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: '#3b82f6',
                        color: 'white'
                      }}>
                        ✓
                      </span>
                    ) : commission.status === 'pending' ? (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: '#fef3c7',
                        color: '#92400e'
                      }}>
                        ⏱
                      </span>
                    ) : null}
                  </td>
                  {user?.role === 'ADMIN' && (
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6b7280',
                          fontSize: '1.25rem',
                          cursor: 'pointer',
                          padding: '0.25rem'
                        }}
                      >
                        ⋮
                      </button>
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
