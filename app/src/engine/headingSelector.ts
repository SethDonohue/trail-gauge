import { HeadingFilter } from '../core/filters';
import {
  chooseHeadingSource, COURSE_MAX_AGE_MS, courseToShown, movingForCourse, resolveHeading,
  type HeadingSettings, type HeadingSource,
} from '../core/heading';
import { live, put, statusStore } from './live';
import { settingsStore } from './settings';

// Picks the compass heading from the GPS course or the magnetometer (Settings > Compass source),
// smooths it so the dial turns instead of jumping when GPS fixes arrive once a second, and puts it.
// Shared by the phone's sensors and the hub.
export class HeadingSelector {
  private readonly filter = new HeadingFilter(0.4);
  private moving = false;
  private lastCourse: number | null = null;
  private lastMs = 0;
  private source: HeadingSource = null;

  // magDeg: tilt-compensated magnetic heading, or null if there is none.
  update(magDeg: number | null, nowMs = Date.now()): void {
    const s = settingsStore.get();
    const st = statusStore.get();
    const hs: HeadingSettings = {
      northRef: s.northRef, declinationMode: s.declinationMode, learnedDeclinationDeg: s.declinationDeg,
      manualDeclinationDeg: s.manualDeclinationDeg, headingOffsetDeg: s.headingOffsetDeg,
    };
    this.moving = movingForCourse(st.speedMps, this.moving);
    const courseFresh = st.gpsCourseDeg !== null && nowMs - st.gpsCourseAtMs < COURSE_MAX_AGE_MS;
    if (this.moving && courseFresh) this.lastCourse = st.gpsCourseDeg;
    const src = chooseHeadingSource({
      pref: s.headingSource, moving: this.moving, courseFresh, haveLastCourse: this.lastCourse !== null,
      magAvailable: magDeg !== null, magDisturbed: st.magDisturbed,
    });
    if (src !== this.source) {
      this.source = src;
      statusStore.set({ headingSource: src });
    }
    let target: { deg: number; isTrue: boolean } | null = null;
    if ((src === 'gps' || src === 'held') && this.lastCourse !== null) target = courseToShown(this.lastCourse, hs);
    else if (src === 'compass' && magDeg !== null) target = resolveHeading(magDeg, hs);
    const dt = this.lastMs ? Math.min(1, (nowMs - this.lastMs) / 1000) : 0;
    this.lastMs = nowMs;
    if (!target) return; // nothing to show: the gauge goes to '--'
    live.headingTrue.value = target.isTrue;
    put('heading', this.filter.update(target.deg, dt));
  }

  reset(): void {
    this.filter.reset();
    this.lastMs = 0;
  }
}
