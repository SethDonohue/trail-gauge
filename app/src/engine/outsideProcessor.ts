import { combineOutside, OutsideTempCorrector } from '../core/outside';
import { put, statusStore } from './live';
import { loadOutsideMemory, rememberOutside, settingsStore } from './settings';

const REMEMBER_EVERY_MS = 60_000;

// Turns the hub's one or two outside sensors into the Outside gauge's reading: lower sensor wins,
// then the low-speed heat-soak correction (needs GPS speed; without it the reading is as measured).
class OutsideProcessor {
  private corrector = new OutsideTempCorrector(null);
  private lastSavedMs = 0;

  async init(): Promise<void> {
    this.corrector = new OutsideTempCorrector(await loadOutsideMemory());
  }

  reset(): void {
    loadOutsideMemory().then(m => (this.corrector = new OutsideTempCorrector(m)));
  }

  process(a: number | null, b: number | null): void {
    const { c, disagree } = combineOutside(a, b);
    const st = statusStore.get();
    if (disagree !== st.outsideDisagree) statusStore.set({ outsideDisagree: disagree });
    if (c === null) return;
    const now = Date.now();
    const enabled = settingsStore.get().outsideTempCorrection && st.locationGranted === true;
    const r = this.corrector.update(c, st.speedMps, now, enabled);
    put('ambient', r.c);
    if (r.holding !== st.outsideHolding) statusStore.set({ outsideHolding: r.holding });
    if (r.remember && now - this.lastSavedMs > REMEMBER_EVERY_MS) {
      this.lastSavedMs = now;
      rememberOutside(r.remember);
    }
  }
}

export const outsideProcessor = new OutsideProcessor();
