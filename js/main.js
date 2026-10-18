/**
 * @file Script principal de la simulación PsycodelicMosca.
 * @description Renderiza una Drosophila 2D vista desde arriba, impulsada por el conectoma BRAIN.
 * The photoreal chitin body is a transparent image asset; the fly's legs,
 * wings, antennae and feeding/grooming actions stay fully articulated in canvas.
 * BRAIN.accumleft / BRAIN.accumright drive direction and speed (unchanged interface).
 */

// --- Controls ---
document.getElementById('clearButton').onclick = function () {
	food = [];
};

document.getElementById('centerButton').onclick = function () {
	centerCameraOnFly();
};

// --- Camera follow and zoom controls ---
var cameraFollowButton = document.getElementById('cameraFollowButton');
if (cameraFollowButton) {
	cameraFollowButton.addEventListener('click', function () {
		cameraFollowsFly = !cameraFollowsFly;
		cameraFollowButton.setAttribute('aria-pressed', cameraFollowsFly ? 'true' : 'false');
		cameraFollowButton.classList.toggle('active', cameraFollowsFly);
		cameraFollowButton.textContent = cameraFollowsFly ? 'Siguiendo' : 'Seguir';
		cameraFollowButton.title = cameraFollowsFly ? 'Dejar de seguir a la mosca' : 'Seguir a la mosca';
		cameraFollowButton.setAttribute('aria-label', cameraFollowButton.title);
		if (cameraFollowsFly) centerCameraOnFly();
	});
}
document.getElementById('zoomIn').onclick = function () { setZoom(zoomLevel * 1.3); };
document.getElementById('zoomOut').onclick = function () { setZoom(zoomLevel / 1.3); };

// --- State ---
var facingDir = 0;
var targetDir = 0;
var speed = 0;
var targetSpeed = 0;
var speedChangeInterval = 0;
var food = [];
var touchResetTime = 0;
var windResetTime = 0;
var dragToolOrigin = null;
var currentDtScale = 1;

// --- Zoom / Pan ---
var zoomLevel = 1;
var panX = 0;
var panY = 0;
var cameraFollowsFly = false;
var MIN_ZOOM = 0.5;
var MAX_ZOOM = 5;
var pinchStartDist = 0;
var pinchStartZoom = 1;
var isPanning = false;
var panStart = { x: 0, y: 0 };
var panStartOffset = { x: 0, y: 0 };

function screenToWorld(sx, sy) {
	var cx = window.innerWidth / 2;
	var cy = window.innerHeight / 2;
	return {
		x: (sx - cx - panX) / zoomLevel + cx,
		y: (sy - cy - panY) / zoomLevel + cy
	};
}

function setZoom(newZoom, focusX, focusY) {
	if (focusX === undefined) focusX = window.innerWidth / 2;
	if (focusY === undefined) focusY = window.innerHeight / 2;
	var cx = window.innerWidth / 2;
	var cy = window.innerHeight / 2;
	// Adjust pan so the point under focus stays fixed
	var worldBefore = screenToWorld(focusX, focusY);
	zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
	var worldAfter = screenToWorld(focusX, focusY);
	panX += (worldAfter.x - worldBefore.x) * zoomLevel;
	panY += (worldAfter.y - worldBefore.y) * zoomLevel;
}

/** Compute the pan needed to put a world point at a screen point at the same zoom. */
function computeCameraPan(worldX, worldY, zoom, screenCenterX, screenCenterY, targetX, targetY) {
	return {
		x: targetX - screenCenterX - zoom * (worldX - screenCenterX),
		y: targetY - screenCenterY - zoom * (worldY - screenCenterY)
	};
}

function centerCameraOnFly() {
	var centerX = window.innerWidth / 2;
	var centerY = window.innerHeight / 2;
	var pan = computeCameraPan(fly.x, fly.y, zoomLevel, centerX, centerY, centerX, centerY);
	panX = pan.x;
	panY = pan.y;
}

// --- Layout helpers (mobile-aware) ---
function isMobile() {
	return window.innerWidth <= 768;
}

function getLayoutBounds() {
	var toolbar = document.getElementById('toolbar');
	var panel = document.getElementById('left-panel');
	var topH = toolbar ? toolbar.offsetHeight : 44;
	var bottomH = 0;
	if (panel && !isMobile()) {
		bottomH = panel.offsetHeight;
	} else if (panel && panel.classList.contains('drawer-open')) {
		bottomH = panel.offsetHeight;
	}
	return {
		top: topH,
		bottom: window.innerHeight - bottomH,
		left: 0,
		right: window.innerWidth
	};
}

// Visual feedback effects
var ripples = [];
var windArrowEnd = null;
var currentMousePos = { x: 0, y: 0 };

// ============================================================
// BEHAVIOR STATE MACHINE
// ============================================================

// Minimum time (ms) the fly must stay in a state before transitioning out
var BEHAVIOR_MIN_DURATION = {
	idle: 0,
	walk: 500,
	explore: 1000,
	phototaxis: 1000,
	rest: 3000,
	groom: 2000,
	feed: 2000,
	fly: 1500,
	startle: 800,
	brace: 500,
};

// Cooldown (ms) after exiting a state before it can be re-entered
var BEHAVIOR_COOLDOWN = {
	startle: 2000,
	fly: 1000,
	groom: 3000,
	feed: 1000,
	brace: 1000,
};

// The behavior state object
var behavior = {
	current: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
	groomLocation: null,
	burstDir: 0,
	turnBiasBaseline: 0,
	locomotionSpeedCommand: 0,
};

var MAX_FLY_ACTIVITY_ENTRIES = 100;
var lastFlyActivityMessage = '';
var lastFlyActivityAt = 0;

function describeFlyBehavior(state, groomLocation) {
	if (state === 'groom') {
		var bodyPart = {
			head: 'la cara', cabeza: 'la cara',
			thorax: 'el tórax', torax: 'el tórax',
			abdomen: 'el abdomen',
			leg: 'las patas', pata: 'las patas'
		}[groomLocation] || 'el tórax';
		return 'Se limpia ' + bodyPart + '.';
	}
	return {
		idle: 'Permanece quieta.',
		feed: 'Se alimenta.',
		walk: 'Camina.',
		explore: 'Explora el entorno.',
		phototaxis: 'Se orienta hacia la luz.',
		rest: 'Descansa.',
		startle: 'Se sobresalta y huye.',
		fly: 'Vuela.',
		brace: 'Se afirma frente al viento.'
	}[state] || 'Realiza una acción: ' + state + '.';
}

function recordFlyActivity(message, category) {
	var list = document.getElementById('fly-activity-log');
	if (!list) return;
	var now = Date.now();
	if (message === lastFlyActivityMessage && now - lastFlyActivityAt < 1400) return;
	lastFlyActivityMessage = message;
	lastFlyActivityAt = now;

	var emptyNotice = list.querySelector('.fly-log-empty');
	if (emptyNotice) emptyNotice.remove();

	var entry = document.createElement('div');
	entry.className = 'fly-log-entry fly-log-' + (category || 'behavior');
	var time = document.createElement('time');
	time.className = 'fly-log-time';
	time.dateTime = new Date(now).toISOString();
	time.textContent = new Date(now).toLocaleTimeString('es-ES', {
		hour: '2-digit', minute: '2-digit', second: '2-digit'
	});
	var description = document.createElement('span');
	description.className = 'fly-log-description';
	description.textContent = message;
	entry.appendChild(time);
	entry.appendChild(description);
	list.insertBefore(entry, list.firstChild);
	while (list.children.length > MAX_FLY_ACTIVITY_ENTRIES) {
		list.removeChild(list.lastChild);
	}
}

function recordFlyBehavior(state) {
	recordFlyActivity(describeFlyBehavior(state, behavior.groomLocation), state === 'groom' ? 'grooming' : 'behavior');
}

recordFlyActivity('La mosca está lista para explorar.', 'system');

// --- Tool state ---
var activeTool = 'feed';
var isDragging = false;
var dragStart = { x: 0, y: 0 };
var canvasTouchActive = false;
var touchTimestamps = [];
var lightStates = [1, 0.5, 0];
var lightStateIndex = 0;
var lightLabels = ['Brillante', 'Tenue', 'Oscuro'];
var tempStates = [0.5, 0.75, 0.25];
var tempStateIndex = 0;
var tempLabels = ['Neutra', 'Cálida', 'Fría'];

// Region-based neuron color map (built after BRAIN.setup)
var neuronColorMap = {};
// Cached dot element arrays per neuron group (built during DOM creation)
var neuronDotCache = {};
var regionColors = {
	sensory: '#3b82f6',
	central: '#8b5cf6',
	drives: '#f59e0b',
	motor: '#ef4444',
};

// Human-readable neuron descriptions for tooltips
var neuronDescriptions = {
	VIS_R1R6: 'Fotorreceptores de movimiento R1-R6',
	VIS_R7R8: 'Fotorreceptores de color R7/R8',
	VIS_ME: 'Médula visual (procesamiento de imágenes)',
	VIS_LO: 'Lóbula (reconocimiento de patrones)',
	VIS_LC: 'Neuronas columnares de la lóbula (detección de aproximación)',
	VIS_LPTC: 'Neuronas tangenciales de la placa lobular (flujo óptico)',
	OLF_ORN_FOOD: 'Receptor olfativo (olores de comida)',
	OLF_ORN_DANGER: 'Receptor olfativo (olores de peligro)',
	OLF_LN: 'Interneuronas locales olfativas',
	OLF_PN: 'Neuronas de proyección olfativa',
	GUS_GRN_SWEET: 'Receptores de sabor dulce',
	GUS_GRN_BITTER: 'Receptores de sabor amargo',
	GUS_GRN_WATER: 'Receptores gustativos del agua',
	MECH_BRISTLE: 'Neuronas sensoriales de las sedas (tacto)',
	MECH_JO: 'Órgano de Johnston (viento y gravedad)',
	MECH_CHORD: 'Órganos cordotonales (propiocepción)',
	THERMO_WARM: 'Termosensores de calor',
	THERMO_COOL: 'Termosensores de frío',
	NOCI: 'Nociceptores (dolor)',
	MB_KC: 'Células de Kenyon (memoria olfativa)',
	MB_APL: 'Neurona inhibidora APL',
	MB_MBON_APP: 'Salida de los cuerpos fungiformes (aproximación)',
	MB_MBON_AV: 'Salida de los cuerpos fungiformes (evitación)',
	MB_DAN_REW: 'Neuronas dopaminérgicas de recompensa',
	MB_DAN_PUN: 'Neuronas dopaminérgicas de castigo',
	LH_APP: 'Cuerno lateral (aproximación)',
	LH_AV: 'Cuerno lateral (evitación)',
	CX_EPG: 'Neuronas brújula (dirección)',
	CX_PFN: 'Neuronas de integración de trayectoria',
	CX_FC: 'Cuerpo en abanico (locomoción)',
	CX_HDELTA: 'Neuronas de cambio de dirección',
	SEZ_FEED: 'Centro de control de la alimentación',
	SEZ_GROOM: 'Centro de control del aseo',
	SEZ_WATER: 'Orden de ingesta de agua',
	ANTENNAL_MECH: 'Mecanosensorial antenal',
	GNG_DESC: 'Ganglios gnáticos (activación)',
	DN_WALK: 'Orden de caminar',
	DN_FLIGHT: 'Orden de volar',
	DN_TURN: 'Orden de girar',
	DN_BACKUP: 'Orden de retroceder',
	DN_STARTLE: 'Orden de sobresalto y escape',
	VNC_CPG: 'Generador de patrones central (marcha)',
	CLOCK_DN: 'Reloj circadiano',
	DRIVE_HUNGER: 'Impulso de hambre',
	DRIVE_FEAR: 'Impulso de miedo',
	DRIVE_FATIGUE: 'Impulso de fatiga',
	DRIVE_CURIOSITY: 'Impulso de curiosidad',
	DRIVE_GROOM: 'Impulso de aseo',
	MN_LEG_L1: 'Neurona motora: pata delantera izquierda',
	MN_LEG_R1: 'Neurona motora: pata delantera derecha',
	MN_LEG_L2: 'Neurona motora: pata media izquierda',
	MN_LEG_R2: 'Neurona motora: pata media derecha',
	MN_LEG_L3: 'Neurona motora: pata trasera izquierda',
	MN_LEG_R3: 'Neurona motora: pata trasera derecha',
	MN_WING_L: 'Neurona motora: ala izquierda',
	MN_WING_R: 'Neurona motora: ala derecha',
	MN_PROBOSCIS: 'Neurona motora: probóscide',
	MN_HEAD: 'Neurona motora: cabeza',
	MN_ABDOMEN: 'Neurona motora: abdomen',
};

// Approximate real neuron counts per functional group (FlyWire data)
var neuronPopulations = {
	VIS_R1R6: 6000,
	VIS_R7R8: 1600,
	VIS_ME: 39000,
	VIS_LO: 9000,
	VIS_LC: 3500,
	VIS_LPTC: 900,
	OLF_ORN_FOOD: 1100,
	OLF_ORN_DANGER: 700,
	OLF_LN: 400,
	OLF_PN: 400,
	GUS_GRN_SWEET: 800,
	GUS_GRN_BITTER: 600,
	GUS_GRN_WATER: 600,
	MECH_BRISTLE: 2200,
	MECH_JO: 480,
	MECH_CHORD: 500,
	ANTENNAL_MECH: 320,
	THERMO_WARM: 30,
	THERMO_COOL: 30,
	NOCI: 100,
	MB_KC: 2000,
	MB_APL: 1,
	MB_MBON_APP: 35,
	MB_MBON_AV: 35,
	MB_DAN_REW: 165,
	MB_DAN_PUN: 165,
	LH_APP: 700,
	LH_AV: 700,
	CX_EPG: 50,
	CX_PFN: 400,
	CX_FC: 2200,
	CX_HDELTA: 350,
	SEZ_FEED: 2500,
	SEZ_GROOM: 1800,
	SEZ_WATER: 700,
	GNG_DESC: 3000,
	DN_WALK: 50,
	DN_FLIGHT: 40,
	DN_TURN: 30,
	DN_BACKUP: 20,
	DN_STARTLE: 15,
	VNC_CPG: 14400,
	CLOCK_DN: 150,
	DRIVE_HUNGER: 200,
	DRIVE_FEAR: 150,
	DRIVE_FATIGUE: 100,
	DRIVE_CURIOSITY: 100,
	DRIVE_GROOM: 100,
	MN_LEG_L1: 50,
	MN_LEG_R1: 50,
	MN_LEG_L2: 50,
	MN_LEG_R2: 50,
	MN_LEG_L3: 50,
	MN_LEG_R3: 50,
	MN_WING_L: 45,
	MN_WING_R: 45,
	MN_PROBOSCIS: 30,
	MN_HEAD: 40,
	MN_ABDOMEN: 60
};

