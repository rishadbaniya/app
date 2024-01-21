import {autorun, action} from "web-vcore/nm/mobx.js";
import {GetPlayingTimeline, GetMapState} from "Store/main/maps/mapStates/$mapState.js";
import {GetOpenMapID} from "Store/main";
import {ACTNodeExpandedSet, GetNodeViewsAlongPath} from "Store/main/maps/mapViews/$mapView.js";
import {store} from "Store";
import {MapUI, ACTUpdateAnchorNodeAndViewOffset} from "UI/@Shared/Maps/MapUI.js";
import {SleepAsync, Vector2, VRect} from "web-vcore/nm/js-vextensions.js";
import {NodeBox} from "UI/@Shared/Maps/Node/NodeBox.js";
import {GetDOM} from "web-vcore/nm/react-vextensions.js";
import {GetViewportRect, RunWithRenderingBatched} from "web-vcore";
import {SlicePath, GetAsync, RunInAction} from "web-vcore/nm/mobx-graphlink.js";
import {GetTimelineStep, GetVisiblePathsAfterSteps, TimelineStep, GetTimelineSteps, GetPathsWith1PlusFocusLevelAfterSteps, ToPathNodes, GetTimelineStepTimesFromStart, GetNodeEffects} from "dm_common";
import {RunWithRenderingBatchedAndBailsCaught} from "Utils/UI/General";

/*function AreSetsEqual(setA, setB) {
	return setA.size === setB.size && [...setA].every((value) => setB.has(value));
}*/

let playingTimeline_lastStep: number|n;
autorun(()=>{
	// const playingTimeline_currentStep = GetPlayingTimelineStep(mapID);
	const mapID = GetOpenMapID();
	const mapState = GetMapState(mapID);
	if (mapID == null || mapState == null) return;
	const {playingTimeline_step} = mapState;
	if (playingTimeline_step != playingTimeline_lastStep) {
		playingTimeline_lastStep = playingTimeline_step;
		if (playingTimeline_step != null) {
			ApplyNodeEffectsForTimelineStepsUpToX(mapID, playingTimeline_step);
		}
	}
}, {name: "TimelineStepEffectApplier"});

// todo: rework this to just calculate all effects from timeline start, for last-applied-step and new-current-step, then compare the difference to know what to "apply right now"
async function ApplyNodeEffectsForTimelineStepsUpToX(mapID: string, stepIndex: number) {
	// since this GetAsync call may take a moment to complete, we need to make sure it returns the same data regardless of if the "current step" changes in the meantime
	// (todo: make this a non-issue by finding a way to have such a delayed GetAsync call simply "canceled" if another call to ApplyNodeEffectsForTimelineStepsUpToX happens during that time)
	const {stepsUpToTarget, targetSteps, newlyRevealedNodePaths, focusNodes} = await GetAsync(()=>{
		//const playingTimeline_currentStep = GetPlayingTimelineStep(mapID);
		const timeline = GetPlayingTimeline(mapID);
		if (timeline == null) return {stepsUpToTarget: null, targetSteps: [], newlyRevealedNodePaths: [], focusNodes: []};
		const steps = GetTimelineSteps(timeline.id);
		const stepTimes = GetTimelineStepTimesFromStart(steps);
		const stepsUpToTarget_ = steps.slice(0, stepIndex + 1);
		//const targetSteps_last = steps[stepIndex];
		const targetSteps_ = steps.filter((a, i)=>stepTimes[i] == stepTimes[stepIndex]); // we need to do this, since multiple steps get "applied" at the same time (ie. with the same timeFromStart)
		const newlyRevealedNodePaths_ = GetVisiblePathsAfterSteps(targetSteps_);
		const focusNodes_ = GetPathsWith1PlusFocusLevelAfterSteps(stepsUpToTarget_);
		return {stepsUpToTarget: stepsUpToTarget_, targetSteps: targetSteps_, newlyRevealedNodePaths: newlyRevealedNodePaths_, focusNodes: focusNodes_};
	});
	if (stepsUpToTarget == null || targetSteps.length == 0) return;

	// apply the store changes all in one batch (so that any dependent UI components only have to re-render once)
	RunWithRenderingBatched(()=>{
		RunInAction(`ApplyNodeEffectsForTimelineStepsUpToX.forStepIndex:${stepIndex}`, ()=>{
			// for the just-reached steps, apply the expansion part required its node "show" effects (the actual showing/hiding of node-ui is handled within NodeUI.tsx)
			//console.log(`@Step(${step.id}) @NewlyRevealedNodes(${newlyRevealedNodes})`);
			if (newlyRevealedNodePaths.length) {
				ExpandToNodes(mapID, newlyRevealedNodePaths);
				// commented; for first project, we want the full-fledged automatic scroll-and-zoom system working, but...
				// todo: make this configurable for the timeline creator and/or visitor (options: manual expand + zoom + scroll, auto expand + scroll-to-new, or auto expand + zoom + scroll to all focus-nodes)
				//FocusOnNodes(mapID, newlyRevealedNodePaths);
			}

			// for the just-reached steps, apply node expand/collapse effects
			for (const nodeEffect of targetSteps.SelectMany(a=>GetNodeEffects(a))) {
				if (nodeEffect.setExpandedTo != null) {
					ACTNodeExpandedSet({mapID, path: nodeEffect.path, expanded: nodeEffect.setExpandedTo});
				}
			}
		});
	});

	// filter out focus-nodes that aren't actually valid atm (else FocusOnNodes func will wait for ~3s for them to become visible, which is not what we want)
	// commented for now; since arg-nodes still show their premises even if "not expanded", for this to work, we'd need to check node-types along way -- which is overly complex/fragile atm
	/*const focusNodes_valid = focusNodes.filter(path=>{
		const pathNodes = ToPathNodes(path);
		const nodeViews = GetNodeViewsAlongPath(mapID, path);
		if (nodeViews.length < pathNodes.length || nodeViews.Any(a=>a?.expanded == false)) return false;
		return true;
	});*/

	// for all steps reached so far, apply scrolling and zooming such that the current list of focus-nodes are all visible (just sufficiently so)
	// if layout-helper-map is enabled, node-focusing happens in a more precise way, in TimelineEffectApplier_Smooth.tsx
	if (!store.main.timelines.layoutHelperMap_load) {
		FocusOnNodes(mapID, focusNodes);
	}
}

