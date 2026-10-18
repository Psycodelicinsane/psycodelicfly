// ============================================================
// Section 1: Assertion Helpers
// ============================================================

function TestFailure(message) {
	this.message = message;
}

function assertEqual(actual, expected, msg) {
	if (actual !== expected) {
		throw new TestFailure(msg + ': expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
	}
}

function assertTrue(value, msg) {
	if (!value) {
		throw new TestFailure(msg + ': expected truthy but got ' + JSON.stringify(value));
	}
}

function assertClose(actual, expected, tolerance, msg) {
	if (Math.abs(actual - expected) > tolerance) {
		throw new TestFailure(msg + ': expected ' + expected + ' ± ' + tolerance + ' but got ' + actual);
	}
}

function withMockedRandom(mockValue, fn) {
	var origRandom = Math.random;
	Math.random = function () { return mockValue; };
	try {
		fn();
	} finally {
		Math.random = origRandom;
	}
}

// ============================================================
// Section 2: Mutable Test State and Reset Helper
// ============================================================

// Mutable test state (these globals are used by the shared
// functions in fly-logic.js: evaluateBehaviorEntry, isCoolingDown, hasNearbyFood)
var behavior = {
	current: 'idle', enterTime: 0, cooldowns: {},
	startlePhase: 'none', startleFreezeEnd: 0, startleBurstEnd: 0,
	touchEscapePending: false, groomLocation: null, burstDir: 0,
	turnBiasBaseline: 0, turnInputFiltered: 0, foodSeekTurnSign: 0,
	locomotionSpeedCommand: 0
};
var food = [];
var fly = { x: 400, y: 300 };

function resetBrainState() {
	BRAIN.setup();
	BRAIN.thisState = 0;
	BRAIN.nextState = 1;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumStartle = 0;
	BRAIN.accumHead = 0;
	BRAIN.accumleft = 0;
	BRAIN.accumright = 0;
	BRAIN._isMoving = false;
	BRAIN._isFeeding = false;
	BRAIN._isGrooming = false;
	BRAIN.stimulate = {
		touch: false,
		touchLocation: null,
		foodNearby: false,
		foodContact: false,
		dangerOdor: false,
		wind: false,
		windStrength: 0,
		windDirection: 0,
		lightLevel: 1,
		nociception: false,
		temperature: 0.5,
	};
	BRAIN.drives = {
		hunger: 0.3,
		fear: 0.0,
		fatigue: 0.0,
		curiosity: 0.5,
		groom: 0.1,
	};
	behavior = {
		current: 'idle', enterTime: 0, cooldowns: {},
		startlePhase: 'none', startleFreezeEnd: 0, startleBurstEnd: 0,
		touchEscapePending: false, groomLocation: null, burstDir: 0,
		turnBiasBaseline: 0, turnInputFiltered: 0, foodSeekTurnSign: 0,
		locomotionSpeedCommand: 0
	};
	food = [];
	fly = { x: 400, y: 300 };
}

// ============================================================
// Section 3: Test Functions
// ============================================================

// --- Connectome Signal Propagation Tests ---

function test_setup_initializes_all_neurons() {
	resetBrainState();
	for (var pre in weights) {
		assertTrue(BRAIN.postSynaptic[pre] !== undefined, 'missing postSynaptic for ' + pre);
		for (var post in weights[pre]) {
			assertTrue(BRAIN.postSynaptic[post] !== undefined, 'missing postSynaptic for target ' + post);
		}
	}
	assertEqual(BRAIN.postSynaptic['VIS_R1R6'][0], 0, 'VIS_R1R6 state 0');
	assertEqual(BRAIN.postSynaptic['VIS_R1R6'][1], 0, 'VIS_R1R6 state 1');
}

function test_dendriteAccumulate_propagates_to_targets() {
	resetBrainState();
	BRAIN.dendriteAccumulate('VIS_R1R6');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 8, 'VIS_R1R6 -> VIS_ME weight 8');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], 4, 'VIS_R1R6 -> VIS_LPTC weight 4');
	assertEqual(BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.nextState], 2, 'VIS_R1R6 -> DRIVE_CURIOSITY weight 2');
	assertEqual(BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState], 0, 'MN_PROBOSCIS should be untouched');
}

function test_dendriteAccumulate_is_additive() {
	resetBrainState();
	BRAIN.dendriteAccumulate('VIS_R1R6');
	BRAIN.dendriteAccumulate('VIS_R1R6');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 16, 'VIS_ME should be 8*2=16 after two accumulations');
}

function test_dendriteAccumulateScaled_applies_scale() {
	resetBrainState();
	BRAIN.dendriteAccumulateScaled('VIS_R1R6', 0.5);
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], Math.round(8 * 0.5), 'VIS_ME scaled to 4');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], Math.round(4 * 0.5), 'VIS_LPTC scaled to 2');
}

function test_fireNeuron_cascades_and_resets() {
	resetBrainState();
	BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] = 50;
	BRAIN.fireNeuron('VIS_ME');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 0, 'VIS_ME reset after firing');
	assertEqual(BRAIN.postSynaptic['VIS_LO'][BRAIN.nextState], 7, 'VIS_ME -> VIS_LO weight 7');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], 6, 'VIS_ME -> VIS_LPTC weight 6');
}

function test_readMotor_drains_to_zero() {
	resetBrainState();
	BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 25;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState], 0, 'MN_PROBOSCIS drained to 0');
	assertEqual(BRAIN.accumFeed, 25, 'accumFeed should be 25');
}

function test_motor_accumulator_floors_at_zero() {
	resetBrainState();
	BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = -5;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumFeed, 0, 'accumFeed floored at 0');
}

// --- Drive System Tests ---

function test_hunger_increases_per_tick() {
	resetBrainState();
	BRAIN.drives.hunger = 0.3;
	BRAIN._isFeeding = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.hunger, 0.305, 0.0001, 'hunger increase');
}

function test_hunger_decreases_when_feeding() {
	resetBrainState();
	BRAIN.drives.hunger = 0.5;
	BRAIN._isFeeding = true;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.hunger, 0.205, 0.0001, 'hunger decrease when feeding');
}

function test_fear_spikes_on_touch() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.touch = true;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.255, 0.0001, 'fear spike on touch');
}

function countLegacyTouchStimuli(location) {
	resetBrainState();
	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = location;
	BRAIN.stimulate.lightLevel = 0;
	var bristleCount = 0;
	var originalAccumulate = BRAIN.dendriteAccumulate;
	var originalAccumulateScaled = BRAIN.dendriteAccumulateScaled;
	var originalRunConnectome = BRAIN.runconnectome;
	BRAIN.dendriteAccumulate = function (name) {
		if (name === 'MECH_BRISTLE') bristleCount++;
	};
	BRAIN.dendriteAccumulateScaled = function () {};
	BRAIN.runconnectome = function () {};
	try {
		BRAIN.update();
	} finally {
		BRAIN.dendriteAccumulate = originalAccumulate;
		BRAIN.dendriteAccumulateScaled = originalAccumulateScaled;
		BRAIN.runconnectome = originalRunConnectome;
	}
	return bristleCount;
}

function test_legacy_connectome_touch_location_boosts_head_and_thorax() {
	assertEqual(countLegacyTouchStimuli('head'), 2, 'head touch gets the stronger mechanosensory input');
	assertEqual(countLegacyTouchStimuli('thorax'), 2, 'thorax touch gets the stronger mechanosensory input');
	assertEqual(countLegacyTouchStimuli('cabeza'), 2, 'legacy Spanish head alias gets the stronger input');
	assertEqual(countLegacyTouchStimuli('torax'), 2, 'legacy Spanish thorax alias gets the stronger input');
	assertEqual(countLegacyTouchStimuli('abdomen'), 1, 'abdomen touch gets the regular mechanosensory input');
	assertEqual(countLegacyTouchStimuli('leg'), 1, 'leg touch gets the regular mechanosensory input');
}

function test_touch_starts_visible_cleaning_feedback_for_head_and_abdomen() {
	resetBrainState();
	anim.groomFeedbackUntil = 0;
	anim.groomFeedbackLocation = null;
	anim.groomPhase = 5;
	facingDir = Math.PI / 2;
	touchTimestamps.length = 0;
	touchResetTime = 0;
	applyTouchTool(fly.x, fly.y - 25);
	assertEqual(BRAIN.stimulate.touchLocation, 'head', 'click over the head is classified correctly');
	assertEqual(anim.groomPhase, 0, 'face-cleaning cycle starts from its first stroke');
	assertTrue(anim.groomFeedbackUntil > Date.now(), 'head touch schedules visible cleaning feedback');
	assertEqual(anim.groomFeedbackLocation, 'head', 'head touch selects the front pair');

	resetBrainState();
	anim.groomFeedbackUntil = 0;
	anim.groomFeedbackLocation = null;
	anim.groomPhase = 5;
	touchTimestamps.length = 0;
	applyTouchTool(fly.x, fly.y + 25);
	assertEqual(BRAIN.stimulate.touchLocation, 'abdomen', 'click over abdomen remains a distinct interaction');
	assertTrue(anim.groomFeedbackUntil > Date.now(), 'abdomen touch also schedules a visible cleaning gesture');
	assertEqual(anim.groomFeedbackLocation, 'abdomen', 'abdomen cleaning selects the rear leg pair');
}

function test_repeated_touch_forces_fast_escape_out_of_grooming() {
	resetBrainState();
	var now = Date.now();
	behavior.current = 'groom';
	behavior.enterTime = now - 100;
	behavior.cooldowns = {};
	behavior.startlePhase = 'none';
	behavior.startleBurstEnd = 0;
	behavior.touchEscapePending = false;
	anim.groomBlend = 0.8;
	anim.groomFeedbackUntil = now + 1000;
	anim.groomFeedbackLocation = 'abdomen';
	anim.groomPoseLocation = 'abdomen';
	touchTimestamps.length = 0;
	touchResetTime = 0;

	applyTouchTool(fly.x, fly.y);
	applyTouchTool(fly.x, fly.y);
	applyTouchTool(fly.x, fly.y);

	assertTrue(BRAIN.stimulate.nociception, 'three quick taps still send the pain stimulus to the connectome');
	assertEqual(behavior.current, 'startle', 'rapid taps interrupt the long grooming minimum immediately');
	assertEqual(behavior.startlePhase, 'freeze', 'escape begins with only a brief startle pause');
	assertTrue(behavior.startleFreezeEnd <= Date.now() + 100,
		'the freeze does not hold the fly in a slow grooming response');
	assertEqual(behavior.touchEscapePending, false, 'the urgent escape request is consumed once');
	assertEqual(anim.groomFeedbackUntil, 0, 'rapid taps cancel the lingering cleaning animation');
	assertEqual(anim.groomFeedbackLocation, null, 'the escape no longer targets a cleaning pose');
	assertEqual(anim.groomBlend, 0, 'the legs leave the grooming pose for the escape');
	assertEqual(touchTimestamps.length, 0, 'the rapid-tap window resets after triggering escape');
}

function captureGroomingLegs(state, location, phase, touchFeedback) {
	var originalCtx = globalThis.ctx;
	var originalGroomBlend = anim.groomBlend;
	var originalGroomPoseLocation = anim.groomPoseLocation;
	var rawCalls = [];
	var path = [];
	var styles = {};
	var nowSeconds = Date.now() / 1000;
	behavior.current = state;
	behavior.groomLocation = location;
	behavior.startlePhase = 'freeze';
	anim.groomPhase = phase;
	anim.groomBlend = 1;
	anim.groomPoseLocation = location;
	anim.groomFeedbackUntil = touchFeedback ? Date.now() + 1000 : 0;
	anim.groomFeedbackLocation = location;
	anim.legJitter = [0, 0, 0, 0, 0, 0];
	anim.legJitterTarget = [0, 0, 0, 0, 0, 0];
	anim.legJitterTimer = nowSeconds;
	anim.legJitterNextInterval = 1000;
	anim.wingMicro = 0;
	anim.wingMicroTarget = 0;
	anim.wingMicroTimer = nowSeconds;
	anim.wingMicroNextInterval = 1000;
	globalThis.ctx = new Proxy({}, {
		get: function (_target, name) {
			if (name === 'beginPath') return function () { path = []; };
			if (name === 'moveTo' || name === 'lineTo') {
				return function (x, y) { path.push([x, y]); };
			}
			if (name === 'stroke') {
				return function () {
					if (path.length > 1) {
						rawCalls.push({ path: path.slice(), strokeStyle: styles.strokeStyle, lineWidth: styles.lineWidth });
					}
				};
			}
			return function () {};
		},
		set: function (_target, name, value) { styles[name] = value; return true; }
	});
	try {
		drawLegs(state, 1);
	} finally {
		globalThis.ctx = originalCtx;
		anim.groomBlend = originalGroomBlend;
		anim.groomPoseLocation = originalGroomPoseLocation;
	}
	var macroCalls = [];
	for (var legIdx = 0; legIdx < 6; legIdx++) {
		var legCalls = rawCalls.slice(legIdx * 11, (legIdx + 1) * 11);
		macroCalls.push({
			path: [legCalls[0].path[0], legCalls[2].path[1]],
			strokeStyle: legCalls[2].strokeStyle,
			lineWidth: legCalls[2].lineWidth
		});
		macroCalls.push(legCalls[3]);
		macroCalls.push({
			path: [legCalls[4].path[0], legCalls[9].path[1]],
			strokeStyle: legCalls[4].strokeStyle,
			lineWidth: legCalls[4].lineWidth
		});
	}
	macroCalls.rawCalls = rawCalls;
	return macroCalls;
}

function assertAnatomicalLegSegments(calls, description) {
	assertEqual(calls.length, 18, description + ': all six legs retain their three macro pose endpoints');
	var rawCalls = calls.rawCalls;
	assertEqual(rawCalls.length, 66, description + ': each leg draws ten anatomical segments and paired claws');
	var lengths = [BODY.legCoxaLength, BODY.legTrochanterLength, BODY.legFemurLength, BODY.legSeg2]
		.concat(BODY.legTarsomereLengths, [BODY.legPretarsusLength]);
	var widths = [0.88, 0.72, 1.05, 0.76, 0.62, 0.58, 0.53, 0.47, 0.41, 0.30];
	assertClose(BODY.legCoxaLength + BODY.legTrochanterLength + BODY.legFemurLength,
		BODY.legSeg1, 0.000001, description + ': the proximal chain keeps the former eight-pixel reach');
	assertClose(BODY.legTarsomereLengths.reduce(function (sum, length) { return sum + length; }, 0) +
		BODY.legPretarsusLength, BODY.legSeg3, 0.000001,
		description + ': the five tarsomeres and pretarsus keep the former six-pixel reach');
	for (var legIdx = 0; legIdx < 6; legIdx++) {
		for (var segmentIdx = 0; segmentIdx < lengths.length; segmentIdx++) {
			var segment = rawCalls[legIdx * 11 + segmentIdx];
			assertEqual(segment.path.length, 2, description + ': each cuticle link has a clean endpoint');
			assertClose(Math.hypot(segment.path[1][0] - segment.path[0][0], segment.path[1][1] - segment.path[0][1]),
				lengths[segmentIdx], 0.000001, description + ': articulated link preserves its measured length');
			assertEqual(segment.strokeStyle, '#3d2e1a', description + ': leg segments keep their dark chitin color');
			assertClose(segment.lineWidth, widths[segmentIdx], 0.000001,
				description + ': femur-to-foot cuticle tapers progressively');
		}
		var claws = rawCalls[legIdx * 11 + 10];
		assertEqual(claws.path.length, 4, description + ': pretarsus terminates in two short claws');
		assertEqual(claws.strokeStyle, '#3d2e1a', description + ': claws keep the same natural cuticle color');
		assertClose(claws.lineWidth, 0.18, 0.000001, description + ': terminal claws stay finer than the tarsus');
	}
	assertEqual(BODY.legTarsomereLengths.length, 5, description + ': the tarsus is divided into five tarsomeres');
	assertTrue(BODY.legTarsomereLengths[0] > BODY.legTarsomereLengths[4],
		description + ': distal tarsomeres taper toward the pretarsus');
}

