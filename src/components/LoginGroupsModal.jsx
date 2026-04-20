import React, { useState, useRef, useEffect } from 'react';

const LoginGroupsModal = ({ 
  isOpen, 
  onClose, 
  groups = [],
  onCreateGroup,
  onEditGroup,
  onDeleteGroup,
  onSelectGroup,
  activeGroupName,
  onPendingChange
}) => {
  const [tempSelectedGroup, setTempSelectedGroup] = useState(activeGroupName)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const modalRef = useRef(null)

  // Update temp selection when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTempSelectedGroup(activeGroupName)
    }
  }, [isOpen, activeGroupName])

  // Notify parent about pending selection differences
  useEffect(() => {
    if (!isOpen) return
    if (onPendingChange) {
      const hasPending = (tempSelectedGroup || null) !== (activeGroupName || null)
      try {
        onPendingChange(hasPending, tempSelectedGroup || null)
      } catch {
        onPendingChange(hasPending)
      }
    }
  }, [isOpen, tempSelectedGroup, activeGroupName, onPendingChange])

  // Detect focus within modal to expand height when inputs are focused (e.g., search bar)
  useEffect(() => {
    if (!isOpen) return
    const el = modalRef.current
    if (!el) return
    const onFocusIn = (e) => {
      const target = e.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('role') === 'search')) {
        setIsSearchFocused(true)
      }
    }
    const onFocusOut = (e) => {
      // Collapse when focus leaves inputs
      setIsSearchFocused(false)
    }
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('focusout', onFocusOut)
    return () => {
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [isOpen])

  if (!isOpen) return null;

  const hasGroups = groups && groups.length > 0;

  const handleApply = () => {
    if (onSelectGroup && tempSelectedGroup) {
      const group = groups.find(g => g.name === tempSelectedGroup)
      if (group) {
        onSelectGroup(group)
      }
    }
    onClose()
  }

  const handleClear = () => {
    setTempSelectedGroup(null)
    if (onSelectGroup) {
      onSelectGroup(null)
    }
    onClose()
  }

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

      {/* Modal content - Bottom Sheet */}
      <div
        ref={modalRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '412px',
          height: 'auto',
          maxHeight: isSearchFocused ? 'calc(85vh + 100px)' : '85vh',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          transition: 'max-height 0.25s ease'
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
            Login Groups
          </h2>

          {/* Create New Group button (+ icon) */}
          <button
            onClick={() => {
              onCreateGroup && onCreateGroup()
              onClose()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 5V19M5 12H19"
                stroke="#4B4B4B"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: '500px',
            maxHeight: isSearchFocused ? '600px' : '500px',
            transition: 'max-height 0.25s ease'
          }}
        >
          {hasGroups ? (
            // Show groups list with edit/delete icons
            <div style={{ width: '100%', padding: '0 20px' }}>
              {groups.map((group, index) => {
                const isSelected = tempSelectedGroup === group.name
                return (
                  <div
                    key={group.id || index}
                    onClick={() => setTempSelectedGroup(group.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: index < groups.length - 1 ? '1px solid #F2F2F7' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? '#F0F9FF' : 'transparent',
                      margin: '0 -20px',
                      paddingLeft: '20px',
                      paddingRight: '20px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '15px',
                          lineHeight: '18px',
                          color: isSelected ? '#2563EB' : '#1B2D45',
                          fontWeight: isSelected ? 600 : 500,
                        }}
                      >
                        {group.name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: '12px',
                          lineHeight: '16px',
                          color: '#999999',
                          marginTop: '2px',
                        }}
                      >
                        {group.loginCount || 0} logins
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      {/* Edit button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditGroup && onEditGroup(group)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M14.166 2.5009C14.3849 2.28203 14.6447 2.10842 14.9307 1.98996C15.2167 1.87151 15.5232 1.81055 15.8327 1.81055C16.1422 1.81055 16.4487 1.87151 16.7347 1.98996C17.0206 2.10842 17.2805 2.28203 17.4993 2.5009C17.7182 2.71977 17.8918 2.97961 18.0103 3.26558C18.1287 3.55154 18.1897 3.85804 18.1897 4.16757C18.1897 4.4771 18.1287 4.7836 18.0103 5.06956C17.8918 5.35553 17.7182 5.61537 17.4993 5.83424L6.24935 17.0842L1.66602 18.3342L2.91602 13.7509L14.166 2.5009Z"
                            stroke="#2563EB"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteGroup && onDeleteGroup(group)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M2.5 5H4.16667H17.5"
                            stroke="#FF383C"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6.66602 5.00008V3.33341C6.66602 2.89139 6.84161 2.46746 7.15417 2.1549C7.46673 1.84234 7.89065 1.66675 8.33268 1.66675H11.666C12.108 1.66675 12.532 1.84234 12.8445 2.1549C13.1571 2.46746 13.3327 2.89139 13.3327 3.33341V5.00008M15.8327 5.00008V16.6667C15.8327 17.1088 15.6571 17.5327 15.3445 17.8453C15.032 18.1578 14.608 18.3334 14.166 18.3334H5.83268C5.39065 18.3334 4.96673 18.1578 4.65417 17.8453C4.34161 17.5327 4.16602 17.1088 4.16602 16.6667V5.00008H15.8327Z"
                            stroke="#FF383C"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M8.33398 9.16675V14.1667"
                            stroke="#FF383C"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M11.666 9.16675V14.1667"
                            stroke="#FF383C"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Show empty state
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <p
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '16px',
                  lineHeight: '20px',
                  color: '#999999',
                  margin: '0 0 32px 0',
                }}
              >
                No groups created yet
              </p>

              {/* Create Now button */}
              <button
                onClick={() => {
                  onCreateGroup && onCreateGroup();
                  onClose();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: '#FFFFFF',
                  border: '1px solid #E6EEF8',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '16px',
                  lineHeight: '20px',
                  color: '#1B2D45',
                  fontWeight: 500,
                  boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 4V14M4 9H14"
                    stroke="#1B2D45"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Create Now
              </button>
            </div>
          )}
        </div>

        {/* Action buttons - Reset and Apply (match FilterModal styles) */}
        {hasGroups && (
          <div
            style={{
              padding: '0 20px 20px',
              borderTop: '1px solid #F2F2F7',
              display: 'flex',
              gap: '16px',
            }}
          >
            {/* Reset */}
            <button
              onClick={handleClear}
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
            {/* Apply */}
            <button
              onClick={handleApply}
              disabled={!tempSelectedGroup}
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '10px 27px',
                background: tempSelectedGroup ? '#2563EB' : '#E5E7EB',
                border: '1px solid ' + (tempSelectedGroup ? '#2563EB' : '#D1D5DB'),
                borderRadius: '20px',
                boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
                cursor: tempSelectedGroup ? 'pointer' : 'not-allowed',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                lineHeight: '20px',
                letterSpacing: '0.06em',
                textTransform: 'capitalize',
                color: tempSelectedGroup ? '#FFFFFF' : '#6B7280',
              }}
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default LoginGroupsModal;
