export class CeUtility {
  static registerHelpers() {
    Handlebars.registerHelper('progressCircle', function(data) {
      return CeUtility.getProgressCircleHtml(data);
    });
  }

  static getProgressCircleHtml(data) {
    return `<svg class="progress-ring progress-ring--${data.class}" viewBox="0 0 ${data.diameter} ${data.diameter}" width="${data.diameter}" height="${data.diameter}">
      <circle
        class="progress-ring__circle"
        stroke-width="${data.strokeWidth}"
        stroke-dasharray="${data.circumference}"
        stroke-dashoffset="${data.offset}"
        stroke="${data.color}"
        fill="transparent"
        r="${data.radius}"
        cx="${data.position}"
        cy="${data.position}"
      />
    </svg>`;
  }

  static getProgressCircle({ current = 100, max = 100, radius = 16 }) {
    let circumference = radius * 2 * Math.PI;
    let percent = current < max ? current / max : 1;
    let percentNumber = percent * 100;
    let offset = circumference - (percent * circumference);
    let strokeWidth = 4;
    let diameter = (radius * 2) + strokeWidth;
    let colorClass = Math.round((percent * 100) / 10) * 10;

    return {
      radius: radius,
      diameter: diameter,
      strokeWidth: strokeWidth,
      circumference: circumference,
      offset: offset,
      position: diameter / 2,
      color: 'red',
      class: colorClass,
    };
  }

  static isLegacyVersion() {
    return game?.release?.version?.startsWith('12');
  }
}