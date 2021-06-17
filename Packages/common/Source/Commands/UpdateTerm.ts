import {Assert, CE} from "web-vcore/nm/js-vextensions";
import {UserEdit} from "../CommandMacros";
import {AssertValidate, AddSchema, GetSchemaJSON, Schema, WrapDBValue} from "web-vcore/nm/mobx-graphlink";
import {GetAsync, Command, AssertV} from "web-vcore/nm/mobx-graphlink";
import {Term} from "../Store/db/terms/@Term";
import {GetTerm} from "../Store/db/terms";
import {AssertUserCanModify} from "./Helpers/SharedAsserts";

type MainType = Term;
const MTName = "Term";

AddSchema(`Update${MTName}_payload`, [MTName], ()=>({
	properties: {
		id: {type: "string"},
		updates: Schema({
			properties: CE(GetSchemaJSON(MTName).properties).Including("name", "forms", "disambiguation", "type", "definition", "note"),
		}),
	},
	required: ["id", "updates"],
}));

@UserEdit
export class UpdateTerm extends Command<{termID: string, updates: Partial<Term>}, {}> {
	oldData: Term;
	newData: Term;
	Validate() {
		const {termID, updates} = this.payload;
		this.oldData = GetTerm(termID);
		AssertUserCanModify(this, this.oldData);
		this.newData = {...this.oldData, ...updates};
		AssertValidate("Term", this.newData, "New-data invalid");
	}

	GetDBUpdates() {
		const {termID} = this.payload;

		const updates = {
			[`terms/${termID}`]: this.newData,
		} as any;
		/*if (this.newData.name != this.oldData.name) {
			updates[`termNames/${this.oldData.name.toLowerCase()}/.${termID}`] = WrapDBValue(null, {merge: true});
			updates[`termNames/${this.newData.name.toLowerCase()}/.${termID}`] = WrapDBValue(true, {merge: true});
		}*/
		return updates;
	}
}