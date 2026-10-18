// ============================================================
// Shared Pure Functions and Constants
// Used by both main.js (browser) and tests.js (test runner).
// Loaded after connectome.js, before main.js.
// Functions reference globals (BRAIN, behavior, food, fly)
// which are defined by the consumer (main.js or tests.js).
// ============================================================

// Normalize angle to [-PI, PI] range
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}

/**
 * Advance the fly's heading toward a target without exceeding a physical
 * angular rate. `dtScale` is measured in 60 Hz frames, so the cap is stable
 * across fast and slow displays while the retention factor keeps small turns
 * gently eased.
 */
function computeHeadingStep(currentDir, targetDir, turnRetention, maxTurnRate, dtScale) {
	currentDir = Number(currentDir);
	targetDir = Number(targetDir);
	turnRetention = Number(turnRetention);
	maxTurnRate = Number(maxTurnRate);
	dtScale = Number(dtScale);
	if (!isFinite(currentDir) || !isFinite(targetDir)) return 0;
	if (!isFinite(turnRetention)) turnRetention = 0.9;
	if (!isFinite(maxTurnRate) || maxTurnRate < 0) maxTurnRate = 2.4;
	if (!isFinite(dtScale) || dtScale < 0) dtScale = 1;

	turnRetention = Math.max(0, Math.min(1, turnRetention));
	var angleDiff = normalizeAngle(targetDir - currentDir);
	var easedStep = angleDiff * (1 - Math.pow(turnRetention, dtScale));
	var maxStep = maxTurnRate * dtScale / 60;
	return Math.max(-maxStep, Math.min(maxStep, easedStep));
}

// Accumulator thresholds for entering each behavior state
var BEHAVIOR_THRESHOLDS = {
	startle: 30,
	fly: 15,
	feed: 8,
	groom: 8,
	walk: 5,
	restFatigue: 0.7,
	exploreCuriosity: 0.4,
	phototaxisLight: 0.5,
};

/**
 * Returns true if the given behavior state is in its cooldown period.
 * Requires global `behavior` object with a `cooldowns` map.
 */
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}

/**
 * Returns true if any food item is within 50px of the fly.
 * Requires globals `food` (array) and `fly` (object with x, y).
 */
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
}

/**
 * Evaluates accumulator outputs and drives to determine which behavior
 * state should be active. Returns the state name string.
 * Priority order (highest first): startle, fly, feed, groom, brace, rest, phototaxis, explore, walk, idle.
 * Requires globals `BRAIN`, `behavior`, `food`, `fly`.
 */
function evaluateBehaviorEntry() {
	var now = Date.now();
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;

	if (BRAIN.accumStartle > BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('startle', now)) {
		return 'startle';
	}
	if (BRAIN.accumFlight > BEHAVIOR_THRESHOLDS.fly && !isCoolingDown('fly', now)) {
		return 'fly';
	}
	var feedReady = BRAIN.accumFeed > BEHAVIOR_THRESHOLDS.feed ||
		(BRAIN.drives.hunger > 0.7 && BRAIN.stimulate.foodNearby);
	if (feedReady && hasNearbyFood() && !isCoolingDown('feed', now)) {
		return 'feed';
	}
	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
		return 'groom';
	}
	if (BRAIN.stimulate.wind && BRAIN.stimulate.windStrength < 0.5 &&
		BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('brace', now)) {
		return 'brace';
	}
	var restThreshold = BRAIN.stimulate.lightLevel === 0 ? 0.4 : BEHAVIOR_THRESHOLDS.restFatigue;
	if (BRAIN.drives.fatigue > restThreshold) {
		return 'rest';
	}
	if (BRAIN.stimulate.lightLevel > BEHAVIOR_THRESHOLDS.phototaxisLight &&
		BRAIN.drives.curiosity > 0.2 && totalWalk > 3) {
		return 'phototaxis';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk &&
		BRAIN.drives.curiosity > BEHAVIOR_THRESHOLDS.exploreCuriosity) {
		return 'explore';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk) {
		return 'walk';
	}
	return 'idle';
}

// ============================================================
// Extracted Pure Functions for Testing (D68.2)
// These mirror inline logic from main.js and sim-worker.js
// so it can be exercised without DOM/Worker dependencies.
// ============================================================

var FEED_APPROACH_SPEED = 0.25;

// Ignore tiny left/right motor imbalances from stochastic worker output; these
// are gait noise, not a sustained steering command that should make the fly circle.
var MOTOR_TURN_DEADZONE = 0.08;
var MOTOR_TURN_MAX_OFFSET = 0.12;
function computeMotorTurnOffset(leftOutput, rightOutput) {
	var left = Math.max(0, Number(leftOutput) || 0);
	var right = Math.max(0, Number(rightOutput) || 0);
	var total = left + right;
	if (total < 1) return 0;
	var imbalance = (left - right) / total;
	if (Math.abs(imbalance) <= MOTOR_TURN_DEADZONE) return 0;
	return Math.max(-MOTOR_TURN_MAX_OFFSET,
		Math.min(MOTOR_TURN_MAX_OFFSET, imbalance * 0.24));
}

/**
 * Pure food-seeking steering with a bounded per-tick turn and rear-target
 * hysteresis. Returns targetDir, seekStrength, turn, and angleDiff.
 */
var FOOD_SEEK_MAX_TURN = 0.75;
function computeFoodSeekDir(flyX, flyY, foodX, foodY, hunger, facingDirVal, previousTurnSign) {
	var foodAngle = Math.atan2(-(foodY - flyY), foodX - flyX);
	var seekStrength = Math.min(1, hunger);
	var angleDiffToFood = normalizeAngle(foodAngle - facingDirVal);
	var desiredTurn = angleDiffToFood * seekStrength;
	var turnSign = 0;
	var rearTarget = Math.abs(angleDiffToFood) > Math.PI - 0.25;
	if ((previousTurnSign === -1 || previousTurnSign === 1) &&
		Math.abs(angleDiffToFood) > Math.PI - 0.55) {
		// Keep the chosen side while the target crosses the directly-behind seam.
		turnSign = previousTurnSign;
	} else if (rearTarget) {
		turnSign = angleDiffToFood < 0 ? -1 : 1;
	}
	var turnMagnitude = Math.min(FOOD_SEEK_MAX_TURN, Math.abs(desiredTurn));
	var turn = turnSign ? turnSign * turnMagnitude :
		Math.max(-FOOD_SEEK_MAX_TURN, Math.min(FOOD_SEEK_MAX_TURN, desiredTurn));
	return {
		targetDir: facingDirVal + turn,
		seekStrength: seekStrength,
		turn: turn,
		angleDiff: angleDiffToFood,
		turnSign: turnSign
	};
}

/**
 * Pure extraction of food consumption progress (main.js ~lines 1760-1761).
 * Returns progress value clamped to [0, 1].
 */
function computeFoodProgress(foodItem, now) {
	var elapsed = now - foodItem.feedStart;
	var progress = Math.min(1, (foodItem.eaten || 0) + elapsed / foodItem.feedDuration);
	return progress;
}

/**
 * Pure extraction of pause-feeding logic (main.js ~lines 1773-1776).
 * Mutates foodItem in place: accumulates eaten progress and resets feedStart to 0.
 */
function pauseFeeding(foodItem, now) {
	if (foodItem.feedStart === 0) return;
	var ate = now - foodItem.feedStart;
	foodItem.eaten = Math.min(1, (foodItem.eaten || 0) + ate / foodItem.feedDuration);
	foodItem.feedStart = 0;
}
