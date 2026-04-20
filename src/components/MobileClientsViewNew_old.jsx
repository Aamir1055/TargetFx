import { useState } from 'react'

const MobileClientsViewNew = ({ clients = [], onClientClick }) => {
  return (
    <div style={{
      position: 'relative',
      width: '412px',
      height: '923px',
      background: '#F4F4F4',
      fontFamily: 'Outfit, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Rectangle 41868 - Header */}
      <div style={{
        position: 'absolute',
        width: '412px',
        height: '118px',
        left: 'calc(50% - 412px/2)',
        top: '0px',
        background: '#FFFFFF',
        border: '0.911215px solid rgba(26, 99, 188, 0.05)',
        boxShadow: '0px 3.64486px 44.9229px rgba(0, 0, 0, 0.05)',
        borderRadius: '22px 22px 20px 20px'
      }}>
        {/* Frame 1707486430 - Main Header Row */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0px',
          gap: '119px',
          position: 'absolute',
          width: '372px',
          height: '36px',
          left: '20px',
          top: '62px'
        }}>
          {/* Hamburger Menu */}
          <button style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            width: '36px',
            height: '36px',
            background: 'rgba(230, 238, 248, 0.44)',
            boxShadow: 'inset 0px 2px 2px rgba(155, 151, 151, 0.2)',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer'
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect y="3.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
              <rect y="8.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
              <rect y="13.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
            </svg>
          </button>

          {/* Title & Profile Container */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '118px',
            flex: 1
          }}>
            {/* Clients Title */}
            <span style={{
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: '20px',
              lineHeight: '17px',
              color: '#4B4B4B'
            }}>
              Clients
            </span>

            {/* Profile Picture */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              overflow: 'hidden',
              boxShadow: 'inset 0px 4px 4px rgba(0, 0, 0, 0.25)'
            }}>
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces" 
                alt="Profile"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Frame 1707486432 - Action Buttons Row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px',
        gap: '274px',
        position: 'absolute',
        width: '372px',
        height: '18px',
        left: '20px',
        top: '138px'
      }}>
        {/* View All */}
        <span style={{
          width: '36px',
          height: '11px',
          fontFamily: 'Outfit',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '10px',
          lineHeight: '11px',
          color: '#1A63BC',
          flex: 'none',
          order: 0,
          flexGrow: 0
        }}>
          View All
        </span>

        {/* Frame 1707486431 - Icon Buttons Container */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0px',
          gap: '4px',
          width: '62px',
          height: '18px',
          flex: 'none',
          order: 1,
          flexGrow: 0
        }}>
          {/* Percentage Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.81846 8.06846C7.26347 8.06846 7.69848 7.9365 8.06849 7.68927C8.4385 7.44204 8.72689 7.09063 8.89719 6.6795C9.06748 6.26837 9.11204 5.81597 9.02523 5.37951C8.93841 4.94305 8.72412 4.54214 8.40945 4.22747C8.09478 3.9128 7.69387 3.69851 7.25741 3.6117C6.82095 3.52488 6.36855 3.56944 5.95742 3.73973C5.54629 3.91003 5.19488 4.19842 4.94765 4.56843C4.70042 4.93844 4.56846 5.37345 4.56846 5.81846C4.56933 6.41502 4.80658 6.98697 5.22841 7.40879C5.65023 7.83062 6.2219 8.06787 6.81846 8.06846ZM6.81846 5.06846C6.9668 5.06846 7.1118 5.11245 7.23514 5.19486C7.35848 5.27727 7.45461 5.3944 7.51137 5.53145C7.56814 5.66849 7.58299 5.81929 7.55405 5.96478C7.52511 6.11027 7.45368 6.2439 7.34879 6.34879C7.2439 6.45368 7.11027 6.52511 6.96478 6.55405C6.81929 6.58299 6.66849 6.56814 6.53145 6.51137C6.3944 6.45461 6.27727 6.35848 6.19486 6.23514C6.11245 6.1118 6.06846 5.9668 6.06846 5.81846C6.06846 5.61955 6.14748 5.42878 6.28813 5.28813C6.42878 5.14748 6.61955 5.06846 6.81846 5.06846ZM13.1815 9.93146C12.7365 9.93146 12.3015 10.0634 11.9315 10.3107C11.5615 10.5579 11.2731 10.9093 11.1028 11.3204C10.9325 11.7316 10.888 12.184 10.9748 12.6204C11.0616 13.0569 11.2759 13.4578 11.5906 13.7725C11.9052 14.0871 12.3062 14.3014 12.7426 14.3882C13.1791 14.475 13.6315 14.4305 14.0426 14.2602C14.4537 14.0899 14.8051 13.8015 15.0524 13.4315C15.2996 13.0615 15.4315 12.6265 15.4315 12.1815C15.4306 11.5849 15.1934 11.013 14.7716 10.5911C14.3497 10.1693 13.778 9.93206 13.1815 9.93146ZM13.1815 12.9315C13.0331 12.9315 12.8881 12.8875 12.7648 12.8051C12.6414 12.7227 12.5453 12.6055 12.4886 12.4685C12.4318 12.3314 12.4169 12.1806 12.4459 12.0351C12.4748 11.8897 12.5462 11.756 12.6511 11.6511C12.756 11.5462 12.8897 11.4748 13.0351 11.4459C13.1806 11.4169 13.3314 11.4318 13.4685 11.4886C13.6055 11.5453 13.7227 11.6414 13.8051 11.7648C13.8875 11.8881 13.9315 12.0331 13.9315 12.1815C13.9315 12.3804 13.8524 12.5711 13.7118 12.7118C13.5711 12.8524 13.3804 12.9315 13.1815 12.9315ZM15.7802 3.21971C15.6395 3.07911 15.4488 3.00012 15.2499 3.00012C15.051 3.00012 14.8603 3.07911 14.7197 3.21971L4.21971 13.7197C4.14888 13.7889 4.09106 13.8717 4.05175 13.9632C4.01244 14.0547 3.99236 14.1531 3.99144 14.2527C3.99053 14.3522 4.00881 14.451 4.04515 14.5432C4.08149 14.6353 4.13517 14.7191 4.20554 14.7895C4.27591 14.8599 4.35966 14.9156 4.45184 14.9533C4.54402 14.991 4.64285 15.01 4.74242 15.0091C4.842 15.0083 4.94056 14.9876 5.03204 14.9483C5.12353 14.909 5.20623 14.8518 5.27571 14.7802L15.7802 4.28021C15.9208 4.13957 15.9998 3.94883 15.9998 3.74996C15.9998 3.55109 15.9208 3.36036 15.7802 3.21971Z" fill="#4B4B4B"/>
            </svg>
          </button>

          {/* Download Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 1,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3H10.5V7.5H12.375L9 10.875M9 3H7.5V7.5H5.625L9 10.875" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.5 14.25H13.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Filter Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 2,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.25 8.25H12.75V9.75H5.25V8.25ZM3 5.25H15V6.75H3V5.25ZM7.5 11.25H10.5V12.75H7.5V11.25Z" fill="#4B4B4B"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Frame 1707486433 - Scrollable Face Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0px',
        gap: '10px',
        position: 'absolute',
        width: '392px',
        height: '82px',
        left: '20px',
        top: '166px',
        overflowX: 'scroll',
        overflowY: 'hidden'
      }} className="scrollbar-hide">
        {/* Card 1 - NET LIFETIME BONUS (Green/Up) */}
        <div style={{
          boxSizing: 'border-box',
          width: '176px',
          minWidth: '176px',
          height: '82px',
          background: '#FFFFFF',
          border: '1px solid #ECECEC',
          boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
          borderRadius: '8px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 'none'
        }}>
          {/* Top Section */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            {/* Icon + Label */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px'
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect width="12" height="12" fill="#1A63BC"/>
              </svg>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '8px',
                lineHeight: '10px',
                textTransform: 'uppercase',
                color: '#475467',
                whiteSpace: 'nowrap'
              }}>NET LIFETIME</span>
            </div>
            
            {/* Amount */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: '3px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '13px',
                lineHeight: '16px',
                color: '#4B4B4B',
                whiteSpace: 'nowrap'
              }}>4,99,514</span>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '8px',
                lineHeight: '10px',
                color: '#475467'
              }}>USD</span>
            </div>
          </div>
          
          {/* Bottom Section - Percentage + Chart */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            {/* Percentage Badge */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2px'
            }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M3 9L7 5L11 9" stroke="#15803D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '10px',
                lineHeight: '12px',
                color: '#15803D'
              }}>12.0%</span>
            </div>
            
            {/* Mini Chart */}
            <svg width="50" height="24" viewBox="0 0 50 24" fill="none" style={{ marginRight: '-5px' }}>
              <defs>
                <linearGradient id="greenGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(21, 128, 61, 0.3)" />
                  <stop offset="100%" stopColor="rgba(21, 128, 61, 0)" />
                </linearGradient>
              </defs>
              <path d="M0 24V14C7 12 14 10 21 8C28 6 35 7 42 9C45 10 48 8 50 6V24H0Z" fill="url(#greenGradient1)"/>
              <path d="M0 14C7 12 14 10 21 8C28 6 35 7 42 9C45 10 48 8 50 6" stroke="#15803D" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
        </div>

        {/* Card 2 - DAILY NET D/W (Red/Down) */}
        <div style={{
          boxSizing: 'border-box',
          width: '176px',
          minWidth: '176px',
          height: '82px',
          background: '#FFFFFF',
          border: '1px solid #ECECEC',
          boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
          borderRadius: '8px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 'none'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px'
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect width="12" height="12" fill="#1A63BC"/>
              </svg>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '8px',
                lineHeight: '10px',
                textTransform: 'uppercase',
                color: '#475467',
                whiteSpace: 'nowrap'
              }}>DAILY NET D/W</span>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: '3px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '13px',
                lineHeight: '16px',
                color: '#4B4B4B',
                whiteSpace: 'nowrap'
              }}>4,99,514</span>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '8px',
                lineHeight: '10px',
                color: '#475467'
              }}>USD</span>
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2px'
            }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M11 5L7 9L3 5" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '10px',
                lineHeight: '12px',
                color: '#B91C1C'
              }}>12.0%</span>
            </div>
            
            <svg width="50" height="24" viewBox="0 0 50 24" fill="none" style={{ marginRight: '-5px' }}>
              <defs>
                <linearGradient id="redGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(185, 28, 28, 0.3)" />
                  <stop offset="100%" stopColor="rgba(185, 28, 28, 0)" />
                </linearGradient>
              </defs>
              <path d="M0 0V10C7 12 14 14 21 16C28 18 35 17 42 15C45 14 48 16 50 18V0H0Z" fill="url(#redGradient1)"/>
              <path d="M0 10C7 12 14 14 21 16C28 18 35 17 42 15C45 14 48 16 50 18" stroke="#B91C1C" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
        </div>

        {/* Card 3 - MONTHLY EQUITY (Red/Down) */}
        <div style={{
          width: '176px',
          height: '82px',
          position: 'relative',
          flex: 'none',
          order: 2,
          flexGrow: 0
        }}>
          <div style={{
            boxSizing: 'border-box',
            position: 'absolute',
            left: '0%',
            right: '0%',
            top: '0%',
            bottom: '0%',
            background: '#FFFFFF',
            border: '1px solid #ECECEC',
            boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
            borderRadius: '8px'
          }} />
          
          <div style={{
            position: 'absolute',
            left: '5.68%',
            right: '5.68%',
            top: '12.2%',
            bottom: '12.2%'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '10px',
              position: 'absolute',
              left: '5.68%',
              right: '34.09%',
              top: '12.2%',
              bottom: '36.59%'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '6px',
                width: '106px',
                height: '12px'
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect width="12" height="12" fill="#1A63BC"/>
                </svg>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '10px',
                  lineHeight: '13px',
                  textTransform: 'uppercase',
                  color: '#475467'
                }}>MONTHLY EQUITY</span>
              </div>
              
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '2px',
                width: '106px',
                height: '20px'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 700,
                  fontSize: '14px',
                  lineHeight: '20px',
                  textTransform: 'uppercase',
                  color: '#4B4B4B'
                }}>4,99,514.54</span>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '10px',
                  lineHeight: '8px',
                  textTransform: 'uppercase',
                  color: '#475467'
                }}>USD</span>
              </div>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              padding: '0px',
              gap: '64px',
              position: 'absolute',
              height: '34px',
              left: '5.68%',
              right: '5.68%',
              top: 'calc(50% - 34px/2 + 14px)'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0px',
                gap: '3px',
                width: '48px',
                height: '14px',
                borderRadius: '50px'
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11 5L7 9L3 5" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '11px',
                  lineHeight: '13px',
                  letterSpacing: '0.01em',
                  color: '#B91C1C'
                }}>12.0%</span>
              </div>
              
              <svg width="44" height="34" viewBox="0 0 44 34" fill="none">
                <defs>
                  <linearGradient id="redGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(185, 28, 28, 0.3)" />
                    <stop offset="100%" stopColor="rgba(185, 28, 28, 0)" />
                  </linearGradient>
                </defs>
                <path d="M0 10V24C5 26 10 29 15 32C20 34 25 33 30 28C35 23 40 26 44 28V10H0Z" fill="url(#redGradient2)"/>
                <path d="M0 10C5 12 10 15 15 18C20 21 25 22 30 18C35 14 40 16 44 18" stroke="#B91C1C" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 4 - TOTAL EQUITY (Green/Up) */}
        <div style={{
          width: '176px',
          height: '82px',
          position: 'relative',
          flex: 'none',
          order: 3,
          flexGrow: 0
        }}>
          <div style={{
            boxSizing: 'border-box',
            position: 'absolute',
            left: '0%',
            right: '0%',
            top: '0%',
            bottom: '0%',
            background: '#FFFFFF',
            border: '1px solid #ECECEC',
            boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
            borderRadius: '8px'
          }} />
          
          <div style={{
            position: 'absolute',
            left: '5.68%',
            right: '5.68%',
            top: '12.2%',
            bottom: '12.2%'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '10px',
              position: 'absolute',
              left: '5.68%',
              right: '34.09%',
              top: '12.2%',
              bottom: '36.59%'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '6px',
                width: '106px',
                height: '12px'
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect width="12" height="12" fill="#1A63BC"/>
                </svg>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '10px',
                  lineHeight: '13px',
                  textTransform: 'uppercase',
                  color: '#475467'
                }}>TOTAL EQUITY</span>
              </div>
              
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '2px',
                width: '106px',
                height: '20px'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 700,
                  fontSize: '14px',
                  lineHeight: '20px',
                  textTransform: 'uppercase',
                  color: '#4B4B4B'
                }}>4,99,514.54</span>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '10px',
                  lineHeight: '8px',
                  textTransform: 'uppercase',
                  color: '#475467'
                }}>USD</span>
              </div>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              padding: '0px',
              gap: '64px',
              position: 'absolute',
              left: '5.68%',
              right: '5.68%',
              top: '46.34%',
              bottom: '12.2%'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0px',
                gap: '3px',
                width: '48px',
                height: '14px',
                borderRadius: '50px'
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 9L7 5L11 9" stroke="#15803D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{
                  fontFamily: 'Inter',
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '11px',
                  lineHeight: '13px',
                  letterSpacing: '0.01em',
                  color: '#15803D'
                }}>12.0%</span>
              </div>
              
              <svg width="44" height="34" viewBox="0 0 44 34" fill="none">
                <defs>
                  <linearGradient id="greenGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(21, 128, 61, 0.3)" />
                    <stop offset="100%" stopColor="rgba(21, 128, 61, 0)" />
                  </linearGradient>
                </defs>
                <path d="M0 34V20C5 18 10 15 15 12C20 9 25 8 30 10C35 12 40 8 44 6V34H0Z" fill="url(#greenGradient2)"/>
                <path d="M0 20C5 18 10 15 15 12C20 9 25 8 30 10C35 12 40 8 44 6" stroke="#15803D" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 5 - NET LIFETIME BONUS (Simplified) */}
        <div style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '20px',
          gap: '10px',
          width: '176px',
          height: '82px',
          background: '#FFFFFF',
          border: '1px solid #F2F2F7',
          boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
          borderRadius: '8px',
          flex: 'none',
          order: 4,
          flexGrow: 0
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '10px',
            width: '136px',
            height: '42px'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '22px',
              width: '136px',
              height: '12px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '10px',
                lineHeight: '13px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>NET LIFETIME BONUS</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect width="12" height="12" fill="#2563EB"/>
              </svg>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '4px',
              width: '136px',
              height: '20px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '18px',
                lineHeight: '20px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>4,99,514.54</span>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '10px',
                lineHeight: '8px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>USD</span>
            </div>
          </div>
        </div>

        {/* Card 6 - TOTAL EQUITY (Simplified) */}
        <div style={{
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '20px',
          gap: '10px',
          width: '176px',
          height: '82px',
          background: '#FFFFFF',
          border: '1px solid #F2F2F7',
          boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
          borderRadius: '8px',
          flex: 'none',
          order: 5,
          flexGrow: 0
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '10px',
            width: '136px',
            height: '42px'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '22px',
              width: '136px',
              height: '12px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '10px',
                lineHeight: '13px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>TOTAL EQUITY</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect width="12" height="12" fill="#2563EB"/>
              </svg>
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '0px',
              gap: '4px',
              width: '136px',
              height: '20px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '18px',
                lineHeight: '20px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>4,99,514.54</span>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '10px',
                lineHeight: '8px',
                textTransform: 'uppercase',
                color: '#333333'
              }}>USD</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px',
        gap: '274px',
        position: 'absolute',
        width: '372px',
        height: '18px',
        left: '20px',
        top: '138px'
      }}>
        {/* View All */}
        <span style={{
          width: '36px',
          height: '11px',
          fontFamily: 'Outfit',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '10px',
          lineHeight: '11px',
          color: '#1A63BC',
          flex: 'none',
          order: 0,
          flexGrow: 0
        }}>
          View All
        </span>

        {/* Frame 1707486431 - Icon Buttons Container */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0px',
          gap: '4px',
          width: '62px',
          height: '18px',
          flex: 'none',
          order: 1,
          flexGrow: 0
        }}>
          {/* Percentage Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.81846 8.06846C7.26347 8.06846 7.69848 7.9365 8.06849 7.68927C8.4385 7.44204 8.72689 7.09063 8.89719 6.6795C9.06748 6.26837 9.11204 5.81597 9.02523 5.37951C8.93841 4.94305 8.72412 4.54214 8.40945 4.22747C8.09478 3.9128 7.69387 3.69851 7.25741 3.6117C6.82095 3.52488 6.36855 3.56944 5.95742 3.73973C5.54629 3.91003 5.19488 4.19842 4.94765 4.56843C4.70042 4.93844 4.56846 5.37345 4.56846 5.81846C4.56933 6.41502 4.80658 6.98697 5.22841 7.40879C5.65023 7.83062 6.2219 8.06787 6.81846 8.06846ZM6.81846 5.06846C6.9668 5.06846 7.1118 5.11245 7.23514 5.19486C7.35848 5.27727 7.45461 5.3944 7.51137 5.53145C7.56814 5.66849 7.58299 5.81929 7.55405 5.96478C7.52511 6.11027 7.45368 6.2439 7.34879 6.34879C7.2439 6.45368 7.11027 6.52511 6.96478 6.55405C6.81929 6.58299 6.66849 6.56814 6.53145 6.51137C6.3944 6.45461 6.27727 6.35848 6.19486 6.23514C6.11245 6.1118 6.06846 5.9668 6.06846 5.81846C6.06846 5.61955 6.14748 5.42878 6.28813 5.28813C6.42878 5.14748 6.61955 5.06846 6.81846 5.06846ZM13.1815 9.93146C12.7365 9.93146 12.3015 10.0634 11.9315 10.3107C11.5615 10.5579 11.2731 10.9093 11.1028 11.3204C10.9325 11.7316 10.888 12.184 10.9748 12.6204C11.0616 13.0569 11.2759 13.4578 11.5906 13.7725C11.9052 14.0871 12.3062 14.3014 12.7426 14.3882C13.1791 14.475 13.6315 14.4305 14.0426 14.2602C14.4537 14.0899 14.8051 13.8015 15.0524 13.4315C15.2996 13.0615 15.4315 12.6265 15.4315 12.1815C15.4306 11.5849 15.1934 11.013 14.7716 10.5911C14.3497 10.1693 13.778 9.93206 13.1815 9.93146ZM13.1815 12.9315C13.0331 12.9315 12.8881 12.8875 12.7648 12.8051C12.6414 12.7227 12.5453 12.6055 12.4886 12.4685C12.4318 12.3314 12.4169 12.1806 12.4459 12.0351C12.4748 11.8897 12.5462 11.756 12.6511 11.6511C12.756 11.5462 12.8897 11.4748 13.0351 11.4459C13.1806 11.4169 13.3314 11.4318 13.4685 11.4886C13.6055 11.5453 13.7227 11.6414 13.8051 11.7648C13.8875 11.8881 13.9315 12.0331 13.9315 12.1815C13.9315 12.3804 13.8524 12.5711 13.7118 12.7118C13.5711 12.8524 13.3804 12.9315 13.1815 12.9315ZM15.7802 3.21971C15.6395 3.07911 15.4488 3.00012 15.2499 3.00012C15.051 3.00012 14.8603 3.07911 14.7197 3.21971L4.21971 13.7197C4.14888 13.7889 4.09106 13.8717 4.05175 13.9632C4.01244 14.0547 3.99236 14.1531 3.99144 14.2527C3.99053 14.3522 4.00881 14.451 4.04515 14.5432C4.08149 14.6353 4.13517 14.7191 4.20554 14.7895C4.27591 14.8599 4.35966 14.9156 4.45184 14.9533C4.54402 14.991 4.64285 15.01 4.74242 15.0091C4.842 15.0083 4.94056 14.9876 5.03204 14.9483C5.12353 14.909 5.20623 14.8518 5.27571 14.7802L15.7802 4.28021C15.9208 4.13957 15.9998 3.94883 15.9998 3.74996C15.9998 3.55109 15.9208 3.36036 15.7802 3.21971Z" fill="#4B4B4B"/>
            </svg>
          </button>

          {/* Download Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 1,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3H10.5V7.5H12.375L9 10.875M9 3H7.5V7.5H5.625L9 10.875" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.5 14.25H13.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Filter Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 2,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.25 8.25H12.75V9.75H5.25V8.25ZM3 5.25H15V6.75H3V5.25ZM7.5 11.25H10.5V12.75H7.5V11.25Z" fill="#4B4B4B"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default MobileClientsViewNew
