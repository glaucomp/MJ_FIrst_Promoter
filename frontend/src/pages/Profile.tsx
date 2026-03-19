import { useEffect, useState } from 'react';
import { authAPI } from '../services/api';

interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'ADMIN' | 'PROMOTER';
  userType?: 'ADMIN' | 'ACCOUNT_MANAGER' | 'TEAM_MANAGER' | 'PROMOTER';
  isActive: boolean;
  createdAt: string;
}

interface UserTypeInfo {
  userId: string;
  userType: string;
  isAccountManager: boolean;
  isTeamLeader: boolean;
  isPromoter: boolean;
  isAdmin: boolean;
  invitedByAdmin: boolean;
  hasDownline: boolean;
  totalReferrals: number;
  totalCustomers: number;
  upline?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    isAccountManager: boolean;
  };
}

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [typeDetails, setTypeDetails] = useState<UserTypeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await authAPI.getCurrentUser();
      setProfile(response.data.user);
      setTypeDetails(response.data.typeDetails);
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const getUserTypeColor = (userType?: string) => {
    if (!userType) return '#718096';
    
    switch (userType) {
      case 'ADMIN':
        return '#805ad5';
      case 'ACCOUNT_MANAGER':
        return '#667eea';
      case 'TEAM_MANAGER':
        return '#ed8936';
      case 'PROMOTER':
        return '#48bb78';
      default:
        return '#718096';
    }
  };

  const getUserTypeLabel = (userType?: string) => {
    if (!userType) return 'User';
    
    switch (userType) {
      case 'ADMIN':
        return 'Administrator';
      case 'ACCOUNT_MANAGER':
        return 'Account Manager';
      case 'TEAM_MANAGER':
        return 'Team Manager';
      case 'PROMOTER':
        return 'Promoter';
      default:
        return 'Promoter';
    }
  };

  const getUserTypeDescription = (userType?: string) => {
    if (!userType) return 'Standard user account';
    
    switch (userType) {
      case 'ADMIN':
        return 'Full platform access with administrative privileges';
      case 'ACCOUNT_MANAGER':
        return 'Invited directly by admin, manages campaigns and teams';
      case 'TEAM_MANAGER':
        return 'Has built a team with active downline referrals';
      case 'PROMOTER':
        return 'Standard promoter account';
      default:
        return 'Standard user account';
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#718096' }}>Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '1.125rem', color: '#f56565' }}>{error || 'Profile not found'}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
          👤 My Profile
        </h2>
        <p style={{ color: '#718096', fontSize: '1rem' }}>
          View your account information and user type
        </p>
      </div>

      {/* Profile Card */}
      <div className="card" style={{ padding: '2rem', background: 'white', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: '2rem', marginBottom: '2rem' }}>
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${getUserTypeColor(profile.userType)} 0%, ${getUserTypeColor(profile.userType)}dd 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '3rem',
              flexShrink: 0,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
            }}
          >
            {profile.firstName?.charAt(0) || 'U'}
            {profile.lastName?.charAt(0) || ''}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '0.5rem' }}>
              {profile.firstName} {profile.lastName}
            </h3>
            <p style={{ fontSize: '1rem', color: '#718096', marginBottom: '1rem' }}>
              {profile.email}
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  background: `${getUserTypeColor(profile.userType)}20`,
                  color: getUserTypeColor(profile.userType),
                }}
              >
                {getUserTypeLabel(profile.userType)}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  background: profile.isActive ? '#48bb7820' : '#f5656520',
                  color: profile.isActive ? '#48bb78' : '#f56565',
                }}
              >
                {profile.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        {/* User Type Description */}
        <div
          style={{
            padding: '1.5rem',
            background: `${getUserTypeColor(profile.userType)}10`,
            borderRadius: '0.5rem',
            border: `2px solid ${getUserTypeColor(profile.userType)}30`,
            marginBottom: '2rem'
          }}
        >
          <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', marginBottom: '0.5rem' }}>
            About Your User Type
          </h4>
          <p style={{ fontSize: '0.875rem', color: '#718096', lineHeight: '1.6' }}>
            {getUserTypeDescription(profile.userType)}
          </p>
        </div>

        {/* Profile Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div
            style={{
              padding: '1.5rem',
              background: '#f7fafc',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
              User ID
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', fontFamily: 'monospace' }}>
              {profile.id}
            </div>
          </div>

          <div
            style={{
              padding: '1.5rem',
              background: '#f7fafc',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
              Role
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748' }}>
              {profile.role}
            </div>
          </div>

          <div
            style={{
              padding: '1.5rem',
              background: '#f7fafc',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
              Member Since
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748' }}>
              {new Date(profile.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Type Details Card */}
      {typeDetails && (
        <div className="card" style={{ padding: '2rem', background: 'white' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '1.5rem' }}>
            📊 Account Statistics
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div
              style={{
                padding: '1.5rem',
                background: '#f7fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👥</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#667eea', marginBottom: '0.25rem' }}>
                {typeDetails.totalReferrals}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                Total Referrals
              </div>
            </div>

            <div
              style={{
                padding: '1.5rem',
                background: '#f7fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛍️</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#48bb78', marginBottom: '0.25rem' }}>
                {typeDetails.totalCustomers}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                Total Customers
              </div>
            </div>

            <div
              style={{
                padding: '1.5rem',
                background: '#f7fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                {typeDetails.hasDownline ? '👨‍👩‍👧‍👦' : '🎯'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ed8936', marginBottom: '0.25rem' }}>
                {typeDetails.hasDownline ? 'Yes' : 'No'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                Has Downline
              </div>
            </div>
          </div>

          {/* Upline Information */}
          {typeDetails.upline && (
            <div
              style={{
                padding: '1.5rem',
                background: '#f7fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                marginTop: '1.5rem'
              }}
            >
              <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', marginBottom: '1rem' }}>
                📤 Your Upline
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '50px',
                    height: '50px',
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
                  {typeDetails.upline.firstName?.charAt(0) || ''}
                  {typeDetails.upline.lastName?.charAt(0) || ''}
                </div>
                <div>
                  <div style={{ fontWeight: '600', color: '#2d3748' }}>
                    {typeDetails.upline.firstName} {typeDetails.upline.lastName}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#718096' }}>
                    {typeDetails.upline.email}
                  </div>
                  {typeDetails.upline.isAccountManager && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '0.25rem',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: '#667eea20',
                        color: '#667eea'
                      }}
                    >
                      Account Manager
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Capabilities */}
          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#2d3748', marginBottom: '1rem' }}>
              🔓 Your Capabilities
            </h4>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {typeDetails.isAdmin && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#805ad510',
                    borderRadius: '0.5rem',
                    border: '1px solid #805ad530',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>🔐</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.875rem' }}>
                      Full Administrative Access
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      Manage campaigns, users, and all platform settings
                    </div>
                  </div>
                </div>
              )}
              
              {typeDetails.isAccountManager && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#667eea10',
                    borderRadius: '0.5rem',
                    border: '1px solid #667eea30',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>💼</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.875rem' }}>
                      Account Manager Privileges
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      Unlimited invites, campaign management, team oversight
                    </div>
                  </div>
                </div>
              )}

              {typeDetails.isTeamLeader && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#ed893610',
                    borderRadius: '0.5rem',
                    border: '1px solid #ed893630',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>👨‍👩‍👧‍👦</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.875rem' }}>
                      Team Manager
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      Lead {typeDetails.totalReferrals} team member{typeDetails.totalReferrals !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )}

              {typeDetails.isPromoter && !typeDetails.isAccountManager && !typeDetails.isTeamLeader && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#48bb7810',
                    borderRadius: '0.5rem',
                    border: '1px solid #48bb7830',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>🎯</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '0.875rem' }}>
                      Standard Promoter
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      Earn commissions and invite friends to grow your team
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Details */}
      <div className="card" style={{ padding: '2rem', background: 'white' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2d3748', marginBottom: '1.5rem' }}>
          📋 Account Details
        </h3>
        
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              Email Address
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
              {profile.email}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              Full Name
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
              {profile.firstName} {profile.lastName}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              User Type
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
              {getUserTypeLabel(profile.userType)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              Role
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
              {profile.role}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              Account Status
            </div>
            <div style={{ fontSize: '0.875rem', color: profile.isActive ? '#48bb78' : '#f56565', fontWeight: '600' }}>
              {profile.isActive ? 'Active' : 'Inactive'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#4a5568' }}>
              Member Since
            </div>
            <div style={{ fontSize: '0.875rem', color: '#2d3748' }}>
              {new Date(profile.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
