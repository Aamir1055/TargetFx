import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useGroups } from '../contexts/GroupContext';
import './LoginGroupModal.css';

const LoginGroupModal = ({ isOpen, onClose, onSave, onBack, editGroup = null }) => {
  const { createGroup, createRangeGroup, updateGroup } = useGroups();
  const [activeTab, setActiveTab] = useState('myLogin');
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState('');

  // My Login tab state
  const [logins, setLogins] = useState([]);
  const [selectedLogins, setSelectedLogins] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogins, setTotalLogins] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  // By Range tab state
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // Initialize form with edit data
  useEffect(() => {
    if (isOpen && editGroup) {
      console.log('Editing group:', editGroup);
      setGroupName(editGroup.name);
      if (editGroup.range) {
        // Range-based group
        setActiveTab('range');
        setRangeFrom(editGroup.range.from?.toString() || '');
        setRangeTo(editGroup.range.to?.toString() || '');
        setSelectedLogins([]);
      } else if (editGroup.loginIds && editGroup.loginIds.length > 0) {
        // Manual selection group
        setActiveTab('myLogin');
        const loginIdsAsStrings = editGroup.loginIds.map(id => String(id));
        console.log('Setting selected logins:', loginIdsAsStrings);
        setSelectedLogins(loginIdsAsStrings);
        setRangeFrom('');
        setRangeTo('');
      }
    } else if (isOpen) {
      // Reset for new group
      setGroupName('');
      setSelectedLogins([]);
      setRangeFrom('');
      setRangeTo('');
      setActiveTab('myLogin');
    }
  }, [isOpen, editGroup]);

  // Fetch logins for My Login tab
  const fetchLogins = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        fields: 'login,name,email',
        page: currentPage,
        limit: limit
      };
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const queryString = new URLSearchParams(params).toString();
      const response = await api.get(`/api/broker/clients/fields?${queryString}`);

      if (response.data.status === 'success') {
        setLogins(response.data.data.clients || []);
        setTotalPages(response.data.data.totalPages || 1);
        setTotalLogins(response.data.data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching logins:', err);
      setError('Failed to load logins');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery]);

  // Fetch logins when tab changes to My Login or page/search changes
  useEffect(() => {
    if (isOpen && activeTab === 'myLogin') {
      fetchLogins();
    }
  }, [isOpen, activeTab, fetchLogins]);

  // Handle select all on current page
  const handleSelectAll = () => {
    const currentPageLogins = logins.map(l => String(l.login));
    const allCurrentSelected = currentPageLogins.every(login => selectedLogins.includes(login));
    
    if (allCurrentSelected) {
      // Deselect all on current page
      setSelectedLogins(prev => prev.filter(login => !currentPageLogins.includes(login)));
    } else {
      // Select all on current page
      setSelectedLogins(prev => {
        const newSet = new Set([...prev, ...currentPageLogins]);
        return Array.from(newSet);
      });
    }
  };

  // Handle individual login selection
  const handleLoginSelect = (login) => {
    const loginStr = String(login);
    setSelectedLogins(prev => {
      if (prev.includes(loginStr)) {
        return prev.filter(l => l !== loginStr);
      } else {
        return [...prev, loginStr];
      }
    });
  };

  // Check if all current page logins are selected
  const isAllCurrentPageSelected = () => {
    if (logins.length === 0) return false;
    return logins.every(l => selectedLogins.includes(String(l.login)));
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchLogins();
  };

  // Handle save
  const handleSave = () => {
    // Validate group name
    if (!groupName.trim()) {
      setError('Please enter a group name');
      return;
    }

    if (activeTab === 'myLogin') {
      if (selectedLogins.length === 0) {
        setError('Please select at least one login');
        return;
      }

      if (editGroup) {
        // Update existing group
        updateGroup(editGroup.name, groupName.trim(), selectedLogins, null);
      } else {
        // Create new group
        createGroup(groupName.trim(), selectedLogins);
      }
    } else {
      // Range validation
      const min = parseInt(rangeFrom);
      const max = parseInt(rangeTo);

      if (!rangeFrom.trim() || !rangeTo.trim()) {
        setError('Please enter both From and To values');
        return;
      }

      if (isNaN(min) || isNaN(max)) {
        setError('Please enter valid numeric values');
        return;
      }

      if (min > max) {
        setError('From value cannot be greater than To value');
        return;
      }

      if (editGroup) {
        // Update existing group
        updateGroup(editGroup.name, groupName.trim(), null, { from: min, to: max });
      } else {
        // Create new group
        createRangeGroup(groupName.trim(), min, max);
      }
    }

    if (typeof onSave === 'function') {
      onSave();
    }
    handleClose();
  };

  // Handle close
  const handleClose = () => {
    setGroupName('');
    setSelectedLogins([]);
    setSearchQuery('');
    setCurrentPage(1);
    setRangeFrom('');
    setRangeTo('');
    setError('');
    setActiveTab('myLogin');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          zIndex: 9998,
        }}
        onClick={handleClose}
      />

      {/* Modal - Bottom Sheet */}
      <div
        className="login-group-modal"
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '412px',
          height: 'auto',
          maxHeight: '85vh',
          background: '#FFFFFF',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          transition: 'max-height 0.3s ease-in-out',
        }}
      >
        {/* Top indicator */}
        <div
          style={{
            width: '47px',
            height: '2px',
            background: 'rgba(71, 84, 103, 0.55)',
            borderRadius: '2px',
            margin: '10px auto',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            marginBottom: '10px',
          }}
        >
          <button
            onClick={() => {
              handleClose()
              if (onBack) onBack()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
            }}
          >
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ transform: 'rotate(180deg)' }}>
              <path d="M1 1L7 7L1 13" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <h2
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: '18px',
              lineHeight: '24px',
              color: '#4B4B4B',
              margin: 0,
            }}
          >
            {editGroup ? 'Edit Login Group' : 'Login Groups'}
          </h2>

          <div style={{ width: '18px' }} />
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: '1px', background: '#F2F2F7', marginBottom: '16px' }} />

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {/* Group Name Input */}
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <input
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                setError('');
              }}
              placeholder="Enter Group Name"
              style={{
                width: '100%',
                padding: '12px 45px 12px 16px',
                background: '#FFFFFF',
                border: '1px solid #E6EEF8',
                borderRadius: '12px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '14px',
                color: '#1B2D45',
                outline: 'none',
              }}
            />
            <svg
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path d="M10 13C11.6569 13 13 11.6569 13 10C13 8.34315 11.6569 7 10 7C8.34315 7 7 8.34315 7 10C7 11.6569 8.34315 13 10 13Z" stroke="#2563EB" strokeWidth="1.5"/>
              <path d="M3 18C3 15.2386 5.23858 13 8 13H12C14.7614 13 17 15.2386 17 18" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setActiveTab('myLogin')}
              style={{
                flex: 1,
                padding: '10px',
                background: activeTab === 'myLogin' ? '#2563EB' : '#FFFFFF',
                color: activeTab === 'myLogin' ? '#FFFFFF' : '#999999',
                border: activeTab === 'myLogin' ? 'none' : '1px solid #E6EEF8',
                borderRadius: '20px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              My Login
            </button>
            <button
              onClick={() => setActiveTab('range')}
              style={{
                flex: 1,
                padding: '10px',
                background: activeTab === 'range' ? '#2563EB' : '#FFFFFF',
                color: activeTab === 'range' ? '#FFFFFF' : '#999999',
                border: activeTab === 'range' ? 'none' : '1px solid #E6EEF8',
                borderRadius: '20px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              By Range
            </button>
          </div>

          {/* My Login Tab */}
          {activeTab === 'myLogin' && (
            <div>
              {/* Info text */}
              <div style={{ marginBottom: '12px' }}>
                <p style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '12px',
                  color: '#999999',
                }}>
                  Showing {logins.length} items on this page
                </p>
              </div>

              {/* Search */}
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <input
                  type="text"
                  className="login-group-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchLogins()}
                  placeholder="Search login, name, email"
                  style={{
                    width: '100%',
                    padding: '12px 45px 12px 16px',
                    background: '#FFFFFF',
                    border: '1px solid #E6EEF8',
                    borderRadius: '12px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '14px',
                    color: '#1B2D45',
                    outline: 'none',
                  }}
                />
                <svg
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                  }}
                  onClick={fetchLogins}
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <circle cx="8" cy="8" r="6.5" stroke="#999999" strokeWidth="1.5"/>
                  <path d="M13 13L16 16" stroke="#999999" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>

              {/* Logins List */}
              <div style={{ height: '340px', minHeight: '340px', maxHeight: '340px', overflowY: 'auto', marginBottom: '8px' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#999999' }}>
                    Loading...
                  </div>
                ) : logins.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#999999' }}>
                    {searchQuery ? 'No logins found' : 'No logins available'}
                  </div>
                ) : (
                  logins.map((client) => {
                    const isSelected = selectedLogins.includes(String(client.login));
                    return (
                      <div
                        key={client.login}
                        onClick={() => handleLoginSelect(client.login)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '12px 0',
                          borderBottom: '1px solid #F2F2F7',
                          cursor: 'pointer',
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: isSelected ? '2px solid #2563EB' : '2px solid #E6EEF8',
                            background: isSelected ? '#2563EB' : '#FFFFFF',
                            marginRight: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isSelected && (
                            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                              <path d="M1 5L4.5 8.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>

                        {/* Login Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: 'Outfit, sans-serif',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#2563EB',
                            marginBottom: '2px',
                          }}>
                            {client.login}
                          </div>
                          <div style={{
                            fontFamily: 'Outfit, sans-serif',
                            fontSize: '12px',
                            color: '#999999',
                          }}>
                            {client.name || client.email || '-'}
                            {client.email && client.name && ` (${client.email})`}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination - Sticky at bottom */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 0',
                  position: 'sticky',
                  bottom: 0,
                  background: '#FFFFFF',
                  borderTop: '1px solid #F2F2F7',
                  zIndex: 10,
                }}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '6px 12px',
                      background: currentPage === 1 ? '#F2F2F7' : '#2563EB',
                      color: currentPage === 1 ? '#999999' : '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Previous
                  </button>
                  <span style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '12px',
                    color: '#4B4B4B',
                  }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: '6px 12px',
                      background: currentPage === totalPages ? '#F2F2F7' : '#2563EB',
                      color: currentPage === totalPages ? '#999999' : '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* By Range Tab */}
          {activeTab === 'range' && (
            <div style={{ padding: '8px 0' }}>
              <p style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '12px',
                color: '#999999',
                marginBottom: '16px',
              }}>
                Enter a range of login IDs (e.g., from 1 to 30)
              </p>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '12px',
                    color: '#4B4B4B',
                    marginBottom: '6px',
                  }}>
                    From
                  </label>
                  <input
                    type="number"
                    value={rangeFrom}
                    onChange={(e) => {
                      setRangeFrom(e.target.value);
                      setError('');
                    }}
                    placeholder="e.g., 1"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#FFFFFF',
                      border: '1px solid #E6EEF8',
                      borderRadius: '12px',
                      fontFamily: 'Outfit, sans-serif',
                      fontSize: '14px',
                      color: '#1B2D45',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '12px',
                    color: '#4B4B4B',
                    marginBottom: '6px',
                  }}>
                    To
                  </label>
                  <input
                    type="number"
                    value={rangeTo}
                    onChange={(e) => {
                      setRangeTo(e.target.value);
                      setError('');
                    }}
                    placeholder="e.g., 30"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#FFFFFF',
                      border: '1px solid #E6EEF8',
                      borderRadius: '12px',
                      fontFamily: 'Outfit, sans-serif',
                      fontSize: '14px',
                      color: '#1B2D45',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '12px 20px',
            background: '#FEE2E2',
            borderTop: '1px solid #FCA5A5',
          }}>
            <p style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '12px',
              color: '#DC2626',
            }}>
              {error}
            </p>
          </div>
        )}

        {/* Footer Buttons */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #F2F2F7',
          display: 'flex',
          gap: '10px',
        }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1,
              padding: '12px',
              background: '#FFFFFF',
              border: '1px solid #E6EEF8',
              borderRadius: '12px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              color: '#2563EB',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {editGroup ? 'Reset' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '12px',
              background: '#2563EB',
              border: 'none',
              borderRadius: '12px',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {editGroup ? 'Apply' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
};

export default LoginGroupModal;
