import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Sphere, Cylinder, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import { computeBVector, computeETotal } from './physics';

// Componente que renderiza los cilindros que representan el Cátodo y el Ánodo del magnetrón
function MagnetronCylinders({ params, hideLabels }) {
  const { Ri, Re, L, z1, z2 } = params;
  
  // Escalamos todo por 100 para un mejor manejo de la cámara en three.js (centímetros en lugar de metros)
  const scale = 100;
  
  return (
    <group scale={[scale, scale, scale]}>
      {/* Primer cilindro (Parte superior) */}
      <group position={[0, 0, z1]}>
        {/* Cilindro interior (Cátodo) */}
        <Cylinder args={[Ri, Ri, L, 32]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.6} emissive="#3b82f6" emissiveIntensity={0.5} side={THREE.DoubleSide} />
          {/* Etiqueta HTML para mostrar el nombre del elemento en 3D */}
          {!hideLabels && (
            <Html position={[0, L/2 + 0.01, 0]} center distanceFactor={10} className="label-3d">
              <div className="label-container">Cátodo</div>
            </Html>
          )}
        </Cylinder>
        {/* Cilindro exterior (Ánodo) */}
        <Cylinder args={[Re, Re, L, 32]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.25} emissive="#3b82f6" emissiveIntensity={0.2} side={THREE.DoubleSide} />
          {!hideLabels && (
            <Html position={[Re, L/2 + 0.01, 0]} center distanceFactor={10} className="label-3d">
              <div className="label-container">Ánodo</div>
            </Html>
          )}
        </Cylinder>
      </group>

      {/* Segundo cilindro (Parte inferior) */}
      <group position={[0, 0, z2]}>
        {/* Cilindro interior */}
        <Cylinder args={[Ri, Ri, L, 32]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#a78bfa" transparent opacity={0.6} emissive="#8b5cf6" emissiveIntensity={0.5} side={THREE.DoubleSide} />
        </Cylinder>
        {/* Cilindro exterior */}
        <Cylinder args={[Re, Re, L, 32]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#a78bfa" transparent opacity={0.25} emissive="#8b5cf6" emissiveIntensity={0.2} side={THREE.DoubleSide} />
        </Cylinder>
      </group>
    </group>
  );
}

// Componente para visualizar los campos vectoriales (Magnético o Eléctrico) mediante flechas
function VectorField({ params, type, color }) {
  const scale = 100;
  const { Ri, Re, z1, z2 } = params;
  
  // useMemo recomputa las flechas solo si "params" o "type" cambian, mejorando el rendimiento
  const arrows = useMemo(() => {
    const result = [];
    const numPhi = 8; // Número de puntos angulares
    const numRho = 3; // Número de puntos radiales
    const numZ = 10;  // Número de puntos en el eje Z
    
    // Rango de visualización en Z
    const zMin = Math.min(z1, z2) - 0.05;
    const zMax = Math.max(z1, z2) + 0.05;
    
    // Iteramos sobre coordenadas cilíndricas para generar puntos de muestra
    for (let i = 0; i < numPhi; i++) {
      const phi = (i / numPhi) * Math.PI * 2;
      for (let j = 0; j < numRho; j++) {
        const rho = Ri + (j / (numRho - 1 || 1)) * (Re - Ri);
        for (let k = 0; k < numZ; k++) {
          const z = zMin + (k / (numZ - 1)) * (zMax - zMin);
          
          // Convertimos las coordenadas a cartesianas
          const x = rho * Math.cos(phi);
          const y = rho * Math.sin(phi);
          
          let field;
          let arrowScale = 1;
          
          // Calculamos el valor del campo dependiendo del tipo
          if (type === 'magnetic') {
            field = computeBVector(x, y, z, params);
            // El campo B es muy pequeño (ej. 1e-10 T), escalamos enormemente para que sea visible
            arrowScale = 1e9; 
          } else {
            field = computeETotal(x, y, z, params);
            // El campo E es grande (ej. 1e3), reducimos la escala para la visualización
            arrowScale = 0.0005;
          }
          
          const dir = new THREE.Vector3(field[0], field[1], field[2]);
          const length = dir.length() * arrowScale;
          
          // Solo mostramos la flecha si tiene una longitud apreciable
          if (length > 0.01) {
            dir.normalize();
            result.push({
              position: new THREE.Vector3(x * scale, y * scale, z * scale),
              direction: dir,
              length: Math.min(length * scale * 0.1, 2) // Limitamos la longitud de la flecha
            });
          }
        }
      }
    }
    return result;
  }, [params, type]);

  // Renderiza todas las flechas compiladas en el arreglo 'arrows'
  return (
    <group>
      {arrows.map((arrow, i) => (
        <primitive 
          key={i}
          object={new THREE.ArrowHelper(arrow.direction, arrow.position, arrow.length, color, 0.2, 0.1)} 
        />
      ))}
    </group>
  );
}

// Componente para renderizar y animar la trayectoria seguida por el electrón
function ElectronTrajectory({ trajectory, onProgress, savedTrajectory, hideLabels, params, isPaused }) {
  const scale = 100;
  const electronRef = useRef(); // Referencia a la esfera del electrón
  const trailRef = useRef();    // Referencia a la línea (estela) de la trayectoria
  const velocityArrowRef = useRef(); // Referencia al vector de velocidad del electrón

  // Escala para la flecha de velocidad (ajustaremos según sea necesario)
  const vScale = 1e-6; 

  // Convertimos las posiciones de la trayectoria a vectores Vector3 de three.js
  const points = useMemo(() => {
    return trajectory.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale));
  }, [trajectory]);

  // Convertimos las posiciones de la trayectoria previamente guardada (si existe)
  const savedPoints = useMemo(() => {
    if (!savedTrajectory) return [];
    return savedTrajectory.map(p => new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale));
  }, [savedTrajectory]);

  // Tiempo interno de animación para la interpolación de trayectoria
  const animTimeRef = useRef(0);

  // useFrame ejecuta esta lógica en cada cuadro (frame) renderizado, permitiendo la animación fluida
  useFrame((state, delta) => {
    if (points.length === 0) return;
    
    // Aumentamos el contador de tiempo si la simulación no está en pausa
    if (!isPaused) {
      animTimeRef.current += delta;
    }
    
    const duration = 2; // Tiempo en segundos en que la animación completa un ciclo
    const time = animTimeRef.current % duration;
    const progress = time / duration;
    
    // Calculamos el índice actual en la matriz de la trayectoria basado en el porcentaje de progreso
    const index = Math.floor(progress * (points.length - 1));
    const point = points[index];
    
    // Actualizamos la posición espacial de la esfera (electrón)
    if (electronRef.current) {
      electronRef.current.position.copy(point);
    }

    // Actualizamos la flecha de la velocidad para mostrar dirección y magnitud
    if (velocityArrowRef.current) {
      const data = trajectory[index];
      // LLamamos al callback con el punto de data actual de progreso
      if (onProgress) onProgress(data);

      const vel = new THREE.Vector3(data.vx, data.vy, data.vz);
      const speed = vel.length();
      
      // Si el electrón se está moviendo, actualizamos orientación, magnitud y color de la flecha
      if (speed > 0) {
        const dir = vel.clone().normalize();
        velocityArrowRef.current.setDirection(dir);
        
        // Longitud de la flecha proporcional a la rapidez actual
        const arrowLen = speed * vScale * 10; // Ajuste visual para no abrumar la escena
        velocityArrowRef.current.setLength(Math.max(arrowLen, 0.5), 0.2, 0.1);
        
        // El color cambiará dinámicamente: desde amarillo (lento) hasta rojo vivo (rápido)
        const ratio = Math.min(speed / 1e6, 1);
        const color = new THREE.Color().setHSL(0, 1, 0.5); // Rojo puro por defecto
        
        // Interpolar en el espectro HSL desde amarillo (~0.16) a rojo (0)
        color.setHSL((1 - ratio) * 0.15, 1, 0.5);
        velocityArrowRef.current.setColor(color);
      }
      
      // La flecha sigue al electrón actualizando su propia posición
      velocityArrowRef.current.position.copy(point);
    }
  });

  // Render inicial si no hay trayectoria disponible: mostramos el electrón estático en su posición inicial
  if (points.length === 0) {
    const scaleFactor = 100;
    return (
      <Sphere position={[params.x0 * scaleFactor, params.y0 * scaleFactor, params.z0 * scaleFactor]} args={[0.2, 16, 16]}>
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
        {!hideLabels && (
          <Html distanceFactor={10} center position={[0, 0.5, 0]}>
            <div className="label-electron">Electrón</div>
          </Html>
        )}
      </Sphere>
    );
  }

  // Componente devuelto cuando la información de trayectoria se encuentra disponible
  return (
    <group>
      {/* Línea que dibuja la totalidad de la trayectoria actual */}
      <Line
        ref={trailRef}
        points={points}
        color="#ef4444"
        lineWidth={2}
        transparent
        opacity={0.8}
      />

      {/* Rastro fantasma (ghost trail) de la trayectoria guardada anterior, dibujado como línea punteada */}
      {savedPoints.length > 0 && (
        <Line
          points={savedPoints}
          color="#22d3ee"
          lineWidth={1.5}
          transparent
          opacity={0.4}
          dashed
          dashSize={0.5}
          gapSize={0.2}
        />
      )}
      
      {/* El electrón animándose sobre la trayectoria simulada */}
      <Sphere ref={electronRef} args={[0.2, 16, 16]}>
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
        {!hideLabels && (
          <Html distanceFactor={10} center position={[0, 0.5, 0]}>
            <div className="label-electron">Electrón</div>
          </Html>
        )}
      </Sphere>

      {/* Flecha tridimensional que indica la velocidad actual en este momento simulado */}
      <primitive
        object={new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, 0),
          1,
          0xff0000
        )}
        ref={velocityArrowRef}
      />
    </group>
  );
}