function test_original_leg_colors_are_dark_chitin() {
	assertEqual(COLORS.leg, '#3d2e1a', 'original legs keep their dark brown cuticle');
	assertEqual(COLORS.legJoint, '#382718', 'leg joints stay dark and do not read as yellow dots');
}

function test_face_and_abdomen_grooming_use_original_legs_under_the_shell() {
	resetBrainState();
	// Touch-triggered cleaning can run while the connectome is still in startle.
	var faceA = captureGroomingLegs('startle', 'head', 0.35, true);
	assertAnatomicalLegSegments(faceA, 'face washing');

	var faceB = captureGroomingLegs('startle', 'head', 1.1, true);
	assertTrue(Math.hypot(faceB[2].path[1][0] - faceA[2].path[1][0],
		faceB[2].path[1][1] - faceA[2].path[1][1]) > 0.1,
		'the front tarsi continue rubbing across the face');
	var frontFemur = faceA[3];
	var frontTibia = faceA[4];
	var frontTarsus = faceA[5];
	var upperAngle = Math.atan2(frontFemur.path[1][1] - frontFemur.path[0][1],
		frontFemur.path[1][0] - frontFemur.path[0][0]);
	var forearmAngle = Math.atan2(frontTibia.path[1][1] - frontTibia.path[0][1],
		frontTibia.path[1][0] - frontTibia.path[0][0]);
	assertTrue(Math.abs(normalizeAngle(forearmAngle - upperAngle)) > 1.8,
		'the front tibia bends at the knee like an elbow instead of reaching straight down');
	assertTrue(frontTarsus.path[1][1] < -25 && Math.abs(frontTarsus.path[1][0]) < 10,
		'the fine front tarsus reaches the forehead and eye edge to wash the face');
	var activeFaceGroom = captureGroomingLegs('groom', 'head', 0.35, false);
	for (var segment = 0; segment < 18; segment++) {
		for (var point = 0; point < 2; point++) {
			assertClose(activeFaceGroom[segment].path[point][0], faceA[segment].path[point][0], 0.000001,
				'connectome grooming and touch feedback use the same original leg pose');
			assertClose(activeFaceGroom[segment].path[point][1], faceA[segment].path[point][1], 0.000001,
				'connectome grooming and touch feedback preserve the original articulation');
		}
	}

	var abdomenA = captureGroomingLegs('startle', 'abdomen', 0.35, true);
	assertAnatomicalLegSegments(abdomenA, 'abdomen cleaning');
	var rearFemur = abdomenA[15];
	var rearTibia = abdomenA[16];
	var rearTarsus = abdomenA[17];
	var rearUpperAngle = Math.atan2(rearFemur.path[1][1] - rearFemur.path[0][1],
		rearFemur.path[1][0] - rearFemur.path[0][0]);
	var rearForearmAngle = Math.atan2(rearTibia.path[1][1] - rearTibia.path[0][1],
		rearTibia.path[1][0] - rearTibia.path[0][0]);
	assertTrue(rearFemur.path[1][0] - rearFemur.path[0][0] > 5 &&
		Math.abs(normalizeAngle(rearForearmAngle - rearUpperAngle)) > 1.0,
		'the rear leg forms a visible bent elbow outside the abdomen');
	assertTrue(rearTarsus.path[1][1] > 10 && rearTarsus.path[1][1] < 22 &&
		rearTarsus.path[1][0] > 5 && rearTarsus.path[1][0] < 14,
		'the rear tarsus reaches the abdomen edge for a readable belly-washing stroke');
	var abdomenB = captureGroomingLegs('startle', 'abdomen', 2.7, true);
	assertTrue(Math.hypot(abdomenB[14].path[1][0] - abdomenA[14].path[1][0],
		abdomenB[14].path[1][1] - abdomenA[14].path[1][1]) > 0.1,
		'the original rear legs keep their abdomen-grooming motion');
}

function test_thorax_grooming_hind_tarsi_brush_the_shell_in_alternating_strokes() {
	var thoraxA = captureGroomingLegs('startle', 'thorax', 0.35, true);
	assertAnatomicalLegSegments(thoraxA, 'thorax cleaning');
	var leftFemur = thoraxA[12];
	var leftTibia = thoraxA[13];
	var leftTarsus = thoraxA[14];
	var rightFemur = thoraxA[15];
	var rightTibia = thoraxA[16];
	var rightTarsus = thoraxA[17];
	var leftFemurAngle = Math.atan2(leftFemur.path[1][1] - leftFemur.path[0][1],
		leftFemur.path[1][0] - leftFemur.path[0][0]);
	var leftTibiaAngle = Math.atan2(leftTibia.path[1][1] - leftTibia.path[0][1],
		leftTibia.path[1][0] - leftTibia.path[0][0]);
	var leftTarsusAngle = Math.atan2(leftTarsus.path[1][1] - leftTarsus.path[0][1],
		leftTarsus.path[1][0] - leftTarsus.path[0][0]);
	var rightFemurAngle = Math.atan2(rightFemur.path[1][1] - rightFemur.path[0][1],
		rightFemur.path[1][0] - rightFemur.path[0][0]);
	var rightTibiaAngle = Math.atan2(rightTibia.path[1][1] - rightTibia.path[0][1],
		rightTibia.path[1][0] - rightTibia.path[0][0]);
	assertTrue(Math.abs(normalizeAngle(leftTibiaAngle - leftFemurAngle)) > 1.0 &&
		Math.abs(normalizeAngle(rightTibiaAngle - rightFemurAngle)) > 1.0,
		'thorax cleaning visibly folds both hind legs at their knees');
	assertTrue(Math.abs(normalizeAngle(leftTarsusAngle - leftTibiaAngle)) > 2.0,
		'the fine tarsus curls back toward the thorax instead of pointing away from it');
	assertTrue(leftTarsus.path[1][0] < -10 && leftTarsus.path[1][0] > -14 &&
		leftTarsus.path[1][1] > -11 && leftTarsus.path[1][1] < -6,
		'the left tarsus reaches the outer thorax margin to brush the shell');
	assertTrue(rightTarsus.path[1][0] > 10 && rightTarsus.path[1][0] < 14 &&
		rightTarsus.path[1][1] > -11 && rightTarsus.path[1][1] < -6,
		'the right tarsus mirrors the contact pose on the opposite thorax edge');

	var thoraxB = captureGroomingLegs('startle', 'thorax', 2.7, true);
	var leftStrokeDx = thoraxB[14].path[1][0] - leftTarsus.path[1][0];
	var leftStrokeDy = thoraxB[14].path[1][1] - leftTarsus.path[1][1];
	var rightStrokeDx = thoraxB[17].path[1][0] - rightTarsus.path[1][0];
	var rightStrokeDy = thoraxB[17].path[1][1] - rightTarsus.path[1][1];
	assertTrue(Math.hypot(leftStrokeDx, leftStrokeDy) > 0.5 &&
		Math.hypot(rightStrokeDx, rightStrokeDy) > 0.5,
		'the hind legs sweep back and forth over the thorax instead of holding a static pose');
	assertTrue(leftStrokeDx * -rightStrokeDx + leftStrokeDy * rightStrokeDy < 0,
		'the left and right thorax strokes alternate instead of sweeping in sync');
}

function test_proboscis_reach_uses_face_position_food_radius_and_orientation() {
	var originalBaseY = BODY.proboscisBaseY;
	var originalLength = BODY.proboscisLength;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalFacing = facingDir;
	try {
		BODY.proboscisBaseY = -30.8;
		BODY.proboscisLength = 9;
		fly.x = 400;
		fly.y = 300;
		facingDir = Math.PI / 2;
		assertTrue(isFoodInFrontOfProboscis({ x: 400, y: 250, radius: 10 }),
			'food above the fly is in front of its mouth when it faces up');
		assertTrue(!isFoodInFrontOfProboscis({ x: 400, y: 350, radius: 10 }),
			'food behind the fly is not treated as a mouth target');
		assertTrue(!isFoodInFrontOfProboscis({ x: 450, y: 300, radius: 10 }),
			'sideways food does not make the proboscis extend before the fly turns');
		assertTrue(!isFoodInFrontOfProboscis({ x: 420, y: 270, radius: 10 }),
			'food almost beside the mouth stays hidden until the fly aligns its head');
		assertTrue(isFoodInFrontOfProboscis({ x: 412, y: 253, radius: 10 }),
			'food aligned within the forward mouth cone can trigger a tasting extension');
		facingDir = 0;
		assertTrue(isFoodInFrontOfProboscis({ x: 450, y: 300, radius: 10 }),
			'food to the right becomes front-facing after the fly turns right');
		assertTrue(!isFoodInFrontOfProboscis({ x: 350, y: 300, radius: 10 }),
			'food to the left is behind after the fly turns right');
		facingDir = Math.PI / 2;
		assertTrue(isFoodWithinProboscisReach({ x: 400, y: 251, radius: 10 }),
			'a full-sized food item is reachable at the front of the shorter mouthpart');
		assertTrue(!isFoodWithinProboscisReach({ x: 400, y: 250, radius: 10 }),
			'food just beyond the shorter proboscis range is not treated as contact');
		assertTrue(isFoodWithinProboscisReach({ x: 400, y: 260, radius: 1 }),
			'the contact range follows food as it shrinks');
		assertTrue(!isFoodWithinProboscisReach({ x: 450, y: 300, radius: 10 }),
			'a food item beside the fly is not falsely treated as reachable before it turns');
	} finally {
		BODY.proboscisBaseY = originalBaseY;
		BODY.proboscisLength = originalLength;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		facingDir = originalFacing;
	}
}

