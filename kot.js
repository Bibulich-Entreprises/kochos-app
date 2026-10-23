// Kot provisorio: silueta de bichito con el color y la inicial del jugador.
// Lo usan la puerta y el control. Cuando exista el editor de Kots, esto se reemplaza por el diseño de cada uno.

function oscurecer(color, cuanto) {
  const n = parseInt(color.slice(1), 16);
  const canal = (desplazar) => Math.round(((n >> desplazar) & 255) * (1 - cuanto));
  return `rgb(${canal(16)}, ${canal(8)}, ${canal(0)})`;
}

function kotSvg(color, inicial, clase = "") {
  const sombra = oscurecer(color, 0.22);
  const letra = (inicial || "?").slice(0, 1).toUpperCase();
  return `<svg class="kot ${clase}" viewBox="0 0 120 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><radialGradient id="kot-brillo" cx=".32" cy=".28" r=".75">
      <stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="60" cy="118" rx="34" ry="5" fill="#000" opacity=".14"/>
    <g class="kot-cuerpo">
      <path d="M44 28 Q37 12 27 9" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M76 28 Q83 12 93 9" stroke="${color}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="27" cy="9" r="6" fill="${color}"/><circle cx="93" cy="9" r="6" fill="${color}"/>
      <ellipse class="kot-pie" cx="44" cy="110" rx="12" ry="7" fill="${sombra}"/>
      <ellipse class="kot-pie kot-pie-der" cx="76" cy="110" rx="12" ry="7" fill="${sombra}"/>
      <path d="M60 22c-27 0-44 21-44 47 0 27 15 42 44 42s44-15 44-42c0-26-17-47-44-47z" fill="${color}"/>
      <path d="M60 22c-27 0-44 21-44 47 0 27 15 42 44 42s44-15 44-42c0-26-17-47-44-47z" fill="url(#kot-brillo)"/>
      <circle cx="45" cy="56" r="10" fill="#fff"/><circle cx="75" cy="56" r="10" fill="#fff"/>
      <circle class="kot-ojo" cx="47" cy="58" r="5" fill="#1b1d24"/><circle class="kot-ojo" cx="77" cy="58" r="5" fill="#1b1d24"/>
      <circle cx="60" cy="86" r="17" fill="#fff" opacity=".28"/>
      <text x="60" y="93" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-weight="800" font-size="21" fill="#fff">${letra}</text>
    </g>
  </svg>`;
}

export { kotSvg, oscurecer };