// Componente por defecto exportado, configura la escena en Three.js, cámaras, iluminación general
export default function Scene3D({ trajectory, params, showBField, showEField, onProgress, savedTrajectory, hideLabels, isPaused }) {
  return (
    <Canvas
      camera={{ position: [15, 10, 15], fov: 45 }}
      // La convención es que el eje Y esté "arriba" por defecto
    >
      <color attach="background" args={['#09090b']} />
      
      {/* Iluminación base y fuentes de luz artificial */}
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <pointLight position={[-10, -10, -10]} intensity={0.8} color="#3b82f6" />
      
      {/* Malla del piso para dar perspectiva al espacio */}
      <Grid infiniteGrid fadeDistance={40} sectionColor="#1e293b" cellColor="#0f172a" />
      
      <group>
        {/* Renderizado de Cátodo y Ánodo */}
        <MagnetronCylinders params={params} hideLabels={hideLabels} />
        {/* Lógica condicional para campos electromagnéticos */}
        {showBField && <VectorField params={params} type="magnetic" color="#3b82f6" />}
        {showEField && <VectorField params={params} type="electric" color="#fbbf24" />}
        {/* Renderizado del electrón; animado o estático */}
        {trajectory && trajectory.length > 0 && (
          <ElectronTrajectory 
            trajectory={trajectory} 
            onProgress={onProgress} 
            savedTrajectory={savedTrajectory}
            hideLabels={hideLabels}
            params={params}
            isPaused={isPaused}
          />
        )}
        {(!trajectory || trajectory.length === 0) && (
          <ElectronTrajectory 
            trajectory={[]} 
            params={params} 
            hideLabels={hideLabels}
            isPaused={isPaused} 
          />
        )}
      </group>

      {/* Habilita el control del ratón para rotar, panear (agarrar y mover) y hacer zoom */}
      <OrbitControls 
        enableDamping 
        dampingFactor={0.05} 
        minDistance={5} 
        maxDistance={50}
      />
    </Canvas>
  );
}