function test_feed_approach_stops_at_proboscis_reach_distance() {
	var originalState = behavior.current;
	var originalFood = food;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.foodSeekTurnSign = 0;
		behavior.current = 'feed';
		fly.x = 400;
		fly.y = 300;
		facingDir = Math.PI / 2;
		globalThis.speed = 0;
		food = [{ x: 400, y: 250, radius: 10 }];
		computeMovementForBehavior();
		assertClose(globalThis.targetSpeed, 0.25, 0.000001,
			'the fly keeps approaching until the shorter mouthpart can reach food');

		food = [{ x: 400, y: 251, radius: 10 }];
		computeMovementForBehavior();
		assertEqual(globalThis.targetSpeed, 0,
			'the body stops at the proboscis contact distance instead of covering the food');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		food = originalFood;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		facingDir = originalFacing;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_proboscis_begins_during_feed_approach_and_extends_further_at_contact() {
	var originalState = behavior.current;
	var originalFood = food;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalFacing = facingDir;
	var originalContact = BRAIN.stimulate.foodContact;
	var originalExtend = anim.proboscisExtend;
	var originalWingSpread = anim.wingSpread;
	var originalGroomPhase = anim.groomPhase;
	var originalGroomBlend = anim.groomBlend;
	var originalGroomPoseLocation = anim.groomPoseLocation;
	var originalGroomFeedback = anim.groomFeedbackUntil;
	var originalBaseY = BODY.proboscisBaseY;
	var originalLength = BODY.proboscisLength;
	try {
		BODY.proboscisBaseY = -30.8;
		BODY.proboscisLength = 9;
		fly.x = 400;
		fly.y = 300;
		facingDir = Math.PI / 2;
		behavior.current = 'feed';
		anim.proboscisExtend = 0;
		anim.groomFeedbackUntil = 0;
		BRAIN.stimulate.foodContact = false;

		food = [{ x: 400, y: 350, radius: 10 }];
		updateAnimForBehavior(1);
		assertEqual(anim.proboscisExtend, 0,
			'the proboscis stays retracted instead of pointing toward food behind the abdomen');

		food = [{ x: 412, y: 253, radius: 10 }];
		updateAnimForBehavior(1);
		assertClose(anim.proboscisExtend, 0.06, 0.000001,
			'the mouth starts to peek out toward front-aligned food during the approach');

		food = [{ x: 400, y: 251, radius: 10 }];
		updateAnimForBehavior(1);
		assertClose(anim.proboscisExtend, 0.154, 0.000001,
			'the proboscis extends further once its mouth can reach the food');

		behavior.current = 'idle';
		anim.proboscisExtend = 0;
		food = [{ x: 400, y: 250, radius: 10 }];
		updateAnimForBehavior(1);
		assertEqual(anim.proboscisExtend, 0,
			'nearby food alone does not extend the proboscis outside feeding behavior');

		behavior.current = 'groom';
		anim.proboscisExtend = 0.5;
		food = [];
		updateAnimForBehavior(1);
		assertClose(anim.proboscisExtend, 0.45, 0.000001,
			'the existing easing smoothly retracts mouthparts after feeding ends');
	} finally {
		behavior.current = originalState;
		food = originalFood;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		facingDir = originalFacing;
		BRAIN.stimulate.foodContact = originalContact;
		anim.proboscisExtend = originalExtend;
		anim.wingSpread = originalWingSpread;
		anim.groomPhase = originalGroomPhase;
		anim.groomBlend = originalGroomBlend;
		anim.groomPoseLocation = originalGroomPoseLocation;
		anim.groomFeedbackUntil = originalGroomFeedback;
		BODY.proboscisBaseY = originalBaseY;
		BODY.proboscisLength = originalLength;
	}
}
function test_abdomen_grooming_flexes_cutout_during_behavior_and_touch_feedback() {
	var originalCtx = globalThis.ctx;
	var originalState = behavior.current;
	var originalLocation = behavior.groomLocation;
	var originalPhase = anim.groomPhase;
	var originalGroomBlend = anim.groomBlend;
	var originalGroomPoseLocation = anim.groomPoseLocation;
	var originalFeedbackUntil = anim.groomFeedbackUntil;
	var originalFeedbackLocation = anim.groomFeedbackLocation;
	var originalReady = globalThis.flyBodyAssetReady;
	var originalAsset = globalThis.flyBodyAsset;
	var rotations = [];
	var translations = [];
	var imageArgs = [];
	globalThis.flyBodyAssetReady = true;
	globalThis.flyBodyAsset = { naturalWidth: 454, naturalHeight: 1284 };
	globalThis.ctx = new Proxy({}, {
		get: function (_target, name) {
			if (name === 'rotate') return function (angle) { rotations.push(angle); };
			if (name === 'translate') return function (x, y) { translations.push([x, y]); };
			if (name === 'drawImage') return function () { imageArgs.push(Array.prototype.slice.call(arguments)); };
			return function () {};
		},
		set: function () { return true; }
	});
	try {
		anim.groomPhase = Math.PI / 1.6;
		anim.groomBlend = 1;
		anim.groomPoseLocation = 'abdomen';
		behavior.current = 'groom';
		behavior.groomLocation = 'abdomen';
		anim.groomFeedbackUntil = 0;
		drawPhotorealBody();
		assertClose(rotations[0], 0.0096, 0.000001,
			'connectome abdomen grooming uses a subtle flex without hanging away from the thorax');
		assertEqual(translations.length, 2, 'the abdomen rotates around the split without shifting the hinge');
		assertClose(translations[0][1] + translations[1][1], 0, 0.000001,
			'the abdomen hinge stays connected to the thorax');
		assertEqual(imageArgs.length, 2, 'the photo body is split into a thorax and an overlapping abdomen');
		var sourceSplitY = Math.round(1284 * 0.57);
		var overlapCanvas = (sourceSplitY - imageArgs[1][2]) * (BODY.bodySpriteHeight / 1284);
		var halfBodyWidth = 454 * (BODY.bodySpriteHeight / 1284) / 2;
		var edgeRotationShift = halfBodyWidth * Math.abs(Math.sin(rotations[0]));
		assertTrue(overlapCanvas > edgeRotationShift,
			'the overlapping abdomen strip covers rotational edge movement and prevents a visible cut');

		rotations = [];
		translations = [];
		imageArgs = [];
		behavior.current = 'startle';
		anim.groomFeedbackUntil = Date.now() + 1000;
		anim.groomFeedbackLocation = 'abdomen';
		drawPhotorealBody();
		assertClose(rotations[0], 0.0096, 0.000001,
			'abdomen touch feedback uses the same subtle, connected hinge');
		assertClose(translations[0][1] + translations[1][1], 0, 0.000001,
			'touch-triggered belly cleaning does not pull the abdomen off the shell');

		rotations = [];
		translations = [];
		behavior.current = 'groom';
		behavior.groomLocation = 'thorax';
		anim.groomPoseLocation = 'thorax';
		anim.groomFeedbackUntil = 0;
		drawPhotorealBody();
		assertEqual(rotations.length, 0, 'thorax cleaning does not curl the abdomen cutout');
		assertEqual(translations.length, 0, 'thorax cleaning leaves the abdomen joint closed');
	} finally {
		globalThis.ctx = originalCtx;
		behavior.current = originalState;
		behavior.groomLocation = originalLocation;
		anim.groomPhase = originalPhase;
		anim.groomBlend = originalGroomBlend;
		anim.groomPoseLocation = originalGroomPoseLocation;
		anim.groomFeedbackUntil = originalFeedbackUntil;
		anim.groomFeedbackLocation = originalFeedbackLocation;
		globalThis.flyBodyAssetReady = originalReady;
		globalThis.flyBodyAsset = originalAsset;
	}
}

function test_groom_pose_blends_in_and_out_without_snapping() {
	var originalState = behavior.current;
	var originalLocation = behavior.groomLocation;
	var originalBlend = anim.groomBlend;
	var originalPoseLocation = anim.groomPoseLocation;
	var originalFeedbackUntil = anim.groomFeedbackUntil;
	var originalFeedbackLocation = anim.groomFeedbackLocation;
	var originalPhase = anim.groomPhase;
	var originalWingSpread = anim.wingSpread;
	var originalProboscisExtend = anim.proboscisExtend;
	try {
		behavior.current = 'groom';
		behavior.groomLocation = 'head';
		anim.groomFeedbackUntil = 0;
		anim.groomBlend = 0;
		updateAnimForBehavior(1);
		assertClose(anim.groomBlend, 0.14, 0.000001,
			'face washing eases the front-leg pose in over several frames');
		assertEqual(anim.groomPoseLocation, 'head', 'the eased pose retains its face-cleaning target');

		var blendedIn = anim.groomBlend;
		behavior.current = 'idle';
		updateAnimForBehavior(1);
		assertTrue(anim.groomBlend > 0 && anim.groomBlend < blendedIn,
			'leaving grooming eases the legs back to their resting pose');

		behavior.current = 'startle';
		anim.groomBlend = 0;
		anim.groomFeedbackUntil = Date.now() + 1000;
		anim.groomFeedbackLocation = 'abdomen';
		updateAnimForBehavior(1);
		assertClose(anim.groomBlend, 0.14, 0.000001,
			'touch-triggered belly washing uses the same smooth pose transition');
		assertEqual(anim.groomPoseLocation, 'abdomen',
			'touch feedback keeps its selected belly-cleaning target while blending');
	} finally {
		behavior.current = originalState;
		behavior.groomLocation = originalLocation;
		anim.groomBlend = originalBlend;
		anim.groomPoseLocation = originalPoseLocation;
		anim.groomFeedbackUntil = originalFeedbackUntil;
		anim.groomFeedbackLocation = originalFeedbackLocation;
		anim.groomPhase = originalPhase;
		anim.wingSpread = originalWingSpread;
		anim.proboscisExtend = originalProboscisExtend;
	}
}

function test_photoreal_body_and_proboscis_render_smoke() {
	resetBrainState();
	globalThis.flyBodyAssetReady = true;
	globalThis.flyBodyAsset = { naturalWidth: 454, naturalHeight: 1284 };
	BODY.bodySpriteHeight = 64;
	BODY.bodySpriteTop = -32;
	BODY.proboscisBaseY = -30.8;
	BODY.proboscisLength = 9;
	globalThis.__canvasDrawCalls = 0;
	drawPhotorealBody();
	var bodyCalls = globalThis.__canvasDrawCalls;
	assertTrue(bodyCalls >= 2, 'photo body draws its head/thorax and articulated abdomen texture');

	food = [{ x: fly.x, y: fly.y - 50, radius: 10 }];
	facingDir = Math.PI / 2;
	drawProboscis(1);
	assertTrue(globalThis.__canvasDrawCalls > bodyCalls, 'feeding proboscis draws its tube and labella');
}

function test_proboscis_stays_hidden_when_there_is_no_food_target() {
	var originalFood = food;
	var before = globalThis.__canvasDrawCalls;
	try {
		food = [];
		drawProboscis(1);
		assertEqual(globalThis.__canvasDrawCalls, before,
			'the feeding tube cannot appear when there is no food to reach');
	} finally {
		food = originalFood;
	}
}

function test_food_uses_photoreal_top_down_honey_asset_and_shrinks_with_feeding() {
	var originalFood = food;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalAssetReady = globalThis.honeyDropAssetReady;
	var originalAsset = globalThis.honeyDropAsset;
	var originalMethodCalls = globalThis.__canvasMethodCalls;
	var originalDrawCalls = globalThis.__canvasDrawCalls;
	try {
		food = [{ x: 300, y: 300, radius: 10 }];
		fly.x = 40;
		fly.y = 40;
		globalThis.honeyDropAssetReady = true;
		globalThis.honeyDropAsset = { naturalWidth: 512, naturalHeight: 512 };
		globalThis.__canvasMethodCalls = {};
		globalThis.__canvasDrawCalls = 0;
		drawFood();
		assertEqual(globalThis.__canvasMethodCalls.drawImage, 1,
			'the food is rendered from the photoreal top-down honey cutout');
		assertTrue((globalThis.__canvasMethodCalls.ellipse || 0) >= 1,
			'a subtle contact shadow anchors the glossy droplet to the scene');
		assertTrue((globalThis.__canvasMethodCalls.fill || 0) >= 1,
			'the food retains its soft shadow while the photo asset is drawn');
	} finally {
		food = originalFood;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		globalThis.honeyDropAssetReady = originalAssetReady;
		globalThis.honeyDropAsset = originalAsset;
		globalThis.__canvasMethodCalls = originalMethodCalls;
		globalThis.__canvasDrawCalls = originalDrawCalls;
	}
}

function test_proboscis_is_thin_and_stays_under_the_front_shell() {
	var originalCtx = globalThis.ctx;
	var originalFood = food;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalFacing = facingDir;
	var originalBaseY = BODY.proboscisBaseY;
	var originalBodyTop = BODY.bodySpriteTop;
	var originalLength = BODY.proboscisLength;
	var styles = {};
	var path = [];
	var strokes = [];
	var ellipses = [];
	var fills = [];
	globalThis.ctx = new Proxy({}, {
		get: function (_target, name) {
			if (name === 'createLinearGradient') {
				return function () { return { addColorStop: function () {} }; };
			}
			if (name === 'beginPath') return function () { path = []; };
			if (name === 'moveTo') return function (x, y) { path.push({ type: 'move', x: x, y: y }); };
			if (name === 'lineTo') return function (x, y) { path.push({ type: 'line', x: x, y: y }); };
			if (name === 'closePath') return function () { path.push({ type: 'close' }); };
			if (name === 'quadraticCurveTo') {
				return function (cpx, cpy, x, y) {
					path.push({ type: 'curve', cpx: cpx, cpy: cpy, x: x, y: y });
				};
			}
			if (name === 'stroke') {
				return function () {
					strokes.push({ path: path.slice(), width: styles.lineWidth, color: styles.strokeStyle });
				};
			}
			if (name === 'fill') {
				return function () { fills.push({ path: path.slice(), style: styles.fillStyle }); };
			}
			if (name === 'ellipse') {
				return function (x, y, radiusX, radiusY) {
					ellipses.push({ x: x, y: y, radiusX: radiusX, radiusY: radiusY });
				};
			}
			return function () {};
		},
		set: function (_target, name, value) { styles[name] = value; return true; }
	});
	try {
		fly.x = 400;
		fly.y = 300;
		facingDir = Math.PI / 2;
		BODY.proboscisBaseY = -30.8;
		BODY.bodySpriteTop = -32;
		BODY.proboscisLength = 9;
		food = [{ x: 400, y: 250, radius: 10 }];
		drawProboscis(1);
		var fullStrokes = strokes.slice();
		var fullFills = fills.slice();
		assertEqual(fullStrokes.length, 3, 'the complete mouthpart uses a slim sheath, core and highlight');
		assertEqual(fullFills.length, 3, 'the tapered tube and its paired labella use filled, natural shapes');
		assertEqual(fullFills[0].path.filter(function (step) { return step.type === 'curve'; }).length, 2,
			'the mouth tube narrows along a curved, tapered silhouette');
		assertTrue(fullFills[0].path.some(function (step) { return step.type === 'line'; }),
			'the tapered rostrum closes its narrow tip instead of drawing a round wire');
		assertClose(fullStrokes[0].path[0].x, 0, 0.000001, 'mouth roots at the center of the face');
		assertClose(fullStrokes[0].path[0].y, -30.8, 0.000001, 'mouth attachment sits at the lower front of the head');
		assertTrue(fullStrokes[0].path[1].y < BODY.bodySpriteTop,
			'the tip extends beyond the head silhouette while its root stays under the shell');
		assertClose(fullStrokes[0].width, 1.05, 0.000001, 'the dark sheath stays short and fine');
		assertClose(fullStrokes[1].width, 0.56, 0.000001, 'warm proboscis core is finer than the sheath');
		assertClose(fullStrokes[2].width, 0.18, 0.000001, 'the reflected highlight is hair-thin');
		assertEqual(ellipses.length, 4, 'the exposed tip retains small paired labella without a bulb');

		strokes.length = 0;
		drawProboscis(0.5);
		var partialStrokes = strokes.slice();
		assertEqual(partialStrokes.length, 3, 'the approach pose draws one complete tube underneath the shell');
		assertEqual(fills.length, 6, 'the tapered tube and labella remain present during the approach');
		assertTrue(partialStrokes[0].path[1].y < BODY.bodySpriteTop,
			'the partial approach extension peeks out beyond the face');
		assertTrue(partialStrokes[0].path[1].y > fullStrokes[0].path[1].y,
			'the approach pose is shorter than the full contact extension');
		assertEqual(ellipses.length, 8, 'labella remain on the same under-body layer during approach');

		food = [{ x: 400, y: 350, radius: 10 }];
		strokes.length = 0;
		ellipses.length = 0;
		fills.length = 0;
		drawProboscis(1);
		assertEqual(strokes.length, 0, 'a rear food target cannot draw a tube through the abdomen');
		assertEqual(ellipses.length, 0, 'labella stay hidden when food is behind the fly');
		assertEqual(fills.length, 0, 'the tapered mouthpart also stays hidden for food behind the fly');
	} finally {
		globalThis.ctx = originalCtx;
		food = originalFood;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		facingDir = originalFacing;
		BODY.proboscisBaseY = originalBaseY;
		BODY.bodySpriteTop = originalBodyTop;
		BODY.proboscisLength = originalLength;
	}
}

function test_antennae_use_dark_tapered_aristae_without_bright_bulbs() {
	var oldMethodCalls = globalThis.__canvasMethodCalls;
	var oldWind = BRAIN.stimulate.wind;
	globalThis.__canvasMethodCalls = {};
	try {
		var now = Date.now() / 1000;
		anim.antennaTimer = now;
		anim.antennaNextInterval = 1000;
		anim.antennaTwitchL = 0;
		anim.antennaTwitchR = 0;
		anim.antennaTargetL = 0;
		anim.antennaTargetR = 0;
		BRAIN.stimulate.wind = false;
		drawAntennae(now, 1);
		assertEqual(globalThis.__canvasMethodCalls.arc || 0, 0,
			'antennae use fine aristae rather than round yellow bulbs');
		assertEqual(globalThis.__canvasMethodCalls.quadraticCurveTo, 4,
			'both antennae retain curved basal segments and aristae');
		assertEqual(globalThis.__canvasMethodCalls.lineTo, 6,
			'both aristae retain three fine branches for realistic texture');
		assertEqual(COLORS.antenna, '#302015', 'antennae stay a natural, dark brown');
	} finally {
		globalThis.__canvasMethodCalls = oldMethodCalls;
		BRAIN.stimulate.wind = oldWind;
	}
}

function captureGroundGrid(zoom, panXValue, panYValue, lightLevel) {
	var originalCtx = globalThis.ctx;
	var originalZoom = globalThis.zoomLevel;
	var originalPanX = globalThis.panX;
	var originalPanY = globalThis.panY;
	var originalLight = BRAIN.stimulate.lightLevel;
	var styles = {};
	var path = [];
	var strokes = [];
	var labels = [];
	var clipRects = [];
	var clipCalls = 0;
	var saveCalls = 0;
	var restoreCalls = 0;
	globalThis.zoomLevel = zoom;
	globalThis.panX = panXValue;
	globalThis.panY = panYValue;
	BRAIN.stimulate.lightLevel = lightLevel;
	globalThis.ctx = new Proxy({}, {
		get: function (_target, name) {
			if (name === 'save') return function () { saveCalls++; };
			if (name === 'restore') return function () { restoreCalls++; };
			if (name === 'beginPath') return function () { path = []; };
			if (name === 'moveTo' || name === 'lineTo') {
				return function (x, y) { path.push([x, y]); };
			}
			if (name === 'rect') {
				return function (x, y, width, height) { clipRects.push([x, y, width, height]); };
			}
			if (name === 'clip') return function () { clipCalls++; };
			if (name === 'stroke') {
				return function () {
					strokes.push({
						path: path.slice(),
						strokeStyle: styles.strokeStyle,
						lineWidth: styles.lineWidth
					});
				};
			}
			if (name === 'fillText') {
				return function (text, x, y) {
					labels.push({ text: String(text), x: x, y: y, fillStyle: styles.fillStyle });
				};
			}
			return function () {};
		},
		set: function (_target, name, value) { styles[name] = value; return true; }
	});
	try {
		drawGroundGrid();
	} finally {
		globalThis.ctx = originalCtx;
		globalThis.zoomLevel = originalZoom;
		globalThis.panX = originalPanX;
		globalThis.panY = originalPanY;
		BRAIN.stimulate.lightLevel = originalLight;
	}
	return { strokes: strokes, labels: labels, clipRects: clipRects, clipCalls: clipCalls, saveCalls: saveCalls, restoreCalls: restoreCalls };
}

function gridSegments(stroke) {
	var segments = [];
	for (var i = 0; i + 1 < stroke.path.length; i += 2) {
		segments.push([stroke.path[i], stroke.path[i + 1]]);
	}
	return segments;
}

function test_ground_grid_uses_50px_world_spacing_and_250px_references() {
	var grid = captureGroundGrid(1, 0, 0, 0.8);
	assertEqual(grid.clipRects.length, 1, 'the grid clips its drawing to the play area');
	assertEqual(grid.clipCalls, 1, 'the canvas clip is applied before drawing the grid');
	assertEqual(grid.saveCalls, 1, 'grid drawing isolates its canvas state');
	assertEqual(grid.restoreCalls, 1, 'the clip is released before later objects draw');
	assertEqual(grid.clipRects[0].join(','), '0,44,800,506',
		'grid clipping excludes the toolbar and lower panel');
	var minor = grid.strokes[0];
	var major = grid.strokes[1];
	var verticalMinor = gridSegments(minor).filter(function (segment) {
		return segment[0][0] === segment[1][0];
	});
	var verticalMajor = gridSegments(major).filter(function (segment) {
		return segment[0][0] === segment[1][0];
	});
	assertEqual(verticalMinor.length, 17, '50 px vertical grid spans the 800 px viewport');
	for (var i = 0; i < verticalMinor.length; i++) {
		assertClose(verticalMinor[i][0][0], i * 50, 0.000001,
			'minor vertical grid lines remain aligned to 50 px world coordinates');
	}
	assertEqual(verticalMajor.length, 4, 'major grid references appear every 250 px');
	for (var majorIdx = 0; majorIdx < verticalMajor.length; majorIdx++) {
		assertEqual(verticalMajor[majorIdx][0][0] % 250, 0,
			'major vertical references stay on 250 px coordinates');
	}
	assertEqual(minor.lineWidth, 0.7, 'minor line weight stays unobtrusive at 1x zoom');
	assertTrue(minor.strokeStyle.indexOf('22, 37, 18') !== -1,
		'the grid uses a muted dark tone on the bright floor');
	assertClose(major.lineWidth, 1, 0.000001, 'major reference marks remain slightly stronger than minor lines');
	var coordinateLabels = grid.labels.filter(function (label) { return /^-?\d+$/.test(label.text); });
	assertTrue(coordinateLabels.length > 0, 'major grid coordinates are labeled');
	for (var labelIdx = 0; labelIdx < coordinateLabels.length; labelIdx++) {
		assertEqual(Number(coordinateLabels[labelIdx].text) % 250, 0,
			'coordinate labels match the major reference spacing');
	}
	assertTrue(grid.labels.some(function (label) { return label.text === 'Cuadrícula: 50 px'; }),
		'the grid includes its scale label');
}

function test_ground_grid_stays_world_anchored_when_panned_and_zoomed() {
	var grid = captureGroundGrid(2, 40, -30, 0.2);
	assertEqual(grid.clipRects.length, 1, 'zoomed grid keeps a single bounded clip region');
	assertEqual(grid.clipRects[0].join(','), '180,187,400,253',
		'panning and zooming transform the clip with the visible play area');
	var minor = grid.strokes[0];
	var major = grid.strokes[1];
	var verticalMinor = gridSegments(minor).filter(function (segment) {
		return segment[0][0] === segment[1][0];
	});
	var verticalMajor = gridSegments(major).filter(function (segment) {
		return segment[0][0] === segment[1][0];
	});
	assertTrue(verticalMinor.length > 0, 'panning and zooming still leave the grid visible');
	for (var i = 0; i < verticalMinor.length; i++) {
		assertEqual(verticalMinor[i][0][0] % 50, 0,
			'pan and zoom do not detach the grid from world coordinates');
		if (i > 0) {
			assertClose(verticalMinor[i][0][0] - verticalMinor[i - 1][0][0], 50, 0.000001,
				'world grid spacing remains 50 px after camera changes');
		}
	}
	for (var majorIdx = 0; majorIdx < verticalMajor.length; majorIdx++) {
		assertEqual(verticalMajor[majorIdx][0][0] % 250, 0,
			'major references remain anchored every 250 px after camera changes');
	}
	assertClose(minor.lineWidth, 0.35, 0.000001, 'minor strokes preserve their screen weight at 2x zoom');
	assertTrue(minor.strokeStyle.indexOf('232, 241, 210') !== -1,
		'the subtle grid switches to a light tone on the darker floor');
}

function test_vector_body_fallback_uses_the_darker_photocuticle_filter() {
	var originalCtx = globalThis.ctx;
	var originalReady = globalThis.flyBodyAssetReady;
	var originalAsset = globalThis.flyBodyAsset;
	var originalLight = BRAIN.stimulate.lightLevel;
	var originalDrawAbdomen = globalThis.drawAbdomen;
	var originalDrawThorax = globalThis.drawThorax;
	var originalDrawHead = globalThis.drawHead;
	var originalDrawEyes = globalThis.drawEyes;
	var drawnParts = [];
	var styles = {};
	globalThis.flyBodyAssetReady = false;
	globalThis.flyBodyAsset = {};
	globalThis.drawAbdomen = function () { drawnParts.push('abdomen'); };
	globalThis.drawThorax = function () { drawnParts.push('thorax'); };
	globalThis.drawHead = function () { drawnParts.push('head'); };
	globalThis.drawEyes = function () { drawnParts.push('eyes'); };
	BRAIN.stimulate.lightLevel = 1;
	globalThis.ctx = new Proxy({}, {
		get: function () { return function () {}; },
		set: function (_target, name, value) { styles[name] = value; return true; }
	});
	try {
		drawPhotorealBody();
		assertEqual(styles.filter, 'brightness(0.66) saturate(0.88)',
			'the canvas fallback stays as dark as the photoreal body at bright light');
		assertEqual(drawnParts.join(','), 'abdomen,thorax,head,eyes',
			'the fallback retains all four original body parts');
	} finally {
		globalThis.ctx = originalCtx;
		globalThis.flyBodyAssetReady = originalReady;
		globalThis.flyBodyAsset = originalAsset;
		globalThis.drawAbdomen = originalDrawAbdomen;
		globalThis.drawThorax = originalDrawThorax;
		globalThis.drawHead = originalDrawHead;
		globalThis.drawEyes = originalDrawEyes;
		BRAIN.stimulate.lightLevel = originalLight;
	}
}

function test_photoreal_wings_use_asset_on_both_sides() {
	resetBrainState();
	var originalWingReady = globalThis.flyWingAssetReady;
	var originalWingAsset = globalThis.flyWingAsset;
	var originalWingMicro = anim.wingMicro;
	var originalWingSpread = anim.wingSpread;
	globalThis.flyWingAssetReady = true;
	globalThis.flyWingAsset = { naturalWidth: 765, naturalHeight: 1485 };
	BODY.wingOffsetX = 7;
	BODY.wingOffsetY = -8;
	BODY.wingLength = 42;
	BODY.wingWidth = 16;
	anim.wingMicro = 0.5;
	try {
		anim.wingSpread = 0.25;
		globalThis.__canvasImageDrawCalls = 0;
		drawWing(-1);
		drawWing(1);
		assertEqual(globalThis.__canvasImageDrawCalls, 2, 'mirrored photoreal wing asset is drawn for both sides at rest');

		anim.wingSpread = 1;
		globalThis.__canvasImageDrawCalls = 0;
		drawWing(-1);
		drawWing(1);
		assertEqual(globalThis.__canvasImageDrawCalls, 10,
			'flight renders five translucent time-averaged samples for each wing');
	} finally {
		globalThis.flyWingAssetReady = originalWingReady;
		globalThis.flyWingAsset = originalWingAsset;
		anim.wingMicro = originalWingMicro;
		anim.wingSpread = originalWingSpread;
	}
}

function test_fly_render_layers_keep_tube_under_shell_and_expose_front_mouth() {
	var originalDrawLegs = globalThis.drawLegs;
	var originalDrawBody = globalThis.drawPhotorealBody;
	var originalDrawAntennae = globalThis.drawAntennae;
	var originalDrawProboscis = globalThis.drawProboscis;
	var originalDrawMouth = globalThis.drawProboscisMouth;
	var originalDrawWing = globalThis.drawWing;
	var originalState = behavior.current;
	var originalProboscis = anim.proboscisExtend;
	var order = [];

	try {
		behavior.current = 'feed';
		anim.proboscisExtend = 1;
		globalThis.drawLegs = function () { order.push('legs'); };
		globalThis.drawPhotorealBody = function () { order.push('body'); };
		globalThis.drawAntennae = function () { order.push('antennae'); };
		globalThis.drawProboscis = function () { order.push('proboscis-under-shell'); };
		globalThis.drawProboscisMouth = function () { order.push('front-mouth'); };
		globalThis.drawWing = function (side) { order.push(side < 0 ? 'wing-left' : 'wing-right'); };

		drawFlyBody(1);
		assertEqual(order.join(','), 'legs,proboscis-under-shell,body,front-mouth,antennae,wing-left,wing-right',
			'the tube stays masked by the shell while a tiny feeding mouth is exposed at the face');
	} finally {
		globalThis.drawLegs = originalDrawLegs;
		globalThis.drawPhotorealBody = originalDrawBody;
		globalThis.drawAntennae = originalDrawAntennae;
		globalThis.drawProboscis = originalDrawProboscis;
		globalThis.drawProboscisMouth = originalDrawMouth;
		globalThis.drawWing = originalDrawWing;
		behavior.current = originalState;
		anim.proboscisExtend = originalProboscis;
	}
}

function test_proboscis_mouth_opening_is_visible_at_anterior_head_edge() {
	var originalCtx = globalThis.ctx;
	var originalBaseY = BODY.proboscisBaseY;
	var ellipses = [];
	BODY.proboscisBaseY = -30.8;
	globalThis.ctx = new Proxy({}, {
		get: function (_target, name) {
			if (name === 'ellipse') {
				return function (x, y, radiusX, radiusY) {
					ellipses.push({ x: x, y: y, radiusX: radiusX, radiusY: radiusY });
				};
			}
			return function () {};
		},
		set: function () { return true; }
	});
	try {
		drawProboscisMouth();
		assertEqual(ellipses.length, 3, 'the mouth is formed from a natural lip, dark opening and tiny highlight');
		assertClose(ellipses[0].x, 0, 0.000001, 'the oral opening stays centered at the front of the head');
		assertClose(ellipses[0].y, -30.8, 0.000001, 'the mouth sits at the anterior edge, not over the abdomen');
		assertTrue(ellipses[0].y < BODY.bodySpriteTop + 2,
			'the opening remains close to the head silhouette where the proboscis emerges');
	} finally {
		globalThis.ctx = originalCtx;
		BODY.proboscisBaseY = originalBaseY;
	}
}

function test_wings_open_outward_instead_of_crossing_when_flying() {
	var rightRest = computeWingRotation(1, 0, 0, 0);
	var leftRest = computeWingRotation(-1, 0, 0, 0);
	var rightFlight = computeWingRotation(1, 1, 0, 0);
	var leftFlight = computeWingRotation(-1, 1, 0, 0);
	assertClose(rightRest, -leftRest, 0.000001, 'resting wing angles mirror each other');
	assertClose(rightFlight, -leftFlight, 0.000001, 'flight wing angles remain mirrored');
	assertTrue(rightFlight < 0 && leftFlight > 0,
		'full spread rotates each wing away from the body instead of inverting across it');
	assertClose(computeWingAlpha(0), 0.50, 0.000001, 'wings are less transparent while remaining translucent at rest');
	assertClose(computeWingAlpha(1), 0.75, 0.000001, 'wings remain translucent but are clearer in flight');
}

function test_flying_wings_render_a_symmetric_time_averaged_stroke() {
	var resting = computeWingStrokeSamples(0.25);
	var flying = computeWingStrokeSamples(1);
	assertEqual(resting.length, 1, 'resting wings stay crisp instead of being drawn as a blur');
	assertEqual(flying.length, 5, 'flight wings use a compact set of stroke-exposure samples');
	assertClose(flying[0].offset, -flying[4].offset, 0.000001, 'outer stroke samples are mirrored');
	assertClose(flying[1].offset, -flying[3].offset, 0.000001, 'inner stroke samples are mirrored');
	assertClose(flying[2].offset, 0, 0.000001, 'the strongest sample stays at the mean wing pose');
	assertClose(flying.reduce(function (sum, sample) { return sum + sample.opacity; }, 0), 1, 0.000001,
		'sample opacity is normalized so the motion blur stays translucent');
	assertTrue(flying[0].offset < 0 && flying[4].offset > 0,
		'the flight stroke covers both sides of the mean wing position');
}

function test_center_camera_preserves_zoom_while_centering_fly() {
	var zoom = 2.35;
	var screenCenterX = 640;
	var screenCenterY = 360;
	var flyX = 210;
	var flyY = 515;
	var pan = computeCameraPan(flyX, flyY, zoom, screenCenterX, screenCenterY,
		screenCenterX, screenCenterY);
	var projectedX = screenCenterX + pan.x + zoom * (flyX - screenCenterX);
	var projectedY = screenCenterY + pan.y + zoom * (flyY - screenCenterY);
	assertClose(projectedX, screenCenterX, 0.000001, 'center button places the fly at viewport center');
	assertClose(projectedY, screenCenterY, 0.000001, 'vertical centering uses the same camera transform');
	assertClose(zoom, 2.35, 0.000001, 'centering does not reset or change the zoom');
}

function test_behavior_register_phrases_are_clear_spanish() {
	assertEqual(describeFlyBehavior('groom', 'head'), 'Se limpia la cara.', 'face wash gets a Spanish log entry');
	assertEqual(describeFlyBehavior('groom', 'abdomen'), 'Se limpia el abdomen.', 'abdomen grooming is recorded explicitly');
	assertEqual(describeFlyBehavior('feed'), 'Se alimenta.', 'feeding is logged in Spanish');
}

function test_photoreal_material_tracks_light_setting_while_staying_dark() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 1;
	assertEqual(getFlyLightingFilter(), 'brightness(0.66) saturate(0.88)',
		'bright setting keeps the photo materials dark while preserving chitin detail');
	BRAIN.stimulate.lightLevel = 0.5;
	assertEqual(getFlyLightingFilter(), 'brightness(0.55) saturate(0.80)',
		'mid-level light produces an intermediate dark cuticle');
	BRAIN.stimulate.lightLevel = 0;
	assertEqual(getFlyLightingFilter(), 'brightness(0.44) saturate(0.72)',
		'dark setting dims and desaturates the cuticle further');
}