function ExpandToNodes(mapID: string, paths: string[]) {
	for (const path of paths) {
		const parentPath = SlicePath(path, 1);
		if (parentPath == null) continue;
		ACTNodeExpandedSet({mapID, path: parentPath, expanded: true, expandAncestors: true});
	}
}

async function FocusOnNodes(mapID: string, paths: string[]) {
	let mapUI: MapUI|n;
	for (let i = 0; i < 30 && mapUI == null; i++) {
		if (i > 0) await SleepAsync(100);
		mapUI = MapUI.CurrentMapUI;
	}
	if (mapUI == null) {
		console.log("Failed to find MapUI to apply scroll to.");
		return;
	}

	let nodeBoxes: NodeBox[] = [];
	for (let i = 0; i < 30 && nodeBoxes.length < paths.length; i++) {
		if (i > 0) await SleepAsync(100);
		nodeBoxes = paths.map(path=>mapUI!.FindNodeBox(path)).filter(nodeBox=>{
			if (nodeBox == null) return false;
			const dom = GetDOM(nodeBox);
			if (dom == null) return false;
			if (dom.parentElement!.style.opacity == "0" || dom.parentElement!.style.left == "") return false;
			return true;
		}) as NodeBox[];
	}
	if (nodeBoxes.length == 0) {
		console.log("Failed to find any of the NodeBoxes to apply scroll to. Paths:", paths);
		return;
	}

	let focusNodeRectsMerged: VRect|n;
	for (const box of nodeBoxes) {
		const boxDom = GetDOM(box);
		if (boxDom == null) continue;
		// const boxPos = GetViewportRect(GetDOM(box)).Center.Minus(GetViewportRect(mapUI.mapUIEl).Position);
		const boxRect = GetViewportRect(boxDom).NewPosition(a=>a.Minus(GetViewportRect(mapUI!.mapUIEl!).Position));
		focusNodeRectsMerged = focusNodeRectsMerged ? focusNodeRectsMerged.Encapsulating(boxRect) : boxRect;
	}
	if (focusNodeRectsMerged == null) return;

	const mapState = GetMapState.NN(mapID);
	const nodeBoxesMerged_sizeWhenUnscaled = focusNodeRectsMerged.Size.DividedBy(mapState.zoomLevel);

	const viewportEl = mapUI.mapUIEl!.parentElement!.parentElement!;
	const viewportSize = new Vector2(viewportEl.clientWidth, viewportEl.clientHeight);
	// apply just enough zoom-out to be able to fit all of the focus-nodes within the viewport
	const zoomRequired = Math.min(viewportSize.x / nodeBoxesMerged_sizeWhenUnscaled.x, viewportSize.y / nodeBoxesMerged_sizeWhenUnscaled.y);
	const newZoom = (zoomRequired * .9).FloorTo(.1).KeepBetween(.1, 1);
	if (newZoom.Distance(mapState.zoomLevel) > .01) {
		RunInAction("FocusOnNodes.zoomOut", ()=>mapState.zoomLevel = newZoom);
		// re-call this function, since we need to recalc // edit: Actually, is this even necessary? I don't think it should be... (well, the ACTUpdateAnchorNodeAndViewOffset call might need the delay)
		setTimeout(()=>FocusOnNodes(mapID, paths), 100);
		return;
	}

	/* const nodeBoxPositionAverage = nodeBoxPositionSum.Times(1 / paths.length);
	// mapUI.ScrollToPosition(new Vector2((nodeBoxPositionAverage.x - 100).KeepAtLeast(0), nodeBoxPositionAverage.y));
	mapUI.ScrollToPosition_Center(nodeBoxPositionAverage.Plus(-250, 0)); */
	//mapUI.ScrollToMakeRectVisible(nodeBoxesMerged, 100);
	mapUI.ScrollToPosition_Center(focusNodeRectsMerged.Center);
	ACTUpdateAnchorNodeAndViewOffset(mapID);
}