// Hawkwind's verdict on a virtue, in our own words. He ranks karma below 20 /
// 40 / 60 / 99, and at 99 sends you to meditate (u4-decompiled U4_SHOPS.C
// SHP_hawkwind). 0 means a partial Avatar already.
export interface VirtueBand {
  label: string
  /** 0 (far) to 4 (ready); 5 for a partial Avatar. */
  step: number
}

export function hawkwindBand(karma: number): VirtueBand {
  if (karma === 0) return { label: 'Partial Avatar', step: 5 }
  if (karma >= 99) return { label: 'Ready: meditate 3 cycles at its shrine', step: 4 }
  if (karma >= 60) return { label: 'Close to Elevation', step: 3 }
  if (karma >= 40) return { label: 'Halfway there', step: 2 }
  if (karma >= 20) return { label: 'Some way to go', step: 1 }
  return { label: 'Far from Elevation', step: 0 }
}