function test_fear_exponential_decay() {
	resetBrainState();
	BRAIN.drives.fear = 1.0;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.85, 0.0001, 'fear decay');
}

function test_drives_clamped_to_zero() {
	resetBrainState();
	BRAIN.drives.hunger = 0.0;
	BRAIN._isFeeding = true;
	BRAIN.updateDrives();
	assertEqual(BRAIN.drives.hunger, 0, 'hunger clamped at zero');
}

function test_drives_clamped_to_one() {
	resetBrainState();
	BRAIN.drives.hunger = 0.999;
	BRAIN._isFeeding = false;
	BRAIN.updateDrives();
	assertEqual(BRAIN.drives.hunger, 1, 'hunger clamped at one');
}

function test_fear_wind_contribution() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.8;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.136, 0.0001, 'fear from wind');
}

function test_fear_no_wind_contribution_below_threshold() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.5;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.0, 0.0001, 'no fear from weak wind');
}

// --- Angle Normalization Tests ---

function test_normalizeAngle_zero() {
	assertClose(normalizeAngle(0), 0, 0.0001, 'normalizeAngle(0)');
}

function test_normalizeAngle_pi() {
	assertClose(normalizeAngle(Math.PI), Math.PI, 0.0001, 'normalizeAngle(PI)');
}

function test_normalizeAngle_neg_pi() {
	assertClose(normalizeAngle(-Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-PI)');
}

function test_normalizeAngle_3pi() {
	assertClose(normalizeAngle(3 * Math.PI), Math.PI, 0.0001, 'normalizeAngle(3PI)');
}

function test_normalizeAngle_neg5pi() {
	assertClose(normalizeAngle(-5 * Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-5PI)');
}

function test_normalizeAngle_large_positive() {
	var result = normalizeAngle(7);
	assertTrue(result >= -Math.PI && result <= Math.PI, 'normalizeAngle(7) in range');
	assertClose(result, 7 - 2 * Math.PI, 0.0001, 'normalizeAngle(7) value');
}

// --- Behavior Threshold Tests ---

function test_startle_entry() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	behavior.cooldowns = {};
	assertEqual(evaluateBehaviorEntry(), 'startle', 'startle entry');
}

function test_startle_blocked_by_cooldown() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	behavior.cooldowns = { startle: Date.now() + 10000 };
	assertTrue(evaluateBehaviorEntry() !== 'startle', 'startle blocked by cooldown');
}

