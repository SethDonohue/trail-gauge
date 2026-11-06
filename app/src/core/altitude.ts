// Barometric altitude (international standard atmosphere, troposphere).

export const STD_QNH_HPA = 1013.25;
const EXP = 0.190295;

export function pressureToAltitudeM(pressureHpa: number, qnhHpa: number): number {
  return 44330 * (1 - Math.pow(pressureHpa / qnhHpa, EXP));
}

// The sea-level reference pressure that makes the current pressure read as a known elevation.
export function qnhFromElevation(pressureHpa: number, elevationM: number): number {
  return pressureHpa / Math.pow(1 - elevationM / 44330, 1 / EXP);
}
