# Dashboard Face Cards - Drag & Drop User Guide

## ✨ New Feature: Customizable Card Layout

You can now **drag and drop** the Dashboard face cards to arrange them in your preferred order!

---

## 🎯 How to Use

### Step 1: Hover Over a Card
- Move your mouse over any face card
- Notice the **cursor changes** to a "move" cursor (↔️)
- Card **scales up slightly** and shows a shadow

### Step 2: Drag the Card
- **Click and hold** on the card you want to move
- The card becomes **semi-transparent** (50% opacity)
- **Drag** the card to your desired position

### Step 3: Drop on Target
- **Hover** over the card you want to swap with
- **Release** the mouse button to drop
- The two cards **instantly swap positions**
- Your layout is **automatically saved**

### Step 4: Reset (Optional)
- Click the **"Reset Order"** button in the header
- All cards return to their original order
- New order is saved automatically

---

## 📋 Visual Indicators

### 🖱️ **Drag Instruction**
```
📊 Drag cards to reorder          [🔄 Reset Order]
```
- Located above the card grid
- Shows drag icon (↕️) on the left
- Reset button on the right

### 🎨 **Card States**

**Normal State**
```
┌─────────────────┐
│  Total Client   │  ← Normal appearance
│     1,234       │
└─────────────────┘
```

**Hover State** (Scale up 5%)
```
┌──────────────────┐
│  Total Client    │  ← Slightly larger
│     1,234        │  ← Shadow appears
└──────────────────┘
```

**Dragging State** (50% opacity)
```
┌─────────────────┐
│  Total Client   │  ← Semi-transparent
│     1,234       │  ← Being dragged
└─────────────────┘
```

**Active/Pressed State** (Scale down 5%)
```
┌───────────────┐
│ Total Client  │  ← Slightly smaller
│    1,234      │  ← While holding
└───────────────┘
```

---

## 🔄 Example Swap

### Before Drag
```
┌─────┬─────┬─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │  5  │  6  │
│Total│Total│Total│ Net │Total│Total│
│Clnt │Dpsit│Wdraw│Dpsit│Blnce│Eqty │
└─────┴─────┴─────┴─────┴─────┴─────┘
```

### After Dragging Card 2 to Card 5
```
┌─────┬─────┬─────┬─────┬─────┬─────┐
│  1  │  5  │  3  │  4  │  2  │  6  │  ← Card 2 and 5 swapped!
│Total│Total│Total│ Net │Total│Total│
│Clnt │Eqty │Wdraw│Dpsit│Dpsit│Blnce│
└─────┴─────┴─────┴─────┴─────┴─────┘
```

---

## 💾 Persistent Storage

### Automatic Saving
- Your card order is **automatically saved** after each swap
- Saved to browser's **localStorage**
- **Persists** across:
  - ✅ Page refreshes
  - ✅ Browser restarts
  - ✅ Login/logout sessions

### Storage Location
- **Key**: `dashboardCardOrder`
- **Format**: JSON array `[1, 5, 3, 4, 2, 6, 7, ...]`
- **Size**: ~50 bytes (minimal storage)

### Clear Storage
```javascript
// To manually clear (Browser Console)
localStorage.removeItem('dashboardCardOrder')
// Then refresh page to reset to default
```

---

## 📱 Card Grid Layout

### Responsive Breakpoints

**Mobile (< 768px)**: 2 columns
```
┌─────┬─────┐
│  1  │  2  │
├─────┼─────┤
│  3  │  4  │
├─────┼─────┤
│  5  │  6  │
└─────┴─────┘
```

**Tablet (768px - 1024px)**: 3 columns
```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │
├─────┼─────┼─────┤
│  4  │  5  │  6  │
└─────┴─────┴─────┘
```

**Desktop (> 1024px)**: 6 columns
```
┌─────┬─────┬─────┬─────┬─────┬─────┐
│  1  │  2  │  3  │  4  │  5  │  6  │
├─────┼─────┼─────┼─────┼─────┼─────┤
│  7  │  8  │  9  │ 10  │ 11  │ 12  │
└─────┴─────┴─────┴─────┴─────┴─────┘
```