function test_fly_entry() {
	resetBrainState();
	BRAIN.accumFlight = 20;
	BRAIN.accumStartle = 0;
	assertEqual(evaluateBehaviorEntry(), 'fly', 'fly entry');
}

function test_feed_entry() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	food = [{ x: fly.x + 10, y: fly.y }];
	assertEqual(evaluateBehaviorEntry(), 'feed', 'feed entry');
}

function test_feed_blocked_without_food() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	food = [];
	assertTrue(evaluateBehaviorEntry() !== 'feed', 'feed blocked without food');
}

function test_groom_entry() {
	resetBrainState();
	BRAIN.accumGroom = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	assertEqual(evaluateBehaviorEntry(), 'groom', 'groom entry');
}

function test_rest_entry_high_fatigue() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.drives.fatigue = 0.8;
	assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry from fatigue');
}

function test_rest_lower_threshold_in_dark() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.drives.fatigue = 0.5;
	assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry in dark');
}

function test_brace_entry() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.3;
	assertEqual(evaluateBehaviorEntry(), 'brace', 'brace entry');
}

function test_idle_when_nothing_active() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.drives.curiosity = 0.0;
	assertEqual(evaluateBehaviorEntry(), 'idle', 'idle when nothing active');
}

function test_priority_startle_over_feed() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	BRAIN.accumFeed = 10;
	food = [{ x: fly.x + 10, y: fly.y }];
	assertEqual(evaluateBehaviorEntry(), 'startle', 'startle priority over feed');
}

// --- T5.2: Dark Settling Drive Modulation Tests ---

function test_dark_fatigue_gain_doubled() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.2; // < 0.3 threshold
	BRAIN._isMoving = true;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fatigue, 0.006, 0.0001, 'fatigue gain doubled in dark (0.006)');
}

function test_bright_fatigue_gain_normal() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5; // >= 0.3 threshold
	BRAIN._isMoving = true;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fatigue, 0.003, 0.0001, 'fatigue gain normal in bright (0.003)');
}

function test_dark_curiosity_range_reduced() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.2; // < 0.3 threshold
	BRAIN.drives.curiosity = 0.5;
	withMockedRandom(1.0, function () {
		BRAIN.updateDrives();
	});
	// (1.0 - 0.5) * 0.02 = 0.01, curiosity = 0.5 + 0.01 = 0.51
	assertClose(BRAIN.drives.curiosity, 0.51, 0.001, 'dark curiosity range is 0.02');
}

function test_bright_curiosity_range_normal() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5; // >= 0.3 threshold
	BRAIN.drives.curiosity = 0.5;
	withMockedRandom(1.0, function () {
		BRAIN.updateDrives();
	});
	// (1.0 - 0.5) * 0.06 = 0.03, curiosity = 0.5 + 0.03 = 0.53
	assertClose(BRAIN.drives.curiosity, 0.53, 0.001, 'bright curiosity range is 0.06');
}

function test_tonic_injection_halved_in_dark() {
	// lightLevel=0 → tonic=4; lightLevel=0.15 (below visual threshold 0.2) → tonic=8
	// With zero drives and no stimuli, tonic is the ONLY signal into CX_FC.
	// CX_FC value after one tick: tonic level (< fireThreshold 22, so no cascade).
	resetBrainState();
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	var darkVal = BRAIN.postSynaptic['CX_FC'][BRAIN.thisState];

	resetBrainState();
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0.15; // not zero → tonic=8, but below 0.2 → no visual pathway
	BRAIN._isMoving = false;
	BRAIN.update();
	var dimVal = BRAIN.postSynaptic['CX_FC'][BRAIN.thisState];

	assertEqual(darkVal, 4, 'CX_FC tonic in complete dark should be 4');
	assertEqual(dimVal, 8, 'CX_FC tonic in dim (non-zero light) should be 8');
}

// --- T5.3: Temperature Stimulus Routing Tests ---

function test_temperature_warm_activates_pathway() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.75; // > 0.65 → THERMO_WARM fires
	BRAIN.stimulate.lightLevel = 0.15; // below visual threshold
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// THERMO_WARM → LH_AV: weight 3, warmIntensity = (0.75-0.5)*2 = 0.5
	// Math.round(3 * 0.5) = 2, so LH_AV should be 2 (no other source active)
	assertTrue(BRAIN.postSynaptic['LH_AV'][BRAIN.thisState] > 0,
		'warm temperature activates LH_AV via THERMO_WARM');
}

function test_temperature_cool_activates_pathway() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.25; // < 0.35 → THERMO_COOL fires
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// THERMO_COOL → LH_APP: weight 2, coolIntensity = (0.5-0.25)*2 = 0.5
	// Math.round(2 * 0.5) = 1, so LH_APP should be 1
	assertTrue(BRAIN.postSynaptic['LH_APP'][BRAIN.thisState] > 0,
		'cool temperature activates LH_APP via THERMO_COOL');
}

function test_temperature_neutral_no_thermo() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.5; // neutral: not > 0.65 and not < 0.35
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// Neither THERMO_WARM nor THERMO_COOL should fire
	assertEqual(BRAIN.postSynaptic['LH_AV'][BRAIN.thisState], 0,
		'neutral temperature does not activate LH_AV');
	assertEqual(BRAIN.postSynaptic['LH_APP'][BRAIN.thisState], 0,
		'neutral temperature does not activate LH_APP');
}

// --- T5.3: Nociception Tests ---

function test_nociception_auto_clears() {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.update();
	assertEqual(BRAIN.stimulate.nociception, false, 'nociception auto-clears after one tick');
}

function test_nociception_activates_startle_pathway() {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// NOCI → DN_STARTLE weight 10. After one tick, DN_STARTLE[thisState] = 10.
	assertTrue(BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] > 0,
		'nociception activates DN_STARTLE pathway');
}

// --- T5.1: Brace Entry Condition Tests ---

function test_brace_blocked_by_strong_wind() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.7; // >= 0.5 threshold
	assertTrue(evaluateBehaviorEntry() !== 'brace', 'brace blocked when windStrength >= 0.5');
}

function test_brace_blocked_by_no_wind() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.windStrength = 0.3;
	assertTrue(evaluateBehaviorEntry() !== 'brace', 'brace blocked when wind is not active');
}

function test_brace_blocked_by_high_startle() {
	resetBrainState();
	BRAIN.accumStartle = 35; // > threshold 30
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.3;
	var result = evaluateBehaviorEntry();
	assertEqual(result, 'startle', 'high startle takes priority over brace');
}

// ============================================================
// Section 4: Test Runner
// ============================================================

function runAllTests() {
	var scope = typeof globalThis !== 'undefined' ? globalThis :
	            typeof window !== 'undefined' ? window :
	            typeof global !== 'undefined' ? global : this;
	var tests = [];
	for (var key in scope) {
		if (key.indexOf('test_') === 0 && typeof scope[key] === 'function') {
			tests.push({ name: key, fn: scope[key] });
		}
	}
	tests.sort(function (a, b) {
		return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
	});

	var passed = 0, failed = 0, failures = [];
	var resultsHTML = '';
	for (var i = 0; i < tests.length; i++) {
		var test = tests[i];
		try {
			test.fn();
			passed++;
			resultsHTML += '<div class="test-result pass">' + test.name + '</div>';
		} catch (e) {
			failed++;
			var msg = test.name + ': ' + (e.message || e);
			failures.push(msg);
			resultsHTML += '<div class="test-result fail">' + msg + '</div>';
		}
	}

	// DOM output (browser path)
	if (typeof document !== 'undefined') {
		var resultsEl = document.getElementById('results');
		if (resultsEl) resultsEl.innerHTML = resultsHTML;
		var summaryEl = document.getElementById('summary');
		if (summaryEl) {
			var total = passed + failed;
			summaryEl.innerHTML = '<span class="summary-pass">' + passed + ' passed</span> / <span class="summary-fail">' + failed + ' failed</span> / ' + total + ' total';
		}
	}

	// CLI output (always log to console when available)
	if (typeof console !== 'undefined') {
		var total = passed + failed;
		console.log(passed + ' passed / ' + failed + ' failed / ' + total + ' total');
		for (var f = 0; f < failures.length; f++) {
			console.log('FAIL ' + failures[f]);
		}
	}

	// Node.js exit code (surface failures to CI/automation)
	if (failed > 0 && typeof process !== 'undefined') {
		process.exitCode = 1;
	}
}

// ============================================================
// Section 4b: Food-Seeking, Consumption, Stats, and Startle Tests (D68.2)
// ============================================================

// --- Test group (a): Food-seeking direction ---

function test_food_seek_uses_facingDir_not_targetDir() {
	resetBrainState();
	var facingDirVal = Math.PI / 4;
	var flyX = 400, flyY = 300, foodX = 500, foodY = 200;
	var result = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal);
	// foodAngle = atan2(-(200-300), 500-400) = atan2(100, 100) = PI/4
	// angleDiff = normalizeAngle(PI/4 - PI/4) = 0
	// targetDir = PI/4 + 0 * 0.8 = PI/4
	assertClose(result.targetDir, Math.PI / 4, 0.001,
		'targetDir matches facingDir when food is straight ahead');

	var facingDirVal2 = -Math.PI / 2;
	var result2 = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal2);
	// The large target offset is capped to a smooth 0.75 radian turn per brain tick.
	var expected2 = -Math.PI / 2 + FOOD_SEEK_MAX_TURN;
	assertClose(result2.targetDir, expected2, 0.001,
		'targetDir differs with different facingDir while limiting a sudden reversal');
	assertClose(result2.turn, FOOD_SEEK_MAX_TURN, 0.001,
		'food seeking exposes its bounded turn command for speed easing');
	assertTrue(result2.targetDir !== result.targetDir,
		'different facingDir produces different result');

	var rearTargetA = computeFoodSeekDir(400, 300, 380, 300, 1, 0, 0);
	var rearTargetB = computeFoodSeekDir(400, 300, 380, 299.9, 1, 0, rearTargetA.turnSign);
	assertTrue(rearTargetA.turnSign !== 0 && rearTargetB.angleDiff > 0 && rearTargetB.turn < 0,
		'the fly keeps its chosen turning side when a rear food target crosses the angle seam');
}

function test_food_seek_strength_scales_with_hunger() {
	var r1 = computeFoodSeekDir(400, 300, 500, 200, 0.3, 0);
	assertClose(r1.seekStrength, 0.3, 0.001, 'seekStrength = 0.3 at hunger 0.3');

	var r2 = computeFoodSeekDir(400, 300, 500, 200, 0.9, 0);
	assertClose(r2.seekStrength, 0.9, 0.001, 'seekStrength = 0.9 at hunger 0.9');

	var r3 = computeFoodSeekDir(400, 300, 500, 200, 1.5, 0);
	assertClose(r3.seekStrength, 1.0, 0.001, 'seekStrength clamped to 1.0 at hunger 1.5');
}

function test_food_seek_bounds_reversals_and_slows_while_turning_sharply() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalFood = food;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalFoodNearby = BRAIN.stimulate.foodNearby;
	var originalHunger = BRAIN.drives.hunger;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'explore';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		facingDir = 0;
		food = [{ x: fly.x - 20, y: fly.y, radius: 10 }];
		BRAIN.stimulate.foodNearby = true;
		BRAIN.drives.hunger = 0.9;
		BRAIN.accumleft = 10;
		BRAIN.accumright = 10;
		BRAIN.accumWalkLeft = 10;
		BRAIN.accumWalkRight = 10;
		BRAIN.accumHead = 0;
		globalThis.speed = 0;

		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		var firstTurn = normalizeAngle(globalThis.targetDir - facingDir);
		assertClose(Math.abs(firstTurn), FOOD_SEEK_MAX_TURN, 0.000001,
			'a food target behind the fly is approached with a bounded turn, not a 180-degree snap');
		assertTrue(globalThis.targetSpeed < 0.1,
			'the fly eases its speed down while making a sharp food-seeking turn');

		var turnSign = Math.sign(firstTurn);
		for (var turnTick = 0; turnTick < 3; turnTick++) {
			facingDir = globalThis.targetDir;
			withMockedRandom(0.5, function () { computeMovementForBehavior(); });
			assertTrue(normalizeAngle(globalThis.targetDir - facingDir) * turnSign > 0,
				'the target bearing keeps guiding the fly through the turn instead of making it reverse');
		}
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		food = originalFood;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		BRAIN.stimulate.foodNearby = originalFoodNearby;
		BRAIN.drives.hunger = originalHunger;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_motor_turn_offset_ignores_balanced_worker_noise() {
	assertEqual(computeMotorTurnOffset(10.4, 9.6), 0,
		'four-percent left/right jitter is below the steering dead zone');
	assertEqual(computeMotorTurnOffset(10, 10), 0,
		'balanced motor output does not rotate the fly');
	assertTrue(computeMotorTurnOffset(15, 5) > 0,
		'a clear left-side motor excess can still steer');
	assertTrue(computeMotorTurnOffset(5, 15) < 0,
		'a clear right-side motor excess can still steer in the opposite direction');
}

