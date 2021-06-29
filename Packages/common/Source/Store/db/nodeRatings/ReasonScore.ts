import {emptyArray_forLoading, Assert, IsNaN, CE, ArrayCE} from "web-vcore/nm/js-vextensions.js";
import {StoreAccessor} from "web-vcore/nm/mobx-graphlink.js";
import {MapNodeType} from "../nodes/@MapNodeType.js";
import {GetNodeL3, GetNodeL2} from "../nodes/$node.js";
import {GetNodeChildrenL3, GetParentNodeL3} from "../nodes.js";
import {Polarity, MapNodeL3} from "../nodes/@MapNode.js";
import {ArgumentType} from "../nodes/@MapNodeRevision.js";

export const RS_CalculateTruthScore = StoreAccessor(s=>(claimID: string, calculationPath: string[] = []): number=>{
	const claim = GetNodeL2(claimID);
	Assert(claim && claim.type == MapNodeType.claim, "RS truth-score can only be calculated for a claim.");

	// if we've hit a cycle back to a claim we've already started calculating for (the root claim), consider the truth-score at this lower-location to be 100%
	if (calculationPath.length && calculationPath.indexOf(CE(calculationPath).Last()) < calculationPath.length - 1) return 1;

	const childArguments = GetChildArguments(claim.id);
	if (childArguments == null || childArguments.length == 0) return 1;

	let runningAverage;
	let weightTotalSoFar = 0;
	for (const argument of childArguments) {
		const premises = GetNodeChildrenL3(argument.id).filter(a=>a && a.type == MapNodeType.claim);
		if (premises.length == 0) continue;

		let truthScoreComposite = RS_CalculateTruthScoreComposite(argument.id, calculationPath.concat(argument.id));
		const weight = RS_CalculateWeight(argument.id, premises.map(a=>a.id), calculationPath.concat(argument.id));
		if (weight == 0) continue; // if 0 weight, this argument won't change the result at all, so skip it

		if (argument.displayPolarity == Polarity.opposing) {
			truthScoreComposite = 1 - truthScoreComposite;
		}

		if (runningAverage == null) {
			weightTotalSoFar = weight;
			runningAverage = truthScoreComposite;
		} else {
			weightTotalSoFar += weight; // increase weight first
			const deviationFromAverage = truthScoreComposite - runningAverage;
			const weightRelativeToTotal = weight / weightTotalSoFar;
			runningAverage += deviationFromAverage * weightRelativeToTotal;
		}
		Assert(!IsNaN(runningAverage), "Got an NaN in truth-score calculation function.");
	}
	return runningAverage || 0;
});
export const RS_CalculateTruthScoreComposite = StoreAccessor(s=>(argumentID: string, calculationPath = [] as string[])=>{
	const argument = GetNodeL2(argumentID);
	Assert(argument && argument.type == MapNodeType.argument, "RS truth-score-composite can only be calculated for an argument.");

	const premises = GetNodeChildrenL3(argument.id).filter(a=>a && a.type == MapNodeType.claim);
	if (premises.length == 0) return 0;

	const truthScores = premises.map(premise=>RS_CalculateTruthScore(premise.id, calculationPath.concat(premise.id)));
	const truthScoreComposite = CombinePremiseTruthScores(truthScores, argument.argumentType);
	return truthScoreComposite;
});

export const RS_CalculateBaseWeight = StoreAccessor(s=>(claimID: string, calculationPath = [] as string[])=>{
	const truthScore = RS_CalculateTruthScore(claimID, calculationPath);
	// if truth-score drops below 50, it has 0 weight
	if (truthScore <= 0.5) return 0;

	const weight = (truthScore - 0.5) / 0.5;
	return weight;
});
export const RS_CalculateWeightMultiplier = StoreAccessor(s=>(nodeID: string, calculationPath = [] as string[])=>{
	const node = GetNodeL2(nodeID);
	Assert(node && node.type == MapNodeType.argument, "RS weight-multiplier can only be calculated for an argument<>claim combo -- which is specified by providing its argument node.");

	const childArguments = GetChildArguments(node.id);
	if (childArguments == null || childArguments.length == 0) return 1;

	let runningMultiplier = 1;
	let runningDivisor = 1;
	for (const argument of childArguments) {
		const premises = GetNodeChildrenL3(argument.id).filter(a=>a && a.type == MapNodeType.claim);
		if (premises.length == 0) continue;

		const truthScores = premises.map(premise=>RS_CalculateTruthScore(premise.id, calculationPath.concat(premise.id)));
		const truthScoresCombined = CombinePremiseTruthScores(truthScores, argument.argumentType);
		const weight = RS_CalculateWeight(argument.id, premises.map(a=>a.id), calculationPath.concat(argument.id));

		if (argument.displayPolarity == Polarity.supporting) {
			runningMultiplier += truthScoresCombined * weight;
		} else {
			runningDivisor += truthScoresCombined * weight;
		}
	}
	return runningMultiplier / runningDivisor;
});
export const RS_CalculateWeight = StoreAccessor(s=>(argumentID: string, premiseIDs: string[], calculationPath = [] as string[])=>{
	const argument = GetNodeL2(argumentID);
	const premises = premiseIDs.map(id=>GetNodeL2(id));
	if (premises.length == 0) return 0;
	const baseWeightsProduct = premises.map(premise=>RS_CalculateBaseWeight(premise.id, calculationPath.concat(premise.id))).reduce((prev, cur)=>prev * cur);
	const weightMultiplier = RS_CalculateWeightMultiplier(argument.id, calculationPath);
	return baseWeightsProduct * weightMultiplier;
});