// --- Brain setup ---
BRAIN.setup();

// Build connectome grid grouped by region type
(function () {
	var holder = document.getElementById('nodeHolder');
	var regionOrder = ['sensory', 'central', 'drives', 'motor'];
	var regionLabels = { sensory: 'Sensorial', central: 'Central', drives: 'Impulsos', motor: 'Motor' };
	var regionNeurons = {};
	for (var r = 0; r < regionOrder.length; r++) {
		regionNeurons[regionOrder[r]] = [];
	}
	// Sort neurons into regions
	for (var ps in BRAIN.connectome) {
		var assigned = false;
		for (var regionName in BRAIN.neuronRegions) {
			var list = BRAIN.neuronRegions[regionName];
			for (var ni = 0; ni < list.length; ni++) {
				if (list[ni] === ps) {
					regionNeurons[regionName].push(ps);
					assigned = true;
					break;
				}
			}
			if (assigned) break;
		}
		if (!assigned) regionNeurons['motor'].push(ps);
	}

	for (var ri = 0; ri < regionOrder.length; ri++) {
		var type = regionOrder[ri];
		var neurons = regionNeurons[type];
		if (neurons.length === 0) continue;

		var section = document.createElement('div');
		section.className = 'cg-section cg-section-' + type;

		var label = document.createElement('div');
		label.className = 'cg-label';
		label.textContent = regionLabels[type];
		section.appendChild(label);

		var grid = document.createElement('div');
		grid.className = 'cg-nodes';

		for (var n = 0; n < neurons.length; n++) {
			var node = document.createElement('div');
			node.className = 'cg-node';
			node.id = neurons[n];
			node.setAttribute('data-neuron', neurons[n]);

			var nameSpan = document.createElement('span');
			nameSpan.className = 'cg-name';
			nameSpan.textContent = neurons[n].replace(/_/g, ' ');
			node.appendChild(nameSpan);

			var cluster = document.createElement('span');
			cluster.className = 'cg-dot-cluster';
			var pop = neuronPopulations[neurons[n]] || 1;
			var dotCount = Math.max(1, Math.min(600, Math.round(pop / 100)));
			var dotArr = [];
			for (var d = 0; d < dotCount; d++) {
				var dot = document.createElement('span');
				dot.className = 'cg-dot';
				cluster.appendChild(dot);
				dotArr.push(dot);
			}
			neuronDotCache[neurons[n]] = dotArr;
			node.appendChild(cluster);

			grid.appendChild(node);
		}

		section.appendChild(grid);
		holder.appendChild(section);
	}
})();

// Build neuron -> color lookup from BRAIN.neuronRegions
for (var region in BRAIN.neuronRegions) {
	var neurons = BRAIN.neuronRegions[region];
	for (var i = 0; i < neurons.length; i++) {
		neuronColorMap[neurons[i]] = regionColors[region] || '#55FF55';
	}
}

// --- Neuron tooltip on hover ---
var neuronTooltip = document.getElementById('neuronTooltip');
document.getElementById('nodeHolder').addEventListener('mouseover', function (e) {
	var node = e.target.closest('.cg-node');
	if (!node) return;
	var id = node.getAttribute('data-neuron');
	var desc = neuronDescriptions[id] || id;
	var pop = neuronPopulations[id];
	var popText = pop ? ' — representa aproximadamente ' + pop.toLocaleString('es-ES') + ' neuronas' : '';
	neuronTooltip.textContent = desc + popText;
	neuronTooltip.style.display = 'block';
});
document.getElementById('nodeHolder').addEventListener('mousemove', function (e) {
	if (neuronTooltip.style.display === 'block') {
		neuronTooltip.style.left = (e.clientX + 10) + 'px';
		neuronTooltip.style.bottom = (window.innerHeight - e.clientY + 10) + 'px';
		neuronTooltip.style.top = 'auto';
	}
});
document.getElementById('nodeHolder').addEventListener('mouseout', function (e) {
	var node = e.target.closest('.cg-node');
	if (node) {
		neuronTooltip.style.display = 'none';
	}
});

// --- Tool button handlers ---
var toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
for (var i = 0; i < toolButtons.length; i++) {
	(function (btn) {
		var tool = btn.getAttribute('data-tool');
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else if (tool === 'temp') {
			btn.addEventListener('click', cycleTempLevel);
		} else {
			btn.addEventListener('click', function () {
				activeTool = tool;
				for (var j = 0; j < toolButtons.length; j++) {
					var t = toolButtons[j].getAttribute('data-tool');
					if (t !== 'light' && t !== 'temp') {
						toolButtons[j].classList.remove('active');
					}
				}
				btn.classList.add('active');
			});
		}
	})(toolButtons[i]);
}

// --- Brain 3D toggle ---
var brain3dBtn = document.getElementById('brain3dBtn');
if (brain3dBtn) {
    brain3dBtn.addEventListener('click', function () {
        if (typeof Brain3D !== 'undefined') {
            Brain3D.toggle();
            var isActive = Brain3D.active;
            brain3dBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) {
                brain3dBtn.classList.add('active');
            } else {
                brain3dBtn.classList.remove('active');
            }
        }
    });
}

// --- Learn / Education panel toggle ---
var learnBtn = document.getElementById('learnBtn');
if (learnBtn) {
    learnBtn.addEventListener('click', function () {
        if (typeof EducationPanel !== 'undefined') {
            EducationPanel.toggle();
            if (EducationPanel.active) {
                learnBtn.classList.add('active');
            } else {
                learnBtn.classList.remove('active');
            }
        }
    });
}

// --- Help overlay toggle ---
var helpOverlay = document.getElementById('helpOverlay');
var helpBtn = document.getElementById('helpBtn');
var helpCloseBtn = document.getElementById('helpCloseBtn');

helpBtn.addEventListener('click', function () {
	var isVisible = helpOverlay.style.display !== 'none';
	helpOverlay.style.display = isVisible ? 'none' : 'block';
});

helpCloseBtn.addEventListener('click', function () {
	helpOverlay.style.display = 'none';
});

// Close help overlay when clicking outside of it
document.addEventListener('click', function (e) {
	if (helpOverlay.style.display !== 'none' &&
		!helpOverlay.contains(e.target) &&
		e.target !== helpBtn) {
		helpOverlay.style.display = 'none';
	}
});

// Close education panel when clicking outside of it
document.addEventListener('click', function (e) {
    if (typeof EducationPanel !== 'undefined' && EducationPanel.active) {
        var panel = document.getElementById('education-panel');
        var learnBtnEl = document.getElementById('learnBtn');
        var brain3dOverlay = document.getElementById('brain3d-overlay');
        if (panel && !panel.contains(e.target) && e.target !== learnBtnEl && (!brain3dOverlay || !brain3dOverlay.contains(e.target))) {
            EducationPanel.hide();
            if (learnBtnEl) learnBtnEl.classList.remove('active');
        }
    }
});

// --- Mobile drawer toggle ---
var sidebarToggle = document.getElementById('sidebarToggle');
var leftPanel = document.getElementById('left-panel');
var drawerBackdrop = document.getElementById('drawer-backdrop');

function openDrawer() {
	if (leftPanel) leftPanel.classList.add('drawer-open');
	if (drawerBackdrop) drawerBackdrop.classList.add('visible');
	document.body.style.overflow = 'hidden';
}

function closeDrawer() {
	if (leftPanel) leftPanel.classList.remove('drawer-open');
	if (drawerBackdrop) drawerBackdrop.classList.remove('visible');
	document.body.style.overflow = '';
}

if (sidebarToggle) {
	sidebarToggle.addEventListener('click', function (e) {
		e.stopPropagation();
		if (isMobile()) {
			// On mobile, hamburger toggles bottom panel drawer
			if (leftPanel && leftPanel.classList.contains('drawer-open')) {
				closeDrawer();
			} else {
				openDrawer();
			}
		} else {
			// On desktop, hamburger toggles activity sidebar
			if (typeof CaretakerSidebar !== 'undefined') {
				var isOpen = CaretakerSidebar.toggle();
				var actBtn = document.getElementById('activityToggle');
				if (actBtn) actBtn.classList.toggle('active', isOpen);
			}
		}
	});
}

// --- Activity sidebar toggle (desktop) ---
var activityToggle = document.getElementById('activityToggle');
var activityCloseBtn = document.getElementById('caretaker-sidebar-close');

if (activityToggle) {
	activityToggle.addEventListener('click', function(e) {
		e.stopPropagation();
		if (typeof CaretakerSidebar !== 'undefined') {
			var isOpen = CaretakerSidebar.toggle();
			activityToggle.classList.toggle('active', isOpen);
		}
	});
}

if (activityCloseBtn) {
	activityCloseBtn.addEventListener('click', function() {
		if (typeof CaretakerSidebar !== 'undefined') {
			var sidebar = document.getElementById('caretaker-sidebar');
			if (sidebar) sidebar.classList.remove('sidebar-open');
			if (activityToggle) activityToggle.classList.remove('active');
		}
	});
}

if (drawerBackdrop) {
	drawerBackdrop.addEventListener('click', function () {
		closeDrawer();
	});
}

// --- Lite mode toggle ---
var liteBtn = document.getElementById('liteBtn');
var liteModeActive = false;

if (liteBtn) {
	liteBtn.addEventListener('click', function () {
		liteModeActive = !liteModeActive;
		if (liteModeActive) {
			liteBtn.classList.add('active');
			// Slow down brain tick from 500ms (2Hz) to 1000ms (1Hz)
			clearInterval(brainTickId);
			brainTickId = setInterval(updateBrain, 1000);
			// Tell neuro-renderer to skip idle frames
			if (typeof NeuroRenderer !== 'undefined') {
				NeuroRenderer.setLiteMode(true);
			}
		} else {
			liteBtn.classList.remove('active');
			// Restore brain tick to 500ms (2Hz)
			clearInterval(brainTickId);
			brainTickId = setInterval(updateBrain, 500);
			if (typeof NeuroRenderer !== 'undefined') {
				NeuroRenderer.setLiteMode(false);
			}
		}
	});
}

// --- Connectome panel toggle ---
var connectomeToggleBtn = document.getElementById('connectomeToggleBtn');
var nodeHolder = document.getElementById('nodeHolder');

connectomeToggleBtn.addEventListener('click', function () {
	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
		if (NeuroRenderer.isActive()) {
			NeuroRenderer.destroy();
			connectomeToggleBtn.textContent = 'Vista 139 mil';
		} else {
			if (NeuroRenderer.init()) {
				connectomeToggleBtn.textContent = 'Grupos';
			}
		}
	} else {
		if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer.isActive()) {
			NeuroRenderer.destroy();
			nodeHolder.classList.remove('hidden');
			connectomeToggleBtn.textContent = 'Ocultar';
		} else if (nodeHolder.classList.contains('hidden')) {
			nodeHolder.classList.remove('hidden');
			connectomeToggleBtn.textContent = 'Ocultar';
		} else {
			nodeHolder.classList.add('hidden');
			connectomeToggleBtn.textContent = 'Mostrar';
		}
	}
});

/**
 * Updates the brain state and converts motor output to direction/speed.
 * Interface unchanged from worm-sim.
 */
function updateBrain() {
	BRAIN.update();
	if (typeof NeuroRenderer === 'undefined' || !NeuroRenderer.isActive()) {
		for (var postSynaptic in BRAIN.connectome) {
			var psBox = document.getElementById(postSynaptic);
			if (!psBox) continue;
			var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
			var color = neuronColorMap[postSynaptic] || '#55FF55';
			var baseOpacity = Math.min(1, neuron / 50);
			var dots = neuronDotCache[postSynaptic];
			if (!dots) continue;
			for (var di = 0; di < dots.length; di++) {
				var variation = (Math.random() - 0.5) * 0.6;
				var dotOpacity = Math.max(0, Math.min(1, baseOpacity + variation * baseOpacity));
				dots[di].style.backgroundColor = color;
				dots[di].style.opacity = dotOpacity;
				dots[di].style.boxShadow = dotOpacity > 0.5 ? '0 0 ' + Math.round(dotOpacity * 4) + 'px ' + color : 'none';
			}
			psBox.classList.toggle('cg-active', baseOpacity > 0.15);
		}
	}
	// Evaluate behavioral state and compute movement
	updateBehaviorState();
	computeMovementForBehavior();

	// Update drive meter bars
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	var driveGroomEl = document.getElementById('driveGroom');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
	if (driveGroomEl) driveGroomEl.style.width = (BRAIN.drives.groom * 100) + '%';

	// Update behavior state label
	var behaviorStateEl = document.getElementById('behaviorState');
	if (behaviorStateEl) {
		var stateLabels = {
			idle: 'inactivo',
			feed: 'comiendo',
			groom: 'aseándose',
			walk: 'caminando',
			explore: 'explorando',
			rest: 'descansando',
			startle: 'sobresaltada',
			fly: 'volando',
			phototaxis: 'fototaxis',
			brace: 'en guardia'
		};
		behaviorStateEl.textContent = stateLabels[behavior.current] || behavior.current;
	}
}

