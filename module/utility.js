export class TrackerUtility {
  /** Fixed halves: HP left clockwise, Temp right counterclockwise, bottom to top. */
  static getHealthArcsHtml({ current, temp, max }) {
    const fraction = value => Number.isFinite(value) && Number.isFinite(max) && max > 0
      ? Math.min(1, Math.max(0, value / max)) : 0;
    const point = angle => {
      const radians = angle * Math.PI / 180;
      return `${24 + 20.5 * Math.cos(radians)} ${24 - 20.5 * Math.sin(radians)}`;
    };
    const hpClass = Math.round(fraction(current) * 10) * 10;
    const paths = [
      { start: 265, end: 95, sweep: 1, value: current, className: `te-hp-arc progress-ring--${hpClass}` },
      { start: 275, end: 445, sweep: 0, value: temp, className: 'te-temp-arc' },
    ];
    return `<svg class="progress-ring te-health-arcs" aria-hidden="true" viewBox="0 0 48 48" width="48" height="48">
      ${paths.map(({ start, end, sweep, value, className }) => {
        const d = `M ${point(start)} A 20.5 20.5 0 0 ${sweep} ${point(end)}`;
        return `<path class="te-arc-track" d="${d}" fill="none" stroke-width="3.5" />
          <path class="${className}" d="${d}" fill="none" stroke-width="3.5" pathLength="100"
            stroke-dasharray="${fraction(value) * 100} 100" stroke-linecap="butt" />`;
      }).join('')}
    </svg>`;
  }

  static getProgressCircleHtml(data) {
    return `<svg class="progress-ring progress-ring--${data.class}" aria-hidden="true" viewBox="0 0 ${data.diameter} ${data.diameter}" width="${data.diameter}" height="${data.diameter}">
      <circle class="progress-ring__circle" stroke-width="${data.strokeWidth}"
        stroke-dasharray="${data.circumference}" stroke-dashoffset="${data.offset}"
        fill="transparent" r="${data.radius}" cx="${data.position}" cy="${data.position}" />
    </svg>`;
  }

  static getProgressCircle({ current = 0, max = 0 } = {}) {
    const radius = 20.5;
    const circumference = radius * 2 * Math.PI;
    const percent = Number.isFinite(current) && Number.isFinite(max) && max > 0
      ? Math.min(1, Math.max(0, current / max)) : 0;
    // The generic full ring uses the same 3.5px-at-48px visual weight as D&D's arcs.
    const diameter = 48;
    const strokeWidth = 3.5;
    return {
      radius, diameter, strokeWidth, circumference,
      offset: circumference * (1 - percent),
      position: diameter / 2,
      class: Math.round(percent * 10) * 10,
    };
  }
}
