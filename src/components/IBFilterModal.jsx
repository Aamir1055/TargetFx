import { useState, useEffect, useMemo } from 'react'
import api from '../services/api'

const IBFilterModal = ({ isOpen, onClose, onSelectIB, currentSelectedIB, onPendingChange }) => {
  const [ibEmails, setIbEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState(null)
  const [tempSelectedIB, setTempSelectedIB] = useState(null)

  useEffect(() => {
    if (isOpen) {
      fetchIBEmails()
      // Set temporary selection to current selection when modal opens
      setTempSelectedIB(currentSelectedIB)
    }
  }, [isOpen, currentSelectedIB])

  // Notify parent when there are pending changes
  useEffect(() => {
    if (isOpen && onPendingChange) {
      const hasPending = (tempSelectedIB?.email || null) !== (currentSelectedIB?.email || null)
      try {
        onPendingChange(hasPending, tempSelectedIB || null)
      } catch {
        onPendingChange(hasPending)
      }
    }
  }, [isOpen, tempSelectedIB, currentSelectedIB, onPendingChange])

  const fetchIBEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getIBEmails()
      // Handle different response structures
      const emailsData = response.data?.data?.emails || response.data?.emails || []
      if (emailsData && emailsData.length > 0) {
        // Sort by percentage in ascending order
        const sortedEmails = emailsData.sort((a, b) => {
          const percentA = parseFloat(a.percentage || 0)
          const percentB = parseFloat(b.percentage || 0)
          return percentA - percentB
        })
        setIbEmails(sortedEmails)
      } else {
        // If no emails, set empty array (not an error)
        setIbEmails([])
      }
    } catch (err) {
      console.error('Error fetching IB emails:', err)
      setError('Failed to fetch IB emails. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Filter emails based on search query
  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return ibEmails
    
    const query = searchQuery.toLowerCase()
    return ibEmails.filter(ib => 
      ib.email.toLowerCase().includes(query) ||
      ib.name?.toLowerCase().includes(query)
    )
  }, [ibEmails, searchQuery])

  const handleSelectIB = (ib) => {
    // Just store temporarily, don't apply yet
    setTempSelectedIB(ib)
  }

  const handleApply = async () => {
    if (!tempSelectedIB) return
    
    try {
      setLoading(true)
      // Fetch MT5 accounts for the selected IB
      const response = await api.getIBMT5Accounts(tempSelectedIB.email)
      
      // Handle different response structures
      const mt5Data = response.data?.data?.mt5_accounts || response.data?.mt5_accounts || []
      
      // Pass both IB info and MT5 accounts to parent
      if (typeof onSelectIB === 'function') {
        onSelectIB({
          email: tempSelectedIB.email,
          name: tempSelectedIB.name,
          percentage: tempSelectedIB.percentage,
          mt5Accounts: mt5Data
        })
      }
      onClose()
    } catch (err) {
      console.error('Error fetching MT5 accounts:', err)
      setError('Failed to fetch MT5 accounts. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setTempSelectedIB(null)
    if (typeof onSelectIB === 'function') {
      onSelectIB(null) // Clear the filter
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop overlay */}
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
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '412px',
          height: '70vh',
          minHeight: '600px',
          maxHeight: '70vh',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom, 20px)',
        }}
      >
        {/* Top indicator line */}
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
              // Instead of closing completely, return to CustomizeView menu
              if (typeof window !== 'undefined') {
                const ev = new CustomEvent('openCustomizeView')
                window.dispatchEvent(ev)
              }
              onClose()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
            }}
          >
            <svg
              width="8"
              height="14"
              viewBox="0 0 8 14"
              fill="none"
              style={{ transform: 'rotate(180deg)' }}
            >
              <path
                d="M1 1L7 7L1 13"
                stroke="#4B4B4B"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <h2
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: '18px',
              lineHeight: '24px',
              color: '#4B4B4B',
              letterSpacing: '-0.0041em',
              margin: 0,
            }}
          >
            IB Filter
          </h2>

          <div style={{ width: '18px' }} /> {/* Spacer for centering */}
        </div>

        {/* Divider line */}
        <div
          style={{
            width: '100%',
            height: '1px',
            background: '#F2F2F7',
            marginBottom: '20px',
          }}
        />

        {/* Search bar */}
        <div style={{ padding: '0 20px', marginBottom: '20px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
            }}
          >
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 45px',
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
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
            >
              <circle cx="8" cy="8" r="6.5" stroke="#999999" strokeWidth="1.5"/>
              <path d="M13 13L16 16" stroke="#999999" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* IB Emails list */}
        <div 
          style={{ 
            flex: 1, 
            padding: '0 20px', 
            overflowY: 'auto',
            minHeight: 0,
            maxHeight: 'calc(70vh - 200px)',
            marginBottom: '0'
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px 0',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid #F2F2F7',
                  borderTop: '3px solid #2563EB',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
            </div>
          ) : error ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <p
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '14px',
                  color: '#FF383C',
                  marginBottom: '16px',
                }}
              >
                {error}
              </p>
              <button
                onClick={fetchIBEmails}
                style={{
                  padding: '10px 20px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <p
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '14px',
                  color: '#999999',
                }}
              >
                {searchQuery ? 'No IB emails match your search' : 'No IB emails found'}
              </p>
            </div>
          ) : (
            filteredEmails.map((ib) => {
              const isSelected = tempSelectedIB?.email === ib.email
              return (
                <button
                  key={ib.id}
                  onClick={() => handleSelectIB(ib)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #F2F2F7',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Outfit, sans-serif',
                      fontWeight: isSelected ? 600 : 400,
                      fontSize: '16px',
                      lineHeight: '20px',
                      color: '#2563EB',
                      textAlign: 'left',
                    }}
                  >
                    {ib.email}
                  </span>
                  <svg
                    width="8"
                    height="14"
                    viewBox="0 0 8 14"
                    fill="none"
                  >
                    <path
                      d="M1 1L7 7L1 13"
                      stroke="#2563EB"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )
            })
          )}
        </div>

        {/* Bottom divider */}
        <div
          style={{
            width: '100%',
            height: '1px',
            background: '#F2F2F7',
            margin: '0',
            marginTop: 'auto',
          }}
        />

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: '20px',
            padding: '5px 18px 32px',
            background: '#FFFFFF',
          }}
        >
          {/* Reset button */}
          <button
            onClick={handleReset}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 16px',
              background: '#E5E7EB',
              border: '1px solid #D1D5DB',
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: '#6B7280',
            }}
          >
            Reset
          </button>

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={!tempSelectedIB || loading}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 27px',
              background: (tempSelectedIB && !loading) ? '#2563EB' : '#E5E7EB',
              border: '1px solid ' + ((tempSelectedIB && !loading) ? '#2563EB' : '#D1D5DB'),
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: (tempSelectedIB && !loading) ? 'pointer' : 'not-allowed',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: (tempSelectedIB && !loading) ? '#FFFFFF' : '#6B7280',
            }}
          >
            {loading ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Add CSS keyframes for loading spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  )
}

export default IBFilterModal
