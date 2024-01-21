import {CreateAccessor} from "web-vcore/nm/mobx-graphlink";
import {emptyArray} from "web-vcore/.yalc/js-vextensions";
import {TimelineStep} from "./@TimelineStep.js";
import {GetTimelineStepTimesFromStart} from "../timelineSteps.js";

export class TimelineStepEffect {
	constructor(data?: Partial<TimelineStepEffect>) { Object.assign(this, data); }
	/** Time that effect takes place, as seconds since start of step. */
	time_relative = 0;

	nodeEffect?: NodeEffect;
	setTimeTrackerState?: boolean;
}

export function IsStepEffectEmpty(stepEffect: TimelineStepEffect) {
	return IsNodeEffectEmpty(stepEffect.nodeEffect) && stepEffect.setTimeTrackerState == null;
}

export class NodeEffect {
	constructor(data?: RequiredBy<Partial<NodeEffect>, "path">) {
		Object.assign(this, data);
	}

	path: string;

	show?: boolean|n;
	show_revealDepth?: number|n;
	changeFocusLevelTo?: number|n;
	setExpandedTo?: boolean|n;
	hide?: boolean|n;
	//hide_delay?: number|n;
}

export function IsNodeEffectEmpty(nodeEffect: NodeEffect|n) {
	if (nodeEffect == null) return true;
	return nodeEffect.show == null && nodeEffect.changeFocusLevelTo == null && nodeEffect.setExpandedTo == null && nodeEffect.hide == null;
}

// after accessor-based processing (see GetTimelineStepEffectsResolved accessor)
export class TimelineStepEffect_Resolved extends TimelineStepEffect {
	constructor(baseEffect: TimelineStepEffect, stepTime: number) {
		super(baseEffect);
		this.time_absolute = stepTime + this.time_relative;
	}
	time_absolute: number;
}

export const GetTimelineStepEffectsResolved = CreateAccessor((steps: TimelineStep[])=>{
	const stepTimes = GetTimelineStepTimesFromStart(steps);

	const allEffects_resolved = [] as TimelineStepEffect_Resolved[];
	for (const [index, step] of steps.entries()) {
		const stepTime = stepTimes[index];
		const stepTime_safe = stepTime ?? 0;
		for (const effect of step.extras?.effects ?? []) {
			const effect_resolved = new TimelineStepEffect_Resolved(effect, stepTime_safe);
			allEffects_resolved.push(effect_resolved);
		}
	}
	return allEffects_resolved.OrderBy(a=>a.time_absolute);
});