BRAIN.randExcite();

// Poll for worker ready state to init WebGL neuron renderer
var _neuroRendererInitTimer = setInterval(function () {
	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
		clearInterval(_neuroRendererInitTimer);
		if (NeuroRenderer.init()) {
			connectomeToggleBtn.textContent = 'Grupos';
		}
	}
}, 200);
setTimeout(function () { clearInterval(_neuroRendererInitTimer); }, 30000);

// Keyboard shortcut: 'v' toggles connectome view
document.addEventListener('keydown', function (e) {
	if (e.key === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
		connectomeToggleBtn.click();
	}
});

var brainTickId = setInterval(updateBrain, 500);

// --- Tab visibility handling ---
// When the tab is backgrounded, browsers throttle setInterval to ~1/s but
// pause requestAnimationFrame entirely. This means the brain tick keeps
// running (accumulating drives, processing stale stimuli) while update()
// never runs to clear stimulus timers or reset food flags. On resume,
// drives are maxed out causing a jarring behavioral cascade.
// Fix: pause the brain tick when hidden, resume when visible. On resume,
// clear all stale stimuli and snapshot drives to prevent drift.
var driveSnapshotOnHide = null;

document.addEventListener('visibilitychange', function () {
	if (document.hidden) {
		// Tab is being hidden: stop the brain tick entirely
		clearInterval(brainTickId);
		brainTickId = null;

		// Stop the sim-worker tick loop and clear stale neural state
		BRAIN.stopWorker();

		// Snapshot current drive values so we can restore them on resume
		driveSnapshotOnHide = {
			hunger: BRAIN.drives.hunger,
			fear: BRAIN.drives.fear,
			fatigue: BRAIN.drives.fatigue,
			curiosity: BRAIN.drives.curiosity,
			groom: BRAIN.drives.groom,
		};
	} else {
		// Tab is becoming visible again: clear all stale stimuli
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		BRAIN.stimulate.windDirection = 0;
		BRAIN.stimulate.foodNearby = false;
		BRAIN.stimulate.foodContact = false;
		BRAIN.stimulate.nociception = false;
		touchResetTime = 0;
		windResetTime = 0;
		touchTimestamps.length = 0;

		// Reset drag/interaction state that may be stale from a mid-drag tab hide
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;

		// Pause food feeding timers on resume, preserve eaten progress
		for (var fi = 0; fi < food.length; fi++) {
			if (food[fi].feedStart !== 0) {
				var ate = Date.now() - food[fi].feedStart;
				food[fi].eaten = Math.min(1, (food[fi].eaten || 0) + ate / food[fi].feedDuration);
				food[fi].feedStart = 0;
			}
			food[fi].radius = 10 * (1 - (food[fi].eaten || 0) * 0.9);
		}

		// Restore drive snapshot to undo any drift from throttled ticks
		// that may have fired between the hide event and clearInterval
		if (driveSnapshotOnHide) {
			BRAIN.drives.hunger = driveSnapshotOnHide.hunger;
			BRAIN.drives.fear = driveSnapshotOnHide.fear;
			BRAIN.drives.fatigue = driveSnapshotOnHide.fatigue;
			BRAIN.drives.curiosity = driveSnapshotOnHide.curiosity;
			BRAIN.drives.groom = driveSnapshotOnHide.groom;
			driveSnapshotOnHide = null;
		}

		// Reset behavior and speed state to prevent high-speed transient
		// states from persisting after stimuli have been cleared
		behavior.current = 'idle';
		behavior.startlePhase = 'none';
		behavior.enterTime = Date.now();
		behavior.cooldowns = {};
		behavior.burstDir = 0;
		behavior.turnBiasBaseline = 0;
		behavior.locomotionSpeedCommand = 0;
		speed = 0;
		speedChangeInterval = 0;

		// Reset lastTime so the RAF loop does not compute a huge dt on resume
		lastTime = -1;

		// Restart the sim-worker with a clean neural state
		BRAIN.startWorker();

		// Restart the brain tick
		brainTickId = setInterval(updateBrain, liteModeActive ? 1000 : 500);
	}
});

// --- Canvas setup ---
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.addEventListener('mousedown', handleCanvasMousedown, false);
canvas.addEventListener('mousemove', handleCanvasMousemove, false);
document.addEventListener('mouseup', handleCanvasMouseup, false);

// --- Touch event handlers (mobile/tablet support) ---
canvas.addEventListener('touchstart', function (event) {
	if (event.touches.length === 2) {
		// Pinch-to-zoom start
		event.preventDefault();
		var dx = event.touches[0].clientX - event.touches[1].clientX;
		var dy = event.touches[0].clientY - event.touches[1].clientY;
		pinchStartDist = Math.hypot(dx, dy);
		pinchStartZoom = zoomLevel;
		canvasTouchActive = false;
		return;
	}
	canvasTouchActive = true;
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchmove', function (event) {
	if (event.touches.length === 2) {
		// Pinch-to-zoom
		event.preventDefault();
		var dx = event.touches[0].clientX - event.touches[1].clientX;
		var dy = event.touches[0].clientY - event.touches[1].clientY;
		var dist = Math.hypot(dx, dy);
		var midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
		var midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
		setZoom(pinchStartZoom * (dist / pinchStartDist), midX, midY);
		return;
	}
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousemove({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

document.addEventListener('touchend', function (event) {
	pinchStartDist = 0;
	if (canvasTouchActive) {
		event.preventDefault();
		var touch = event.changedTouches[0];
		handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
		canvasTouchActive = false;
	}
}, { passive: false });

// --- Scroll wheel zoom ---
canvas.addEventListener('wheel', function (event) {
	event.preventDefault();
	var factor = event.deltaY < 0 ? 1.1 : 0.9;
	setZoom(zoomLevel * factor, event.clientX, event.clientY);
}, { passive: false });

function handleCanvasMousedown(event) {
	var world = screenToWorld(event.clientX, event.clientY);
	var cx = world.x;
	var cy = world.y;

	if (activeTool === 'feed') {
		var foodMinY = getLayoutBounds().top;
		var foodMaxY = window.innerHeight;
		cy = Math.max(foodMinY, Math.min(foodMaxY, cy));
		food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0 });
	} else if (activeTool === 'touch') {
		applyTouchTool(cx, cy);
		ripples.push({ x: cx, y: cy, startTime: Date.now() });
	} else if (activeTool === 'air') {
		isDragging = true;
		dragToolOrigin = 'air';
		windResetTime = 0;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
		BRAIN.stimulate.windDirection = 0;
	}
}

function handleCanvasMousemove(event) {
	currentMousePos.x = event.clientX;
	currentMousePos.y = event.clientY;
	if (!isDragging || dragToolOrigin !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
	BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
	windArrowEnd = { x: event.clientX, y: event.clientY };
}

function handleCanvasMouseup(event) {
	if (isDragging) {
		if (dragToolOrigin === 'air') {
			var dx = event.clientX - dragStart.x;
			var dy = event.clientY - dragStart.y;
			var dragDist = Math.sqrt(dx * dx + dy * dy);
			if (dragDist < 5) {
				var distToFly = Math.hypot(event.clientX - fly.x, event.clientY - fly.y);
				BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));
				BRAIN.stimulate.windDirection = Math.atan2(-(fly.y - event.clientY), fly.x - event.clientX);
			} else {
				BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
				BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
			}
			BRAIN.stimulate.wind = true;
			windResetTime = Date.now() + 2000;
		}
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;
	}
}

function applyTouchTool(cx, cy) {
	var distToFly = Math.hypot(cx - fly.x, cy - fly.y);
	if (distToFly > 50) return; // click not on fly

	// Transform click to fly-local coordinates
	var dx = cx - fly.x;
	var dy = cy - fly.y;
	var angle = facingDir - Math.PI / 2;
	var cosA = Math.cos(angle);
	var sinA = Math.sin(angle);
	var localX = dx * cosA - dy * sinA;
	var localY = dx * sinA + dy * cosA;

	// Classify body part
	var location;
	if (Math.abs(localX) > 12 && localY > -20 && localY < 5) {
		location = 'leg';
	} else if (localY < -17) {
		location = 'head';
	} else if (localY < 2) {
		location = 'thorax';
	} else {
		location = 'abdomen';
	}

	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = location;

	// A brief, purely visual cleaning response keeps all touched body parts
	// legible even when the connectome prioritizes a startle response.
	anim.groomPhase = 0;
	anim.groomFeedbackUntil = Date.now() + 1100;
	anim.groomFeedbackLocation = location;
	anim.groomPoseLocation = location;
	recordFlyActivity(
		describeFlyBehavior('groom', location).replace(/\.$/, '') + ' tras el contacto.',
		'grooming'
	);

	touchResetTime = Math.max(touchResetTime, Date.now() + 2000);

	// Track touch timestamps for nociception (rapid repeated touch = pain)
	var now = Date.now();
	touchTimestamps.push(now);
	// Prune entries older than 4 seconds
	var cutoff = now - 4000;
	while (touchTimestamps.length > 0 && touchTimestamps[0] < cutoff) {
		touchTimestamps.shift();
	}
	// 3+ touches within 4 seconds triggers nociception for one brain tick
	if (touchTimestamps.length >= 3) {
		BRAIN.stimulate.nociception = true;
		touchTimestamps.length = 0; // reset to require fresh rapid touches
	}
}

/**
 * Returns the nearest food item and its distance, or null if no food exists.
 */
function nearestFood() {
	var best = null;
	var bestDist = Infinity;
	for (var i = 0; i < food.length; i++) {
		var d = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (d < bestDist) {
			bestDist = d;
			best = food[i];
		}
	}
	if (!best) return null;
	return { item: best, dist: bestDist };
}

/** Express a world-space food item in the fly's local, forward-facing frame. */
function getFoodProboscisCoordinates(item) {
	if (!item) return null;
	var worldX = item.x - fly.x;
	var worldY = item.y - fly.y;
	var bodyRotation = -facingDir + Math.PI / 2;
	return {
		x: worldX * Math.cos(bodyRotation) + worldY * Math.sin(bodyRotation),
		y: -worldX * Math.sin(bodyRotation) + worldY * Math.cos(bodyRotation)
	};
}

/** Keep mouth extension inside a forward cone so it never points through the abdomen. */
function isFoodInFrontOfProboscis(item) {
	var position = getFoodProboscisCoordinates(item);
	if (!position) return false;
	var forwardDistance = BODY.proboscisBaseY - position.y;
	var mouthDistance = Math.hypot(position.x, -forwardDistance);
	if (mouthDistance < 0.001) return true;
	return forwardDistance / mouthDistance >= Math.SQRT1_2;
}

/** Check reach from the actual mouth attachment in the fly's rotated frame. */
function isFoodWithinProboscisReach(item) {
	var position = getFoodProboscisCoordinates(item);
	if (!position || !isFoodInFrontOfProboscis(item)) return false;
	var mouthDistance = Math.hypot(position.x, position.y - BODY.proboscisBaseY);
	var foodRadius = Math.max(0, Number(item.radius) || 0);
	return mouthDistance <= BODY.proboscisLength + foodRadius;
}

/**
 * Called on the 500ms brain tick. Evaluates state transitions and
 * updates BRAIN behavior flags for the next tick's drive computation.
 */
function updateBehaviorState() {
	var now = Date.now();
	var elapsed = now - behavior.enterTime;
	var minDur = BEHAVIOR_MIN_DURATION[behavior.current] || 0;

	// Do not transition if minimum duration has not elapsed
	if (elapsed < minDur) {
		// Update BRAIN flags based on current state (for drive computation)
		syncBrainFlags();
		return;
	}

	var newState = evaluateBehaviorEntry();

	if (newState !== behavior.current) {
		// Set cooldown for the state being exited
		if (BEHAVIOR_COOLDOWN[behavior.current]) {
			behavior.cooldowns[behavior.current] = now + BEHAVIOR_COOLDOWN[behavior.current];
		}
		// Pause feeding timer when exiting feed state but keep eaten progress
		if (behavior.current === 'feed') {
			for (var fi = 0; fi < food.length; fi++) {
				if (food[fi].feedStart !== 0) {
					var ate = Date.now() - food[fi].feedStart;
					food[fi].eaten = Math.min(1, (food[fi].eaten || 0) + ate / food[fi].feedDuration);
					food[fi].feedStart = 0;
				}
			}
		}
		behavior.current = newState;
		behavior.enterTime = now;
		// Startle: initialize freeze phase and drain DN_STARTLE
		if (newState === 'startle') {
			behavior.startlePhase = 'freeze';
			behavior.startleFreezeEnd = now + 200;
			if (BRAIN.postSynaptic['DN_STARTLE']) {
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
			}
		} else {
			behavior.startlePhase = 'none';
		}

		// Groom: snapshot the touch location that triggered grooming.
		if (newState === 'groom') {
			behavior.groomLocation = BRAIN.stimulate.touchLocation || 'thorax';
		}

		// A touch-triggered cleaning message already describes this exact action.
		var sameTouchCleaning = newState === 'groom' &&
			anim.groomFeedbackUntil > now &&
			behavior.groomLocation === anim.groomFeedbackLocation;
		if (!sameTouchCleaning) recordFlyBehavior(newState);
	}

	syncBrainFlags();
}

/**
 * Syncs BRAIN._isMoving/_isFeeding/_isGrooming flags with the
 * behavioral state machine so that drive updates in the next
 * brain tick reflect actual behavior, not just accumulator values.
 */
function syncBrainFlags() {
	var s = behavior.current;
	BRAIN._isMoving = (s === 'walk' || s === 'explore' || s === 'phototaxis' ||
		s === 'fly' || (s === 'startle' && behavior.startlePhase === 'burst'));
	BRAIN._isFeeding = (s === 'feed');
	BRAIN._isGrooming = (s === 'groom');
}

/**
 * High-pass a turn command so steady motor or noise bias cannot spin the fly.
 * Called on the 500ms brain tick alongside the movement controller.
 */
function filterPersistentTurn(rawTurn) {
	if (typeof rawTurn !== 'number' || !isFinite(rawTurn)) rawTurn = 0;
	var baseline = Number(behavior.turnBiasBaseline);
	if (!isFinite(baseline)) baseline = 0;

	// A steady motor or random offset is a heading preference, not an endless
	// angular velocity. Remove its DC component while letting changing signals
	// through; this preserves brief turns without allowing one-sided outputs to
	// wind the fly around in circles.
	if (Math.abs(rawTurn) < 0.0001) {
		behavior.turnBiasBaseline = 0;
		return 0;
	}
	baseline += (rawTurn - baseline) * 0.25;
	behavior.turnBiasBaseline = baseline;
	var turn = rawTurn - baseline;
	return Math.max(-0.12, Math.min(0.12, turn));
}

function smoothLocomotionSpeed(rawSpeed, maxSpeed, blend) {
	if (typeof rawSpeed !== 'number' || !isFinite(rawSpeed)) rawSpeed = 0;
	if (typeof maxSpeed !== 'number' || !isFinite(maxSpeed) || maxSpeed <= 0) maxSpeed = 1;
	if (typeof blend !== 'number' || !isFinite(blend)) blend = 0.35;
	rawSpeed = Math.max(0, Math.min(maxSpeed, rawSpeed));
	blend = Math.max(0, Math.min(1, blend));

	var command = Number(behavior.locomotionSpeedCommand);
	if (!isFinite(command)) {
		command = (typeof speed === 'number' && isFinite(speed)) ? Math.max(0, speed) : 0;
	}
	command = Math.max(0, Math.min(maxSpeed, command));
	command += (rawSpeed - command) * blend;
	behavior.locomotionSpeedCommand = command;
	return command;
}

/**
 * Maps the connectome motor outputs to smooth movement targets on each
 * 500 ms brain tick, retaining the web reference's relative steering model.
 */
function computeMovementForBehavior() {
	var scalingFactor = 20;
	var state = behavior.current;
	var rawMotorSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);

	if (state === 'walk' || state === 'explore') {
		// Match the web reference: motor asymmetry steers relative to the current
		// heading and exploration adds small, symmetric turns on each brain tick.
		// A slow bias filter prevents persistent motor imbalance/noisy output from
		// becoming a perpetual clockwise or counter-clockwise spin.
		var motorTurn = computeMotorTurnOffset(BRAIN.accumleft, BRAIN.accumright);
		var wanderRange = state === 'explore' ? 0.3 : 0.08;
		var turnInput = motorTurn + (Math.random() - 0.5) * wanderRange;
		if (BRAIN.accumHead > 3) {
			var headTurn = computeMotorTurnOffset(BRAIN.accumWalkLeft, BRAIN.accumWalkRight);
			if (headTurn !== 0) {
				var headBias = Math.min((BRAIN.accumHead / 40) * 0.15, 0.08);
				turnInput += headBias * (headTurn > 0 ? 1 : -1);
			}
		}
		targetDir = facingDir + filterPersistentTurn(turnInput);

		// Keep an active gait visibly translating even when the virtual VNC output
		// is near its walk-entry threshold (matching the reference fork's floor).
		var desiredWalkSpeed = Math.max(rawMotorSpeed, 0.25);
		// Food-seeking: steer toward nearest food when hungry and food detected.
		if (BRAIN.stimulate.foodNearby && BRAIN.drives.hunger > 0.3) {
			var nf = nearestFood();
			if (nf) {
				var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
				var seekStrength = Math.min(1, BRAIN.drives.hunger);
				var angleDiffToFood = normalizeAngle(foodAngle - facingDir);
				targetDir = facingDir + angleDiffToFood * seekStrength;
				desiredWalkSpeed = Math.max(desiredWalkSpeed, 0.3);
			}
		}
		targetSpeed = smoothLocomotionSpeed(desiredWalkSpeed, 0.85, 0.35);
		// The neural bridge updates every 500 ms; a slower acceleration constant
		// keeps individual worker spikes from appearing as fast footstep-like darts.
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 2.5);
	} else if (state === 'phototaxis') {
		var dx = window.innerWidth / 2 - fly.x;
		var dy = -(window.innerHeight / 2 - fly.y);
		var desiredPhotoSpeed;
		if (Math.hypot(dx, dy) < 40) {
			// atan2(0, 0) flips to an arbitrary heading at the light source.
			// Mill gently around it instead of orbiting or snapping to a stop.
			targetDir = facingDir + filterPersistentTurn((Math.random() - 0.5) * 0.4);
			desiredPhotoSpeed = 0.15;
		} else {
			behavior.turnBiasBaseline = 0;
			targetDir = Math.atan2(dy, dx);
			desiredPhotoSpeed = Math.max(rawMotorSpeed, 0.3);
		}
		targetSpeed = smoothLocomotionSpeed(desiredPhotoSpeed, 0.85, 0.35);
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 2.5);
	} else if (state === 'fly') {
		var flightTurn = computeMotorTurnOffset(BRAIN.accumleft, BRAIN.accumright) + (Math.random() - 0.5) * 0.2;
		targetDir = facingDir + filterPersistentTurn(flightTurn);
		var desiredFlightSpeed = Math.max(rawMotorSpeed * 2.5, 1.5);
		targetSpeed = smoothLocomotionSpeed(desiredFlightSpeed, 2.4, 0.45);
		// Keep the intentional flight burst, but avoid the near-instant speed jump
		// of the old 10-frame ramp when the brain state toggles.
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
	} else if (state === 'startle') {
		behavior.locomotionSpeedCommand = 0;
		behavior.turnBiasBaseline = 0;
		if (behavior.startlePhase === 'freeze') {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.5;
		} else {
			// burst: use the pre-computed escape direction from applyBehaviorMovement freeze-to-burst transition
			targetDir = behavior.burstDir;
			targetSpeed = 0.5;
			speedChangeInterval = (targetSpeed - speed) / 30;
		}
	} else if (state === 'feed') {
		behavior.locomotionSpeedCommand = 0;
		behavior.turnBiasBaseline = 0;
		// Approach until the mouth can reach the food, not until the body overlaps it.
		var nf = nearestFood();
		if (nf && !isFoodWithinProboscisReach(nf.item)) {
			var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
			targetDir = foodAngle;
			targetSpeed = 0.25;
			speedChangeInterval = (targetSpeed - speed) / 30;
		} else {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.1;
		}
	} else if (state === 'brace') {
		behavior.locomotionSpeedCommand = 0;
		behavior.turnBiasBaseline = 0;
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
		// Orient to face into the wind (toward wind source = windDirection + PI)
		var braceDir = normalizeAngle(BRAIN.stimulate.windDirection + Math.PI);
		var braceDiff = normalizeAngle(braceDir - targetDir);
		targetDir += braceDiff * 0.8;
		targetDir = normalizeAngle(targetDir);
	} else if (state === 'groom' || state === 'rest') {
		behavior.locomotionSpeedCommand = 0;
		behavior.turnBiasBaseline = 0;
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
	} else {
		behavior.locomotionSpeedCommand = 0;
		behavior.turnBiasBaseline = 0;
		// idle
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.05;
	}
}