export type ReasonScoreValues = {argument, premises, argTruthScoreComposite, argWeightMultiplier, argWeight, claimTruthScore, claimBaseWeight};
export type ReasonScoreValues_RSPrefix = {argument, premises, rs_argTruthScoreComposite, rs_argWeightMultiplier, rs_argWeight, rs_claimTruthScore, rs_claimBaseWeight};
export const RS_GetAllValues = StoreAccessor(s=>(nodeID: string, path: string, useRSPrefix = false, calculationPath = [] as string[])=>{
	const node = GetNodeL2(nodeID);
	const parent = GetParentNodeL3(path);
	const argument = node.type == MapNodeType.argument ? node : parent && parent.type == MapNodeType.argument ? parent : null;
	const premises = node.type == MapNodeType.argument ? GetNodeChildrenL3(argument.id, path).filter(a=>a && a.type == MapNodeType.claim) : [node];

	if (node.type == MapNodeType.claim) {
		var claimTruthScore = RS_CalculateTruthScore(node.id, calculationPath);
		var claimBaseWeight = RS_CalculateBaseWeight(node.id, calculationPath);
	}
	if (argument) { // (node could instead be a claim under category)
		var argTruthScoreComposite = RS_CalculateTruthScoreComposite(argument.id, calculationPath);
		var argWeightMultiplier = RS_CalculateWeightMultiplier(argument.id, calculationPath);
		var argWeight = RS_CalculateWeight(argument.id, premises.map(a=>a.id), calculationPath);
	}

	if (useRSPrefix) {
		return {
			argument, premises,
			rs_argTruthScoreComposite: argTruthScoreComposite, rs_argWeightMultiplier: argWeightMultiplier, rs_argWeight: argWeight,
			rs_claimTruthScore: claimTruthScore, rs_claimBaseWeight: claimBaseWeight,
		} as any;
	}
	return {argument, premises, argTruthScoreComposite, argWeightMultiplier, argWeight, claimTruthScore, claimBaseWeight} as ReasonScoreValues & ReasonScoreValues_RSPrefix;
});

function CombinePremiseTruthScores(truthScores: number[], argumentType: ArgumentType) {
	if (argumentType == ArgumentType.all) {
		return truthScores.reduce((prev, cur)=>prev * cur);
	}
	if (argumentType == ArgumentType.anyTwo) {
		if (truthScores.length < 2) return 0;
		let highestTruthScore = CE(truthScores).Max();
		let otherTruthScores = CE(truthScores).Except({excludeEachOnlyOnce: true}, highestTruthScore);
		let secondHighestTruthScore = CE(otherTruthScores).Max();
		return highestTruthScore * secondHighestTruthScore;
	}
	return CE(truthScores).Max(); // ArgumentType.Any
}

const GetChildArguments = StoreAccessor(s=>(nodeID: string): MapNodeL3[]=>{
	const children = GetNodeChildrenL3(nodeID);
	if (children == emptyArray_forLoading || CE(children).Any(a=>a == null)) return null; // null means still loading
	const childArguments = children.filter(a=>a.type == MapNodeType.argument);
	for (const child of childArguments) {
		const childChildren = GetNodeChildrenL3(nodeID);
		if (childChildren == emptyArray_forLoading || CE(childChildren).Any(a=>a == null)) return null; // null means still loading
	}

	return childArguments;
});