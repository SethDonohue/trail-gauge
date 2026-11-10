// Hub status bits as messages for Settings > Hub status. Pure, so it is unit-tested.

import { STATUS, STATUS2 } from './frame.ts';

export type VehicleBusSetting = 'auto' | 'none';

// True when the vehicle has a CAN/OBD-II connection as far as we know. The hub says so itself in
// newer firmware (STATUS2.NO_VEHICLE_BUS); otherwise the user's setting decides.
export function hasVehicleBus(status2: number, setting: VehicleBusSetting): boolean {
  if (status2 & STATUS2.NO_VEHICLE_BUS) return false;
  return setting !== 'none';
}

export function hubFaults(status: number, status2: number, frameVersion: number | null, bus: VehicleBusSetting): string[] {
  const f: string[] = [];
  if (status & STATUS.IMU_FAULT) f.push('Tilt sensor fault');
  if (status & STATUS.BARO_FAULT) f.push('Barometer fault');
  if (status & STATUS.COOLANT_FAULT) f.push('Coolant sensor fault');
  if (status & STATUS.AMBIENT_FAULT) f.push('Outside sensor fault');
  if (status & STATUS.MAG_DISTURBED) f.push('Compass interference');
  if (status & STATUS.BATTERY_LOW) f.push('Battery low');
  if ((status & STATUS.CAN_ERROR) && hasVehicleBus(status2, bus)) f.push('Vehicle bus (CAN) error');
  if (frameVersion !== null && frameVersion >= 3) {
    if (status2 & STATUS2.AMBIENT2_FAULT) f.push('Second outside sensor fault');
    if (status2 & STATUS2.CABIN_FAULT) f.push('Cabin sensor fault');
    if (status2 & STATUS2.HUMIDITY_FAULT) f.push('Humidity sensor fault');
  }
  return f;
}

export function vehicleBusLabel(status2: number, frameVersion: number | null, setting: VehicleBusSetting): string {
  if (status2 & STATUS2.NO_VEHICLE_BUS) return 'None (hub has no CAN/OBD-II)';
  if (setting === 'none') return 'None (set here)';
  if (frameVersion === null) return 'Unknown until the hub connects';
  return frameVersion >= 3 ? 'CAN / OBD-II' : 'Not reported by this hub firmware';
}
