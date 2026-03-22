// Constantes físicas fundamentales
export const CONSTANTS = {
  mu0: 4 * Math.PI * 1e-7, // Permeabilidad magnética del vacío
  q: -1.6e-19,             // Carga del electrón (Coulombs)
  m: 9.11e-31,             // Masa del electrón (kg)
};

// Parámetros por defecto para la simulación del magnetrón
export const DEFAULT_PARAMS = {
  Mo: 3.2e-4,  // Magnetización
  Ri: 0.01,    // Radio interno (Cátodo)
  Re: 0.02,    // Radio externo (Ánodo)
  L: 0.05,     // Longitud del cilindro
  z1: 0.075,   // Posición z del primer imán
  z2: -0.075,  // Posición z del segundo imán
  E0: 2e3,     // Campo eléctrico base
  x0: 0.005,   // Posición inicial en x
  y0: 0,       // Posición inicial en y
  z0: 0,       // Posición inicial en z
  vx0: 1e5,    // Velocidad inicial en x
  vy0: 0,      // Velocidad inicial en y
  vz0: 1e5,    // Velocidad inicial en z
};

// Calcula la componente Z del campo magnético generado por un cilindro magnético
export function computeBzCilindro(rho, zrel, params) {
  const { Mo, Ri, Re, L } = params;
  const { mu0 } = CONSTANTS;
  // Términos para la aproximación del campo magnético usando el modelo de cilindro
  const term1 = (zrel + L/2) / Math.sqrt(Re*Re + Math.pow(zrel + L/2, 2) + Math.pow(rho, 2));
  const term2 = (zrel - L/2) / Math.sqrt(Re*Re + Math.pow(zrel - L/2, 2) + Math.pow(rho, 2));
  const term3 = (zrel + L/2) / Math.sqrt(Ri*Ri + Math.pow(zrel + L/2, 2) + Math.pow(rho, 2));
  const term4 = (zrel - L/2) / Math.sqrt(Ri*Ri + Math.pow(zrel - L/2, 2) + Math.pow(rho, 2));
  
  return (mu0 * Mo / 2) * (term1 - term2 - term3 + term4);
}

// Calcula el campo magnético total sumando las contribuciones de los dos imanes
export function computeBTotal(x, y, z, params) {
  const rho = Math.sqrt(x*x + y*y); // Distancia radial al eje Z
  return computeBzCilindro(rho, z - params.z1, params) + computeBzCilindro(rho, z - params.z2, params);
}

// Devuelve el vector del campo magnético (asumiendo que solo tiene componente en Z)
export function computeBVector(x, y, z, params) {
  return [0, 0, computeBTotal(x, y, z, params)];
}

// Calcula el vector del campo eléctrico radial (actuando desde el cátodo hacia el ánodo)
export function computeETotal(x, y, z, params) {
  const { E0 } = params;
  const rho = Math.sqrt(x*x + y*y + 1e-12); // Sumamos 1e-12 para evitar división por cero
  return [
    E0 * x / rho, // Componente X del campo eléctrico
    E0 * y / rho, // Componente Y del campo eléctrico
    0             // Componente Z del campo eléctrico es cero (campo bidimensional)
  ];
}

// Calcula las derivadas (velocidades y aceleraciones) para el integrador numérico
export function computeDerivatives(t, Y, params) {
  const [x, y, z, vx, vy, vz] = Y; // Posición y velocidad actual
  const B = computeBTotal(x, y, z, params); // Campo magnético en (x, y, z)
  const E = computeETotal(x, y, z, params); // Campo eléctrico en (x, y, z)
  const { q, m } = CONSTANTS;
  const q_m = q / m; // Relación carga-masa

  return [
    vx, // Derivada de la posición X es la velocidad X
    vy, // Derivada de la posición Y es la velocidad Y
    vz, // Derivada de la posición Z es la velocidad Z
    // Aceleración según la fuerza de Lorentz: a = (q/m) * (E + v × B)
    q_m * (E[0] + vy * B), // Componente X de la aceleración
    q_m * (E[1] - vx * B), // Componente Y de la aceleración
    0                      // Componente Z de la aceleración es cero en este modelo
  ];
}

