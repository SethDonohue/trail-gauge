import { HeadingFilter } from '../core/filters';
import { GyroBridge } from '../core/gyroHeading';
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
  private lastCourseAtMs = 0;
  private readonly gyro = new GyroBridge();
  private lastMs = 0;
  private source: HeadingSource = null;

  // magDeg: tilt-compensated magnetic heading, or null if there is none.
  // yawRateDegS: heading rate from the gyroscope (clockwise seen from above), or null without one.
  update(magDeg: number | null, nowMs = Date.now(), yawRateDegS: number | null = null): void {
    const s = settingsStore.get();
    const st = statusStore.get();
    const hs: HeadingSettings = {
      northRef: s.northRef, declinationMode: s.declinationMode, learnedDeclinationDeg: s.declinationDeg,
      manualDeclinationDeg: s.manualDeclinationDeg, headingOffsetDeg: s.headingOffsetDeg,
    };
    const dt = this.lastMs ? Math.min(1, (nowMs - this.lastMs) / 1000) : 0;
    this.lastMs = nowMs;
    this.moving = movingForCourse(st.speedMps, this.moving);
    const courseFresh = st.gpsCourseDeg !== null && nowMs - st.gpsCourseAtMs < COURSE_MAX_AGE_MS;
    if (this.moving && courseFresh) {
      this.lastCourse = st.gpsCourseDeg;
      // Each new GPS direction resets the gyroscope bridge, so its drift never builds up at speed.
      if (st.gpsCourseAtMs !== this.lastCourseAtMs && st.gpsCourseDeg !== null) this.gyro.anchor(st.gpsCourseDeg);
      this.lastCourseAtMs = st.gpsCourseAtMs;
    }
    if (yawRateDegS !== null) {
      if (st.speedMps !== null && st.speedMps < 0.3) this.gyro.learnBias(yawRateDegS, dt);
      this.gyro.step(yawRateDegS, dt);
    }
    const src = chooseHeadingSource({
      pref: s.headingSource, moving: this.moving, courseFresh, haveLastCourse: this.lastCourse !== null,
      gyroAvailable: yawRateDegS !== null && this.gyro.value !== null,
      magAvailable: magDeg !== null, magDisturbed: st.magDisturbed,
    });
    if (src !== this.source) {
      this.source = src;
      statusStore.set({ headingSource: src });
    }
    let target: { deg: number; isTrue: boolean } | null = null;
    if (src === 'gyro' && this.gyro.value !== null) target = courseToShown(this.gyro.value, hs);
    else if ((src === 'gps' || src === 'held') && this.lastCourse !== null) target = courseToShown(this.lastCourse, hs);
    else if (src === 'compass' && magDeg !== null) target = resolveHeading(magDeg, hs);
    if (!target) return; // nothing to show: the gauge goes to '--'
    live.headingTrue.value = target.isTrue;
    put('heading', this.filter.update(target.deg, dt));
  }

  reset(): void {
    this.filter.reset();
    this.lastMs = 0;
  }
}
