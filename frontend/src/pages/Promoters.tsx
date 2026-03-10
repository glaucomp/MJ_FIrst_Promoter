import React, { useState, useEffect } from 'react';
import { userAPI } from '../services/api';

interface Promoter {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  _count?: {
    referralsMade: number;
    commissions: number;
  };
  stats?: {
    totalReferrals: number;
    activeReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
  };
}

const Promoters = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    fetchPromoters();
  }, []);

  const fetchPromoters = async () => {
    try {
      const response = await userAPI.getAll();
      // Filter only promoters
      const promoterUsers = response.data.users.filter((u: any) => u.role === 'PROMOTER');
      
      // Mock additional stats for now
      const promotersWithStats = promoterUsers.map((p: any) => ({
        ...p,
        stats: {
          totalReferrals: Math.floor(Math.random() * 50),
          activeReferrals: Math.floor(Math.random() * 30),
          totalEarnings: Math.random() * 5000,
          pendingEarnings: Math.random() * 500
        }
      }));
      
      setPromoters(promotersWithStats);
    } catch (err) {
      setError('Failed to load promoters');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (promoterId: string, currentStatus: boolean) => {
    try {
      // TODO: Replace with actual API call
      // await userAPI.updateStatus(promoterId, { isActive: !currentStatus });
      
      setPromoters(prev => prev.map(p => 
        p.id === promoterId ? { ...p, isActive: !currentStatus } : p
      ));
      setSuccess(`Promoter ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update promoter status');
    }
  };

  const filteredPromoters = promoters.filter(p => {
    const matchesFilter = filter === 'all' || 
      (filter === 'active' && p.isActive) || 
      (filter === 'inactive' && !p.isActive);
    
    const matchesSearch = searchTerm === '' || 
      p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: promoters.length,
    active: promoters.filter(p => p.isActive).length,
    inactive: promoters.filter(p => !p.isActive).length,
    totalReferrals: promoters.reduce((sum, p) => sum + (p.stats?.totalReferrals || 0), 0),
    totalEarnings: promoters.reduce((sum, p) => sum + (p.stats?.totalEarnings || 0), 0)
  };

  const getStatusBadgeStyle = (isActive: boolean) => ({
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    background: isActive ? '#48bb7820' : '#f5656520',
    color: isActive ? '#48bb78' : '#f56565'
  });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading promoters...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          👥 Promoters Management
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          Manage all promoters, track their performance and control access
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
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Promoters</p>
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
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Active Promoters</p>
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
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Referrals</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#667eea' }}>
                {stats.totalReferrals}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>🎯</div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>Total Earnings</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d3748' }}>
                ${stats.totalEarnings.toFixed(2)}
              </p>
            </div>
            <div style={{ fontSize: '2rem' }}>💰</div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'white' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
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
              All ({promoters.length})
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
              onClick={() => setFilter('inactive')}
              className="btn"
              style={{
                background: filter === 'inactive' ? '#f56565' : '#e2e8f0',
                color: filter === 'inactive' ? 'white' : '#2d3748',
                border: 'none'
              }}
            >
              Inactive ({stats.inactive})
            </button>
          </div>
          
          <div style={{ flex: '1', minWidth: '250px', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="🔍 Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              style={{
                width: '100%',
                padding: '0.625rem 1rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.375rem'
              }}
            />
          </div>
        </div>
      </div>

      {/* Promoters Table */}
      <div className="card" style={{ padding: 0, background: 'white', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Promoter
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Status
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Referrals
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Total Earnings
                </th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Pending
                </th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Joined
                </th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPromoters.map((promoter) => (
                <tr key={promoter.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.875rem'
                      }}>
                        {promoter.firstName?.charAt(0)}{promoter.lastName?.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: '#2d3748' }}>
                          {promoter.firstName} {promoter.lastName}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                          {promoter.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={getStatusBadgeStyle(promoter.isActive)}>
                      {promoter.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '1.125rem' }}>
                      {promoter.stats?.totalReferrals || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      {promoter.stats?.activeReferrals || 0} active
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#2d3748', fontSize: '1.125rem' }}>
                    ${promoter.stats?.totalEarnings?.toFixed(2) || '0.00'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#ed8936', fontWeight: '600' }}>
                    ${promoter.stats?.pendingEarnings?.toFixed(2) || '0.00'}
                  </td>
                  <td style={{ padding: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                    {new Date(promoter.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleToggleStatus(promoter.id, promoter.isActive)}
                        className="btn"
                        style={{
                          background: promoter.isActive ? '#f56565' : '#48bb78',
                          color: 'white',
                          border: 'none',
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem'
                        }}
                      >
                        {promoter.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedPromoter(promoter);
                          setShowDetailsModal(true);
                        }}
                        className="btn"
                        style={{
                          background: '#667eea',
                          color: 'white',
                          border: 'none',
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem'
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredPromoters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
              <p style={{ fontSize: '1.125rem', fontWeight: '500' }}>No promoters found</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                {searchTerm ? 'Try adjusting your search terms.' : 'No promoters match the selected filters.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedPromoter && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }} onClick={() => setShowDetailsModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderTopLeftRadius: '0.75rem',
              borderTopRightRadius: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '1.5rem'
                }}>
                  {selectedPromoter.firstName?.charAt(0)}{selectedPromoter.lastName?.charAt(0)}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
                    {selectedPromoter.firstName} {selectedPromoter.lastName}
                  </h2>
                  <p style={{ fontSize: '0.875rem', opacity: 0.9, margin: 0 }}>
                    {selectedPromoter.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: 'white',
                  fontSize: '1.5rem',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem' }}>
              {/* Status Badge */}
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={getStatusBadgeStyle(selectedPromoter.isActive)}>
                  {selectedPromoter.isActive ? 'Active' : 'Inactive'}
                </span>
                <span style={{ marginLeft: '1rem', color: '#718096', fontSize: '0.875rem' }}>
                  Joined {new Date(selectedPromoter.createdAt).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </span>
              </div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{
                  padding: '1rem',
                  background: '#f7fafc',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>
                    Total Referrals
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#2d3748' }}>
                    {selectedPromoter.stats?.totalReferrals || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#48bb78', marginTop: '0.25rem' }}>
                    {selectedPromoter.stats?.activeReferrals || 0} active
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: '#f7fafc',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>
                    Total Earnings
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#48bb78' }}>
                    ${selectedPromoter.stats?.totalEarnings?.toFixed(2) || '0.00'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                    All time
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: '#f7fafc',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>
                    Pending Earnings
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ed8936' }}>
                    ${selectedPromoter.stats?.pendingEarnings?.toFixed(2) || '0.00'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                    Awaiting payment
                  </div>
                </div>
              </div>

              {/* Recent Activity Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#2d3748', marginBottom: '1rem' }}>
                  📊 Performance Overview
                </h3>
                <div style={{
                  padding: '1.5rem',
                  background: '#f7fafc',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
                        Conversion Rate
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#667eea' }}>
                        {selectedPromoter.stats?.totalReferrals 
                          ? ((selectedPromoter.stats.activeReferrals / selectedPromoter.stats.totalReferrals) * 100).toFixed(1)
                          : '0'}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
                        Avg. Earnings per Referral
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#48bb78' }}>
                        ${selectedPromoter.stats?.totalReferrals 
                          ? ((selectedPromoter.stats.totalEarnings || 0) / selectedPromoter.stats.totalReferrals).toFixed(2)
                          : '0.00'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Referrals */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#2d3748', marginBottom: '1rem' }}>
                  👥 Recent Referrals
                </h3>
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f7fafc' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#4a5568' }}>
                          User
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#4a5568' }}>
                          Status
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#4a5568' }}>
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3].map((i) => (
                        <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#2d3748' }}>
                            Referral User {i}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: i === 1 ? '#48bb7820' : '#667eea20',
                              color: i === 1 ? '#48bb78' : '#667eea'
                            }}>
                              {i === 1 ? 'Active' : 'Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#718096' }}>
                            {new Date(Date.now() - i * 86400000).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  onClick={() => handleToggleStatus(selectedPromoter.id, selectedPromoter.isActive)}
                  className="btn"
                  style={{
                    background: selectedPromoter.isActive ? '#f56565' : '#48bb78',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    flex: 1
                  }}
                >
                  {selectedPromoter.isActive ? '🚫 Deactivate Promoter' : '✅ Activate Promoter'}
                </button>
                <button
                  className="btn"
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    flex: 1
                  }}
                >
                  📧 Send Email
                </button>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="btn"
                  style={{
                    background: '#e2e8f0',
                    color: '#2d3748',
                    border: 'none',
                    padding: '0.75rem 1.5rem'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promoters;