// Realiza un paso de integración usando el método de Runge-Kutta de 4to orden (RK4)
function rk4Step(t, Y, dt, params) {
  const k1 = computeDerivatives(t, Y, params);
  const Y2 = Y.map((y, i) => y + 0.5 * dt * k1[i]);
  const k2 = computeDerivatives(t + 0.5 * dt, Y2, params);
  const Y3 = Y.map((y, i) => y + 0.5 * dt * k2[i]);
  const k3 = computeDerivatives(t + 0.5 * dt, Y3, params);
  const Y4 = Y.map((y, i) => y + dt * k3[i]);
  const k4 = computeDerivatives(t + dt, Y4, params);

  // Combina los cuatro pasos de RK4 para estimar el siguiente estado
  return Y.map((y, i) => y + (dt / 6) * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
}

// Ejecuta la simulación completa del electrón a lo largo del tiempo
export function runSimulation(params, timeSpan = 5e-7, dt = 1e-10) {
  const { x0, y0, z0, vx0, vy0, vz0 } = params;
  let Y = [x0, y0, z0, vx0, vy0, vz0]; // Estado inicial
  let t = 0; // Tiempo inicial
  
  const trajectory = [];
  // Guarda el estado inicial en la trayectoria
  trajectory.push({ t, x: Y[0], y: Y[1], z: Y[2], vx: Y[3], vy: Y[4], vz: Y[5] });

  // Número total de pasos de simulación
  const steps = Math.ceil(timeSpan / dt);

  for (let i = 0; i < steps; i++) {
    Y = rk4Step(t, Y, dt, params); // Avanza un paso en el tiempo
    t += dt;
    // Guarda el nuevo estado
    trajectory.push({ t, x: Y[0], y: Y[1], z: Y[2], vx: Y[3], vy: Y[4], vz: Y[5] });
    
    // Detiene la simulación de forma anticipada si el electrón se escapa más allá del dispositivo
    const radius = Math.sqrt(Y[0]*Y[0] + Y[1]*Y[1]);
    if (radius > params.Re * 3) {
      break;
    }
  }

  return trajectory;
}

// Genera un mapa 2D del campo magnético para visualización
export function generateMagneticFieldMap(params, zRes = 60, rRes = 40) {
  const z_plot = [];
  // Coordenadas para el eje Z
  for(let i=0; i<zRes; i++) {
      z_plot.push(-0.1 + i * (0.2 / (zRes - 1)));
  }
  const r_plot = [];
  // Coordenadas para el radio (rho)
  for(let i=0; i<rRes; i++) {
      r_plot.push(0 + i * (0.05 / (rRes - 1)));
  }

  const Bmap = [];
  let maxB = 0;
  // Calcula el campo magnético en cada punto de la grilla
  for (let zi = 0; zi < zRes; zi++) {
    const row = [];
    for (let ri = 0; ri < rRes; ri++) {
      const rho = r_plot[ri];
      const zp = z_plot[zi];
      const b = computeBzCilindro(rho, zp - params.z1, params) + computeBzCilindro(rho, zp - params.z2, params);
      row.push(b);
      maxB = Math.max(maxB, Math.abs(b)); // Actualiza el valor máximo del campo para normalización
    }
    Bmap.push(row);
  }

  return { z_plot, r_plot, Bmap, maxB };
}

/**
 * Analiza el estado actual del electrón y retorna
 * una lista de mensajes de contexto físico para mostrar al usuario.
 */
export function analyzePhysicsState(point, params) {
  if (!point) return [];

  const { x, y, z, vx, vy, vz } = point;
  const { q, m } = CONSTANTS;

  // Calculamos la distancia radial y la rapidez del electrón
  const radius = Math.sqrt(x * x + y * y);
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

  // Calcula las fuerzas eléctrica y magnética
  const E = [params.E0 * x / (radius + 1e-12), params.E0 * y / (radius + 1e-12), 0];
  const Bz = computeBTotal(x, y, z, params);

  // Componentes de la fuerza magnética de Lorentz (F = q(v × B)), sabiendo que B = (0,0,Bz)
  const Fmag_x = q * (vy * Bz);
  const Fmag_y = q * (-vx * Bz);
  const Fmag_mag = Math.sqrt(Fmag_x * Fmag_x + Fmag_y * Fmag_y); // Magnitud de la fuerza magnética

  const Felec_x = q * E[0];
  const Felec_y = q * E[1];
  const Felec_mag = Math.sqrt(Felec_x * Felec_x + Felec_y * Felec_y); // Magnitud de la fuerza eléctrica

  const messages = [];

  // --- Contexto espacial ---
  if (radius <= params.Ri * 1.05) {
    messages.push({ icon: '🔵', text: 'El electrón está cerca del Cátodo (electrodo negativo)', color: '#60a5fa' });
  } else if (radius >= params.Re * 0.92) {
    messages.push({ icon: '🔴', text: 'El electrón está cerca del Ánodo — ¡riesgo de escape!', color: '#f87171' });
  } else {
    // Calcula el porcentaje del trayecto entre cátodo y ánodo
    const pct = Math.round(((radius - params.Ri) / (params.Re - params.Ri)) * 100);
    messages.push({ icon: '⚡', text: `El electrón ocupa el ${pct}% del espacio interelectródico`, color: '#a78bfa' });
  }

  // --- Fuerza dominante ---
  if (Fmag_mag > Felec_mag * 1.5) {
    messages.push({ icon: '🌀', text: 'El campo magnético está curvando la trayectoria', color: '#818cf8' });
  } else if (Felec_mag > Fmag_mag * 1.5) {
    messages.push({ icon: '⚡', text: 'El campo eléctrico está acelerando el electrón radialmente', color: '#fbbf24' });
  } else {
    messages.push({ icon: '⚖️', text: 'Fuerzas eléctrica y magnética están en equilibrio', color: '#34d399' });
  }

  // --- Contexto de velocidad ---
  const speedPct = Math.min(100, Math.round((speed / 3e8) * 100 * 1000));
  if (speed > 1e6) {
    messages.push({ icon: '🚀', text: `El electrón viaja a ${(speed / 1e6).toFixed(2)} × 10⁶ m/s`, color: '#fb923c' });
  } else {
    messages.push({ icon: '📏', text: `Velocidad: ${speed.toExponential(2)} m/s`, color: '#94a3b8' });
  }

  // --- Estado de confinamiento ---
  if (radius < params.Re && radius > params.Ri) {
    messages.push({ icon: '✅', text: 'Electrón confinado — el magnetrón está operando', color: '#4ade80' });
  } else if (radius >= params.Re) {
    messages.push({ icon: '❌', text: 'Electrón escapó al Ánodo — sin confinamiento magnético', color: '#f87171' });
  }

  return messages;
}
