import { Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import {
  AlertTracker, batteryLevel, cabinLevel, coolantLevel, fogLevel, iceLevel, tiltLevel,
  type AlertId, type Beep, type Level,
} from '../core/alerts';
import { readFresh, statusStore } from './live';
import { settingsStore } from './settings';

const WARN_VIBRATION = [0, 120, 90, 120];
const ALARM_VIBRATION = [0, 250, 120, 250, 120, 400];
const TICK_MS = 500;

// Watches the readings, colours nothing (the gauges do that), and beeps/vibrates per the rules in
// core/alerts.ts. Alert sounds use the media volume.
class AlertMonitor {
  private tracker = new AlertTracker();
  private timer: ReturnType<typeof setInterval> | null = null;
  private players: Partial<Record<Beep, AudioPlayer>> = {};

  start(): void {
    if (this.timer) return;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', allowsRecording: false })
      .catch(() => {});
    try {
      this.players.warn = createAudioPlayer(require('../../assets/sounds/warn.wav'));
      this.players.alarm = createAudioPlayer(require('../../assets/sounds/alarm.wav'));
    } catch {
      // No audio on this device: vibration still works.
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  levels(): Partial<Record<AlertId, Level | null>> {
    const s = settingsStore.get();
    const now = Date.now();
    const r = (ch: Parameters<typeof readFresh>[0]) => readFresh(ch, now);
    const outside = r('ambient');
    const cabin = r('cabin');
    return {
      tilt: tiltLevel(r('pitch'), r('roll'), s.pitchWarnDeg, s.rollWarnDeg),
      coolant: coolantLevel(r('coolant'), s.coolantWarnC),
      battery: batteryLevel(r('battery'), s.batteryLowV),
      ice: iceLevel(outside, s.iceRiskC),
      cabin: cabinLevel(cabin, s.cabinWarnC),
      fog: s.fogWarnings ? fogLevel(outside, cabin, r('humidity')) : null,
    };
  }

  private tick(): void {
    const s = settingsStore.get();
    const levels = this.levels();
    const prev = statusStore.get().alertLevels;
    if ((Object.keys(levels) as AlertId[]).some(k => levels[k] !== prev[k])) {
      statusStore.set({ alertLevels: levels });
    }
    // Demo data never beeps.
    const demoMotion = s.motionSource === 'demo';
    const demoEngine = s.engineSource === 'demo';
    const isDemo = (id: AlertId) => (id === 'tilt' ? demoMotion : demoEngine);
    const { beep } = this.tracker.update(Date.now(), levels,
      id => s.muted || s.mutedAlerts.includes(id) || isDemo(id));
    if (beep) this.play(beep);
  }

  // Also used by Settings > Test alert, so it ignores mute.
  play(beep: Beep): void {
    const s = settingsStore.get();
    if (s.alertSound) {
      const p = this.players[beep];
      if (p) {
        p.seekTo(0).catch(() => {});
        p.play();
      }
    }
    if (s.alertVibrate) Vibration.vibrate(beep === 'alarm' ? ALARM_VIBRATION : WARN_VIBRATION);
  }
}

export const alertMonitor = new AlertMonitor();