/**
 * Called every frame (60fps) BEFORE speed interpolation.
 * Handles frame-rate-dependent overrides: startle freeze/burst transitions,
 * and speed clamping for stationary behaviors.
 */
function applyBehaviorMovement(dtScale) {
	if (behavior.current === 'startle') {
		var now = Date.now();
		if (behavior.startlePhase === 'freeze') {
			speed = 0;
			speedChangeInterval = 0;
			if (now >= behavior.startleFreezeEnd) {
				behavior.startlePhase = 'burst';
				speed = 3.0;
				behavior.burstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);
				targetDir = behavior.burstDir;
				facingDir = behavior.burstDir;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
			}
		}
	}

	if (behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle' ||
		behavior.current === 'brace') {
		if (speed > 0.05) {
			speed *= Math.pow(0.92, dtScale);
		} else {
			speed = 0;
		}
	}
	if (behavior.current === 'feed') {
		var nf = nearestFood();
		if (nf && !isFoodWithinProboscisReach(nf.item)) {
			// Allow slow drift: clamp speed to max 0.2 so it doesn't overshoot
			if (speed > 0.2) {
				speed *= Math.pow(0.92, dtScale);
			}
		} else {
			if (speed > 0.05) {
				speed *= Math.pow(0.92, dtScale);
			} else {
				speed = 0;
			}
		}
	}
}

/**
 * Called every frame (60fps). Smoothly interpolates animation parameters
 * toward their targets based on the current behavior state.
 */
function updateAnimForBehavior(dtScale) {
	var state = behavior.current;

	// Wing spread target (exponential interpolation for frame-rate independence)
	var targetWingSpread = 0;
	if (state === 'fly' || (state === 'startle' && behavior.startlePhase === 'burst')) {
		targetWingSpread = 1;
	}
	anim.wingSpread += (targetWingSpread - anim.wingSpread) * (1 - Math.pow(0.85, dtScale));

	// Ease the legs into and out of grooming so the elbow pose does not snap.
	var touchCleaningActive = anim.groomFeedbackUntil > Date.now();
	if (state === 'groom') {
		anim.groomPoseLocation = behavior.groomLocation;
	} else if (touchCleaningActive) {
		anim.groomPoseLocation = anim.groomFeedbackLocation;
	}
	var targetGroomBlend = state === 'groom' || touchCleaningActive ? 1 : 0;
	anim.groomBlend += (targetGroomBlend - anim.groomBlend) * (1 - Math.pow(0.86, dtScale));

	// Show a short tasting extension while the fly is deliberately feeding and
	// nearby food is within approach range; extend fully once the mouth can reach it.
	var targetProboscis = 0;
	if (state === 'feed') {
		var mouthTarget = nearestFood();
		if (mouthTarget && mouthTarget.dist <= 50 && isFoodInFrontOfProboscis(mouthTarget.item)) {
			targetProboscis = isFoodWithinProboscisReach(mouthTarget.item) ? 1 : 0.6;
		}
	}
	anim.proboscisExtend += (targetProboscis - anim.proboscisExtend) * (1 - Math.pow(0.9, dtScale));

	// Visual cleaning feedback uses the existing gait phase without changing
	// the brain's behavior state or interfering with movement/turning.
	if (state === 'groom' || anim.groomFeedbackUntil > Date.now()) {
		anim.groomPhase += 0.12 * dtScale;
	}

	// Walk phase advances when walking (linear dt scaling for phase accumulator)
	if (state === 'walk' || state === 'explore' || state === 'phototaxis') {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5 * dtScale;
	}
}

function cycleLightLevel() {
	lightStateIndex = (lightStateIndex + 1) % lightStates.length;
	BRAIN.stimulate.lightLevel = lightStates[lightStateIndex];
	var btn = document.getElementById('lightBtn');
	if (btn) btn.textContent = 'Luz: ' + lightLabels[lightStateIndex];
}

function cycleTempLevel() {
	tempStateIndex = (tempStateIndex + 1) % tempStates.length;
	BRAIN.stimulate.temperature = tempStates[tempStateIndex];
	var btn = document.getElementById('tempBtn');
	if (btn) btn.textContent = 'Temp.: ' + tempLabels[tempStateIndex];
}

