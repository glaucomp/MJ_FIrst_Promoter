import { useState, useEffect } from 'react';
import { customerAPI } from '../services/api';

interface Customer {
  id: string;
  email: string;
  name: string;
  revenue: number;
  subscriptionType: string;
  status: 'active' | 'cancelled';
  metadata: string | null;
  createdAt: string;
  referral: {
    referrer: {
      firstName: string;
      lastName: string;
    };
    campaign: {
      name: string;
    };
  };
}

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await customerAPI.getAll();
      setCustomers(response.data.customers);
    } catch (err) {
      setError('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = filter === 'all'
    ? customers
    : customers.filter(c => c.status === filter);

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.status === 'active').length,
    cancelled: customers.filter(c => c.status === 'cancelled').length,
    totalRevenue: customers.reduce((sum, c) => sum + c.revenue, 0),
    activeRevenue: customers.filter(c => c.status === 'active').reduce((sum, c) => sum + c.revenue, 0)
  };

  const getStatusBadgeStyle = (status: string) => ({
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    background: status === 'active' ? '#48bb7820' : '#f5656520',
    color: status === 'active' ? '#48bb78' : '#f56565'
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading customers...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          🛍️ Customer Management
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Track all customers acquired through referrals and their revenue contribution
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          {error}
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
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Customers</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d3748' }}>
                {stats.total}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>👥</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Active Customers</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#48bb78' }}>
                {stats.active}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>✅</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Revenue</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d3748' }}>
                ${stats.totalRevenue.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>💰</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Active MRR</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#667eea' }}>
                ${stats.activeRevenue.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>📈</div>
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
            All ({customers.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className="btn"
            style={{
              background: filter === 'active' ? '#48bb78' : '#e2e8f0',
              color: filter === 'active' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            Active ({stats.active})
          </button>
          <button
            onClick={() => setFilter('cancelled')}
            className="btn"
            style={{
              background: filter === 'cancelled' ? '#f56565' : '#e2e8f0',
              color: filter === 'cancelled' ? 'white' : '#2d3748',
              border: 'none'
            }}
          >
            Cancelled ({stats.cancelled})
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="card" style={{ padding: 0, background: 'white', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Customer
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Transaction ID
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Referred By
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Campaign
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Revenue
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Plan
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Status
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#2d3748' }}>
                        {customer.name}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                        {customer.email}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ 
                      fontFamily: 'monospace', 
                      fontSize: '0.8rem', 
                      color: '#4a5568',
                      background: '#f7fafc',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      display: 'inline-block'
                    }}>
                      {customer.metadata || 'N/A'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#4a5568' }}>
                    {customer.referral?.referrer?.firstName} {customer.referral?.referrer?.lastName}
                  </td>
                  <td style={{ padding: '1rem', color: '#4a5568', fontSize: '0.875rem' }}>
                    {customer.referral?.campaign?.name}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#2d3748', fontSize: '1.125rem' }}>
                    ${customer.revenue.toFixed(2)}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      textTransform: 'capitalize',
                      background: '#e2e8f0',
                      color: '#4a5568'
                    }}>
                      {customer.subscriptionType}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={getStatusBadgeStyle(customer.status)}>
                      {customer.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredCustomers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛍️</div>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>No customers found</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {filter !== 'all' ? `No ${filter} customers at the moment.` : 'Start generating referrals to acquire customers!'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Customers;