function test_walk_heading_settles_under_sustained_motor_bias() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'walk';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		facingDir = 0.7;
		globalThis.speed = 0;
		BRAIN.accumleft = 10.4;
		BRAIN.accumright = 9.6;
		BRAIN.accumWalkLeft = 10.4;
		BRAIN.accumWalkRight = 9.6;
		BRAIN.accumHead = 0;
		withMockedRandom(0.5, function () {
			computeMovementForBehavior();
		});
		assertClose(normalizeAngle(globalThis.targetDir - facingDir), 0, 0.000001,
			'balanced motor output has no directional bias');

		BRAIN.accumleft = 15;
		BRAIN.accumright = 5;
		BRAIN.accumWalkLeft = 15;
		BRAIN.accumWalkRight = 5;
		BRAIN.accumHead = 10;
		withMockedRandom(0.5, function () {
			computeMovementForBehavior();
		});
		var firstCorrection = normalizeAngle(globalThis.targetDir - facingDir);
		assertTrue(firstCorrection > 0 && firstCorrection < 0.13,
			'a real motor asymmetry still makes a small, smooth turn');

		for (var turnTick = 0; turnTick < 30; turnTick++) {
			facingDir = globalThis.targetDir;
			withMockedRandom(0.5, function () {
				computeMovementForBehavior();
			});
		}
		assertTrue(Math.abs(normalizeAngle(facingDir - 0.7)) < 0.5,
			'a sustained one-sided signal cannot accumulate into a full circle');
		var settledHeading = facingDir;
		BRAIN.accumleft = 0;
		BRAIN.accumright = 0;
		BRAIN.accumWalkLeft = 0;
		BRAIN.accumWalkRight = 0;
		BRAIN.accumHead = 0;
		withMockedRandom(0.5, function () {
			computeMovementForBehavior();
		});
		assertClose(normalizeAngle(globalThis.targetDir - settledHeading), 0, 0.000001,
			'when the motor signal clears, the fly holds its new heading instead of snapping back');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_walk_can_make_small_turns_with_balanced_leg_output() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'walk';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		facingDir = -0.4;
		globalThis.speed = 0;
		BRAIN.accumleft = 10;
		BRAIN.accumright = 10;
		BRAIN.accumWalkLeft = 10;
		BRAIN.accumWalkRight = 10;
		BRAIN.accumHead = 0;
		withMockedRandom(0.75, function () { computeMovementForBehavior(); });
		assertTrue(normalizeAngle(globalThis.targetDir - facingDir) > 0,
			'walk mode retains a gentle turn even when synthetic leg motors are symmetric');
		facingDir = globalThis.targetDir;
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		withMockedRandom(0.25, function () { computeMovementForBehavior(); });
		assertTrue(normalizeAngle(globalThis.targetDir - facingDir) < 0,
			'the small walk turns are unbiased and can change direction naturally');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_explore_uses_small_relative_turns_not_absolute_heading_jumps() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalFoodNearby = BRAIN.stimulate.foodNearby;
	var originalHunger = BRAIN.drives.hunger;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'explore';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		facingDir = 0.5;
		BRAIN.accumleft = 10;
		BRAIN.accumright = 10;
		BRAIN.accumWalkLeft = 10;
		BRAIN.accumWalkRight = 10;
		BRAIN.accumHead = 0;
		BRAIN.stimulate.foodNearby = false;
		BRAIN.drives.hunger = 0;
		globalThis.speed = 0;

		withMockedRandom(0.75, function () { computeMovementForBehavior(); });
		var firstTurn = normalizeAngle(globalThis.targetDir - facingDir);
		assertTrue(firstTurn > 0 && firstTurn <= 0.08,
			'exploration asks for a small turn relative to the current heading, not a new absolute direction');
		for (var turnTick = 0; turnTick < 30; turnTick++) {
			facingDir = globalThis.targetDir;
			withMockedRandom(0.75, function () { computeMovementForBehavior(); });
		}
		assertTrue(Math.abs(normalizeAngle(facingDir - 0.5)) < 0.5,
			'a persistent wander bias settles quickly rather than producing repeated spins');
		assertTrue(Math.abs(normalizeAngle(globalThis.targetDir - facingDir)) < 0.001,
			'the turn filter settles onto a new heading smoothly');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		BRAIN.stimulate.foodNearby = originalFoodNearby;
		BRAIN.drives.hunger = originalHunger;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_exploration_turn_noise_is_smoothed_to_avoid_c_shaped_reversals() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalFoodNearby = BRAIN.stimulate.foodNearby;
	var originalHunger = BRAIN.drives.hunger;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'explore';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		facingDir = 0.7;
		BRAIN.accumleft = 10;
		BRAIN.accumright = 10;
		BRAIN.accumWalkLeft = 10;
		BRAIN.accumWalkRight = 10;
		BRAIN.accumHead = 0;
		BRAIN.stimulate.foodNearby = false;
		BRAIN.drives.hunger = 0;
		globalThis.speed = 0;

		var maxTurnStep = 0;
		var totalTurnJitter = 0;
		for (var turnTick = 0; turnTick < 12; turnTick++) {
			withMockedRandom(turnTick % 2 === 0 ? 0.95 : 0.05, function () {
				computeMovementForBehavior();
			});
			var turnStep = normalizeAngle(globalThis.targetDir - facingDir);
			maxTurnStep = Math.max(maxTurnStep, Math.abs(turnStep));
			totalTurnJitter += Math.abs(turnStep);
			facingDir = globalThis.targetDir;
		}
		assertTrue(maxTurnStep < 0.05,
			'alternating noisy motor ticks cannot snap the heading left and right');
		assertTrue(totalTurnJitter < 0.5,
			'smoothed exploration noise avoids a repeated C-shaped back-and-forth path');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		BRAIN.stimulate.foodNearby = originalFoodNearby;
		BRAIN.drives.hunger = originalHunger;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_phototaxis_uses_global_light_without_point_target() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalFlyX = fly.x;
	var originalFlyY = fly.y;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'phototaxis';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		BRAIN.accumleft = 0;
		BRAIN.accumright = 0;
		BRAIN.accumWalkLeft = 0;
		BRAIN.accumWalkRight = 0;
		BRAIN.accumHead = 0;
		facingDir = 0.4;
		fly.x = globalThis.innerWidth / 2;
		fly.y = globalThis.innerHeight / 2;
		globalThis.speed = 0;

		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		var centerTurn = normalizeAngle(globalThis.targetDir - facingDir);
		var centerSpeed = globalThis.targetSpeed;
		assertClose(centerTurn, 0, 1e-9,
			'uniform ambient light does not make the fly steer toward the canvas center');
		assertTrue(centerSpeed > 0,
			'a global light response preserves locomotion instead of stopping at an invented source');

		behavior.turnBiasBaseline = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		fly.x = globalThis.innerWidth / 2 + 150;
		fly.y = globalThis.innerHeight / 2 - 80;
		facingDir = 0.4;
		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		assertClose(normalizeAngle(globalThis.targetDir - facingDir), 0, 1e-9,
			'phototaxis heading is independent of the fly position because the light has no point location');
		assertClose(globalThis.targetSpeed, centerSpeed, 1e-9,
			'ambient-light locomotion speed does not depend on distance from the screen center');

		behavior.turnBiasBaseline = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0.25;
		fly.x = globalThis.innerWidth / 2 + 50;
		fly.y = globalThis.innerHeight / 2;
		var startX = fly.x;
		var startY = fly.y;
		var startRadius = Math.hypot(startX - globalThis.innerWidth / 2, startY - globalThis.innerHeight / 2);
		facingDir = Math.PI / 2;
		globalThis.speed = 0.25;
		globalThis.targetDir = facingDir;
		globalThis.targetSpeed = 0.25;
		globalThis.speedChangeInterval = 0;
		for (var tick = 0; tick < 10; tick++) {
			withMockedRandom(0.5, function () { computeMovementForBehavior(); });
			for (var frame = 0; frame < 30; frame++) {
				globalThis.speed += globalThis.speedChangeInterval;
				if (globalThis.speed < 0) globalThis.speed = 0;
				facingDir = normalizeAngle(facingDir + computeHeadingStep(facingDir, globalThis.targetDir, 0.82, 2.2, 1));
				fly.x += Math.cos(facingDir) * globalThis.speed;
				fly.y -= Math.sin(facingDir) * globalThis.speed;
			}
		}
		var endRadius = Math.hypot(fly.x - globalThis.innerWidth / 2, fly.y - globalThis.innerHeight / 2);
		assertClose(fly.x, startX, 1e-9,
			'a neutral heading stays straight instead of curving around a virtual light source');
		assertTrue(fly.y < startY && endRadius > startRadius,
			'uniform photoreceptor activation does not pull the fly toward the screen center');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		facingDir = originalFacing;
		fly.x = originalFlyX;
		fly.y = originalFlyY;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_locomotion_speed_is_smoothed_and_capped() {
	var originalState = behavior.current;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFoodSeekTurnSign = behavior.foodSeekTurnSign;
	var originalTurnInputFiltered = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalWalkLeft = BRAIN.accumWalkLeft;
	var originalWalkRight = BRAIN.accumWalkRight;
	var originalHead = BRAIN.accumHead;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'walk';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		globalThis.speed = 0;
		BRAIN.accumleft = 1000;
		BRAIN.accumright = 1000;
		BRAIN.accumWalkLeft = 1000;
		BRAIN.accumWalkRight = 1000;
		BRAIN.accumHead = 0;

		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		var initialWalkSpeed = globalThis.targetSpeed;
		assertTrue(initialWalkSpeed > 0 && initialWalkSpeed < 0.85,
			'a sudden motor-output spike is ramped rather than applied as an instant dash');
		for (var speedTick = 0; speedTick < 12; speedTick++) {
			withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		}
		assertTrue(globalThis.targetSpeed >= initialWalkSpeed && globalThis.targetSpeed <= 0.85,
			'walking speed approaches its cap smoothly even when neural output is very high');
		var cruisingSpeed = globalThis.targetSpeed;
		BRAIN.accumleft = 0;
		BRAIN.accumright = 0;
		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		assertTrue(globalThis.targetSpeed > 0 && globalThis.targetSpeed < cruisingSpeed,
			'speed also eases down instead of dropping in a single brain tick');

		behavior.current = 'fly';
		behavior.turnBiasBaseline = 0;
		behavior.foodSeekTurnSign = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		globalThis.speed = 0;
		BRAIN.accumleft = 1000;
		BRAIN.accumright = 1000;
		withMockedRandom(0.5, function () { computeMovementForBehavior(); });
		assertTrue(globalThis.targetSpeed > 0 && globalThis.targetSpeed < 1.5,
			'the takeoff speed is ramped instead of jumping immediately to its flight minimum');
		assertTrue(globalThis.targetSpeed <= 2.4,
			'flight speed has a natural upper bound');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.foodSeekTurnSign = originalFoodSeekTurnSign;
		behavior.turnInputFiltered = originalTurnInputFiltered;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		BRAIN.accumWalkLeft = originalWalkLeft;
		BRAIN.accumWalkRight = originalWalkRight;
		BRAIN.accumHead = originalHead;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_flight_turn_noise_stays_small_and_can_steer_both_ways() {
	var originalState = behavior.current;
	var originalFacing = facingDir;
	var originalTurnBias = behavior.turnBiasBaseline;
	var originalFilteredTurn = behavior.turnInputFiltered;
	var originalSpeedCommand = behavior.locomotionSpeedCommand;
	var originalAccumLeft = BRAIN.accumleft;
	var originalAccumRight = BRAIN.accumright;
	var originalSpeed = globalThis.speed;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	try {
		behavior.current = 'fly';
		behavior.turnBiasBaseline = 0;
		behavior.turnInputFiltered = 0;
		behavior.locomotionSpeedCommand = 0;
		BRAIN.accumleft = 10;
		BRAIN.accumright = 10;
		facingDir = 0.4;
		globalThis.speed = 1;
		withMockedRandom(0.95, function () { computeMovementForBehavior(); });
		var rightTurn = normalizeAngle(globalThis.targetDir - facingDir);
		assertTrue(rightTurn > 0 && rightTurn < 0.01,
			'positive flight noise becomes only a fine correction, not a visible heading jump');

		behavior.turnBiasBaseline = 0;
		behavior.turnInputFiltered = 0;
		facingDir = 0.4;
		withMockedRandom(0.05, function () { computeMovementForBehavior(); });
		var leftTurn = normalizeAngle(globalThis.targetDir - facingDir);
		assertTrue(leftTurn < 0 && leftTurn > -0.01,
			'negative flight noise remains gentle and preserves steering in the opposite direction');
	} finally {
		behavior.current = originalState;
		behavior.turnBiasBaseline = originalTurnBias;
		behavior.turnInputFiltered = originalFilteredTurn;
		behavior.locomotionSpeedCommand = originalSpeedCommand;
		BRAIN.accumleft = originalAccumLeft;
		BRAIN.accumright = originalAccumRight;
		facingDir = originalFacing;
		globalThis.speed = originalSpeed;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_heading_turn_rate_caps_flight_and_startle_without_angle_seam_jumps() {
	var flightStep = computeHeadingStep(0, Math.PI, 0.65, 2.6, 1);
	assertClose(flightStep, 2.6 / 60, 0.000001,
		'a large flight command is capped to the configured angular speed per 60 Hz frame');

	var startleStep = computeHeadingStep(0, Math.PI, 0.25, 10.5, 1);
	assertClose(startleStep, 10.5 / 60, 0.000001,
		'startle may turn faster but still cannot snap the body to its escape heading');

	var smallCorrection = computeHeadingStep(0, 0.05, 0.9, 2.4, 1);
	assertClose(smallCorrection, 0.005, 0.000001,
		'small corrections retain a gentle eased response below the angular-rate cap');

	var seamCorrection = computeHeadingStep(Math.PI - 0.05, -Math.PI + 0.05, 0.5, 6, 1);
	assertClose(seamCorrection, 0.05, 0.000001,
		'heading interpolation takes the short path across the plus/minus pi seam');
	assertClose(computeHeadingStep(0, 1, 0.5, 6, 0), 0, 0.000001,
		'zero elapsed time cannot change the heading');
}

function test_startle_burst_sprints_then_recovers_without_snapping_heading() {
	var originalState = behavior.current;
	var originalPhase = behavior.startlePhase;
	var originalFreezeEnd = behavior.startleFreezeEnd;
	var originalBurstEnd = behavior.startleBurstEnd;
	var originalBurstDir = behavior.burstDir;
	var originalFacing = facingDir;
	var originalTargetDir = globalThis.targetDir;
	var originalTargetSpeed = globalThis.targetSpeed;
	var originalSpeed = globalThis.speed;
	var originalSpeedChangeInterval = globalThis.speedChangeInterval;
	var initialHeading = 0.25;
	try {
		behavior.current = 'startle';
		behavior.startlePhase = 'freeze';
		behavior.startleFreezeEnd = 0;
		behavior.startleBurstEnd = 0;
		facingDir = initialHeading;
		globalThis.targetDir = initialHeading;
		globalThis.speed = 0.7;
		withMockedRandom(0.5, function () { applyBehaviorMovement(1); });

		assertEqual(behavior.startlePhase, 'burst', 'the brief freeze transitions into an escape sprint');
		assertClose(facingDir, initialHeading, 0.000001,
			'the escape direction is not assigned directly to the rendered body heading');
		assertClose(normalizeAngle(globalThis.targetDir - (initialHeading + Math.PI)), 0, 0.000001,
			'the burst direction remains a target for a fast, rate-limited turn');
		assertClose(globalThis.speed, 3.0, 0.000001, 'the escape launches at brisk running speed');
		assertClose(globalThis.targetSpeed, 3.0, 0.000001, 'the short sprint holds its fast target speed');
		assertClose(globalThis.speedChangeInterval, 0, 0.000001, 'the sprint launch is not immediately damped');
		assertTrue(behavior.startleBurstEnd > Date.now(), 'the sprint target stays active for a short burst');

		behavior.startleBurstEnd = Date.now() - 1;
		globalThis.speed = 3.0;
		applyBehaviorMovement(1);
		assertClose(globalThis.targetSpeed, 0.9, 0.000001, 'the sprint eases into a short recovery run');
		assertTrue(globalThis.speedChangeInterval < 0, 'recovery decelerates gradually rather than cutting the run off');
	} finally {
		behavior.current = originalState;
		behavior.startlePhase = originalPhase;
		behavior.startleFreezeEnd = originalFreezeEnd;
		behavior.startleBurstEnd = originalBurstEnd;
		behavior.burstDir = originalBurstDir;
		facingDir = originalFacing;
		globalThis.targetDir = originalTargetDir;
		globalThis.targetSpeed = originalTargetSpeed;
		globalThis.speed = originalSpeed;
		globalThis.speedChangeInterval = originalSpeedChangeInterval;
	}
}

function test_feed_approach_speed_constant() {
	assertEqual(FEED_APPROACH_SPEED, 0.25, 'feed approach speed is 0.25');
}

// --- Test group (b): Feed entry bypass ---

function test_feed_entry_hunger_bypass_at_50px() {
	resetBrainState();
	BRAIN.drives.hunger = 0.8;
	BRAIN.stimulate.foodNearby = true;
	BRAIN.accumFeed = 0;
	fly.x = 400; fly.y = 300;
	food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertEqual(state, 'feed', 'hunger bypass enters feed at 50px range');
}

function test_feed_entry_hunger_bypass_requires_high_hunger() {
	resetBrainState();
	BRAIN.drives.hunger = 0.65;
	BRAIN.stimulate.foodNearby = true;
	BRAIN.accumFeed = 0;
	fly.x = 400; fly.y = 300;
	food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertTrue(state !== 'feed', 'no feed entry when hunger <= 0.7 and accumFeed < 8');
}

function test_feed_entry_neural_pathway_requires_food_within_50px() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.drives.hunger = 0.3;
	BRAIN.stimulate.foodNearby = false;
	fly.x = 400; fly.y = 300;
	food = [{ x: 460, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertTrue(state !== 'feed', 'neural pathway blocked when food > 50px');
}

function test_feed_entry_neural_pathway_within_50px() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.drives.hunger = 0.3;
	BRAIN.stimulate.foodNearby = false;
	fly.x = 400; fly.y = 300;
	food = [{ x: 425, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertEqual(state, 'feed', 'neural pathway enters feed when food within 50px');
}

// --- Test group (c): Food consumption ---

function test_food_progress_accumulates() {
	var item = { feedStart: 1000, feedDuration: 4000, eaten: 0 };
	var p1 = computeFoodProgress(item, 2000);
	assertClose(p1, 0.25, 0.001, 'progress is 0.25 after 1s of 4s');

	var item2 = { feedStart: 1000, feedDuration: 4000, eaten: 0.5 };
	var p2 = computeFoodProgress(item2, 2000);
	assertClose(p2, 0.75, 0.001, 'progress accumulates with prior eaten');
}

function test_food_progress_clamped_at_one() {
	var item = { feedStart: 1000, feedDuration: 2000, eaten: 0.8 };
	var p = computeFoodProgress(item, 5000);
	assertEqual(p, 1, 'progress clamped at 1');
}

function test_food_pause_preserves_eaten_progress() {
	var item = { feedStart: 1000, feedDuration: 4000, eaten: 0.1 };
	pauseFeeding(item, 3000);
	assertClose(item.eaten, 0.6, 0.001, 'eaten accumulates on pause');
	assertEqual(item.feedStart, 0, 'feedStart reset to 0 on pause');
}

function test_food_pause_noop_when_not_feeding() {
	var item = { feedStart: 0, feedDuration: 4000, eaten: 0.3 };
	pauseFeeding(item, 5000);
	assertClose(item.eaten, 0.3, 0.001, 'eaten unchanged when already paused');
	assertEqual(item.feedStart, 0, 'feedStart stays 0');
}

function test_food_removal_at_full_progress() {
	food = [{ x: 400, y: 300, feedStart: 1000, feedDuration: 2000, eaten: 0, radius: 10 }];
	var p = computeFoodProgress(food[0], 3000);
	assertEqual(p >= 1, true, 'food fully consumed');
	if (p >= 1) { food.splice(0, 1); }
	assertEqual(food.length, 0, 'food removed from array');
}

// --- Test group (d): sim-worker averaged stats (inline arithmetic) ---

function test_simworker_stats_accumulation_and_averaging() {
	var STATS_INTERVAL_LOCAL = 20;
	var cumulativeFiredCount = 0, tickTimeSamples = 0, tickTimeSum = 0;
	for (var i = 0; i < 20; i++) {
		tickTimeSamples++;
		cumulativeFiredCount += 10;
		tickTimeSum += 5.0;
	}
	assertEqual(tickTimeSamples, 20, 'samples reached STATS_INTERVAL');
	assertEqual(cumulativeFiredCount, 200, 'cumulative fired = 20 * 10');
	var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples);
	assertEqual(avgFired, 10, 'average fired neurons per tick is 10');
	var avgMs = tickTimeSum / tickTimeSamples;
	assertClose(avgMs, 5.0, 0.001, 'average tick time is 5ms');
	tickTimeSum = 0; tickTimeSamples = 0; cumulativeFiredCount = 0;
	assertEqual(cumulativeFiredCount, 0, 'cumulative reset after stats emit');
	assertEqual(tickTimeSamples, 0, 'samples reset after stats emit');
}

function test_simworker_stats_varying_fire_counts() {
	var cumulativeFiredCount = 0, tickTimeSamples = 0;
	for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 5; }
	for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 15; }
	assertEqual(cumulativeFiredCount, 200, 'cumulative = 50 + 150');
	var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples);
	assertEqual(avgFired, 10, 'average over varying counts is 10');
}

function test_simworker_reset_clears_cumulative() {
	var cumulativeFiredCount = 150, tickTimeSamples = 8, tickTimeSum = 40;
	tickTimeSum = 0;
	tickTimeSamples = 0;
	cumulativeFiredCount = 0;
	assertEqual(cumulativeFiredCount, 0, 'cumulativeFiredCount cleared on reset');
	assertEqual(tickTimeSamples, 0, 'tickTimeSamples cleared on reset');
	assertEqual(tickTimeSum, 0, 'tickTimeSum cleared on reset');
	tickTimeSamples++; cumulativeFiredCount += 7; tickTimeSum += 3.0;
	assertEqual(cumulativeFiredCount, 7, 'post-reset accumulation starts fresh');
}

// --- Test group (e): DN_STARTLE reads nextState ---

function test_dn_startle_reads_nextState() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 50;
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 5;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 50, 'accumStartle reads from nextState (50), not thisState (5)');
}