function drawFood() {
	var t = Date.now();
	for (var i = 0; i < food.length; i++) {
		var f = food[i];
		var radius = Math.max(0.7, Number(f.radius) || 0);
		if (!(radius > 0)) continue;
		var distToFly = Math.hypot(fly.x - f.x, fly.y - f.y);

		ctx.save();

		// Soft contact shadow gives the droplet a little volume on the scene.
		ctx.beginPath();
		ctx.ellipse(f.x + radius * 0.08, f.y + radius * 0.74,
			radius * 0.82, radius * 0.25, 0, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(74, 39, 12, 0.20)';
		ctx.fill();

		// Subtle pulsing amber halo when the fly is close enough to sense it.
		if (distToFly <= 50) {
			var pulse = 0.20 + Math.sin(t / 200) * 0.05;
			var glow = ctx.createRadialGradient(f.x, f.y, radius * 0.15,
				f.x, f.y, radius * 2.0);
			glow.addColorStop(0, 'rgba(255, 183, 38, ' + pulse.toFixed(2) + ')');
			glow.addColorStop(1, 'rgba(255, 157, 18, 0)');
			ctx.beginPath();
			ctx.ellipse(f.x, f.y, radius * 1.8, radius * 1.55, 0, 0, Math.PI * 2);
			ctx.fillStyle = glow;
			ctx.fill();
		}

		// Render the genuine macro cutout from directly above. Its natural wet
		// reflections and translucent amber depth remain photographic as it shrinks.
		if (honeyDropAssetReady && honeyDropAsset && honeyDropAsset.naturalWidth) {
			var imageSize = Math.max(1.4, radius * 2.2);
			ctx.drawImage(honeyDropAsset, f.x - imageSize / 2, f.y - imageSize / 2,
				imageSize, imageSize);
			ctx.restore();
			continue;
		}

		// Procedural teardrop fallback while the photographic asset is loading.
		ctx.beginPath();
		ctx.moveTo(f.x, f.y - radius * 1.08);
		ctx.bezierCurveTo(
			f.x + radius * 0.17, f.y - radius * 0.80,
			f.x + radius * 1.04, f.y - radius * 0.12,
			f.x + radius * 0.82, f.y + radius * 0.42
		);
		ctx.bezierCurveTo(
			f.x + radius * 0.64, f.y + radius * 1.02,
			f.x - radius * 0.62, f.y + radius * 1.02,
			f.x - radius * 0.82, f.y + radius * 0.40
		);
		ctx.bezierCurveTo(
			f.x - radius * 1.02, f.y - radius * 0.13,
			f.x - radius * 0.18, f.y - radius * 0.81,
			f.x, f.y - radius * 1.08
		);
		ctx.closePath();

		var honey = ctx.createRadialGradient(
			f.x - radius * 0.33, f.y - radius * 0.48, radius * 0.04,
			f.x + radius * 0.10, f.y + radius * 0.16, radius * 1.58
		);
		honey.addColorStop(0, '#fff4b8');
		honey.addColorStop(0.17, '#ffe07a');
		honey.addColorStop(0.43, '#f7b52f');
		honey.addColorStop(0.73, '#dc8117');
		honey.addColorStop(1, '#8d410b');
		ctx.fillStyle = honey;
		ctx.fill();
		ctx.strokeStyle = 'rgba(102, 47, 8, 0.52)';
		ctx.lineWidth = Math.max(0.3, radius * 0.045);
		ctx.stroke();

		// Gentle translucent amber depth along the lower edge.
		ctx.beginPath();
		ctx.ellipse(f.x + radius * 0.12, f.y + radius * 0.48,
			radius * 0.48, radius * 0.17, 0.08, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(119, 48, 5, 0.14)';
		ctx.fill();

		// Long soft reflection and a tiny white glint sell the wet, sticky surface.
		ctx.beginPath();
		ctx.ellipse(f.x - radius * 0.28, f.y - radius * 0.42,
			radius * 0.12, radius * 0.29, -0.30, 0, Math.PI * 2);
		var shine = ctx.createLinearGradient(
			f.x - radius * 0.40, f.y - radius * 0.72,
			f.x - radius * 0.12, f.y - radius * 0.08
		);
		shine.addColorStop(0, 'rgba(255, 255, 231, 0.88)');
		shine.addColorStop(1, 'rgba(255, 246, 202, 0.10)');
		ctx.fillStyle = shine;
		ctx.fill();
		ctx.beginPath();
		ctx.ellipse(f.x - radius * 0.05, f.y - radius * 0.82,
			radius * 0.075, radius * 0.065, -0.2, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(255, 255, 244, 0.94)';
		ctx.fill();

		ctx.restore();
	}
}

/**
 * Draws expanding ripple effects at touch-tool click points.
 * Ripples expand from 0 to 30px radius over 500ms, fading out.
 */
function drawRipples() {
	var now = Date.now();
	for (var i = ripples.length - 1; i >= 0; i--) {
		var r = ripples[i];
		var elapsed = now - r.startTime;
		if (elapsed > 500) {
			ripples.splice(i, 1);
			continue;
		}
		var progress = elapsed / 500;
		var radius = progress * 30;
		var alpha = 1 - progress;
		ctx.beginPath();
		ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(227, 115, 75, ' + alpha.toFixed(2) + ')';
		ctx.lineWidth = 2 * (1 - progress);
		ctx.stroke();
	}
}

/**
 * Draws a wind direction arrow when the air tool is being dragged.
 * Arrow points from dragStart to current mouse position.
 */
function drawWindArrow() {
	if (!isDragging || dragToolOrigin !== 'air' || !windArrowEnd) return;
	var dx = windArrowEnd.x - dragStart.x;
	var dy = windArrowEnd.y - dragStart.y;
	var dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 5) return;

	var alpha = Math.min(0.7, dist / 150);

	// Shaft
	ctx.beginPath();
	ctx.moveTo(dragStart.x, dragStart.y);
	ctx.lineTo(windArrowEnd.x, windArrowEnd.y);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();

	// Arrowhead
	var angle = Math.atan2(dy, dx);
	var headLen = 10;
	ctx.beginPath();
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle - 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle - 0.4) * headLen
	);
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle + 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle + 0.4) * headLen
	);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();
}

// --- Fly body ---

/**
 * The fly object holds position and animation state.
 * All body part offsets are relative to the fly center and drawn via canvas transforms.
 */
var fly = {
	x: window.innerWidth / 2,
	y: window.innerHeight / 2,
};

// Animation state
var anim = {
	// Leg walk cycle phase (0 to 2*PI)
	walkPhase: 0,
	// Idle timers
	antennaTwitchL: 0,
	antennaTwitchR: 0,
	antennaTargetL: 0,
	antennaTargetR: 0,
	antennaTimer: 0,
	// Leg idle jitter
	legJitter: [0, 0, 0, 0, 0, 0],
	legJitterTarget: [0, 0, 0, 0, 0, 0],
	legJitterTimer: 0,
	// Wing idle
	wingMicro: 0,
	wingMicroTarget: 0,
	wingMicroTimer: 0,
	// Pre-rolled next intervals (frame-rate-independent timer frequency)
	antennaNextInterval: 0.8 + Math.random() * 1.2,
	legJitterNextInterval: 1.5 + Math.random() * 2.0,
	wingMicroNextInterval: 2.0 + Math.random() * 3.0,
	// Behavior animation state (T2.1)
	groomPhase: 0,
	groomBlend: 0,
	groomPoseLocation: null,
	groomFeedbackUntil: 0,
	groomFeedbackLocation: null,
	proboscisExtend: 0,
	wingSpread: 0,
};

// Body dimensions (fly ~70px long)
var BODY = {
	// Overall scale
	scale: 1.0,
	// Head
	headRadius: 6,
	headOffsetY: -24, // from center (negative = forward)
	// Eyes
	eyeRadiusX: 4,
	eyeRadiusY: 5,
	eyeOffsetX: 5.5,
	eyeOffsetY: -25,
	// Antennae
	antennaBaseX: 2.5,
	antennaBaseY: -29,
	antennaLength: 8,
	// Thorax
	thoraxRadiusX: 8,
	thoraxRadiusY: 12,
	thoraxOffsetY: -10,
	// Abdomen
	abdomenRadiusX: 10,
	abdomenRadiusY: 16,
	abdomenOffsetY: 12,
	// Wing roots sit laterally on the upper thorax, behind the head.
	wingOffsetX: 8,
	wingOffsetY: -9,
	wingLength: 42,
	wingWidth: 16,
	// Proboscis
	proboscisLength: 9,
	proboscisBaseY: -30.8,
	// The body sprite is fitted to the existing local-coordinate skeleton.
	bodySpriteHeight: 64,
	bodySpriteTop: -32,
	// Leg attachment points on thorax (x, y relative to center)
	// front, middle, rear -- left side (mirrored for right)
	legAttach: [
		{ x: 7, y: -16 },  // front
		{ x: 9, y: -10 },  // middle
		{ x: 8, y: -3 },   // rear
	],
	// Leg segment lengths
	legSeg1: 8,
	legSeg2: 10,
	legSeg3: 6,
	// Resting leg angles (radians from body axis, pointing outward)
	legRestAngles: [
		{ hip: -0.7, knee: -0.3 },  // front: angled forward
		{ hip: 0.0, knee: 0.2 },    // middle: straight out
		{ hip: 0.7, knee: 0.3 },    // rear: angled backward
	],
};

// The body texture replaces only the painted body shell. All appendages remain
// attached to the existing local-coordinate rig and keep their original motion.
var flyBodyAsset = new Image();
var flyBodyAssetReady = false;
flyBodyAsset.onload = function () { flyBodyAssetReady = true; };
flyBodyAsset.onerror = function () {
	console.warn('Photoreal fly body asset unavailable; using the canvas fallback.');
};
flyBodyAsset.src = './assets/drosophila-body.png';

var flyWingAsset = new Image();
var flyWingAssetReady = false;
flyWingAsset.onload = function () { flyWingAssetReady = true; };
flyWingAsset.onerror = function () {
	console.warn('Photoreal wing asset unavailable; using the canvas fallback.');
};
flyWingAsset.src = './assets/drosophila-wing.png';

// Real top-down macro texture for the food droplet (shrunk with the existing
// feeding radius and kept as a procedural fallback until the PNG is ready).
var honeyDropAsset = new Image();
var honeyDropAssetReady = false;
honeyDropAsset.onload = function () { honeyDropAssetReady = true; };
honeyDropAsset.onerror = function () {
	console.warn('Photoreal honey asset unavailable; using the canvas fallback.');
};
honeyDropAsset.src = './assets/honey-drop.png';

// --- Colors (Realistic Chitin & Biological Tones) ---
var COLORS = {
	thorax: '#6b5030',
	thoraxStroke: '#3d2e1a',
	abdomen: '#8a6b3a',
	abdomenStripe: '#5c4428',
	abdomenLight: '#695532',
	head: '#6b5030',
	headStroke: '#3d2e1a',
	eyeFill: '#6b0909',
	eyeHighlight: '#ff2a2a',
	antenna: '#302015',
	leg: '#3d2e1a',
	legJoint: '#382718',
};

/** Keep the photographic cuticles responsive to the simulation's light control. */
function getFlyLightingFilter() {
	var light = Number(BRAIN.stimulate.lightLevel);
	if (!isFinite(light)) light = 1;
	light = Math.max(0, Math.min(1, light));
	// Keep the cuticle visibly darker even at the brightest setting while
	// preserving a clear response to the environment's light level.
	var brightness = 0.44 + light * 0.22;
	var saturation = 0.72 + light * 0.16;
	return 'brightness(' + brightness.toFixed(2) + ') saturate(' + saturation.toFixed(2) + ')';
}

/**
 * Draws the complete fly body at (0,0) facing up (-Y direction).
 * Canvas should be translated/rotated before calling.
 */
function drawFlyBody(dtScale) {
	var t = Date.now() / 1000;
	var state = behavior.current;

	// --- Legs and the complete proboscis are underneath the photoreal shell ---
	drawLegs(state, dtScale);
	if (anim.proboscisExtend > 0.01) {
		drawProboscis(anim.proboscisExtend);
	}

	// The opaque shell masks the tube root; only its front tip can protrude.
	drawPhotorealBody();
	if (anim.proboscisExtend > 0.01) {
		// Reopen the tiny oral slit above the shell so feeding visibly starts at
		// the face rather than looking as if the fly eats through its abdomen.
		drawProboscisMouth();
	}

	// --- Antennae ---
	drawAntennae(t, dtScale);

	// The wings remain on the final foreground layer, above the body and leg rig.
	drawWing(-1); // left
	drawWing(1);  // right
}

/**
 * Draw the generated Drosophila body cutout, split at the abdomen hinge so the
 * small abdomen curl from the original rig is retained. The legacy vector body
 * remains a graceful fallback while the PNG is loading or if it is unavailable.
 */
function drawPhotorealBody() {
	if (!flyBodyAssetReady || !flyBodyAsset.naturalWidth || !flyBodyAsset.naturalHeight) {
		ctx.save();
		ctx.filter = getFlyLightingFilter();
		drawAbdomen();
		drawThorax();
		drawHead();
		drawEyes();
		ctx.restore();
		return;
	}

	var sourceWidth = flyBodyAsset.naturalWidth;
	var sourceHeight = flyBodyAsset.naturalHeight;
	var height = BODY.bodySpriteHeight;
	var scale = height / sourceHeight;
	var width = sourceWidth * scale;
	var x = -width / 2;
	var y = BODY.bodySpriteTop;
	var splitY = Math.round(sourceHeight * 0.57);
	var splitCanvasY = y + splitY * scale;
	var overlap = 18; // a sub-pixel overlap prevents a seam when the abdomen flexes

	ctx.save();
	ctx.filter = getFlyLightingFilter();

	// Head and thorax stay on the body root.
	ctx.drawImage(
		flyBodyAsset,
		0, 0, sourceWidth, splitY,
		x, y, width, splitY * scale
	);

	// Keep abdomen motion subtle and hinge it exactly at the overlapping seam.
	// Thorax grooming should move the legs, not pull the abdomen away from the shell.
	var abdomenGroomLocation = behavior.current === 'groom' ? behavior.groomLocation :
		(anim.groomBlend > 0.01 ? (anim.groomPoseLocation || anim.groomFeedbackLocation || behavior.groomLocation) : null);
	var abdomenFlex = 0;
	if (abdomenGroomLocation === 'abdomen') {
		abdomenFlex = Math.sin(anim.groomPhase * 0.8) * 2 * Math.max(0, Math.min(1, anim.groomBlend));
	}
	var lowerSourceY = Math.max(0, splitY - overlap);
	ctx.save();
	if (abdomenFlex) {
		ctx.translate(0, splitCanvasY);
		ctx.rotate(abdomenFlex * 0.006);
		ctx.translate(0, -splitCanvasY);
	}
	ctx.drawImage(
		flyBodyAsset,
		0, lowerSourceY, sourceWidth, sourceHeight - lowerSourceY,
		x, y + lowerSourceY * scale, width, (sourceHeight - lowerSourceY) * scale
	);
	ctx.restore();
	ctx.restore();
}

/** Keep both wings opening away from the body instead of crossing when the fly takes off. */
function computeWingRotation(side, spread, microOffset, buzzOffset) {
	var spreadAmount = Math.max(0, Math.min(1, Number(spread) || 0));
	return side * (0.35 - spreadAmount * 0.55 + (buzzOffset || 0)) + microOffset * 0.02;
}

function computeWingAlpha(spread) {
	var spreadAmount = Math.max(0, Math.min(1, Number(spread) || 0));
	return 0.50 + spreadAmount * 0.25;
}

/**
 * Draws one wing (side = -1 for left, +1 for right).
 */
