import React, { useState, useEffect, useRef, useCallback } from 'react';
import { runSimulation, DEFAULT_PARAMS, generateMagneticFieldMap, analyzePhysicsState } from './physics';
import { Play, RotateCcw, Activity, Zap, Magnet, Target, Gauge, Table, Download, Eye, EyeOff, HelpCircle, X, Info, ChevronDown, ChevronRight, Pause } from 'lucide-react';
import Scene3D from './Scene3D';
import { CONSTANTS } from './physics';

function App() {
  // Estados principales de la simulación
  const [params, setParams] = useState(DEFAULT_PARAMS); // Parámetros físicos actuales
  const [trajectory, setTrajectory] = useState([]); // Arreglo con los puntos de la trayectoria calculada
  const [isSimulating, setIsSimulating] = useState(false); // Indica si la simulación está en curso
  const [magneticMap, setMagneticMap] = useState(null); // Mapa pre-calculado del campo magnético
  const [status, setStatus] = useState({ state: 'pending', radius: 0 }); // Estado final del electrón (confinado/escapó)
  
  // Estados para controlar qué elementos visuales se muestran en la pantalla
  const [showBField, setShowBField] = useState(false); // Mostrar campo magnético interactivo
  const [showEField, setShowEField] = useState(false); // Mostrar campo eléctrico interactivo
  const [currentData, setCurrentData] = useState(null); // Datos del punto actual en la animación
  
  // Estados para la funcionalidad de comparación de simulaciones
  const [savedSimulation, setSavedSimulation] = useState(null); // Simulación guardada como referencia
  const [isComparing, setIsComparing] = useState(false); // Indica si estamos comparando dos trayectorias
  
  // Estados para la interfaz de usuario (UI)
  const [showDataTable, setShowDataTable] = useState(false); // Mostrar tabla numérica de datos
  const [showHelp, setShowHelp] = useState(false); // Mostrar panel de ayuda
  const [activeTab, setActiveTab] = useState('radio'); // Pestaña activa en los gráficos (energía, velocidad, radio)
  const [expandedSection, setExpandedSection] = useState('posicion'); // Sección expandida en la barra lateral
  const [isPaused, setIsPaused] = useState(false); // Pausa/reanuda la animación 3D

  // Función para abrir/cerrar las secciones del menú lateral
  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // Hook que pre-calcula el mapa del campo magnético cuando cambian ciertos parámetros.
  // Se usa un retraso (debounce) de 250ms para evitar parones (lag) en la interfaz mientras el usuario arrastra un slider.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const bMap = generateMagneticFieldMap(params);
      setMagneticMap(bMap);
    }, 250); 
    
    return () => clearTimeout(timeoutId); // Limpia el timeout si los parámetros cambian muy rápido
  }, [params.Mo, params.Ri, params.Re, params.L, params.z1, params.z2]);

  // Hook que carga una simulación previamente guardada desde el almacenamiento del navegador (localStorage) al iniciar la app.
  useEffect(() => {
    const saved = localStorage.getItem('magnetron_saved_sim');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedSimulation(parsed);
        setIsComparing(true); // Activa el modo de comparación
      } catch (e) {
        console.error("Error loading saved simulation", e);
      }
    }
  }, []);

  // Función para ejecutar la simulación principal con los parámetros actuales
  const handleSimulate = () => {
    setIsSimulating(true);
    // Utilizamos setTimeout para permitir que la UI de React actualice (muestre "Reiniciar")
    // antes de bloquear el hilo principal con el recálculo intenso (Runge-Kutta 4)
    setTimeout(() => {
      const traj = runSimulation(params); // Calcula la trayectoria del electrón
      setTrajectory(traj);

      // Revisamos la posición del último punto para determinar el estado final
      const lastPoint = traj[traj.length - 1];
      const radius = Math.sqrt(lastPoint.x * lastPoint.x + lastPoint.y * lastPoint.y);

      let state = 'escaped'; // Asumimos escape por defecto
      if (radius < params.Re) {
        state = 'confined'; // Confinado si nunca supera el radio externo (Ánodo)
      }

      setStatus({ state, radius });
      setIsSimulating(false);
    }, 50);
  };

  // Función genérica para manejar la actualización de los parámetros desde los controles deslizantes
  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  // Restaura los valores y estados iniciales por defecto de la simulación
  const resetParams = () => {
    setParams(DEFAULT_PARAMS);
    setTrajectory([]);
    setStatus({ state: 'pending', radius: 0 });
    setCurrentData(null);
    setSavedSimulation(null);
    setIsComparing(false);
  };

  // Guarda la simulación actual para permitir luego comparar su trayectoria interactiva con una modificación
  const handleSaveForComparison = () => {
    if (trajectory.length > 0) {
      const simData = {
        trajectory,
        params: { ...params }
      };
      setSavedSimulation(simData);
      localStorage.setItem('magnetron_saved_sim', JSON.stringify(simData)); // Persistencia local
      setIsComparing(true);
    }
  };

  // Borra la simulación guardada como referencia y limpia el modo comparación
  const clearComparison = () => {
    setSavedSimulation(null);
    localStorage.removeItem('magnetron_saved_sim');
    setIsComparing(false);
  };

  // Función utilitaria para calcular la energía cinética del electrón (1/2 * m * v^2)
  const calculateEnergy = (v) => {
    const speedSq = v.x * v.x + v.y * v.y + v.z * v.z;
    return 0.5 * CONSTANTS.m * speedSq;
  };

  // Genera y descarga un archivo CSV con toda la información numérica de la trayectoria generada
  const exportToCSV = () => {
    if (trajectory.length === 0) return;
    
    // Encabezados del archivo
    const headers = ['t', 'x', 'y', 'z', 'vx', 'vy', 'vz'];
    // Concatenación de datos por cada punto
    const rows = trajectory.map(p => [p.t, p.x, p.y, p.z, p.vx, p.vy, p.vz].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Creación dinámica del archivo binario a partir del texto (Blob) y su descarga forzada
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `simulacion_magnetron_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click(); // Ejecuta el click simulado
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      {/* SIDEBAR CONTROLS */}
      <aside className="sidebar">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="title">Simulador</h1>
            <p className="subtitle">Física de Magnetrón Cilíndrico Dual</p>
          </div>
          <button 
            className="help-btn"
            onClick={() => setShowHelp(true)}
            title="Ayuda y Conceptos"
          >
            <HelpCircle size={18} />
          </button>
        </div>

        <div className="control-group">
          <div className="flex gap-2">
            <button className={`btn flex-1 ${isSimulating ? 'bg-indigo-600 hover:bg-indigo-700' : 'btn-primary'}`} onClick={handleSimulate} disabled={isSimulating}>
              <Play size={18} fill="currentColor" />
              {isSimulating ? 'Reiniciar' : 'Ejecutar'}
            </button>
            <button 
              className={`btn flex-1 ${!isPaused ? 'btn-secondary border-white/20' : 'btn-primary opacity-90'}`} 
              onClick={() => setIsPaused(!isPaused)} 
              disabled={trajectory.length === 0}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              {isPaused ? 'Reanudar' : 'Pausar'}
            </button>
          </div>

          <button className="btn btn-secondary" onClick={resetParams}>
            <RotateCcw size={18} />
            Restablecer Parámetros
          </button>

          <div className="flex gap-2">
            <button 
              className={`btn flex-1 ${savedSimulation ? 'btn-secondary' : ''}`} 
              onClick={handleSaveForComparison}
              disabled={trajectory.length === 0 || isSimulating}
            >
              <Target size={18} />
              {savedSimulation ? 'Actualizar Base' : 'Guardar Base'}
            </button>
            {savedSimulation && (
              <button className="btn btn-danger w-12" onClick={clearComparison} title="Limpiar comparación">
                <RotateCcw size={18} />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button 
              className={`btn flex-1 ${showDataTable ? 'btn-secondary shadow-inner' : ''}`} 
              onClick={() => setShowDataTable(!showDataTable)}
              disabled={trajectory.length === 0}
            >
              {showDataTable ? <EyeOff size={18} /> : <Table size={18} />}
              {showDataTable ? 'Ocultar Datos' : 'Ver Tabla de Datos'}
            </button>
            <button 
              className="btn btn-secondary w-12" 
              onClick={exportToCSV}
              disabled={trajectory.length === 0}
              title="Descargar CSV"
            >
              <Download size={18} />
            </button>
          </div>
        </div>

        <div className="control-item">
          <div className="control-header accordion-toggle" onClick={() => toggleSection('campos')}>
            <span className="label">Visualización de Campos</span>
            {expandedSection === 'campos' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {expandedSection === 'campos' && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer" title="Líneas de flujo del campo magnético generado por los anillos">
                <input type="checkbox" checked={showBField} onChange={(e) => setShowBField(e.target.checked)} />
                <span style={{ color: '#60a5fa' }}>Campo Magnético (Azul)</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer" title="Dirección de la fuerza eléctrica radial entre cátodo y ánodo">
                <input type="checkbox" checked={showEField} onChange={(e) => setShowEField(e.target.checked)} />
                <span style={{ color: '#fbbf24' }}>Campo Eléctrico (Amarillo)</span>
              </label>
            </div>
          )}
        </div>

        <div className="control-item">
          <div className="control-header accordion-toggle" onClick={() => toggleSection('posicion')}>
            <span className="label"><Gauge size={14} className="inline mr-2" /> Posición Inicial (m)</span>
            {expandedSection === 'posicion' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {expandedSection === 'posicion' && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">x₀:</span>
                <input type="range" min={-params.Re} max={params.Re} step="0.001" value={params.x0} onChange={(e) => handleParamChange('x0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.x0.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">y₀:</span>
                <input type="range" min={-params.Re} max={params.Re} step="0.001" value={params.y0} onChange={(e) => handleParamChange('y0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.y0.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">z₀:</span>
                <input type="range" min="-0.05" max="0.05" step="0.001" value={params.z0} onChange={(e) => handleParamChange('z0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.z0.toFixed(3)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="control-item">
          <div className="control-header accordion-toggle" onClick={() => toggleSection('velocidad')}>
            <span className="label"><Zap size={14} className="inline mr-2" /> Velocidad Inicial (m/s)</span>
            {expandedSection === 'velocidad' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {expandedSection === 'velocidad' && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">v_x:</span>
                <input type="range" min="1e4" max="1e6" step="1e4" value={params.vx0} onChange={(e) => handleParamChange('vx0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.vx0.toExponential(1)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">v_z:</span>
                <input type="range" min="1e4" max="1e6" step="1e4" value={params.vz0} onChange={(e) => handleParamChange('vz0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.vz0.toExponential(1)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="control-item">
          <div className="control-header accordion-toggle" onClick={() => toggleSection('perfil')}>
            <span className="label"><Magnet size={14} className="inline mr-2" /> Perfil Magnético</span>
            {expandedSection === 'perfil' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {expandedSection === 'perfil' && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400" title="Magnetización de los anillos (A/m²)">M_o:</span>
                <input type="range" min="1e-4" max="1e-3" step="1e-5" value={params.Mo} onChange={(e) => handleParamChange('Mo', e.target.value)} />
                <span className="value-display w-16 text-right">{params.Mo.toExponential(1)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400" title="Distancia al primer anillo magnético">z1 (m):</span>
                <input type="range" min="0.01" max="0.15" step="0.005" value={params.z1} onChange={(e) => handleParamChange('z1', e.target.value)} />
                <span className="value-display w-16 text-right">{params.z1.toFixed(3)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="control-item">
          <div className="control-header accordion-toggle" onClick={() => toggleSection('geometria')}>
            <span className="label"><Activity size={14} className="inline mr-2" /> Campo Eléctrico y Geometría</span>
            {expandedSection === 'geometria' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {expandedSection === 'geometria' && (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400" title="Magnitud del campo eléctrico radial">E_0 (V/m):</span>
                <input type="range" min="500" max="10000" step="100" value={params.E0} onChange={(e) => handleParamChange('E0', e.target.value)} />
                <span className="value-display w-16 text-right">{params.E0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400" title="Radio del cilindro interno (Cátodo)">R_int (m):</span>
                <input type="range" min="0.005" max="0.015" step="0.001" value={params.Ri} onChange={(e) => handleParamChange('Ri', e.target.value)} />
                <span className="value-display w-16 text-right">{params.Ri.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">R_externo:</span>
                <input type="range" min="0.015" max="0.05" step="0.001" value={params.Re} onChange={(e) => handleParamChange('Re', e.target.value)} />
                <span className="value-display w-16 text-right">{params.Re.toFixed(3)}</span>
              </div>
            </div>
          )}
        </div>

      </aside>

      {/* MAIN VIEW */}
      <main className="main-view">
        <div className="glass-panel stats-panel">
          <div className="stat-row">
            <span className="text-sm font-medium flex items-center gap-2"><Target size={16} /> Estado</span>
            {status.state === 'pending' ? (
              <span className="text-xs text-gray-400">Inicia simulación...</span>
            ) : status.state === 'confined' ? (
              <div className="status-box" style={{ color: 'var(--success)' }}>
                <span className="status-indicator status-confined"></span> Confinado
              </div>
            ) : (
              <div className="status-box" style={{ color: 'var(--danger)' }}>
                <span className="status-indicator status-escaped"></span> Escapó
              </div>
            )}
          </div>
          <div className="stat-row">
            <span className="text-sm font-medium text-gray-400">Radio Final:</span>
            <span className="value-display text-lg">
              {status.radius === 0 ? '--' : (status.radius * 100).toFixed(2) + ' cm'}
            </span>
          </div>
        </div>

        <div className="canvas-container">
          {/* Physics Narrator Overlay */}
          {(() => {
            const displayData = currentData || { 
              x: params.x0, y: params.y0, z: params.z0, 
              vx: params.vx0, vy: params.vy0, vz: params.vz0 
            };
            return (
              <div className="physics-narrator">
                <div className="narrator-header">
                  <Info size={13} />
                  <span>¿Qué está pasando?</span>
                </div>
                <div className="narrator-messages">
                  {analyzePhysicsState(displayData, params).map((msg, i) => (
                    <div key={i} className="narrator-msg" style={{ '--msg-color': msg.color }}>
                      <span className="narrator-icon">{msg.icon}</span>
                      <span className="narrator-text">{msg.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="glass-panel real-time-stats">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-blue-400">
                <Gauge size={16} /> Monitoreo en Tiempo Real
              </h3>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Electrón</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="stat-card">
                <span className="stat-label">Velocidad</span>
                <span className="stat-value">
                  {currentData ? (Math.sqrt(currentData.vx**2 + currentData.vy**2 + currentData.vz**2)).toExponential(2) : '--'} 
                  <small className="unit">m/s</small>
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Energía Cinética</span>
                <span className="stat-value">
                  {currentData ? calculateEnergy({x: currentData.vx, y: currentData.vy, z: currentData.vz}).toExponential(2) : '--'}
                  <small className="unit">J</small>
                </span>
              </div>
            </div>

            {/* Physics Charts Comparison */}
            <div className="flex flex-col gap-6 w-full mt-2">
              {(() => {
                const calculateV = (p) => Math.sqrt(p.vx**2 + p.vy**2 + p.vz**2);
                const calculateR = (p) => Math.sqrt(p.x**2 + p.y**2);
                const calculateE = (p) => 0.5 * CONSTANTS.m * (p.vx**2 + p.vy**2 + p.vz**2);

                const renderChart = (title, unit, getter, color, id, tooltip) => {
                  const currentValues = trajectory.map(getter);
                  const savedValues = savedSimulation ? savedSimulation.trajectory.map(getter) : [];
                  
                  // For the radius chart, include Ri and Re in the max calculation
                  const extraRefs = id === 'radius' ? [params.Ri, params.Re] : [];
                  const allVals = [...currentValues, ...savedValues, ...extraRefs];
                  const maxVal = Math.max(...allVals, 1e-20);
                  const minVal = id === 'radius' ? 0 : Math.min(...allVals, 0);

                  const getPath = (vals) => vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${40 - ((v - minVal) / (maxVal - minVal)) * 35}`).join(' ');

                  return (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col">
                        <h4 className="chart-section-header flex justify-between items-center mb-1">
                          <span>{title}</span>
                          <span className="text-[9px] opacity-60 normal-case">({unit})</span>
                        </h4>
                        <p className="text-[9px] text-gray-500 mb-2 italic">{tooltip}</p>
                      </div>
                      
                      {/* Current execution */}
                      <div className="flex flex-col">
                        <div className="flex justify-between items-center text-gray-400 mb-1" style={{ fontSize: '10px' }}>
                          <span className="flex items-center gap-1 whitespace-nowrap"><div className={`w-1.5 h-1.5 rounded-full`} style={{backgroundColor: color}}></div> Actual</span>
                          <span className="value-display" style={{fontSize: '9px'}}>{currentData ? getter(currentData).toExponential(2) : '--'}</span>
                        </div>
                        <div className="chart-container h-24 w-full bg-black/40 rounded border border-white/10 relative overflow-hidden">
                          {trajectory.length > 1 && (
                            <svg viewBox="0 0 100 40" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
                              {/* Grid Lines */}
                              {[0.25, 0.5, 0.75].map(tick => (
                                <line key={tick} x1="0" y1={40 - tick * 40} x2="100" y2={40 - tick * 40} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                              ))}

                              {/* Physical References for Radius */}
                              {id === 'radius' && (
                                <>
                                  <line x1="0" y1={40 - (params.Ri / maxVal) * 35} x2="100" y2={40 - (params.Ri / maxVal) * 35} stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.4" />
                                  <text x="2" y={40 - (params.Ri / maxVal) * 35 - 2} fill="#60a5fa" fontSize="3" opacity="0.6">Cátodo</text>
                                  
                                  <line x1="0" y1={40 - (params.Re / maxVal) * 35} x2="100" y2={40 - (params.Re / maxVal) * 35} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.4" />
                                  <text x="2" y={40 - (params.Re / maxVal) * 35 - 2} fill="#ef4444" fontSize="3" opacity="0.6">Ánodo</text>
                                </>
                              )}

                              {/* Y-Axis scale hints */}
                              <text x="98" y="5" fill="#555" fontSize="3" textAnchor="end">{maxVal.toExponential(1)}</text>
                              <text x="98" y="38" fill="#555" fontSize="3" textAnchor="end">{minVal.toExponential(1)}</text>

                              {/* Data Path */}
                              <polyline points={getPath(currentValues)} fill="none" stroke={color} strokeWidth="1.5" style={{vectorEffect: 'non-scaling-stroke'}} />
                              
                              {currentData && (
                                <circle 
                                  cx={(trajectory.indexOf(currentData) / (trajectory.length - 1)) * 100} 
                                  cy={40 - ((getter(currentData) - minVal) / (maxVal - minVal)) * 35} 
                                  r="2" 
                                  fill="#fff" 
                                  style={{filter: `drop-shadow(0 0 2px ${color})`}}
                                />
                              )}
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Reference execution */}
                      {savedSimulation && (
                        <div className="flex flex-col mt-1">
                          <div className="flex justify-between items-center text-gray-400 mb-1" style={{ fontSize: '10px' }}>
                            <span className="flex items-center gap-1 whitespace-nowrap"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div> Referencia</span>
                          </div>
                          <div className="chart-container h-16 w-full bg-black/20 rounded border border-white/5 relative overflow-hidden">
                            <svg viewBox="0 0 100 40" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="none">
                               {/* Grid Lines */}
                               {[0.25, 0.5, 0.75].map(tick => (
                                <line key={tick} x1="0" y1={40 - tick * 40} x2="100" y2={40 - tick * 40} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                              ))}
                              <polyline points={getPath(savedValues)} fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2,1" style={{vectorEffect: 'non-scaling-stroke'}} />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <div className="flex flex-col">
                    <div className="flex border-b border-white/10 mb-2">
                      <button 
                        className={`flex-1 pb-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'energy' ? 'text-[#ef4444] border-b-2 border-[#ef4444]' : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'}`} 
                        onClick={() => setActiveTab('energy')}
                      >
                        Energía
                      </button>
                      <button 
                        className={`flex-1 pb-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'velocity' ? 'text-[#8b5cf6] border-b-2 border-[#8b5cf6]' : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'}`} 
                        onClick={() => setActiveTab('velocity')}
                      >
                        Velocidad
                      </button>
                      <button 
                        className={`flex-1 pb-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'radio' ? 'text-[#10b981] border-b-2 border-[#10b981]' : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'}`} 
                        onClick={() => setActiveTab('radio')}
                      >
                        Radio
                      </button>
                    </div>

                    <div className="mt-2 min-h-[160px]">
                      {activeTab === 'energy' && renderChart('Energía Cinética', 'J', calculateE, '#ef4444', 'energy', 'Trabajo realizado por el campo eléctrico sobre el electrón.')}
                      {activeTab === 'velocity' && renderChart('Velocidad', 'm/s', calculateV, '#8b5cf6', 'velocity', 'Magnitud de la velocidad instantánea combinada.')}
                      {activeTab === 'radio' && renderChart('Radio vs Tiempo', 'm', calculateR, '#10b981', 'radius', 'Posición radial: entre Cátodo (azul) y Ánodo (rojo).')}
                    </div>
                  </div>
                );
              })()}
              
              {savedSimulation && (
                <div className="mt-2 bg-white/5 p-2 rounded border border-white/10">
                  <span className="text-[9px] text-gray-400 block mb-1 uppercase tracking-tighter font-bold">Parámetros de Referencia</span>
                  <div className="flex gap-3 text-[10px] text-gray-300">
                    <span>E₀: {savedSimulation.params.E0}</span>
                    <span>M₀: {savedSimulation.params.Mo.toExponential(0)}</span>
                    <span>Ri: {savedSimulation.params.Ri.toFixed(3)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showDataTable && trajectory.length > 0 && (
            <div className="glass-panel data-table-overlay">
              <div className="flex justify-between items-center mb-4 sticky top-0 bg-[#0f172a]/95 backdrop-blur-md p-3 rounded-t-lg z-20 border-b border-white/10">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Table size={16} className="text-purple-400" /> Historial de Trayectoria (1:20)
                </h3>
                <button className="text-gray-400 hover:text-white transition-colors" onClick={() => setShowDataTable(false)}>
                  <EyeOff size={16} />
                </button>
              </div>
              <div className="table-wrapper">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="text-gray-500 uppercase tracking-wider border-b border-white/10">
                      <th className="pb-2 p-2">Tiempo (s)</th>
                      <th className="pb-2">X (m)</th>
                      <th className="pb-2">Y (m)</th>
                      <th className="pb-2">V_x (m/s)</th>
                      <th className="pb-2">V_y (m/s)</th>
                      <th className="pb-2 p-2 text-right">Energía (J)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trajectory.filter((_, i) => i % 20 === 0).map((p, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2 p-2 font-mono text-blue-300">{p.t.toExponential(2)}</td>
                        <td className="py-2 font-mono">{p.x.toFixed(4)}</td>
                        <td className="py-2 font-mono">{p.y.toFixed(4)}</td>
                        <td className="py-2 font-mono text-yellow-500/80">{p.vx.toExponential(1)}</td>
                        <td className="py-2 font-mono text-yellow-500/80">{p.vy.toExponential(1)}</td>
                        <td className="py-2 p-2 text-right font-mono text-purple-300">{calculateEnergy({x: p.vx, y: p.vy, z: p.vz}).toExponential(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LEGEND OVERLAY */}
          <div className="legend-overlay">
            <div className="legend-item">
              <div className="legend-color" style={{ background: '#ef4444' }}></div>
              <span>Electrón / Trayectoria Actual</span>
            </div>
            {isComparing && (
              <div className="legend-item">
                <div className="legend-line legend-dash" style={{ borderColor: '#22d3ee' }}></div>
                <span>Trayectoria de Referencia</span>
              </div>
            )}
            {showBField && (
              <div className="legend-item">
                <div className="legend-line" style={{ background: '#3b82f6' }}></div>
                <span>Campo Magnético (B)</span>
              </div>
            )}
            {showEField && (
              <div className="legend-item">
                <div className="legend-line" style={{ background: '#fbbf24' }}></div>
                <span>Campo Eléctrico (E)</span>
              </div>
            )}
          </div>

          {/* HELP MODAL */}
          {showHelp && (
            <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
              <div className="help-modal" onClick={e => e.stopPropagation()}>
                <div className="help-header">
                  <h2 className="flex items-center gap-2">
                    <Info className="text-blue-400" /> Guía del Simulador
                  </h2>
                  <button className="help-close" onClick={() => setShowHelp(false)}>
                    <X size={20} />
                  </button>
                </div>
                <div className="help-content">
                  <div className="help-section">
                    <h3>¿Qué es esto?</h3>
                    <p>
                      Este simulador modela la trayectoria de un electrón dentro de un magnetrón cilíndrico bajo la influencia de campos cruzados.
                    </p>
                  </div>
                  <div className="help-section">
                    <h3>Componentes Principales</h3>
                    <ul>
                      <li><span className="help-bullet">•</span> <strong>Cátodo (Interno - Azul):</strong> Electrodo con carga negativa que emite electrones hacia el espacio interelectródico ($R_i$).</li>
                      <li><span className="help-bullet">•</span> <strong>Ánodo (Externo - Rojo):</strong> Electrodo con carga positiva que ejerce una fuerza tractora sobre los electrones ($R_e$).</li>
                      <li><span className="help-bullet">•</span> <strong>Campo Eléctrico (E):</strong> Creado por la diferencia de potencial, acelera el electrón radialmente hacia afuera.</li>
                      <li><span className="help-bullet">•</span> <strong>Campo Magnético (B):</strong> Generado por los anillos exteriores, curva la trayectoria mediante la Fuerza de Lorentz.</li>
                    </ul>
                  </div>
                  <div className="help-section">
                    <h3>Física del Confinamiento</h3>
                    <p>
                      El secreto de un magnetrón es el <strong>confinamiento magnético</strong>. Si el campo magnético es suficientemente fuerte, el electrón se curva antes de tocar el Ánodo y vuelve hacia el Cátodo. 
                    </p>
                    <p className="mt-2 text-blue-300 text-[10px] italic">
                      * Observa la gráfica de Radio: si la curva verde se mantiene entre las líneas roja y azul, el electrón está confinado.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {magneticMap && (
            <Scene3D 
              trajectory={trajectory} 
              params={params} 
              bMap={magneticMap} 
              showBField={showBField}
              showEField={showEField}
              onProgress={(data) => setCurrentData(data)}
              savedTrajectory={isComparing ? savedSimulation?.trajectory : null}
              hideLabels={showHelp}
              isPaused={isPaused}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
