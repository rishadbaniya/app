import {GetMap, GetTimelineStepTimesFromStart, GetTimelineSteps, GetTimelineStepsReachedByTimeX, GetVisiblePathsAfterSteps, NodeType, TimelineStep} from "dm_common";
import {useMemo} from "react";
import {Graph, KeyframeInfo} from "tree-grapher";
import {GetMapState, GetPlayingTimeline, GetPlayingTimelineAppliedStepIndex, GetPlayingTimelineRevealNodes_All} from "Store/main/maps/mapStates/$mapState";
import {GetOpenMapID} from "Store/main";
import {GetPercentFromXToY} from "js-vextensions";
import {CatchBail, CreateAccessor} from "web-vcore/.yalc/mobx-graphlink";
import {comparer} from "web-vcore/nm/mobx";
import {ARG_MAX_WIDTH_FOR_IT_AND_ARG_BAR_TO_FIT_BEFORE_PREMISE_TOOLBAR, ARG_MAX_WIDTH_FOR_IT_TO_FIT_BEFORE_PREMISE_TOOLBAR, TOOLBAR_HEIGHT} from "./Node/NodeLayoutConstants";

export class NodeDataForTreeGrapher {
	constructor(data?: Partial<NodeDataForTreeGrapher>) {
		Object.assign(this, data);
	}
	nodePath?: string;
	nodeType?: NodeType;
	width?: number;
	expanded?: boolean;
	aboveToolbar_visible?: boolean;
	aboveToolbar_hasLeftButton?: boolean;
}

const animation_transitionPeriod = .5;
export const GetPercentThroughTransition = (lastKeyframe_time: number, nextKeyframe_time: number, currentTime: number|n)=>{
	if (currentTime == null) return 0;
	return GetPercentFromXToY(lastKeyframe_time.KeepAtLeast(nextKeyframe_time - animation_transitionPeriod), nextKeyframe_time, currentTime);
};

export const RevealPathsIncludesNode = (revealPaths: string[], nodePath: string)=>{
	//return revealPaths.includes(nodePath);
	// use startsWith, since some node-reveals are for descendents (ie. without explicitly listing in-between nodes, yet those in-betweens do get shown)
	return revealPaths.Any(a=>a.startsWith(nodePath));
};

export const GetTimelineApplyEssentials = CreateAccessor({cache_comparer: comparer.shallow}, (mapID: string|n)=>{
	if (mapID == null) return null;
	const map = GetMap(mapID);
	if (map == null) return null;
	const mapState = GetMapState(mapID);
	if (mapState == null) return null;
	const timeline = GetPlayingTimeline(mapID);
	if (timeline == null) return null;
	const steps = GetTimelineSteps(timeline.id);
	if (steps.length == 0) return null;
	const currentTime = mapState.playingTimeline_time ?? 0;

	const stepTimes = GetTimelineStepTimesFromStart(steps);
	const stepsReached = GetTimelineStepsReachedByTimeX(timeline.id, currentTime);
	const currentStep_time: number|n = stepTimes[stepsReached.length - 1];
	const nextStep_time: number|n = stepTimes[stepsReached.length];
	const stepsReachedAtNext = stepsReached.concat(steps[stepsReached.length]);

	return {
		mapID, map, mapState, timeline, steps,
		//currentTime, // exclude current-time field; this is because we don't know how precisely the caller needs to know this, so we don't want the cache being unnecessarily invalidated all the time
		stepTimes, currentStep_time, nextStep_time, stepsReached, stepsReachedAtNext,
	};
});