function drawWing(side) {
	var wx = BODY.wingOffsetX * side;
	var wy = BODY.wingOffsetY;
	var wl = BODY.wingLength;
	var ww = BODY.wingWidth * side;
	var spreadAmount = Math.max(0, Math.min(1, Number(anim.wingSpread) || 0));

	// Wing micro-movement (idle flutter)
	var microOffset = anim.wingMicro * 0.5 * side;

	// Flight buzz stays symmetric; increased spread turns the wings outward.
	var buzzOffset = 0;
	if (spreadAmount > 0.5) {
		buzzOffset = Math.sin(Date.now() / 30) * 0.08 * spreadAmount;
	}

	ctx.save();
	ctx.globalAlpha = 1.0;
	ctx.filter = getFlyLightingFilter();
	ctx.translate(wx + microOffset, wy);
	ctx.rotate(computeWingRotation(side, spreadAmount, microOffset, buzzOffset));

	// Keep the photo cutouts close to their resting size during flight.
	var wingScale = 1.0 + spreadAmount * 0.15;
	ctx.scale(wingScale, wingScale);

	// The wing membranes remain translucent at rest and during flight.
	var wingAlpha = computeWingAlpha(spreadAmount);

	// Use the real venated wing cutout when available; mirror it for the other
	// side while retaining the same root, spread, buzz and micro-motion controls.
	if (flyWingAssetReady && flyWingAsset.naturalWidth && flyWingAsset.naturalHeight) {
		ctx.globalAlpha = wingAlpha;
		ctx.scale(side, 1);
		ctx.drawImage(flyWingAsset, 0, 0, BODY.wingWidth * 1.4, wl);
		ctx.restore();
		return;
	}

	// Thin translucent membrane, warmer than the old blue stylization.
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.bezierCurveTo(
		ww * 1.2, wl * 0.2,
		ww * 1.4, wl * 0.7,
		ww * 0.3, wl
	);
	ctx.bezierCurveTo(
		-ww * 0.2, wl * 0.8,
		-ww * 0.1, wl * 0.3,
		0, 0
	);
	var membrane = ctx.createLinearGradient(0, 0, ww * 0.9, wl);
	membrane.addColorStop(0, 'rgba(244, 228, 193, 0.58)');
	membrane.addColorStop(0.45, 'rgba(207, 222, 205, 0.34)');
	membrane.addColorStop(1, 'rgba(251, 243, 218, 0.52)');
	ctx.fillStyle = membrane;
	ctx.globalAlpha = wingAlpha;
	ctx.fill();
	ctx.strokeStyle = 'rgba(79, 59, 39, 0.55)';
	ctx.lineWidth = 0.65;
	ctx.globalAlpha = Math.min(1, wingAlpha + 0.2);
	ctx.stroke();

	// Drosophila-like costa, longitudinal veins and delicate cross-veins.
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.bezierCurveTo(ww * 0.58, wl * 0.2, ww * 1.13, wl * 0.62, ww * 0.31, wl * 0.98);
	ctx.moveTo(0, 0);
	ctx.quadraticCurveTo(ww * 0.28, wl * 0.45, ww * 0.2, wl * 0.91);
	ctx.moveTo(ww * 0.05, wl * 0.12);
	ctx.quadraticCurveTo(ww * 0.58, wl * 0.23, ww * 1.0, wl * 0.36);
	ctx.moveTo(ww * 0.13, wl * 0.31);
	ctx.quadraticCurveTo(ww * 0.65, wl * 0.43, ww * 0.91, wl * 0.55);
	ctx.moveTo(ww * 0.18, wl * 0.52);
	ctx.quadraticCurveTo(ww * 0.62, wl * 0.61, ww * 0.75, wl * 0.73);
	ctx.moveTo(ww * 0.14, wl * 0.34);
	ctx.quadraticCurveTo(ww * 0.34, wl * 0.29, ww * 0.55, wl * 0.3);
	ctx.moveTo(ww * 0.18, wl * 0.54);
	ctx.quadraticCurveTo(ww * 0.38, wl * 0.49, ww * 0.72, wl * 0.52);
	ctx.strokeStyle = 'rgba(71, 52, 35, 0.6)';
	ctx.lineWidth = 0.42;
	ctx.globalAlpha = 0.82;
	ctx.stroke();

	// Fine highlights along the membrane suggest its glassy, iridescent surface.
	ctx.beginPath();
	ctx.moveTo(ww * 0.04, wl * 0.08);
	ctx.quadraticCurveTo(ww * 0.76, wl * 0.25, ww * 1.08, wl * 0.48);
	ctx.strokeStyle = 'rgba(255, 252, 231, 0.58)';
	ctx.lineWidth = 0.5;
	ctx.globalAlpha = 0.72;
	ctx.stroke();
	ctx.globalAlpha = 1.0;

	ctx.restore();
}

/**
 * Draws the abdomen with subtle stripes.
 */