function test_dn_startle_zero_when_no_signal() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 0, 'accumStartle is 0 when no signal');
}

function test_dn_startle_negative_floored() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = -10;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 0, 'negative startle floored at 0');
}

// ============================================================
// Section 5: Worker Bridge Tests (require BRAIN._bridge)
// ============================================================

if (typeof BRAIN !== 'undefined' && BRAIN._bridge) {

// --- aggregateFireState tests ---

var test_bridge_aggregateFireState_basic = function () {
	resetBrainState();
	// Create 10 synthetic groups with 10 neurons each (100 total)
	var names = [];
	var sizes = [];
	var assignments = [];
	for (var g = 0; g < 10; g++) {
		var gname = 'TEST_AG' + g;
		names[g] = gname;
		sizes[g] = 10;
		BRAIN.postSynaptic[gname] = [0, 0];
		for (var n = 0; n < 10; n++) {
			assignments.push(g);
		}
	}
	BRAIN._bridge._setGroupState(10, 100, new Uint16Array(assignments), sizes, names);

	// All 10 neurons in group 0 fire; 5 of 10 in group 3 fire
	var fire = new Uint8Array(100);
	for (var i = 0; i < 10; i++) fire[i] = 1;
	for (var i = 30; i < 35; i++) fire[i] = 1;
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE; // 100
	// Group 0: 10/10 fired in 1 tick → (10/(10*1))*100 = 100
	assertClose(BRAIN.postSynaptic['TEST_AG0'][BRAIN.nextState], FSS, 0.01,
		'full group activation = FIRE_STATE_SCALE');
	// Group 3: 5/10 fired → (5/(10*1))*100 = 50
	assertClose(BRAIN.postSynaptic['TEST_AG3'][BRAIN.nextState], FSS * 0.5, 0.01,
		'half group activation');
	// Group 5: 0/10 fired → 0
	assertEqual(BRAIN.postSynaptic['TEST_AG5'][BRAIN.nextState], 0,
		'unfired group is zero');
};

var test_bridge_aggregateFireState_pending_spikes = function () {
	resetBrainState();
	var names = ['TEST_PS0', 'TEST_PS1', 'TEST_PS2'];
	for (var g = 0; g < 3; g++) {
		BRAIN.postSynaptic[names[g]] = [0, 0];
	}
	var sizes = [20, 10, 5];
	BRAIN._bridge._setGroupState(3, 0, new Uint16Array(0), sizes, names);

	// 40 spikes in group 0, 5 in group 1, 0 in group 2, over 2 ticks
	var spikes = new Float32Array([40, 5, 0]);
	BRAIN._bridge._setFireState(null, spikes, 2);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	// Group 0: (40/(20*2))*100 = 100
	assertClose(BRAIN.postSynaptic['TEST_PS0'][BRAIN.nextState], FSS, 0.01,
		'pending spikes group 0 full activation');
	// Group 1: (5/(10*2))*100 = 25
	assertClose(BRAIN.postSynaptic['TEST_PS1'][BRAIN.nextState], 25, 0.01,
		'pending spikes group 1 quarter activation');
	// Group 2: 0
	assertEqual(BRAIN.postSynaptic['TEST_PS2'][BRAIN.nextState], 0,
		'pending spikes group 2 zero');
};

var test_bridge_aggregateFireState_empty_group = function () {
	resetBrainState();
	BRAIN.postSynaptic['TEST_EG0'] = [0, 0];
	BRAIN.postSynaptic['TEST_EG1'] = [0, 0];
	// Group 0 has size 0 (virtual), group 1 has size 5
	// All 5 neurons belong to group 1
	BRAIN._bridge._setGroupState(2, 5, new Uint16Array([1, 1, 1, 1, 1]), [0, 5],
		['TEST_EG0', 'TEST_EG1']);

	var fire = new Uint8Array(5);
	fire[0] = 1; fire[1] = 1; // 2 of 5 fire in group 1
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	assertEqual(BRAIN.postSynaptic['TEST_EG0'][BRAIN.nextState], 0,
		'empty group (size=0) produces zero activation');
	// Group 1: (2/(5*1))*100 = 40
	assertClose(BRAIN.postSynaptic['TEST_EG1'][BRAIN.nextState], 40, 0.01,
		'non-empty group computes correctly');
};

var test_bridge_aggregateFireState_decay = function () {
	resetBrainState();
	BRAIN.postSynaptic['TEST_DC0'] = [0, 0];
	// Set previous activation in thisState to 80
	BRAIN.postSynaptic['TEST_DC0'][BRAIN.thisState] = 80;

	BRAIN._bridge._setGroupState(1, 10, new Uint16Array(10), [10], ['TEST_DC0']);

	// No neurons fire → windowActivation = 0
	var fire = new Uint8Array(10);
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	// activation = max(0, 80 * 0.75) = 60
	assertClose(BRAIN.postSynaptic['TEST_DC0'][BRAIN.nextState], 60, 0.01,
		'previous activation decays by 0.75');
};

var test_bridge_aggregateFireState_clears_stale = function () {
	resetBrainState();
	// Setup: 2 groups, 10 neurons each
	var names = ['TEST_ST0', 'TEST_ST1'];
	for (var g = 0; g < 2; g++) {
		BRAIN.postSynaptic[names[g]] = [0, 0];
	}
	var assignments = new Uint16Array(20);
	for (var i = 0; i < 10; i++) assignments[i] = 0;
	for (var i = 10; i < 20; i++) assignments[i] = 1;
	BRAIN._bridge._setGroupState(2, 20, assignments, [10, 10], names);

	// First call: fire all neurons in group 0 via latestFireState fallback
	var fire = new Uint8Array(20);
	for (var i = 0; i < 10; i++) fire[i] = 1;
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS, 0.01,
		'first call: group 0 fully active');

	// Second call: no new worker tick, latestFireState should have been cleared
	// so aggregateFireState should be a no-op (no new data to consume).
	// Copy current activation to thisState to simulate state swap
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState] = 0;
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState] = 0;

	BRAIN._bridge.aggregateFireState();

	// With latestFireState cleared, the fallback branch should NOT run.
	// Both pendingGroupSpikes and pendingWorkerTicks are 0, and latestFireState is null,
	// so groupFires stays all-zero. The only contribution is decay: prevActivation * 0.75.
	// Group 0: max(0, 100 * 0.75) = 75 (decay only, not 100 again from stale snapshot)
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS * 0.75, 0.01,
		'second call without new tick: decays instead of re-reading stale fire state');
	// Group 1: max(0, 0 * 0.75) = 0
	assertEqual(BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState], 0,
		'second call: inactive group stays zero');
};

// --- synthesizeMotorOutputs tests ---

var test_bridge_synthesize_walk_tonic = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		// Idle tonic: moderate descending + central complex activity
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 5;
		BRAIN.postSynaptic['VNC_CPG'][BRAIN.nextState] = 1;
		BRAIN.postSynaptic['CX_PFN'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['CX_FC'][BRAIN.nextState] = 2;
		BRAIN.postSynaptic['CX_EPG'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

	// walkIntent = (3+2+2)*0.3 + 0 + (5+1)*0.2 = 2.1 + 1.2 = 3.3
	// total = 5+1 = 6, baseWalk = 6*0.6 = 3.6
	// walkDrive = 3.6*(1+3.3*0.1) = 3.6*1.33 = 4.788
	// walkL = walkR = 4.788/3 = 1.596 per leg (jitter=0)
	// accumWalkLeft = 1.596*3 = 4.788, same for right
	// total = 9.576
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;
	assertClose(totalWalk, 9.576, 0.1, 'idle tonic walk output');
	assertTrue(totalWalk >= 6 && totalWalk <= 12,
		'walk total in 6-12 range, got ' + totalWalk.toFixed(2));
};

var test_bridge_synthesize_flight_fear = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = 8;
		BRAIN.postSynaptic['MB_MBON_AV'][BRAIN.nextState] = 2;
		BRAIN.postSynaptic['LH_AV'][BRAIN.nextState] = 1;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

	// flightIntent = 8*2 + (2+1)*0.8 + 0 + 0 = 18.4 > 1.0
	// flightDrive = 18.4*0.6*0.7 = 7.728
	// accumFlight = 7.728*2 = 15.456
	assertTrue(BRAIN.accumFlight > 15,
		'flight exceeds gate with high DRIVE_FEAR, got ' + BRAIN.accumFlight.toFixed(2));
};

var test_bridge_synthesize_groom = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.nextState] = 5;
		BRAIN.postSynaptic['SEZ_GROOM'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

	// groomIntent = 5*1.5 + 2*1.0 = 9.5 > 1.0
	// MN_ABDOMEN += 9.5*0.6*0.3 = 1.71
	// accumGroom = abdomen + min(legL1, legR1) = 1.71 + walkL_per_leg
	assertTrue(BRAIN.accumGroom > 1,
		'groom activates with high DRIVE_GROOM, got ' + BRAIN.accumGroom.toFixed(2));
};

var test_bridge_synthesize_early_exit = function () {
	resetBrainState();
	// All postSynaptic values are 0 after reset → desc=0, vcpg=0
	// All intents = 0, descProxy = 0, total = 0 < 0.5 → early return

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();

	assertEqual(BRAIN.accumWalkLeft, 0, 'no walk on early exit');
	assertEqual(BRAIN.accumWalkRight, 0, 'no walk right on early exit');
	assertEqual(BRAIN.accumFlight, 0, 'no flight on early exit');
	assertEqual(BRAIN.accumGroom, 0, 'no groom on early exit');
	assertEqual(BRAIN.accumFeed, 0, 'no feed on early exit');
};

var test_bridge_synthesize_dn_startle = function () {
	resetBrainState();
	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 2;
	BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = 5;

	BRAIN._bridge.synthesizeMotorOutputs();

	// dFear=5 > 3.0 → addPS('DN_STARTLE', 5*0.6 = 3.0)
	assertClose(BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState], 3.0, 0.01,
		'DN_STARTLE written to nextState when dFear > 3.0');
};

var test_bridge_synthesize_feed = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['SEZ_FEED'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

	// feedIntent = 3*1.0 + 2*0.5 = 4.0 > 0.5
	// addPS('MN_PROBOSCIS', 4.0*0.6*0.3 = 0.72)
	// MN_PROBOSCIS total = 2 + 0.72 = 2.72
	// accumFeed = 2.72
	assertClose(BRAIN.accumFeed, 2.72, 0.1,
		'feed intent boosts MN_PROBOSCIS');
};

// --- virtual group bypass tests ---

var test_bridge_virtual_bypass_fear = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		// Minimal bridge state: 1 virtual group (DRIVE_FEAR, size=0)
		BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_FEAR']);
		BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

		// Set drives before workerUpdate
		BRAIN.drives.fear = 0.8;
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.dangerOdor = false;
		BRAIN._isFeeding = false;
		BRAIN._isMoving = false;
		BRAIN._isGrooming = false;

		BRAIN._bridge.workerUpdate();
	});

	// After updateDrives: fear = 0.8 * 0.85 = 0.68 (no touch/wind/danger)
	// Virtual bypass: postSynaptic['DRIVE_FEAR'][nextState] = 0.68 * 100 = 68
	// After state swap: thisState has the value
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.thisState], 0.68 * FSS, 0.5,
		'virtual bypass writes fear drive to postSynaptic');
};

var test_bridge_virtual_bypass_curiosity = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_CURIOSITY']);
		BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

		BRAIN.drives.curiosity = 0.6;
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.dangerOdor = false;
		BRAIN._isMoving = false;
		BRAIN._isFeeding = false;
		BRAIN._isGrooming = false;

		BRAIN._bridge.workerUpdate();
	});

	// After updateDrives with Math.random=0.5: curiosity += (0.5-0.5)*range = 0
	// curiosity stays 0.6
	// Virtual bypass: 0.6 * 100 = 60
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.thisState], 0.6 * FSS, 0.5,
		'virtual bypass writes curiosity drive to postSynaptic');
};