export function useGraph(forLayoutHelper: boolean, layoutHelperGraph: Graph|null) {
	const graphInfo = useMemo(()=>{
		const getGroupStablePath = group=>group.leftColumn_userData?.["nodePath"];
		const mainGraph_getNextKeyframeInfo_base = (): KeyframeInfo|null=>{
			const data = GetTimelineApplyEssentials(GetOpenMapID());
			if (data == null) return null;
			const {map, mapState, currentStep_time, nextStep_time, stepsReachedAtNext} = data;
			const currentTime = mapState.playingTimeline_time ?? 0;

			//const finalKeyframe_time = stepTimes.Last();
			const nodePathsVisibleAtNextKeyframe = [map.rootNode].concat(GetVisiblePathsAfterSteps(stepsReachedAtNext));
			const layout = layoutHelperGraph!.GetLayout(undefined, group=>RevealPathsIncludesNode(nodePathsVisibleAtNextKeyframe, group.leftColumn_userData?.["nodePath"] as string))!;
			const percentThroughTransition = GetPercentThroughTransition(currentStep_time, nextStep_time, currentTime);
			return {layout, percentThroughTransition};
		};
		const mainGraph_getNextKeyframeInfo = ()=>CatchBail(null, mainGraph_getNextKeyframeInfo_base);

		const graph = new Graph({
			//uiDebugKit: {FlashComp},
			layoutOpts: {
				nodeSpacing: (nodeA, nodeB)=>{
					const nodeAParentPath = nodeA.data.path_parts.slice(0, -1).join("/");
					const nodeBParentPath = nodeB.data.path_parts.slice(0, -1).join("/");
					const nodeAData = nodeA.data.leftColumn_userData as NodeDataForTreeGrapher;
					const nodeBData = nodeB.data.leftColumn_userData as NodeDataForTreeGrapher;

					// if we have parent-argument's arg-control-bar above, and premise of that arg below, use regular spacing
					// (this logic breaks/causes-overlap if arg+premise1 have 4+ toolbar-buttons among them, but this is rare/unlikely enough to ignore for now)
					if (nodeAParentPath == nodeBParentPath && nodeAData.nodeType == null && nodeBData.nodeType == NodeType.claim) return 8;

					// standard spacing: if both are nodes, use 12; else use 8
					let standardSpacing = nodeAData.nodeType != null && nodeBData.nodeType != null ? 12 : 8;

					const nodeAIsArgOfNodeB = nodeB.data.leftColumn_connectorOpts.parentIsAbove && nodeAData.nodeType == NodeType.argument && nodeBData.nodeType == NodeType.claim && nodeA.data.path == nodeBParentPath;
					if (nodeAIsArgOfNodeB) standardSpacing = 5;

					// if node-b has toolbar above it, we may need to add extra spacing between the two nodes (since a node's toolbar isn't part of its "main rect" used for generic layout)
					if (nodeBData.aboveToolbar_visible) {
						// do special spacing between argument and its first premise (unless it has a left-aligned toolbar-button)
						if (nodeAIsArgOfNodeB && !nodeBData.aboveToolbar_hasLeftButton) {
							if (nodeAIsArgOfNodeB && (nodeAData.width ?? 0) > ARG_MAX_WIDTH_FOR_IT_TO_FIT_BEFORE_PREMISE_TOOLBAR) return TOOLBAR_HEIGHT + 8;
							if (nodeAIsArgOfNodeB && nodeAData.expanded && (nodeAData.width ?? 0) > ARG_MAX_WIDTH_FOR_IT_AND_ARG_BAR_TO_FIT_BEFORE_PREMISE_TOOLBAR) return TOOLBAR_HEIGHT + 8;
						} else {
							return TOOLBAR_HEIGHT + 8;
						}
					}

					return standardSpacing;
				},
				styleSetter_layoutPending: style=>{
					//style.right = "100%"; // not ideal, since can cause some issues (eg. during map load, the center-on-loading-nodes system can jump to empty left-area of map) 
					style.opacity = "0";
					style.pointerEvents = "none";
				},
				styleSetter_layoutDone: style=>{
					//style.right = "";
					style.opacity = "";
					style.pointerEvents = "";
				},
			},
		});
		// for debugging
		if (forLayoutHelper) {
			globalThis.layoutHelperGraph = graph;
		} else {
			globalThis.mainGraph = graph;
		}

		if (layoutHelperGraph != null) {
			graph.StartAnimating(mainGraph_getNextKeyframeInfo, getGroupStablePath);
		}

		return graph;
	}, []);
	return graphInfo;
}