function drawAbdomen() {
	ctx.globalAlpha = 1.0;
	var ax = 0;
	var ay = BODY.abdomenOffsetY;
	var rx = BODY.abdomenRadiusX;
	var ry = BODY.abdomenRadiusY;

	// Abdomen curl during abdomen grooming, including touch feedback.
	var abdomenGroomLocation = behavior.current === 'groom' ? behavior.groomLocation :
		(anim.groomBlend > 0.01 ? (anim.groomPoseLocation || anim.groomFeedbackLocation || behavior.groomLocation) : null);
	var abdomenCurl = 0;
	if (abdomenGroomLocation === 'abdomen') {
		abdomenCurl = Math.sin(anim.groomPhase * 0.8) * 2 * Math.max(0, Math.min(1, anim.groomBlend));
	}
	ay += abdomenCurl;

	// Main abdomen shape
	ctx.beginPath();
	ctx.ellipse(ax, ay, rx, ry, 0, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.abdomen;
	ctx.fill();

	// Subtle highlight along center
	ctx.beginPath();
	ctx.ellipse(ax, ay - 2, rx * 0.35, ry * 0.85, 0, 0, Math.PI * 2);
	var hlGrad = ctx.createLinearGradient(ax - rx * 0.3, ay, ax + rx * 0.3, ay);
	hlGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
	hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
	hlGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
	ctx.fillStyle = hlGrad;
	ctx.fill();

	// Stripes (darker bands across the abdomen)
	ctx.save();
	ctx.beginPath();
	ctx.ellipse(ax, ay, rx, ry, 0, 0, Math.PI * 2);
	ctx.clip();

	for (var s = 0; s < 5; s++) {
		var stripeY = ay - ry * 0.4 + s * (ry * 0.42);
		ctx.beginPath();
		ctx.ellipse(ax, stripeY, rx * 1.05, ry * 0.07, 0, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.abdomenStripe;
		ctx.globalAlpha = 0.6;
		ctx.fill();
	}
	ctx.globalAlpha = 1.0;

	ctx.restore();

	// Outline
	ctx.strokeStyle = COLORS.abdomenStripe;
	ctx.lineWidth = 0.7;
	ctx.beginPath();
	ctx.ellipse(ax, ay, rx, ry, 0, 0, Math.PI * 2);
	ctx.stroke();
}

/**
 * Draws the thorax (darker, slightly smaller ellipse).
 */
function drawThorax() {
	ctx.globalAlpha = 1.0;
	var tx = 0;
	var ty = BODY.thoraxOffsetY;
	var rx = BODY.thoraxRadiusX;
	var ry = BODY.thoraxRadiusY;

	// Radial gradient for chitin sheen
	var tGrad = ctx.createRadialGradient(tx - rx * 0.3, ty - ry * 0.3, rx * 0.2, tx, ty, ry);
	tGrad.addColorStop(0, '#4a3d22');
	tGrad.addColorStop(0.6, COLORS.thorax);
	tGrad.addColorStop(1, COLORS.thoraxStroke);

	ctx.beginPath();
	ctx.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
	ctx.fillStyle = tGrad;
	ctx.fill();
	ctx.strokeStyle = COLORS.thoraxStroke;
	ctx.lineWidth = 0.9;
	ctx.stroke();

	// Subtle midline groove
	ctx.beginPath();
	ctx.moveTo(0, ty - ry * 0.75);
	ctx.lineTo(0, ty + ry * 0.75);
	ctx.strokeStyle = COLORS.thoraxStroke;
	ctx.lineWidth = 0.5;
	ctx.globalAlpha = 0.3;
	ctx.stroke();
	ctx.globalAlpha = 1.0;
}

/**
 * Draws the head.
 */
function drawHead() {
	ctx.globalAlpha = 1.0;
	var hx = 0;
	var hy = BODY.headOffsetY;
	var hrx = BODY.headRadius * 1.1;
	var hry = BODY.headRadius;

	// Head with gradient
	var hGrad = ctx.createRadialGradient(hx - hrx * 0.2, hy - hry * 0.2, hrx * 0.15, hx, hy, hry);
	hGrad.addColorStop(0, '#3d3218');
	hGrad.addColorStop(0.5, COLORS.head);
	hGrad.addColorStop(1, COLORS.headStroke);

	ctx.beginPath();
	ctx.ellipse(hx, hy, hrx, hry, 0, 0, Math.PI * 2);
	ctx.fillStyle = hGrad;
	ctx.fill();
	ctx.strokeStyle = COLORS.headStroke;
	ctx.lineWidth = 0.7;
	ctx.stroke();
}

/**
 * Draws compound eyes on the head.
 */
function drawEyes() {
	ctx.globalAlpha = 1.0;
	for (var side = -1; side <= 1; side += 2) {
		var ex = BODY.eyeOffsetX * side;
		var ey = BODY.eyeOffsetY;
		var erx = BODY.eyeRadiusX;
		var ery = BODY.eyeRadiusY;

		// Eye base with gradient (dark red compound eye)
		var eGrad = ctx.createRadialGradient(ex - erx * 0.3, ey - ery * 0.3, erx * 0.1, ex, ey, ery);
		eGrad.addColorStop(0, '#990000');
		eGrad.addColorStop(0.6, COLORS.eyeFill);
		eGrad.addColorStop(1, '#3d0000');

		ctx.beginPath();
		ctx.ellipse(ex, ey, erx, ery, side * 0.3, 0, Math.PI * 2);
		ctx.fillStyle = eGrad;
		ctx.fill();

		// Compound eye facet pattern
		ctx.save();
		ctx.beginPath();
		ctx.ellipse(ex, ey, erx, ery, side * 0.3, 0, Math.PI * 2);
		ctx.clip();

		ctx.globalAlpha = 0.25;
		for (var fy = -ery + 1; fy < ery; fy += 1.5) {
			for (var fx = -erx + 1; fx < erx; fx += 1.2) {
				var dist = Math.sqrt((fx * fx) / (erx * erx) + (fy * fy) / (ery * ery));
				if (dist < 0.9) {
					ctx.fillStyle = Math.random() > 0.5 ? '#220000' : '#440000';
					ctx.fillRect(ex + fx, ey + fy, 1, 1);
				}
			}
		}
		ctx.globalAlpha = 1.0;
		ctx.restore();

		// Highlight (specular)
		ctx.beginPath();
		ctx.ellipse(ex - side * 1.2, ey - 1.8, erx * 0.4, ery * 0.35, side * 0.3, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.eyeHighlight;
		ctx.globalAlpha = 0.6;
		ctx.fill();
		ctx.globalAlpha = 1.0;
	}
}

/**
 * Draws antennae with idle twitching animation.
 */
function drawAntennae(t, dtScale) {
	// Update antenna twitch targets periodically
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
		anim.antennaTimer = t;
		var antennaBase = 0.8 + Math.random() * 1.2;
		anim.antennaNextInterval = BRAIN.stimulate.lightLevel === 0 ? antennaBase * 2 : antennaBase;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
	}
	// Smooth interpolation toward targets
	anim.antennaTwitchL += (anim.antennaTargetL - anim.antennaTwitchL) * (1 - Math.pow(0.92, dtScale));
	anim.antennaTwitchR += (anim.antennaTargetR - anim.antennaTwitchR) * (1 - Math.pow(0.92, dtScale));

	for (var side = -1; side <= 1; side += 2) {
		var bx = BODY.antennaBaseX * side;
		var by = BODY.antennaBaseY;
		var twitch = side === -1 ? anim.antennaTwitchL : anim.antennaTwitchR;

		// Base angle: spread outward and forward
		var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;

		// Wind-sensing posture: bias antennae toward wind direction
		if (BRAIN.stimulate.wind || behavior.current === 'brace') {
			// Convert world-space windDirection to body-local frame.
			// The canvas transform is: rotate(-facingDir + PI/2), so body-local
			// "forward" (-Y in body space) corresponds to facingDir in world space.
			// Body-local angle of wind = windDirection - facingDir, then rotate by
			// PI/2 because body space has forward = -Y (up on canvas).
			var localWindAngle = normalizeAngle(BRAIN.stimulate.windDirection - facingDir + Math.PI / 2);
			// Blend antenna toward wind source with modest strength
			var windBias = normalizeAngle(localWindAngle - baseAngle) * 0.3;
			baseAngle += windBias;
		}

		var stalkLength = BODY.antennaLength * 0.35;
		var aristaLength = BODY.antennaLength * 0.65;
		var stalkTipX = bx + Math.cos(baseAngle) * stalkLength;
		var stalkTipY = by + Math.sin(baseAngle) * stalkLength;
		var aristaAngle = baseAngle + side * 0.65;
		var aristaTipX = stalkTipX + Math.cos(aristaAngle) * aristaLength;
		var aristaTipY = stalkTipY + Math.sin(aristaAngle) * aristaLength;

		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Short, gently curved basal antenna segment.
		ctx.beginPath();
		ctx.moveTo(bx, by);
		ctx.quadraticCurveTo(
			bx + Math.cos(baseAngle) * stalkLength * 0.52 + side * 0.35,
			by + Math.sin(baseAngle) * stalkLength * 0.52 - 0.2,
			stalkTipX, stalkTipY
		);
		ctx.strokeStyle = COLORS.antenna;
		ctx.lineWidth = 0.72;
		ctx.stroke();

		// Fine outward arista with a few nearly hair-thin branches, rather than a bulb.
		ctx.beginPath();
		ctx.moveTo(stalkTipX, stalkTipY);
		ctx.quadraticCurveTo(
			stalkTipX + Math.cos(aristaAngle) * aristaLength * 0.52,
			stalkTipY + Math.sin(aristaAngle) * aristaLength * 0.52,
			aristaTipX, aristaTipY
		);
		ctx.strokeStyle = COLORS.antenna;
		ctx.lineWidth = 0.28;
		ctx.stroke();

		ctx.beginPath();
		for (var branchIdx = 0; branchIdx < 3; branchIdx++) {
			var branchT = 0.28 + branchIdx * 0.2;
			var branchX = stalkTipX + (aristaTipX - stalkTipX) * branchT;
			var branchY = stalkTipY + (aristaTipY - stalkTipY) * branchT;
			var branchLength = 0.9 - branchIdx * 0.12;
			ctx.moveTo(branchX, branchY);
			ctx.lineTo(
				branchX + Math.cos(aristaAngle + side * 0.9) * branchLength,
				branchY + Math.sin(aristaAngle + side * 0.9) * branchLength
			);
		}
		ctx.lineWidth = 0.2;
		ctx.stroke();
		ctx.restore();
	}
}

/**
 * Draws the proboscis (retractable feeding tube).
 * @param {number} extend - Extension amount from 0 (retracted) to 1 (fully extended).
 */
function drawProboscis(extend) {
	var progress = Math.max(0, Math.min(1, Number(extend) || 0));
	var target = nearestFood();
	if (progress <= 0 || !target) return;

	var now = Date.now() / 1000;
	var baseX = 0;
	var baseY = BODY.proboscisBaseY;
	var foodPosition = getFoodProboscisCoordinates(target.item);
	if (!foodPosition || !isFoodInFrontOfProboscis(target.item)) return;
	var foodX = foodPosition.x;
	var foodY = foodPosition.y;
	var vectorX = foodX - baseX;
	var vectorY = foodY - baseY;
	var distance = Math.hypot(vectorX, vectorY);
	var dirX = 0;
	var dirY = -1;
	if (distance > 0.001) {
		dirX = vectorX / distance;
		dirY = vectorY / distance;
	}

	// Aim the labella at the food's near surface, with just a slight overlap.
	var foodRadius = Math.max(0, Number(target.item.radius) || 0);
	var reach = Math.max(4, Math.min(BODY.proboscisLength, distance, distance - foodRadius + 2));
	var pulse = Math.sin(now * 15) * 0.45 * progress;
	var len = Math.max(0, reach * progress + pulse);
	var tipX = baseX + dirX * len;
	var tipY = baseY + dirY * len;
	var normalX = -dirY;
	var normalY = dirX;
	var bend = Math.sin(now * 11) * 0.7 * progress;
	var controlX = baseX + dirX * len * 0.55 + normalX * bend;
	var controlY = baseY + dirY * len * 0.55 + normalY * bend;
	var heading = Math.atan2(dirY, dirX);

	// Keep the complete mouthpart underneath the head/body. The opaque fly
	// shell naturally masks its root, while the tip stays visible beyond the
	// silhouette at the mouth when it extends.
	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	// A gently tapered, softly shaded rostrum reads as a short mouthpart
	// instead of a straight wire. Its hidden root stays beneath the head shell.
	ctx.beginPath();
	ctx.moveTo(baseX + normalX * 0.68, baseY + normalY * 0.68);
	ctx.quadraticCurveTo(
		controlX + normalX * 0.46, controlY + normalY * 0.46,
		tipX + normalX * 0.32, tipY + normalY * 0.32
	);
	ctx.lineTo(tipX - normalX * 0.32, tipY - normalY * 0.32);
	ctx.quadraticCurveTo(
		controlX - normalX * 0.46, controlY - normalY * 0.46,
		baseX - normalX * 0.68, baseY - normalY * 0.68
	);
	ctx.closePath();
	var tubeShade = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
	tubeShade.addColorStop(0, '#30180f');
	tubeShade.addColorStop(0.35, '#69402a');
	tubeShade.addColorStop(0.72, '#9b6339');
	tubeShade.addColorStop(1, '#422114');
	ctx.fillStyle = tubeShade;
	ctx.fill();

	function strokeCurve(startX, startY, curveX, curveY, endX, endY) {
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.quadraticCurveTo(curveX, curveY, endX, endY);
		ctx.strokeStyle = 'rgba(38, 18, 12, 0.94)';
		ctx.lineWidth = 1.05;
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		ctx.quadraticCurveTo(curveX, curveY, endX, endY);
		ctx.strokeStyle = '#8b5934';
		ctx.lineWidth = 0.56;
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(startX + normalX * 0.22, startY + normalY * 0.22);
		ctx.quadraticCurveTo(
			curveX + normalX * 0.22, curveY + normalY * 0.22,
			endX + normalX * 0.22, endY + normalY * 0.22
		);
		ctx.strokeStyle = 'rgba(231, 190, 143, 0.60)';
		ctx.lineWidth = 0.18;
		ctx.stroke();
	}

	strokeCurve(baseX, baseY, controlX, controlY, tipX, tipY);

	// Paired, small sponge-like labella at the tip; restrained warm highlights
	// suggest the textured pads without turning them into a large bulb.
	ctx.translate(tipX, tipY);
	ctx.rotate(heading);
	var labellaPulse = Math.sin(now * 15) * 0.10 * progress;
	ctx.beginPath();
	ctx.ellipse(0.16, -0.43 - labellaPulse, 1.03, 0.62, -0.12, 0, Math.PI * 2);
	ctx.ellipse(0.16, 0.43 + labellaPulse, 1.03, 0.62, 0.12, 0, Math.PI * 2);
	ctx.fillStyle = '#352018';
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(0.22, -0.43 - labellaPulse, 0.58, 0.31, -0.12, 0, Math.PI * 2);
	ctx.ellipse(0.22, 0.43 + labellaPulse, 0.58, 0.31, 0.12, 0, Math.PI * 2);
	ctx.fillStyle = '#8a5432';
	ctx.fill();
	ctx.restore();
}

/** Draw the small oral opening over the head shell only while tasting food. */
function drawProboscisMouth() {
	ctx.save();
	var mouthY = BODY.proboscisBaseY;
	// A muted chitin lip frames a dark slit at the anterior edge of the head.
	ctx.beginPath();
	ctx.ellipse(0, mouthY, 1.55, 0.92, 0, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(83, 43, 26, 0.92)';
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(0, mouthY - 0.08, 1.08, 0.58, 0, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(25, 11, 8, 0.98)';
	ctx.fill();
	// A tiny warm lower-lip glint makes the opening legible without a cartoon dot.
	ctx.beginPath();
	ctx.ellipse(-0.34, mouthY + 0.34, 0.42, 0.12, -0.14, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(211, 154, 103, 0.72)';
	ctx.fill();
	ctx.restore();
}

/**
 * Draws all 6 legs with behavior-specific animation.
 * State-dependent modes: tripod gait (walk/explore/phototaxis),
 * grooming rub (groom), tucked (fly/rest), jump pose (startle burst),
 * idle jitter (idle/feed).
 */
function drawLegs(state, dtScale) {
	ctx.globalAlpha = 1.0;
	var t = Date.now() / 1000;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
	var isGrooming = (state === 'groom');
	var isFlying = (state === 'fly');
	var isStartleBurst = (state === 'startle' && behavior.startlePhase === 'burst');
	var isStartleFreeze = (state === 'startle' && behavior.startlePhase === 'freeze');
	var isResting = (state === 'rest');
	var isBracing = (state === 'brace');
	var touchGroomFeedback = !isGrooming && anim.groomFeedbackUntil > Date.now();
	var groomBlend = Math.max(0, Math.min(1, Number(anim.groomBlend) || 0));
	var groomingPoseActive = isGrooming || touchGroomFeedback || groomBlend > 0.01;
	var groomingLocation = isGrooming ? behavior.groomLocation :
		(touchGroomFeedback ? anim.groomFeedbackLocation :
			(groomingPoseActive ? (anim.groomPoseLocation || behavior.groomLocation) : null));

	// Update idle jitter targets periodically
	if (t - anim.legJitterTimer > anim.legJitterNextInterval) {
		anim.legJitterTimer = t;
		anim.legJitterNextInterval = 1.5 + Math.random() * 2.0;
		for (var j = 0; j < 6; j++) {
			anim.legJitterTarget[j] = (Math.random() - 0.5) * 0.15;
		}
	}
	for (var j = 0; j < 6; j++) {
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * (1 - Math.pow(0.95, dtScale));
	}

	// Update wing micro-movement
	if (t - anim.wingMicroTimer > anim.wingMicroNextInterval) {
		anim.wingMicroTimer = t;
		anim.wingMicroNextInterval = 2.0 + Math.random() * 3.0;
		anim.wingMicroTarget = (Math.random() - 0.5) * 2;
	}
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * (1 - Math.pow(0.97, dtScale));

	// Tripod groups
	var groupA = [0, 3, 4];
	var groupB = [1, 2, 5];

	for (var legIdx = 0; legIdx < 6; legIdx++) {
		var pairIdx = Math.floor(legIdx / 2); // 0=front, 1=mid, 2=rear
		var side = (legIdx % 2 === 0) ? -1 : 1; // even=left(-1), odd=right(+1)
		var attach = BODY.legAttach[pairIdx];
		var restAngles = BODY.legRestAngles[pairIdx];

		var hipMod = restAngles.hip;
		var kneeMod = restAngles.knee;
		var walkOffset = 0;
		var jitter = 0;
		var tarsusBendOffset = 0.3;

		if (isWalking && !groomingPoseActive) {
			// Tripod gait animation
			var inGroupA = groupA.indexOf(legIdx) !== -1;
			var legPhase = anim.walkPhase + (inGroupA ? 0 : Math.PI);
			walkOffset = Math.sin(legPhase) * 0.35;
		} else if (groomingPoseActive) {
			var groomLoc = groomingLocation || 'thorax';
			var strokePhase = anim.groomPhase + (side > 0 ? Math.PI : 0);
			if (groomLoc === 'head' && pairIdx === 0) {
				// Lift the foreleg outward, then fold the tibia sharply at the knee
				// so the fine tarsus reaches the forehead/eye edge to rub the face.
				// Opposite stroke phases make the two front legs alternate naturally.
				hipMod = 0.04 + Math.sin(strokePhase) * 0.12;
				kneeMod = -2.8 + Math.sin(strokePhase * 1.3 + 0.3) * 0.16;
			} else if (groomLoc === 'abdomen' && pairIdx === 2) {
				// Hind legs form a visible elbow outside the abdomen, then sweep
				// the tarsi inward along the belly edge in alternating strokes.
				hipMod = 0.55 + Math.sin(strokePhase) * 0.1;
				kneeMod = 0.9 + Math.sin(strokePhase * 1.3 + 0.6) * 0.16;
			} else if (groomLoc === 'thorax' && pairIdx === 0) {
				// Bend the forelegs around the thorax margin and curl their fine tarsi
				// back onto the shell for alternating, visible brushing strokes.
				var thoraxStroke = Math.sin(strokePhase * 1.3 + 0.3);
				hipMod = 0.12 + Math.sin(strokePhase) * 0.08;
				kneeMod = 0.75 + thoraxStroke * 0.1;
				var targetTarsusBend = 2.35 + thoraxStroke * 0.1;
				tarsusBendOffset = 0.3 + (targetTarsusBend - 0.3) * groomBlend;
			} else if (groomLoc === 'leg') {
				// Targeted single-leg cleaning: only the leg on the touched side moves
				// Use side-based targeting: left legs clean when side=-1 touch
				if (pairIdx === 1) {
					// Middle legs do the cleaning motion
					hipMod = 0.1 + Math.sin(anim.groomPhase * 1.1) * 0.4;
					kneeMod = 0.3 + Math.sin(anim.groomPhase * 1.4) * 0.3;
				}
			}
			hipMod = restAngles.hip + (hipMod - restAngles.hip) * groomBlend;
			kneeMod = restAngles.knee + (kneeMod - restAngles.knee) * groomBlend;
		} else if (isFlying) {
			// Tucked legs during flight
			hipMod *= 0.4;
			kneeMod *= 0.3;
		} else if (isStartleBurst && pairIdx >= 1) {
			// Middle and rear legs extend for jump
			hipMod *= 1.5;
			kneeMod *= 0.5;
		} else if (isStartleFreeze) {
			// Legs frozen in current position -- no jitter, no walk
			// Use rest angles as-is (no modification)
		} else if (isResting) {
			// Slightly tucked with slow jitter
			hipMod *= 0.7;
			jitter = anim.legJitter[legIdx] * 0.3;
		} else if (isBracing) {
			// Widened stance with suppressed jitter to show bracing
			hipMod *= 1.1;
			jitter = anim.legJitter[legIdx] * 0.1;
		} else {
			// idle / feed / default: normal idle jitter (reduced 50% in complete darkness)
			jitter = anim.legJitter[legIdx] * (BRAIN.stimulate.lightLevel === 0 ? 0.5 : 1.0);
		}

		// Compute hip and knee angles
		var hipAngle = (hipMod + walkOffset + jitter) * side;
		var kneeAngle = kneeMod * side;

		// Attachment point on body
		var ax = attach.x * side;
		var ay = attach.y;

		// First segment (coxa/femur)
		var baseAngle = (side === -1 ? Math.PI : 0) + hipAngle;
		var seg1EndX = ax + Math.cos(baseAngle) * BODY.legSeg1;
		var seg1EndY = ay + Math.sin(baseAngle) * BODY.legSeg1;

		// Second segment (tibia) -- bends at knee
		var kneeAngleAbs = baseAngle + kneeAngle + side * 0.5;
		var seg2EndX = seg1EndX + Math.cos(kneeAngleAbs) * BODY.legSeg2;
		var seg2EndY = seg1EndY + Math.sin(kneeAngleAbs) * BODY.legSeg2;

		// The tarsus keeps its small resting hook, but curls back toward the shell
		// during thorax washing to make the brushing contact visible.
		var tarsusAngle = kneeAngleAbs + side * tarsusBendOffset;
		var seg3EndX = seg2EndX + Math.cos(tarsusAngle) * BODY.legSeg3;
		var seg3EndY = seg2EndY + Math.sin(tarsusAngle) * BODY.legSeg3;

		// Taper the original three rigid segments from femur to fine tarsus.
		var segmentStartsX = [ax, seg1EndX, seg2EndX];
		var segmentStartsY = [ay, seg1EndY, seg2EndY];
		var segmentEndsX = [seg1EndX, seg2EndX, seg3EndX];
		var segmentEndsY = [seg1EndY, seg2EndY, seg3EndY];
		var segmentWidths = [1.05, 0.78, 0.54];
		ctx.strokeStyle = COLORS.leg;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (var segmentIdx = 0; segmentIdx < 3; segmentIdx++) {
			ctx.beginPath();
			ctx.moveTo(segmentStartsX[segmentIdx], segmentStartsY[segmentIdx]);
			ctx.lineTo(segmentEndsX[segmentIdx], segmentEndsY[segmentIdx]);
			ctx.lineWidth = segmentWidths[segmentIdx];
			ctx.stroke();
		}

		// Small, dark joints blend with the cuticle instead of looking like dots.
		ctx.beginPath();
		ctx.arc(seg1EndX, seg1EndY, 0.52, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();

		ctx.beginPath();
		ctx.arc(seg2EndX, seg2EndY, 0.38, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();
	}
}

// --- Movement update (same interface as worm-sim) ---
function update(dt) {
	var dtScale = dt / (1000 / 60);
	currentDtScale = dtScale;
	applyBehaviorMovement(dtScale);

	speed += speedChangeInterval * dtScale;
	if (speed < 0) speed = 0;

	// Edge avoidance: bias targetDir away from screen edges when within 50px
	var edgeMargin = 50;
	var edgeBias = 0;
	var edgeBiasY = 0;
	var bounds = getLayoutBounds();
	var topBound = bounds.top;
	var bottomBound = bounds.bottom;
	var leftBound = 0;
	var rightBound = window.innerWidth;

	if (fly.x - leftBound < edgeMargin) {
		edgeBias += (edgeMargin - (fly.x - leftBound)) / edgeMargin; // push right (+x)
	} else if (rightBound - fly.x < edgeMargin) {
		edgeBias -= (edgeMargin - (rightBound - fly.x)) / edgeMargin; // push left (-x)
	}
	if (fly.y - topBound < edgeMargin) {
		edgeBiasY -= (edgeMargin - (fly.y - topBound)) / edgeMargin; // push down (-y, but facingDir uses -sin for y)
	} else if (bottomBound - fly.y < edgeMargin) {
		edgeBiasY += (edgeMargin - (bottomBound - fly.y)) / edgeMargin; // push up
	}

	if (edgeBias !== 0 || edgeBiasY !== 0) {
		// Compute desired direction away from edges
		var awayAngle = Math.atan2(edgeBiasY, edgeBias);
		var awayStrength = Math.min(1, Math.sqrt(edgeBias * edgeBias + edgeBiasY * edgeBiasY));
		var angleDiffEdge = awayAngle - targetDir;
		// Normalize to [-PI, PI]
		angleDiffEdge = normalizeAngle(angleDiffEdge);
		targetDir += angleDiffEdge * awayStrength * 0.3 * dtScale;
	}

	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Behavior-dependent retention: fast (0.3) for escape states where near-instant
	// turning is needed at high speed, slow (0.9) for calm states where smooth
	// gentle turns look natural. At dtScale=1 (60fps): 0.3 closes 70% of the gap
	// per frame (~3 frames to 97%), 0.9 closes 10% per frame (~22 frames to 90%).
	var turnRetention;
	if (behavior.current === 'startle' && behavior.startlePhase === 'burst') {
		turnRetention = 0.3;
	} else if (behavior.current === 'fly') {
		turnRetention = 0.4;
	} else {
		turnRetention = 0.9;
	}
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(turnRetention, dtScale));

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);

	fly.x += Math.cos(facingDir) * speed * dtScale;
	fly.y -= Math.sin(facingDir) * speed * dtScale;

	// Barrier margin (distance from wall where fly gets pushed back)
	var barrierMargin = 12;
	var bounds = getLayoutBounds();

	// Screen bounds (clamped to visible area: toolbar=44px top, panel=90px bottom)
	if (fly.x < barrierMargin) {
		fly.x = 0;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.x > window.innerWidth - barrierMargin) {
		fly.x = window.innerWidth;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}
	if (fly.y < bounds.top + barrierMargin) {
		fly.y = 44;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.y > bounds.bottom - barrierMargin) {
		fly.y = window.innerHeight;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}

	// Food proximity
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulate.foodNearby = true;
			if (isFoodWithinProboscisReach(food[i])) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					// Gradual feeding: start timer on first contact, shrink food, remove when done
					if (food[i].feedStart === 0) {
						food[i].feedStart = Date.now();
						if (!food[i].feedDuration) food[i].feedDuration = 2000 + Math.random() * 3000;
					}
					var elapsed = Date.now() - food[i].feedStart;
					var progress = Math.min(1, (food[i].eaten || 0) + elapsed / food[i].feedDuration);
					food[i].radius = 10 * (1 - progress * 0.9);
					if (progress >= 1) {
						food.splice(i, 1);
						i--;
					}
				} else {
					// Not feeding but in contact: keep showing eaten progress
					food[i].radius = 10 * (1 - (food[i].eaten || 0) * 0.9);
				}
			} else {
				// Not in contact range: pause feeding timer, keep eaten progress
				if (food[i].feedStart !== 0) {
					var ate = Date.now() - food[i].feedStart;
					food[i].eaten = Math.min(1, (food[i].eaten || 0) + ate / food[i].feedDuration);
					food[i].feedStart = 0;
				}
				food[i].radius = 10 * (1 - (food[i].eaten || 0) * 0.9);
			}
		} else {
			// Out of range: pause feeding timer, keep eaten progress
			if (food[i].feedStart !== 0) {
				var ate = Date.now() - food[i].feedStart;
				food[i].eaten = Math.min(1, (food[i].eaten || 0) + ate / food[i].feedDuration);
				food[i].feedStart = 0;
			}
			food[i].radius = 10 * (1 - (food[i].eaten || 0) * 0.9);
		}
	}

	// Reset touch stimulus after wall-clock expiry (2 seconds)
	if (touchResetTime > 0 && Date.now() >= touchResetTime) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetTime = 0;
	}

	// Reset wind stimulus after wall-clock expiry (2 seconds)
	if (windResetTime > 0 && Date.now() >= windResetTime) {
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		BRAIN.stimulate.windDirection = 0;
		windResetTime = 0;
	}

	updateAnimForBehavior(dtScale);
	if (cameraFollowsFly) centerCameraOnFly();
}