---

## 🎨 Default Card Order

### Row 1 (Cards 1-6)
1. **Total Client** - Blue border
2. **Total Deposit** - Green border
3. **Total Withdrawal** - Red border
4. **Net Deposit** - Emerald/Rose (conditional)
5. **Total Balance** - Indigo border
6. **Total Equity** - Sky blue border

### Row 2 (Cards 7-12)
7. **Total Correction** - Purple border
8. **Total Credit IN** - Emerald border
9. **Total Credit Out** - Orange border
10. **Net Client** - Cyan border
11. **Floating P&L** - Green/Red with icon
12. **Lifetime P&L** - Violet/Pink (conditional)

### Row 3 (Cards 13-17)
13. **Daily Deposit** - Green border
14. **Daily Withdrawal** - Red border
15. **Daily P&L** - Emerald/Rose (conditional)
16. **This Week P&L** - Cyan/Amber (conditional)
17. **This Month P&L** - Teal/Orange (conditional)

---

## 💡 Pro Tips

### 🎯 Organize by Priority
Put your most important metrics in the **top-left** position for quick access:
```
Most Important → Top Left
Least Important → Bottom Right
```

### 📊 Group Related Metrics
Group similar metrics together:
```
Deposits & Withdrawals together
All P&L metrics together
Balance & Equity together
```

### 🎨 Color Coordination
Arrange by color theme for visual appeal:
```
Green metrics (deposits/profits) together
Red metrics (withdrawals/losses) together
Blue metrics (clients/accounts) together
```

### ⚡ Quick Access
Place frequently viewed metrics in the **first row** (cards 1-6)

---

## 🔧 Troubleshooting

### Cards not dragging?
- **Ensure cursor is over the card** (not just the border)
- **Click and hold** before dragging
- Try **refreshing the page**

### Order not saving?
- **Check browser localStorage** is enabled
- **Not in incognito/private mode** (localStorage disabled)
- Try **manual reset** then re-arrange

### Cards look weird after drag?
- **Refresh the page** to reset visual state
- **Click "Reset Order"** to restore default layout

### Lost custom order?
- Order saved **per browser/device**
- Clearing browser data removes saved order
- Use **different browsers** = different orders

---

## 🚀 Keyboard Shortcuts

Currently, drag-and-drop is **mouse-only**. 

Future enhancement: Keyboard accessibility
- `Tab` to focus cards
- `Space/Enter` to select
- `Arrow keys` to move
- `Space/Enter` to drop

---

## 📝 Example Use Cases

### 1. **Trader Focus**
```
Priority: P&L Metrics
Order: 11, 12, 15, 16, 17, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14
```

### 2. **Financial Overview**
```
Priority: Balance & Deposits
Order: 5, 6, 2, 3, 4, 1, 13, 14, 7, 8, 9, 10, 11, 12, 15, 16, 17
```

### 3. **Risk Management**
```
Priority: Equity & Corrections
Order: 6, 10, 7, 11, 1, 5, 2, 3, 4, 8, 9, 12, 13, 14, 15, 16, 17
```

### 4. **Daily Operations**
```
Priority: Daily Metrics
Order: 13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17
```

---

## 🎉 Benefits

✅ **Personalized Dashboard** - Arrange cards your way
✅ **Quick Access** - Put important metrics first
✅ **Better Workflow** - Organize by your needs
✅ **Visual Clarity** - Group related metrics
✅ **Time Saving** - Faster data scanning
✅ **Persistent** - Saves your preferences
✅ **Flexible** - Easy to reorganize anytime
✅ **Reset Option** - Return to default instantly

---

## 🔮 Coming Soon

- 🎯 **Keyboard navigation** support
- 📱 **Touch drag-and-drop** for mobile/tablet
- 💾 **Multiple saved layouts** (presets)
- 📤 **Export/import** layouts
- 👥 **Share layouts** with team
- 🎨 **Custom card colors** and themes

---

## 📞 Support

Having issues with drag-and-drop?
- Check the troubleshooting section above
- Clear browser cache and cookies
- Try a different browser
- Contact support team

---

**Enjoy your customizable Dashboard! 🎨**
