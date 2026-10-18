#!/usr/bin/env node
// Node.js test runner for FlyBrain.
// Loads all scripts into the V8 global context (simulating browser <script> tags)
// then calls runAllTests().
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var root = path.join(__dirname, '..');

// Phase 1: Load base modules (constants + connectome define BRAIN object)
var baseFiles = [
	'js/constants.js',
	'js/connectome.js',
];
for (var i = 0; i < baseFiles.length; i++) {
	var filePath = path.join(root, baseFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: baseFiles[i] });
}

// Phase 2: Enable test mode before loading the worker bridge IIFE.
// This prevents initBridge() from running (no DOM/fetch/Worker in Node)
// and exposes internal functions via BRAIN._bridge for testing.
BRAIN._testMode = true;

// Stub window for neuro-renderer.js IIFE (assigns to window.NeuroRenderer)
if (typeof window === 'undefined') global.window = global;

// Phase 3: Load bridge, logic, and tests
var moreFiles = [
	'js/brain-worker-bridge.js',
	'js/fly-logic.js',
	'js/neuro-renderer.js',
	'tests/tests.js',
];
for (var i = 0; i < moreFiles.length; i++) {
	var filePath = path.join(root, moreFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: moreFiles[i] });
}

// Load DOM-independent touch and renderer helpers from main.js so tests can
// verify under-shell grooming, feeding and the articulated Drosophila leg rig.
var mainSource = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
var behaviorConstantsStart = mainSource.indexOf('// Minimum time (ms) the fly must stay in a state before transitioning out');
var behaviorConstantsEnd = mainSource.indexOf('// The behavior state object', behaviorConstantsStart);
var behaviorStateStart = mainSource.indexOf('function updateBehaviorState() {');
var behaviorStateEnd = mainSource.indexOf('\nfunction filterPersistentTurn', behaviorStateStart);
var canvasMouseStart = mainSource.indexOf('function handleCanvasMousedown(event) {');
var canvasMouseEnd = mainSource.indexOf('\nfunction handleCanvasMousemove', canvasMouseStart);
var touchStart = mainSource.indexOf('function applyTouchTool(cx, cy) {');
var touchEnd = mainSource.indexOf('\n/**\n * Returns the nearest food item', touchStart);
var mouthRangeStart = mainSource.indexOf('function getFoodProboscisCoordinates(item) {');
var mouthRangeEnd = mainSource.indexOf('\n/**\n * Called on the 500ms brain tick.', mouthRangeStart);
var animBehaviorStart = mainSource.indexOf('function updateAnimForBehavior(dtScale) {');
var animBehaviorEnd = mainSource.indexOf('\nfunction cycleLightLevel', animBehaviorStart);
var movementBehaviorStart = mainSource.indexOf('function filterPersistentTurn(rawTurn) {');
var movementBehaviorEnd = mainSource.indexOf('\nfunction updateAnimForBehavior', movementBehaviorStart);
var cameraStart = mainSource.indexOf('function computeCameraPan(');
var cameraEnd = mainSource.indexOf('\nfunction centerCameraOnFly()', cameraStart);
var wingPoseStart = mainSource.indexOf('function computeWingRotation(');
var wingPoseEnd = mainSource.indexOf('/**\n * Draws one wing', wingPoseStart);
var behaviorDescriptionStart = mainSource.indexOf('function describeFlyBehavior(');
var behaviorDescriptionEnd = mainSource.indexOf('\nfunction recordFlyActivity', behaviorDescriptionStart);
var colorsStart = mainSource.indexOf('var COLORS = {');
var colorsEnd = mainSource.indexOf('\n};', colorsStart) + 3;
var drawStart = mainSource.indexOf('function drawLegSegment(');
var drawEnd = mainSource.indexOf('// --- Movement update (same interface as worm-sim) ---', drawStart);
var flyOrderStart = mainSource.indexOf('function drawFlyBody(dtScale) {');
var flyOrderEnd = mainSource.indexOf('/**\n * Draw the generated Drosophila body cutout', flyOrderStart);
var groundGridStart = mainSource.indexOf('function drawGroundGrid() {');
var groundGridEnd = mainSource.indexOf('// --- Draw ---', groundGridStart);
var antennaStart = mainSource.indexOf('function drawAntennae(');
var antennaEnd = mainSource.indexOf('\nfunction drawProboscis(', antennaStart);
var bodyStart = mainSource.indexOf('function drawPhotorealBody()');
var bodyEnd = mainSource.indexOf('/**\n * Draws one wing', bodyStart);
var wingStart = mainSource.indexOf('function drawWing(side) {');
var wingEnd = mainSource.indexOf('/**\n * Draws the abdomen', wingStart);
var mouthStart = mainSource.indexOf('function drawProboscis(extend)');
var mouthEnd = mainSource.indexOf('/**\n * Draws all 6 legs with behavior-specific animation.', mouthStart);
var foodRendererStart = mainSource.indexOf('function drawFood() {');
var foodRendererEnd = mainSource.indexOf('\n/**\n * Draws expanding ripple effects', foodRendererStart);
var lightingStart = mainSource.indexOf('function getFlyLightingFilter()');
var lightingEnd = mainSource.indexOf('/**\n * Draws the complete fly body', lightingStart);
if (behaviorConstantsStart < 0 || behaviorConstantsEnd < 0 || behaviorStateStart < 0 || behaviorStateEnd < 0 ||
	canvasMouseStart < 0 || canvasMouseEnd < 0 || touchStart < 0 || touchEnd < 0 || mouthRangeStart < 0 || mouthRangeEnd < 0 ||
	animBehaviorStart < 0 || animBehaviorEnd < 0 || movementBehaviorStart < 0 || movementBehaviorEnd < 0 ||
	cameraStart < 0 || cameraEnd < 0 ||
	wingPoseStart < 0 || wingPoseEnd < 0 || behaviorDescriptionStart < 0 || behaviorDescriptionEnd < 0 ||
	colorsStart < 0 || colorsEnd <= colorsStart ||
	drawStart < 0 || drawEnd < 0 || flyOrderStart < 0 || flyOrderEnd < 0 ||
	groundGridStart < 0 || groundGridEnd < 0 || antennaStart < 0 || antennaEnd < 0 ||
	bodyStart < 0 || bodyEnd < 0 || wingStart < 0 || wingEnd < 0 || mouthStart < 0 || mouthEnd < 0 ||
	foodRendererStart < 0 || foodRendererEnd < 0 || lightingStart < 0 || lightingEnd < 0) {
	throw new Error('Could not find DOM-independent fly interaction helpers in main.js');
}
global.anim = { groomPhase: 0, groomBlend: 0, groomPoseLocation: null, groomFeedbackUntil: 0, groomFeedbackLocation: null };
global.facingDir = Math.PI / 2;
global.innerWidth = 800;
global.innerHeight = 600;
global.zoomLevel = 1;
global.panX = 0;
global.panY = 0;
global.getLayoutBounds = function () { return { top: 44, bottom: 550, left: 0, right: 800 }; };
global.screenToWorld = function (x, y) { return { x: x, y: y }; };
var activeToolMatch = mainSource.match(/\bvar\s+activeTool\s*=\s*['"]([^'"]+)['"]/);
if (!activeToolMatch) throw new Error('Could not find the default active tool in main.js');
global.activeTool = activeToolMatch[1];
var indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var itemsMenuMatch = indexSource.match(/<div class="toolbar-dropdown-menu" role="group" aria-label="Herramientas de interacción">([\s\S]*?)<\/div>/);
var activeItemsButtonMatch = itemsMenuMatch && itemsMenuMatch[1].match(/<button\b(?=[^>]*\bclass="[^"]*\bactive\b[^"]*")([^>]*)>([\s\S]*?)<\/button>/);
var activeItemsToolMatch = activeItemsButtonMatch && activeItemsButtonMatch[1].match(/\bdata-tool="([^"]+)"/);
var itemsLabelMatch = indexSource.match(/<span id="itemsActiveLabel"[^>]*>([^<]+)<\/span>/);
if (!activeItemsToolMatch || !itemsLabelMatch) throw new Error('Could not find the default Items selection in index.html');
global.__toolbarDefaultTool = activeItemsToolMatch[1];
global.__toolbarDefaultLabel = itemsLabelMatch[1].trim();
global.dragStart = { x: 0, y: 0 };
global.isDragging = false;
global.dragToolOrigin = null;
global.windResetTime = 0;
global.touchResetTime = 0;
global.touchTimestamps = [];
global.ripples = [];
global.speed = 0;
global.targetSpeed = 0;
global.targetDir = 0;
global.speedChangeInterval = 0;
global.BODY = {
	legCoxaLength: 2.1, legTrochanterLength: 0.9, legFemurLength: 5.0,
	legTarsomereLengths: [1.35, 1.2, 1.05, 0.95, 0.75], legPretarsusLength: 0.7,
	legSeg1: 8, legSeg2: 10, legSeg3: 6,
	legAttach: [{x: 7, y: -16}, {x: 9, y: -10}, {x: 8, y: -3}],
	legRestAngles: [{hip: -0.7, knee: -0.3}, {hip: 0, knee: 0.2}, {hip: 0.7, knee: 0.3}],
	bodySpriteHeight: 64, bodySpriteTop: -32,
	wingOffsetX: 7, wingOffsetY: -8, wingLength: 42, wingWidth: 16,
	antennaBaseX: 2.5, antennaBaseY: -29, antennaLength: 8,
	proboscisBaseY: -30.8, proboscisLength: 9,
};
global.flyBodyAssetReady = true;
global.flyBodyAsset = { naturalWidth: 454, naturalHeight: 1284 };
global.flyWingAssetReady = true;
global.flyWingAsset = { naturalWidth: 765, naturalHeight: 1485 };
global.honeyDropAssetReady = false;
global.honeyDropAsset = null;
global.recordFlyActivity = function () {};
global.recordFlyBehavior = function () {};
vm.runInThisContext(mainSource.slice(behaviorConstantsStart, behaviorConstantsEnd), { filename: 'js/main.js#behaviorConstants' });
vm.runInThisContext(mainSource.slice(behaviorStateStart, behaviorStateEnd), { filename: 'js/main.js#behaviorState' });
global.__canvasImageDrawCalls = 0;
global.nearestFood = function () {
	if (!global.food || !global.food.length) return null;
	var item = global.food[0];
	return { item: item, dist: Math.hypot(global.fly.x - item.x, global.fly.y - item.y) };
};
global.__canvasDrawCalls = 0;
global.__canvasMethodCalls = {};
global.ctx = new Proxy({}, {
	get: function (_target, name) {
		if (name === 'createLinearGradient' || name === 'createRadialGradient') {
			return function () { return { addColorStop: function () {} }; };
		}
		return function () {
			global.__canvasDrawCalls++;
			global.__canvasMethodCalls[name] = (global.__canvasMethodCalls[name] || 0) + 1;
			if (name === 'drawImage') global.__canvasImageDrawCalls++;
		};
	},
	set: function () { return true; },
});
vm.runInThisContext(mainSource.slice(touchStart, touchEnd), { filename: 'js/main.js#applyTouchTool' });
vm.runInThisContext(mainSource.slice(canvasMouseStart, canvasMouseEnd), { filename: 'js/main.js#canvasInteraction' });
vm.runInThisContext(mainSource.slice(mouthRangeStart, mouthRangeEnd), { filename: 'js/main.js#foodContactDistance' });
vm.runInThisContext(mainSource.slice(animBehaviorStart, animBehaviorEnd), { filename: 'js/main.js#behaviorAnimation' });
vm.runInThisContext(mainSource.slice(movementBehaviorStart, movementBehaviorEnd), { filename: 'js/main.js#behaviorMovement' });
vm.runInThisContext(mainSource.slice(cameraStart, cameraEnd), { filename: 'js/main.js#cameraPan' });
vm.runInThisContext(mainSource.slice(wingPoseStart, wingPoseEnd), { filename: 'js/main.js#wingPose' });
vm.runInThisContext(mainSource.slice(behaviorDescriptionStart, behaviorDescriptionEnd), { filename: 'js/main.js#behaviorDescription' });
vm.runInThisContext(mainSource.slice(colorsStart, colorsEnd), { filename: 'js/main.js#colors' });
vm.runInThisContext(mainSource.slice(drawStart, drawEnd), { filename: 'js/main.js#legRenderer' });
vm.runInThisContext(mainSource.slice(flyOrderStart, flyOrderEnd), { filename: 'js/main.js#flyRenderOrder' });
vm.runInThisContext(mainSource.slice(groundGridStart, groundGridEnd), { filename: 'js/main.js#groundGrid' });
vm.runInThisContext(mainSource.slice(antennaStart, antennaEnd), { filename: 'js/main.js#antennaRenderer' });
vm.runInThisContext(mainSource.slice(bodyStart, bodyEnd), { filename: 'js/main.js#photorealBody' });
vm.runInThisContext(mainSource.slice(wingStart, wingEnd), { filename: 'js/main.js#wingRenderer' });
vm.runInThisContext(mainSource.slice(lightingStart, lightingEnd), { filename: 'js/main.js#lightingFilter' });
vm.runInThisContext(mainSource.slice(mouthStart, mouthEnd), { filename: 'js/main.js#proboscis' });
vm.runInThisContext(mainSource.slice(foodRendererStart, foodRendererEnd), { filename: 'js/main.js#foodRenderer' });

runAllTests();