// --- Barrier (thin wall around the map) ---
function drawBarrier() {
    var bounds = getLayoutBounds();
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(2, bounds.top, window.innerWidth - 4, bounds.bottom - bounds.top);
    ctx.setLineDash([]);
}

/** Draw a quiet, world-anchored 50 px floor grid for judging the fly's movement. */
function drawGroundGrid() {
	var zoom = Math.max(0.1, Number(zoomLevel) || 1);
	var centerX = window.innerWidth / 2;
	var centerY = window.innerHeight / 2;
	var bounds = getLayoutBounds();
	var left = centerX + (0 - centerX - panX) / zoom;
	var right = centerX + (window.innerWidth - centerX - panX) / zoom;
	var top = centerY + (bounds.top - centerY - panY) / zoom;
	var bottom = centerY + (bounds.bottom - centerY - panY) / zoom;
	var spacing = 50;
	var majorSpacing = 250;
	var darkFloor = BRAIN.stimulate.lightLevel < 0.5;
	var minorColor = darkFloor ? 'rgba(232, 241, 210, 0.13)' : 'rgba(22, 37, 18, 0.13)';
	var majorColor = darkFloor ? 'rgba(232, 241, 210, 0.24)' : 'rgba(22, 37, 18, 0.23)';
	var labelColor = darkFloor ? 'rgba(240, 245, 222, 0.54)' : 'rgba(22, 34, 18, 0.48)';

	ctx.save();
	ctx.beginPath();
	ctx.rect(left, top, right - left, bottom - top);
	ctx.clip();

	ctx.beginPath();
	for (var x = Math.floor(left / spacing) * spacing; x <= right; x += spacing) {
		ctx.moveTo(x, top);
		ctx.lineTo(x, bottom);
	}
	for (var y = Math.floor(top / spacing) * spacing; y <= bottom; y += spacing) {
		ctx.moveTo(left, y);
		ctx.lineTo(right, y);
	}
	ctx.strokeStyle = minorColor;
	ctx.lineWidth = 0.7 / zoom;
	ctx.stroke();

	ctx.beginPath();
	for (var majorX = Math.ceil(left / majorSpacing) * majorSpacing; majorX <= right; majorX += majorSpacing) {
		ctx.moveTo(majorX, top);
		ctx.lineTo(majorX, bottom);
	}
	for (var majorY = Math.ceil(top / majorSpacing) * majorSpacing; majorY <= bottom; majorY += majorSpacing) {
		ctx.moveTo(left, majorY);
		ctx.lineTo(right, majorY);
	}
	ctx.strokeStyle = majorColor;
	ctx.lineWidth = 1 / zoom;
	ctx.stroke();

	ctx.fillStyle = labelColor;
	ctx.font = (9 / zoom) + 'px monospace';
	ctx.textBaseline = 'top';
	ctx.fillText('Cuadrícula: 50 px', left + 6 / zoom, top + 5 / zoom);
	for (var labelX = Math.ceil(left / majorSpacing) * majorSpacing; labelX <= right; labelX += majorSpacing) {
		ctx.fillText(String(labelX), labelX + 3 / zoom, top + 17 / zoom);
	}
	for (var labelY = Math.ceil(top / majorSpacing) * majorSpacing; labelY <= bottom; labelY += majorSpacing) {
		ctx.fillText(String(labelY), left + 5 / zoom, labelY + 2 / zoom);
	}
	ctx.restore();
}

// --- Draw ---
function draw() {
	// Update canvas background based on light level
	var ll = BRAIN.stimulate.lightLevel;
	if (ll >= 1) {
		canvas.style.backgroundColor = '#a8c686';
	} else if (ll >= 0.5) {
		canvas.style.backgroundColor = '#7da35e';
	} else {
		canvas.style.backgroundColor = '#4a6b35';
	}

	ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

	drawBarrier();

	// Apply zoom/pan transform
	ctx.save();
	var cx = window.innerWidth / 2;
	var cy = window.innerHeight / 2;
	ctx.translate(cx + panX, cy + panY);
	ctx.scale(zoomLevel, zoomLevel);
	ctx.translate(-cx, -cy);

	drawGroundGrid();
	drawFood();
	drawRipples();
	drawWindArrow();

	// Draw fly at its position, rotated to face movement direction
	ctx.save();
	ctx.translate(fly.x, fly.y);
	// facingDir is in radians where 0 = right, PI/2 = up
	// Our fly body is drawn facing up (-Y), so rotate accordingly:
	// To face right (facingDir=0), we need to rotate +PI/2
	// The mapping is: canvas rotation = -(facingDir) + PI/2
	// But since canvas Y is inverted (down = +Y), and our sin uses -sin for Y:
	// rotation = -facingDir + PI/2
	ctx.rotate(-facingDir + Math.PI / 2);
	ctx.scale(BODY.scale, BODY.scale);
	drawFlyBody(currentDtScale);
	ctx.restore();

	// Small dot showing fly's "nose" target for debugging (very faint)
	ctx.beginPath();
	ctx.arc(fly.x, fly.y, 2, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.08)';
	ctx.fill();
	if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.drawOverlay(ctx); }

	ctx.restore(); // end zoom/pan transform
}

// --- Resize (with high-DPI support) ---
(function resize() {
	var dpr = window.devicePixelRatio || 1;
	canvas.width = window.innerWidth * dpr;
	canvas.height = window.innerHeight * dpr;
	canvas.style.width = window.innerWidth + 'px';
	canvas.style.height = window.innerHeight + 'px';
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	// Clamp food positions to current visible bounds so food items
	// near old edges don't become unreachable after window shrinks
	for (var i = 0; i < food.length; i++) {
		food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
		food[i].y = Math.max(getLayoutBounds().top, Math.min(food[i].y, window.innerHeight));
	}
	// Also re-clamp the fly position to the new bounds
	fly.x = Math.max(0, Math.min(fly.x, window.innerWidth));
	fly.y = Math.max(getLayoutBounds().top, Math.min(fly.y, window.innerHeight));
	window.addEventListener('resize', resize);
})();

// --- Main loop (requestAnimationFrame with delta-time) ---
var lastTime = -1;
function loop(timestamp) {
	if (lastTime < 0) {
		lastTime = timestamp;
		draw();
		requestAnimationFrame(loop);
		return;
	}
	var dt = timestamp - lastTime;
	lastTime = timestamp;
	// Clamp dt to 100ms to prevent huge jumps after tab-backgrounding
	if (dt > 100) dt = 100;
	update(dt);
	if (typeof Brain3D !== 'undefined' && Brain3D.active) { Brain3D.update(); }
	if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.update(dt); }
	draw();
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
