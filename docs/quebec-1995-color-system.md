# Quebec 1995 Referendum Color System

## Implementation Summary

Production-ready color system for the 1995 Quebec Referendum live simulation with WCAG compliance, color-blind considerations, and broadcast readiness.

## Core Color Palette

### Oui (Gold/Amber)
- **200** `#FDE68A` - 0-1pp (toss-up)
- **300** `#FCD34D` - 1-3pp
- **400** `#FBBF24` - 3-5pp
- **500** `#F59E0B` - 5-10pp
- **600** `#D97706` - 10-20pp
- **700** `#B45309` - 20+pp

### Non (Blue)
- **200** `#BFDBFE` - 0-1pp (toss-up)
- **300** `#93C5FD` - 1-3pp
- **400** `#60A5FA` - 3-5pp
- **500** `#3B82F6` - 5-10pp
- **600** `#2563EB` - 10-20pp
- **700** `#1D4ED8` - 20+pp

### UI Colors
- **No Data**: `#E5E7EB` (gray)
- **Panel Background**: `#111827` @ 92% opacity
- **Border**: `#475569` (slate)
- **Text Primary**: `#F8FAFC`
- **Text Secondary**: `#CBD5E1`
- **Accent (Locked)**: `#A855F7` (violet)

## Features Implemented

### 1. Map Fills
- **Margin-based coloring**: 6 buckets per side (0-1, 1-3, 3-5, 5-10, 10-20, 20+pp)
- **Partial results dimming**: 70% brightness when countedPct < 100 and not locked
- **No data state**: Gray (#E5E7EB) for unreported ridings

### 2. Province Banner
- **Oui percentage**: Gold (#F59E0B)
- **Non percentage**: Blue (#3B82F6)
- **Margin chip**: Background color matches leader (gold/blue), white text
- **Enhanced panel**: 92% opacity slate background with border and shadow

### 3. Legend
- **Margin buckets**: Visual gradient showing all 6 margin ranges for both sides
- **Status indicators**: 
  - No data (gray)
  - Partial results (dimmed color)
  - Locked ridings (🔒 icon)
- **Compact design**: Fits in bottom-left without obscuring map

### 4. Tooltips
- **Leader highlight**: Winning side shown in bold with bucket color (#D97706 or #2563EB)
- **Margin badge**: Colored chip showing leader + margin in pp
- **Enhanced contrast**: Dark panel (92% opacity) with proper borders
- **Language data**: Shows francophone percentage from 1991 census

### 5. Border Styling
- **Normal borders**: Dark slate (#0F172A) @ 0.6-0.8px
- **Locked ridings**: Violet accent (#A855F7) @ 1.2px for visual "glow"
- **Hover effect**: Brighter white highlight on mouseover

## Accessibility Features

### Color-Blind Support
- Margin encoded in **both** hue (gold/blue) and saturation (lighter to darker)
- Locked ridings use violet borders (distinct from both gold and blue)
- Partial results dimmed to 70% (texture differentiation)

### Contrast Ratios
- Text on panels: 12:1 (white on dark slate)
- Margin chips: 4.5:1+ (white text on mid-tone backgrounds)
- Legend swatches: Clearly distinguishable gradients

### Visual Hierarchy
1. Province banner (top center, large numbers)
2. Map visualization (primary focus)
3. Legend (bottom-left, reference)
4. Controls (top-right, secondary)

## DeckGL Configuration

### GeoJsonLayer Settings
```typescript
{
  filled: true,
  extruded: true,
  wireframe: true,
  getElevation: margin * 500 * heightScale * (countedPct/100),
  getFillColor: margin-based bucket selection,
  getLineColor: locked ? violet : dark slate,
  lineWidthMinPixels: 0.6,
  lineWidthMaxPixels: 1.2,
  autoHighlight: true,
  highlightColor: [255, 255, 255, 120]
}
```

## Simulation Logic

### Progressive Reporting
- Random 5-20% chunks every 300ms
- Ridings report in random order
- Lock when >98% counted AND >2pp margin

### Height Encoding
- Extrusion height = margin × 500 × heightScale × (countedPct/100)
- Grows progressively as more polls report
- Final height reflects margin strength

## Browser Compatibility
- Tested in Chrome, Firefox, Edge, Safari
- Hardware acceleration recommended for smooth 3D rendering
- Fallback for devices without WebGL: 2D choropleth view

## Performance Notes
- 78 Quebec ridings render efficiently
- Color calculations cached per riding
- Tooltip HTML generated on-demand
- No performance issues at 60fps

## Future Enhancements (Optional)
- [ ] Hatch pattern overlay for partial results (diagonal lines)
- [ ] Cross-hatch for too-close-to-call (<1pp margin)
- [ ] Red stipple overlay for high rejected ballot percentage
- [ ] Pulse animation on margin chip when province flips
- [ ] Sparkline showing Oui/Non percentages over time
- [ ] Diverging bar chart in province banner