var test_bridge_virtual_bypass_groom = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_GROOM']);
		BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

		BRAIN.drives.groom = 0.5;
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.dangerOdor = false;
		BRAIN._isMoving = false;
		BRAIN._isFeeding = false;
		BRAIN._isGrooming = false;

		BRAIN._bridge.workerUpdate();
	});

	// After updateDrives: groom = 0.5 + 0.008 = 0.508 (no touch, not grooming)
	// Virtual bypass: 0.508 * 100 = 50.8
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.thisState], 0.508 * FSS, 0.5,
		'virtual bypass writes groom drive to postSynaptic');
};

// --- sendStimulation mapping tests ---

var test_bridge_stim_touch_maps_bristle = function () {
	resetBrainState();
	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = null;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var count = 0;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'MECH_BRISTLE') count++;
	}
	assertEqual(count, 1, 'touch without location produces 1 MECH_BRISTLE segment');
};

var test_bridge_stim_touch_head_and_thorax_double = function () {
	resetBrainState();
	BRAIN.stimulate.touch = true;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var locations = ['head', 'thorax', 'cabeza', 'torax'];
	for (var l = 0; l < locations.length; l++) {
		BRAIN.stimulate.touchLocation = locations[l];
		var segs = BRAIN._bridge.collectStimulationSegments();
		var count = 0;
		for (var i = 0; i < segs.length; i++) {
			if (segs[i].name === 'MECH_BRISTLE') count++;
		}
		assertEqual(count, 2, 'touch on ' + locations[l] + ' produces double MECH_BRISTLE');
	}
};

var test_bridge_stim_food_maps_olf = function () {
	resetBrainState();
	BRAIN.stimulate.foodNearby = true;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var found = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'OLF_ORN_FOOD') found = true;
	}
	assertTrue(found, 'foodNearby maps to OLF_ORN_FOOD');
};

var test_bridge_stim_light_maps_vis = function () {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.foodNearby = false;
	BRAIN.stimulate.foodContact = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var hasR1R6 = false;
	var hasR7R8 = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'VIS_R1R6') hasR1R6 = true;
		if (segs[i].name === 'VIS_R7R8') hasR7R8 = true;
	}
	assertTrue(hasR1R6, 'lightLevel>0.2 maps to VIS_R1R6');
	assertTrue(hasR7R8, 'lightLevel>0.2 maps to VIS_R7R8');
};

var test_bridge_stim_temperature_thresholds = function () {
	// Warm: temperature > 0.65 → THERMO_WARM
	resetBrainState();
	BRAIN.stimulate.temperature = 0.8;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var hasWarm = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'THERMO_WARM') hasWarm = true;
	}
	assertTrue(hasWarm, 'temperature>0.65 maps to THERMO_WARM');

	// Cool: temperature < 0.35 → THERMO_COOL
	resetBrainState();
	BRAIN.stimulate.temperature = 0.2;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN._isMoving = false;

	segs = BRAIN._bridge.collectStimulationSegments();
	var hasCool = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'THERMO_COOL') hasCool = true;
	}
	assertTrue(hasCool, 'temperature<0.35 maps to THERMO_COOL');
};

var test_bridge_stim_noci_intensity_and_clear = function () {
	resetBrainState();
	BRAIN.stimulate.nociception = true;

	var segs = BRAIN._bridge.collectOneShotSegments();

	// Find NOCI segment
	var nociSeg = null;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'NOCI') { nociSeg = segs[i]; break; }
	}
	assertTrue(nociSeg !== null, 'nociception maps to NOCI one-shot segment');
	var SI = BRAIN._bridge.STIM_INTENSITY;
	assertClose(nociSeg.intensity, SI * 5, 0.001, 'NOCI intensity is 5x STIM_INTENSITY');
	assertEqual(BRAIN.stimulate.nociception, false, 'nociception auto-clears after collection');
};

var test_bridge_stim_noci_not_in_sustained = function () {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();

	for (var i = 0; i < segs.length; i++) {
		assertTrue(segs[i].name !== 'NOCI',
			'NOCI must not appear in sustained segments (found at index ' + i + ')');
	}
	// nociception flag should NOT be cleared by collectStimulationSegments
	// (it is only cleared by collectOneShotSegments)
	assertTrue(BRAIN.stimulate.nociception === true,
		'collectStimulationSegments does not clear nociception flag');
};

var test_bridge_stim_tonic_background = function () {
	resetBrainState();
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();

	// Tonic CX groups are always present
	var hasCxFc = false, hasCxEpg = false, hasCxPfn = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'CX_FC') hasCxFc = true;
		if (segs[i].name === 'CX_EPG') hasCxEpg = true;
		if (segs[i].name === 'CX_PFN') hasCxPfn = true;
	}
	assertTrue(hasCxFc, 'tonic CX_FC always present');
	assertTrue(hasCxEpg, 'tonic CX_EPG always present');
	assertTrue(hasCxPfn, 'tonic CX_PFN always present');
	// In dark (lightLevel=0), tonic intensity = 0.03
	var tonicSeg = null;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'CX_FC') { tonicSeg = segs[i]; break; }
	}
	assertClose(tonicSeg.intensity, 0.03, 0.001,
		'tonic intensity is 0.03 in dark');
};

// --- buildGroupIndices test ---

var test_bridge_buildGroupIndices = function () {
	resetBrainState();
	// 6 neurons: 0→g0, 1→g1, 2→g0, 3→g2, 4→g1, 5→g0
	var assignments = new Uint16Array([0, 1, 0, 2, 1, 0]);
	BRAIN._bridge._setGroupState(3, 6, assignments, [3, 2, 1], ['GA', 'GB', 'GC']);
	BRAIN._bridge.buildGroupIndices();

	var gi = BRAIN._bridge._getGroupIndices();
	// Group 0: neurons 0, 2, 5
	assertEqual(gi[0].length, 3, 'group 0 has 3 neurons');
	assertTrue(gi[0][0] === 0 && gi[0][1] === 2 && gi[0][2] === 5,
		'group 0 indices are [0, 2, 5]');
	// Group 1: neurons 1, 4
	assertEqual(gi[1].length, 2, 'group 1 has 2 neurons');
	assertTrue(gi[1][0] === 1 && gi[1][1] === 4,
		'group 1 indices are [1, 4]');
	// Group 2: neuron 3
	assertEqual(gi[2].length, 1, 'group 2 has 1 neuron');
	assertEqual(gi[2][0], 3, 'group 2 index is 3');
};

var test_bridge_workerUpdate_drives_throttled = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_FEAR']);
		// No fire state — guard will be false
		BRAIN.drives.fear = 0.5;
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.dangerOdor = false;
		BRAIN._isFeeding = false;
		BRAIN._isMoving = false;
		BRAIN._isGrooming = false;

		// Call workerUpdate with guard false (no latestFireState, no pendingWorkerTicks)
		BRAIN._bridge.workerUpdate();

		// Drives should NOT have been updated (guard was false)
		assertClose(BRAIN.drives.fear, 0.5, 0.001,
			'drives not updated when no worker ticks pending');

		// Now simulate a worker tick arriving
		BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

		// Call workerUpdate again — guard true, should batch-update drives for 2 frames
		BRAIN._bridge.workerUpdate();
	});

	// updateDrives called twice (1 pending + 1 current): fear = 0.5 * 0.85^2
	assertClose(BRAIN.drives.fear, 0.5 * 0.85 * 0.85, 0.01,
		'drives batch-updated for accumulated frames when guard becomes true');
};

} // end bridge tests guard

// ============================================================
// Section: Neuro-renderer smoke tests (D68.3)
// ============================================================

if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer._test) {

var test_neuro_resize_width_only_triggers_rebuild = function () {
    // Checklist item 1: width-only resize must trigger relayout
    var nr = NeuroRenderer._test;
    // Same height, different width (delta >= 2) => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 850, 140),
        'width-only change (800->850) triggers resize');
    // Same height, same width => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 800, 140),
        'no change does not trigger resize');
    // Same height, tiny width change (delta < 2) => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 801, 140),
        'sub-threshold width change (1px) does not trigger resize');
    // Height change, same width => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 800, 160),
        'height-only change triggers resize');
};

var test_neuro_resize_with_displayScale = function () {
    // When displayScale != 1, oldDisplayW = canvas.width * displayScale
    var nr = NeuroRenderer._test;
    // canvas.width=600, displayScale=1.5 => oldDisplayW=900
    // newW=900 => no resize needed
    assertTrue(!nr.needsResize(600, 140, 1.5, 900, 140),
        'displayScale-adjusted width matches => no resize');
    // newW=920 => delta=20 >= 2 => resize needed
    assertTrue(nr.needsResize(600, 140, 1.5, 920, 140),
        'displayScale-adjusted width mismatch => resize');
};

var test_neuro_cssToCanvasCoords_stretch = function () {
    // Checklist item 2: tooltip hover coords convert correctly with CSS stretch
    var nr = NeuroRenderer._test;
    // Canvas is 600px wide internally, CSS-stretched to 900px (rect.width=900)
    // Click at CSS x=450 (center of stretched canvas) should map to canvas x=300
    var coords = nr.cssToCanvasCoords(450, 70, 0, 0, 900, 140, 600, 140, 0);
    assertClose(coords.x, 300, 0.01, 'CSS center maps to canvas center with stretch');
    assertClose(coords.y, 70, 0.01, 'Y unchanged when no vertical stretch');
};

var test_neuro_cssToCanvasCoords_with_scroll = function () {
    var nr = NeuroRenderer._test;
    // scrollLeft=50, click at CSS x=100, rect.left=0, rect.width=800, canvas.width=800
    var coords = nr.cssToCanvasCoords(100, 50, 0, 0, 800, 140, 800, 140, 50);
    assertClose(coords.x, 150, 0.01, 'scrollLeft offset added to canvasX');
};

var test_neuro_cssToCanvasCoords_with_rect_offset = function () {
    var nr = NeuroRenderer._test;
    // Panel starts at x=200 in viewport. Click at clientX=300 => local x=100
    var coords = nr.cssToCanvasCoords(300, 80, 200, 10, 600, 140, 600, 140, 0);
    assertClose(coords.x, 100, 0.01, 'rect.left offset subtracted');
    assertClose(coords.y, 70, 0.01, 'rect.top offset subtracted');
};

var test_neuro_layout_small_sections_get_min_width = function () {
    // Checklist item 4: DRIVES/MOTOR render as visible grids, not 1px slivers
    var nr = NeuroRenderer._test;
    // Simulate: Sensory=100000, Central=35000, Drives=80, Motor=76
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);

    // Drives (index 2) and Motor (index 3) must have sectionW >= MIN_SECTION_W
    assertTrue(layout.sections[2].sectionW >= nr.MIN_SECTION_W,
        'Drives section width >= MIN_SECTION_W (' + layout.sections[2].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');
    assertTrue(layout.sections[3].sectionW >= nr.MIN_SECTION_W,
        'Motor section width >= MIN_SECTION_W (' + layout.sections[3].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');

    // Small sections must have enlarged point sizes (> base POINT_SIZE)
    assertTrue(layout.sections[2].pointSize > nr.POINT_SIZE,
        'Drives gets enlarged pointSize (' + layout.sections[2].pointSize + ' > ' + nr.POINT_SIZE + ')');
    assertTrue(layout.sections[3].pointSize > nr.POINT_SIZE,
        'Motor gets enlarged pointSize (' + layout.sections[3].pointSize + ' > ' + nr.POINT_SIZE + ')');
};

var test_neuro_layout_empty_section_zero_width = function () {
    var nr = NeuroRenderer._test;
    // Section with 0 neurons should have zero width
    var layout = nr.computeSectionLayout([100, 0, 50, 30], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertEqual(layout.sections[1].sectionW, 0, 'empty section has zero width');
    assertEqual(layout.sections[1].neuronCount, 0, 'empty section neuronCount is 0');
};

var test_neuro_layout_displayScale_shrinks_to_fit = function () {
    // Checklist item 6: Motor not clipped -- canvas shrinks via displayScale < 1
    var nr = NeuroRenderer._test;
    // With very large neuron counts, canvasWidth may exceed containerW
    // displayScale = containerW / canvasWidth < 1 means CSS shrinks canvas to fit
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 400, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    // With 135K+ neurons at POINT_SIZE=1 in 400px container, canvas will be wider than 400
    if (layout.canvasWidth > 400) {
        assertTrue(layout.displayScale < 1.0,
            'displayScale < 1 when canvas exceeds container (' + layout.displayScale + ')');
    }
    // All 4 sections must have valid bounds (Motor is last, must not be clipped)
    assertTrue(layout.sections[3].x1 <= layout.canvasWidth,
        'Motor section x1 fits within canvasWidth');
};

var test_neuro_label_maxwidths_prevent_overlap = function () {
    // Checklist item 3: labels truncate with ellipsis (max-width prevents overflow)
    var nr = NeuroRenderer._test;
    // Create mock sectionBounds with known positions
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 216, x1: 400, neuronIndices: [2], neuronCount: 1},
        {x0: 416, x1: 476, neuronIndices: [3], neuronCount: 1},
        {x0: 492, x1: 552, neuronIndices: [4], neuronCount: 1}
    ];
    var dScale = 1.0;
    var widths = nr.computeLabelMaxWidths(bounds, dScale);

    // 4 visible sections => 4 entries
    assertEqual(widths.length, 4, 'all 4 sections get label width entries');

    // First label: maxWidth = next.x0 * dScale - this.x0 * dScale - 4
    // = 216 - 0 - 4 = 212
    assertClose(widths[0].maxWidth, 212, 0.01, 'first label maxWidth capped before second section');

    // Third label (Drives at x0=416): maxWidth = 492 - 416 - 4 = 72
    assertClose(widths[2].maxWidth, 72, 0.01, 'narrow section label maxWidth prevents overflow');

    // Last label (Motor): maxWidth = -1 (uncapped)
    assertEqual(widths[3].maxWidth, -1, 'last label has no maxWidth cap');
};

var test_neuro_label_maxwidths_with_displayScale = function () {
    var nr = NeuroRenderer._test;
    // displayScale=0.5 means CSS positions are halved
    var bounds = [
        {x0: 0, x1: 400, neuronIndices: [1], neuronCount: 1},
        {x0: 416, x1: 800, neuronIndices: [2], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 0.5);
    // First label: leftPx = 0*0.5 = 0, nextLeft = 416*0.5 = 208, maxWidth = max(20, 208-0-4) = 204
    assertClose(widths[0].maxWidth, 204, 0.01, 'displayScale applied to label maxWidth calc');
};

var test_neuro_label_skip_empty_sections = function () {
    var nr = NeuroRenderer._test;
    // Section 1 is empty (0 neurons)
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 200, x1: 200, neuronIndices: [], neuronCount: 0},
        {x0: 216, x1: 400, neuronIndices: [3], neuronCount: 1},
        {x0: 416, x1: 500, neuronIndices: [4], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 1.0);
    // Only 3 visible sections (indices 0, 2, 3)
    assertEqual(widths.length, 3, 'empty section skipped in label widths');
    assertEqual(widths[0].region, 0, 'first visible is region 0');
    assertEqual(widths[1].region, 2, 'second visible is region 2');
    assertEqual(widths[2].region, 3, 'third visible is region 3');
};

var test_neuro_layout_point_size_capped_at_max = function () {
    var nr = NeuroRenderer._test;
    // Very few neurons (e.g. 2) in a section -- pointSize should not exceed MAX_SMALL_PS
    var layout = nr.computeSectionLayout([1000, 500, 2, 3], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertTrue(layout.sections[2].pointSize <= nr.MAX_SMALL_PS,
        'Drives pointSize capped at MAX_SMALL_PS (' + layout.sections[2].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
    assertTrue(layout.sections[3].pointSize <= nr.MAX_SMALL_PS,
        'Motor pointSize capped at MAX_SMALL_PS (' + layout.sections[3].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
};

} // end neuro-renderer tests guard
