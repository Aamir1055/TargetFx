# New Deal Blinking Feature

## Overview
Implemented a visual blinking/flickering effect for newly added deals in both desktop and mobile views of the Live Dealing module. When a new deal arrives via WebSocket, it will blink with a yellow highlight for 3 seconds to draw user attention.

## Implementation Details

### Desktop View (LiveDealingPage.jsx)

#### 1. State Management
- Added `newDealIds` state to track which deals are currently new
- Uses a Set data structure for efficient add/remove operations

#### 2. Deal Addition Handler
- When a new deal is detected in `handleDealAddedEvent`:
  - Deal ID is added to `newDealIds` Set
  - A 3-second timer is set to automatically remove the deal ID from the Set
  - This ensures the blinking effect is temporary

#### 3. CSS Animation
```css
@keyframes dealBlink {
  0%, 100% { background-color: inherit; }
  25%, 75% { background-color: #fef3c7; }  /* Light yellow */
  50% { background-color: #fde68a; }       /* Darker yellow */
}

.new-deal-blink {
  animation: dealBlink 0.6s ease-in-out 4;  /* Blinks 4 times */
}
```

#### 4. Row Rendering
- Table rows check if their deal ID is in `newDealIds`
- If yes, applies the `new-deal-blink` CSS class
- Animation runs automatically and stops after 4 blinks (2.4 seconds total)

### Mobile View (LiveDealingModule.jsx)

#### Implementation
Same pattern as desktop view:
1. Added `newDealIds` state
2. Updated `handleDealAdded` to mark new deals
3. Added CSS keyframe animation
4. Applied `new-deal-blink` class to grid rows

## Animation Characteristics

- **Duration**: 0.6 seconds per cycle
- **Iterations**: 4 complete blinks
- **Total Time**: 2.4 seconds of blinking
- **Auto-removal**: Effect removed from state after 3 seconds
- **Colors**: Yellow gradient (#fef3c7 to #fde68a)
- **Easing**: ease-in-out for smooth transitions

## User Experience

### What Users See
1. New deal arrives via WebSocket
2. Row/card immediately starts blinking with yellow highlight
3. Blinks 4 times over 2.4 seconds
4. Returns to normal background color
5. No manual interaction required

### Benefits
- Instant visual feedback for new deals
- Clear indication of recent trading activity
- Non-intrusive (auto-stops after a few seconds)
- Works in both desktop and mobile views
- No performance impact (CSS animations are hardware-accelerated)

## Technical Notes

### Performance
- Uses CSS animations (GPU-accelerated)
- Minimal JavaScript overhead (just Set operations)
- Automatic cleanup via setTimeout
- No memory leaks (deal IDs are removed from tracking)

### Browser Compatibility
- Works in all modern browsers
- Fallback: Without CSS animation support, deals still appear normally

### State Management
- `newDealIds` is a React state variable containing a Set
- Updates trigger re-renders only for affected rows
- setTimeout ensures automatic cleanup even if component unmounts

## Testing Recommendations

1. **WebSocket Connection**: Ensure deals arrive via WebSocket
2. **Visual Check**: Verify yellow blinking effect appears
3. **Duration**: Confirm blinks stop after ~3 seconds
4. **Multiple Deals**: Test rapid arrival of multiple deals
5. **Pagination**: Verify effect works across different pages
6. **Filters**: Check effect works with filters applied

## Files Modified

1. `src/pages/LiveDealingPage.jsx`
   - Added `newDealIds` state
   - Updated `handleDealAddedEvent`
   - Added CSS keyframes
   - Applied class to table rows

2. `src/components/LiveDealingModule.jsx`
   - Added `newDealIds` state
   - Updated `handleDealAdded`
   - Added CSS keyframes
   - Applied class to grid rows

## Future Enhancements

Potential improvements:
- Make blink color configurable in settings
- Adjust blink duration/count via user preferences
- Add sound notification option
- Different colors for BUY vs SELL deals
- Blink intensity based on deal size
